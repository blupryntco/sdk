import type {
  ChainId,
  CheckStep,
  ClaimCheck,
  KyiAmountTransferMethod,
  KyiAuthority,
  KyiContractSignatureMethod,
  KyiEvidence,
  KyiMemoTransferMethod,
  KyiReport,
  KyiSignatureMethod,
  KyiTokenLookup,
  KyiTokenLookupItem,
  KyiTokenReport,
  KyiVerification,
  KyiVerificationMethod,
} from "@bluprynt/sdk-core";
import {
  type Address,
  ContractFunctionExecutionError,
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

export interface KyiCheckOptions {
  /** RPC endpoints keyed by CAIP-2, e.g. { "eip155:1": "https://…" }. */
  rpcUrls?: Record<ChainId, string>;
}

const ownableAbi = parseAbi(["function owner() view returns (address)"]);
const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

const same = (a: string, b: string) =>
  isAddressEqual(a as Address, b as Address);

class Trail {
  readonly steps: CheckStep[] = [];
  via: CheckStep["via"] = "offline";
  skipped?: string;

  check(check: string, ok: boolean, expected?: unknown, actual?: unknown) {
    this.steps.push({
      check,
      via: this.via,
      ok,
      expected: plain(expected),
      actual: plain(actual),
    });
    return ok;
  }

  address(check: string, expected: string, actual: string | null) {
    return this.check(
      check,
      actual !== null && same(expected, actual),
      expected,
      actual,
    );
  }

  skip(reason: string) {
    this.skipped = reason;
  }

  result(
    kind: ClaimCheck["kind"],
    subject: string,
    method: string,
  ): ClaimCheck {
    const failed = this.steps.find((s) => !s.ok);
    const status = failed
      ? "invalid"
      : this.skipped || this.steps.length === 0
        ? "unverifiable"
        : "valid";
    const reason = failed ? `${failed.check} failed` : this.skipped;
    return { kind, subject, method, status, reason, steps: this.steps };
  }
}

const plain = (v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/** Feed a `GET /kyi/v1/tokens` response; independently re-check every claim in it. */
export async function verifyKyiResponse(
  response: KyiTokenLookup,
  options: KyiCheckOptions = {},
): Promise<KyiReport> {
  const tokens = await Promise.all(
    response.data.map((item) => verifyKyiToken(item, options)),
  );
  const verified = tokens.some((t) => t.verified);
  return {
    claimed: response.kyi_verified,
    verified,
    matchesClaim: matchesClaim(
      response.kyi_verified,
      verified,
      tokens.some((t) => t.matchesClaim === null),
    ),
    tokens,
  };
}

/** null when the record claims verification but the evidence can neither confirm nor refute it. */
function matchesClaim(
  claimed: boolean,
  verified: boolean,
  undecided: boolean,
): boolean | null {
  if (claimed === verified) return true;
  return claimed && undecided ? null : false;
}

export async function verifyKyiToken(
  item: KyiTokenLookupItem,
  options: KyiCheckOptions = {},
): Promise<KyiTokenReport> {
  const checks = await Promise.all([
    ...item.verifications.map((v) => checkKyiVerification(v, options)),
    ...item.authorities.map((a) =>
      checkKyiAuthority(item.token.caip2, item.token.address, a, options),
    ),
  ]);
  const evidence: KyiEvidence = checks.some((c) => c.status === "invalid")
    ? "contradicted"
    : checks.some((c) => c.kind === "verification" && c.status === "valid")
      ? "confirmed"
      : "inconclusive";
  const verified = evidence === "confirmed";
  return {
    caip19: item.token.caip19,
    claimed: item.kyi_verified,
    verified,
    matchesClaim: matchesClaim(
      item.kyi_verified,
      verified,
      evidence === "inconclusive",
    ),
    evidence,
    checks,
  };
}

/** Re-check that a verification's proof shows control of `wallet_address`, and that the wallet backs the authority. */
export async function checkKyiVerification(
  verification: KyiVerification,
  options: KyiCheckOptions = {},
): Promise<ClaimCheck> {
  const {
    wallet_address: wallet,
    authority,
    method,
    expires_at,
  } = verification;
  const t = new Trail();

  t.check(
    "wallet is the authority or one of its signers",
    same(wallet, authority.address) ||
      authority.signers.some((s) => same(wallet, s)),
    [authority.address, ...authority.signers],
    wallet,
  );
  if (expires_at) {
    const now = new Date().toISOString();
    t.check("verification not expired", now < expires_at, expires_at, now);
  }
  await onchain(t, () => checkMethod(t, wallet, method, options));

  return t.result("verification", wallet, methodLabel(method));
}

function methodLabel(method: KyiVerificationMethod): string {
  switch (method.type) {
    case "signature":
      return `signature:${method.scheme ?? "unrecorded"}`;
    case "contract_signature":
      return `contract_signature:${method.scheme}/${method.inner_scheme}`;
    case "transfer":
      return `transfer:${method.kind}`;
    case "admin_manual":
      return "admin_manual";
  }
}

async function checkMethod(
  t: Trail,
  wallet: string,
  method: KyiVerificationMethod,
  options: KyiCheckOptions,
): Promise<void> {
  switch (method.type) {
    case "signature":
      return checkSignature(t, wallet, method);
    case "contract_signature":
      return checkContractSignature(t, wallet, method, options);
    case "transfer":
      return method.kind === "amount"
        ? checkAmountTransfer(t, wallet, method, options)
        : checkMemoTransfer(t, wallet, method, options);
    case "admin_manual":
      return t.skip("admin_manual is not part of the public trust model");
  }
}

async function checkSignature(
  t: Trail,
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
  t: Trail,
  wallet: string,
  method: KyiContractSignatureMethod,
  options: KyiCheckOptions,
): Promise<void> {
  const hash =
    method.inner_scheme === "eip191"
      ? hashMessage(method.message)
      : hashTypedData(JSON.parse(method.message));
  t.via = "rpc";
  const ok = await client(method.caip2, options).verifyHash({
    address: wallet as Address,
    hash,
    signature: method.signature as Hex,
    blockNumber: BigInt(method.block_number),
  });
  t.check(
    `eip1271 isValidSignature on ${method.caip2} at block ${method.block_number}`,
    ok,
    true,
    ok,
  );
}

async function checkAmountTransfer(
  t: Trail,
  wallet: string,
  method: KyiAmountTransferMethod,
  options: KyiCheckOptions,
): Promise<void> {
  const { caip2, transaction_hash, sender, recipient, asset, amount } = method;
  if (!caip2 || !transaction_hash || !asset || !amount) {
    return t.skip("proof material missing");
  }
  t.address("claimed sender is the wallet", wallet, sender);

  const { tx, receipt } = await fetchTx(t, caip2, transaction_hash, options);
  t.check(
    "transaction succeeded",
    receipt.status === "success",
    "success",
    receipt.status,
  );
  t.address("transaction sender", sender, tx.from);

  const [, namespace, reference] = asset.match(/^[^/]+\/([^:]+):(.+)$/) ?? [];
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
          x.value === amount,
      ),
      { token: reference, from: sender, to: recipient, value: amount },
      transfers,
    );
  } else {
    t.skip(`asset ${asset} is not supported`);
  }
}

async function checkMemoTransfer(
  t: Trail,
  wallet: string,
  method: KyiMemoTransferMethod,
  options: KyiCheckOptions,
): Promise<void> {
  const { caip2, transaction_hash, sender, recipient, memo } = method;
  if (!caip2) return t.skip("proof material missing");
  t.address("claimed sender is the wallet", wallet, sender);

  const { tx, receipt } = await fetchTx(t, caip2, transaction_hash, options);
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

/** Re-check on-chain that an authority still holds what the record claims. */
export async function checkKyiAuthority(
  caip2: ChainId,
  token: string,
  authority: KyiAuthority,
  options: KyiCheckOptions = {},
): Promise<ClaimCheck> {
  const t = new Trail();
  if (!caip2.startsWith("eip155:")) {
    t.skip(`${caip2} is not an EVM chain`);
  } else {
    await onchain(t, () => checkAuthority(t, caip2, token, authority, options));
  }
  return t.result("authority", authority.address, authority.type);
}

async function checkAuthority(
  t: Trail,
  caip2: ChainId,
  token: string,
  authority: KyiAuthority,
  options: KyiCheckOptions,
): Promise<void> {
  const rpc = client(caip2, options);
  t.via = "rpc";

  if (authority.account_type === "multisig") {
    const address = authority.address as Address;
    const [owners, threshold] = await Promise.all([
      rpc.readContract({ address, abi: safeAbi, functionName: "getOwners" }),
      rpc.readContract({ address, abi: safeAbi, functionName: "getThreshold" }),
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
      address: token as Address,
      abi: ownableAbi,
      functionName: "owner",
    });
    t.address("token owner()", authority.address, owner);
  } else if (authority.account_type !== "multisig") {
    t.skip(`no generic EVM check for ${authority.type}`);
  }
}

function client(caip2: ChainId, options: KyiCheckOptions): PublicClient {
  const url = options.rpcUrls?.[caip2];
  if (!url) throw new Error(`RPC not configured for ${caip2}`);
  return createPublicClient({ transport: http(url) });
}

async function fetchTx(
  t: Trail,
  caip2: ChainId,
  hash: string,
  options: KyiCheckOptions,
) {
  const rpc = client(caip2, options);
  t.via = "rpc";
  const [tx, receipt] = await Promise.all([
    rpc.getTransaction({ hash: hash as Hex }),
    rpc.getTransactionReceipt({ hash: hash as Hex }),
  ]);
  return { tx, receipt };
}

/** On-chain absence or a reverting call disproves the claim; transport/config errors still throw. */
async function onchain(t: Trail, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (
      err instanceof TransactionNotFoundError ||
      err instanceof TransactionReceiptNotFoundError ||
      err instanceof ContractFunctionExecutionError
    ) {
      t.check("on-chain lookup", false, undefined, err.shortMessage);
      return;
    }
    throw err;
  }
}
