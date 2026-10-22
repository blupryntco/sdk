import {
  type ChainId,
  type CheckResult,
  CheckTrail,
  checkWalletBacksAuthority,
  type KyiAmountTransferMethod,
  type KyiAuthority,
  type KyiChainChecker,
  type KyiCheckOptions,
  type KyiContractSignatureMethod,
  type KyiInstant,
  type KyiMemoTransferMethod,
  type KyiSignatureMethod,
  type KyiToken,
  type KyiVerification,
  type KyiVerificationMethod,
  kyiChainFunctions,
  kyiRpcUrl,
} from "@bluprynt/sdk-core";
import {
  type Address,
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  erc20Abi,
  type Hex,
  hashMessage,
  hashTypedData,
  http,
  isAddress,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  parseEventLogs,
  recoverMessageAddress,
  recoverTypedDataAddress,
  stringToHex,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
} from "viem";

const ownableAbi = parseAbi(["function owner() view returns (address)"]);
const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

const same = (a: string, b: string) =>
  isAddressEqual(a as Address, b as Address);

export const evmKyi: KyiChainChecker = {
  namespace: "eip155",
  sameAddress: same,
  checkProof,
  checkVerificationAt,
  checkAuthorityAt,
  session: (options, run) => {
    const scoped = { ...options };
    sessions.set(scoped, new Reads());
    return run(scoped);
  },
};

export const {
  verifyKyiResponse,
  verifyKyiToken,
  checkKyiVerification,
  checkKyiAuthority,
} = kyiChainFunctions(evmKyi);

const ADMIN_MANUAL = "admin_manual is not part of the public trust model";
interface MinedBlock {
  number: bigint;
  timestamp: bigint;
}

const POSTDATES = "record postdates this moment";

async function checkProof(
  verification: KyiVerification,
  _token: KyiToken,
): Promise<CheckResult> {
  const { wallet_address: wallet, method } = verification;
  const t = new CheckTrail(same);

  checkWalletBacksAuthority(t, verification);
  switch (method.type) {
    case "signature":
      await checkSignature(t, wallet, method);
      break;
    case "admin_manual":
      t.skip(ADMIN_MANUAL);
      break;
    default:
      t.skip("online checks not requested");
  }
  return t.result();
}

async function checkVerificationAt(
  { wallet_address: wallet, method }: KyiVerification,
  _token: KyiToken,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail(same);
  await onchain(t, at, () => checkMethodAt(t, wallet, method, at, options));
  return t.result();
}

async function checkMethodAt(
  t: CheckTrail,
  wallet: string,
  method: KyiVerificationMethod,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<void> {
  switch (method.type) {
    case "signature":
      return checkSignature(t, wallet, method);
    case "admin_manual":
      return t.skip(ADMIN_MANUAL);
  }
  switch (method.type) {
    case "contract_signature":
      return checkContractSignature(t, wallet, method, at, options);
    case "transfer":
      return method.kind === "amount"
        ? checkAmountTransfer(t, wallet, method, at, options)
        : checkMemoTransfer(t, wallet, method, at, options);
  }
}

async function checkSignature(
  t: CheckTrail,
  wallet: string,
  { scheme, message, signature }: KyiSignatureMethod,
): Promise<void> {
  if (!message || !signature) return t.skip("proof material missing");
  const sig = signature as Hex;
  if (scheme === "eip191" || (scheme === null && isAddress(wallet))) {
    const signer = await recoverMessageAddress({ message, signature: sig });
    t.address(
      scheme
        ? "eip191 signature recovers to wallet"
        : "eip191 signature recovers to wallet (scheme not recorded, assumed eip191)",
      wallet,
      signer,
    );
  } else if (scheme === "eip712") {
    const signer = await recoverTypedDataAddress({
      ...JSON.parse(message),
      signature: sig,
    });
    t.address("eip712 signature recovers to wallet", wallet, signer);
  } else {
    t.skip(`scheme ${scheme} is not EVM`);
  }
}

async function checkContractSignature(
  t: CheckTrail,
  wallet: string,
  method: KyiContractSignatureMethod,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<void> {
  const hash =
    method.inner_scheme === "eip191"
      ? hashMessage(method.message)
      : hashTypedData(JSON.parse(method.message));
  t.via = "rpc";
  const rpc = client(method.caip2, options);
  const recorded = BigInt(method.block_number);
  const block = await pin(
    t,
    method.caip2,
    at,
    options,
    at.label === "verified" ? recorded : undefined,
  );
  if (!block) return;
  if (block.number < recorded) return t.skip(POSTDATES);
  const ok = await rpc.verifyHash({
    address: wallet as Address,
    hash,
    signature: method.signature as Hex,
    blockNumber: block.number,
  });
  t.check(
    `eip1271 isValidSignature on ${method.caip2} at block ${block.number}`,
    ok,
    true,
    ok,
  );
}

async function checkAmountTransfer(
  t: CheckTrail,
  wallet: string,
  method: KyiAmountTransferMethod,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<void> {
  const { caip2, transaction_hash, sender, recipient, asset, amount } = method;
  if (!caip2 || !transaction_hash || !asset || !amount) {
    return t.skip("proof material missing");
  }
  t.address("claimed sender is the wallet", wallet, sender);

  const found = await fetchTx(t, caip2, transaction_hash, at, options);
  if (!found) return;
  const { tx, receipt } = found;
  t.check(
    "transaction succeeded",
    receipt.status === "success",
    "success",
    receipt.status,
  );
  t.address("transaction sender", sender, tx.from);

  const [, chain, namespace, reference] =
    asset.match(/^([^/]+)\/([^:]+):(.+)$/) ?? [];
  t.check("asset is on the transaction's chain", chain === caip2, caip2, chain);
  if (namespace === "slip44") {
    if (recipient) t.address("transaction recipient", recipient, tx.to);
    t.check(
      "transferred amount",
      tx.value === BigInt(amount),
      amount,
      tx.value,
    );
  } else if (namespace === "erc20" && reference) {
    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    }).map((log) => ({
      token: log.address,
      from: log.args.from,
      to: log.args.to,
      value: log.args.value.toString(),
    }));
    t.check(
      "matching ERC-20 Transfer in receipt",
      transfers.some(
        (x) =>
          same(x.token, reference) &&
          same(x.from, sender) &&
          (!recipient || same(x.to, recipient)) &&
          x.value === BigInt(amount).toString(),
      ),
      { token: reference, from: sender, to: recipient, value: amount },
      transfers,
    );
  } else {
    t.skip(`asset ${asset} is not supported`);
  }
}

async function checkMemoTransfer(
  t: CheckTrail,
  wallet: string,
  method: KyiMemoTransferMethod,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<void> {
  const { caip2, transaction_hash, sender, recipient, memo } = method;
  if (!caip2) return t.skip("proof material missing");
  t.address("claimed sender is the wallet", wallet, sender);

  const found = await fetchTx(t, caip2, transaction_hash, at, options);
  if (!found) return;
  const { tx, receipt } = found;
  t.check(
    "transaction succeeded",
    receipt.status === "success",
    "success",
    receipt.status,
  );
  t.address("transaction sender", sender, tx.from);
  if (recipient) t.address("transaction recipient", recipient, tx.to);
  const expected = stringToHex(memo);
  t.check(
    "calldata carries the memo",
    tx.input.toLowerCase() === expected.toLowerCase(),
    expected,
    tx.input,
  );
}

async function checkAuthorityAt(
  authority: KyiAuthority,
  token: KyiToken,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail(same);
  if (authority.type !== "owner" && authority.account_type !== "multisig") {
    t.skip(`no generic EVM check for ${authority.type}`);
  } else {
    await onchain(t, at, () =>
      checkAuthorityOnchain(t, token, authority, at, options),
    );
  }
  return t.result();
}

async function checkAuthorityOnchain(
  t: CheckTrail,
  token: KyiToken,
  authority: KyiAuthority,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<void> {
  const rpc = client(token.caip2, options);
  t.via = "rpc";
  const block = await pin(t, token.caip2, at, options);
  if (!block) return;
  const blockNumber = block.number;

  if (authority.account_type === "multisig") {
    const address = authority.address as Address;
    const [owners, threshold] = await Promise.all([
      rpc.readContract({
        address,
        abi: safeAbi,
        functionName: "getOwners",
        blockNumber,
      }),
      rpc.readContract({
        address,
        abi: safeAbi,
        functionName: "getThreshold",
        blockNumber,
      }),
    ]);
    t.check(
      "Safe owners match claimed signers",
      owners.length === authority.signers.length &&
        owners.every((o) => authority.signers.some((s) => same(o, s))),
      authority.signers,
      owners,
    );
    if (authority.threshold !== null) {
      t.check(
        "Safe threshold",
        threshold === BigInt(authority.threshold),
        authority.threshold,
        threshold,
      );
    }
  }

  if (authority.type === "owner") {
    const owner = await rpc.readContract({
      address: token.address as Address,
      abi: ownableAbi,
      functionName: "owner",
      blockNumber,
    });
    t.address("token owner()", authority.address, owner);
  }
}

function client(caip2: ChainId, options: KyiCheckOptions): PublicClient {
  return reads(options).client(caip2, options);
}

async function fetchTx(
  t: CheckTrail,
  caip2: ChainId,
  hash: string,
  at: KyiInstant,
  options: KyiCheckOptions,
) {
  const rpc = client(caip2, options);
  t.via = "rpc";
  const block = await pin(t, caip2, at, options);
  if (!block) return null;
  const [tx, receipt] = await Promise.all([
    rpc.getTransaction({ hash: hash as Hex }),
    rpc.getTransactionReceipt({ hash: hash as Hex }),
  ]);
  if (receipt.blockNumber > block.number) {
    t.skip(POSTDATES);
    return null;
  }
  return { tx, receipt };
}

async function pin(
  t: CheckTrail,
  caip2: ChainId,
  at: KyiInstant,
  options: KyiCheckOptions,
  fixed?: bigint,
): Promise<MinedBlock | null> {
  if (fixed !== undefined) t.position = { block: fixed.toString() };
  const block = await reads(options).blockAt(caip2, options, at, fixed);
  if (!block) {
    t.skip("chain has no block at or before this moment");
    return null;
  }
  t.position = {
    block: block.number.toString(),
    time: new Date(Number(block.timestamp) * 1000).toISOString(),
  };
  return block;
}

/** Shares clients and block lookups between the concurrent checks of one token; failed lookups stay cached so the whole report fails once. */
class Reads {
  private readonly clients = new Map<ChainId, PublicClient>();
  private readonly lookups = new Map<string, Promise<unknown>>();

  client(caip2: ChainId, options: KyiCheckOptions): PublicClient {
    let rpc = this.clients.get(caip2);
    if (!rpc) {
      rpc = createPublicClient({ transport: http(kyiRpcUrl(caip2, options)) });
      this.clients.set(caip2, rpc);
    }
    return rpc;
  }

  blockAt(
    caip2: ChainId,
    options: KyiCheckOptions,
    at: KyiInstant,
    fixed?: bigint,
  ): Promise<MinedBlock | null> {
    if (fixed !== undefined) return this.block(caip2, options, fixed);
    if (at.time === "now") return this.block(caip2, options);
    const target = BigInt(Math.floor(at.time.getTime() / 1000));
    return this.once(`${caip2}/at/${target}`, () =>
      this.search(caip2, options, target),
    );
  }

  private block(caip2: ChainId, options: KyiCheckOptions, number?: bigint) {
    return this.once(`${caip2}/${number ?? "latest"}`, () =>
      this.client(caip2, options).getBlock(
        number === undefined ? undefined : { blockNumber: number },
      ),
    );
  }

  private async search(
    caip2: ChainId,
    options: KyiCheckOptions,
    target: bigint,
  ): Promise<MinedBlock | null> {
    const latest = await this.block(caip2, options);
    if (latest.timestamp <= target) return latest;
    let low = await this.block(caip2, options, 0n);
    if (low.timestamp > target) return null;
    let high = latest.number;
    while (high - low.number > 1n) {
      const mid = await this.block(
        caip2,
        options,
        low.number + (high - low.number) / 2n,
      );
      if (mid.timestamp <= target) low = mid;
      else high = mid.number;
    }
    return low;
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let lookup = this.lookups.get(key) as Promise<T> | undefined;
    if (!lookup) {
      lookup = load();
      this.lookups.set(key, lookup);
    }
    return lookup;
  }
}

const sessions = new WeakMap<KyiCheckOptions, Reads>();

const reads = (options: KyiCheckOptions) =>
  sessions.get(options) ?? new Reads();

const MISSING_STATE =
  /missing trie node|header not found|historical state|state is not available/i;

function isMissingHistoricalState(err: unknown): boolean {
  return (
    err instanceof BaseError &&
    err.walk(
      (e) =>
        e instanceof Error &&
        MISSING_STATE.test(`${e.message} ${(e as BaseError).details ?? ""}`),
    ) !== null
  );
}

/** On-chain absence or a reverting call disproves the claim, an RPC without a past block's state leaves it open; transport/config errors still throw. */
async function onchain(
  t: CheckTrail,
  at: KyiInstant,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (
      at.time !== "now" &&
      t.position?.block &&
      isMissingHistoricalState(err)
    ) {
      t.skip(`RPC has no state for block ${t.position.block}`);
      return;
    }
    if (
      err instanceof TransactionNotFoundError ||
      err instanceof TransactionReceiptNotFoundError ||
      (err instanceof ContractFunctionExecutionError &&
        err.walk(
          (e) =>
            e instanceof ContractFunctionRevertedError ||
            e instanceof ContractFunctionZeroDataError,
        ))
    ) {
      t.check("on-chain lookup", false, undefined, err.shortMessage);
      return;
    }
    throw err;
  }
}
