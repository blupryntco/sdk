import {
  type ChainId,
  type CheckResult,
  CheckTrail,
  checkWalletBacksAuthority,
  type KyiAuthority,
  type KyiChainChecker,
  type KyiCheckOptions,
  type KyiInstant,
  type KyiSignatureMethod,
  type KyiToken,
  type KyiVerification,
  type KyiVerificationMethod,
  kyiChainFunctions,
  kyiMethodLabel,
  kyiRpcUrl,
} from "@bluprynt/sdk-core";
import {
  type Address,
  createSolanaRpc,
  type EncodedAccount,
  fixCodecSize,
  type GetAccountInfoApi,
  getBase58Encoder,
  getBytesCodec,
  getPublicKeyFromAddress,
  getTupleCodec,
  getU8Codec,
  getU16Codec,
  getUtf8Codec,
  type MaybeEncodedAccount,
  parseBase64RpcAccount,
  type ReadonlyUint8Array,
  type Rpc,
  type SignatureBytes,
  unwrapOption,
  verifySignature,
} from "@solana/kit";
import { getMintSize, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  decodeMint,
  decodeMultisig,
  getMultisigSize,
  type Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

export const solanaKyi: KyiChainChecker = {
  namespace: "solana",
  checkProof,
  checkVerificationAt,
  checkAuthorityAt,
};

export const {
  verifyKyiResponse,
  verifyKyiToken,
  checkKyiVerification,
  checkKyiAuthority,
} = kyiChainFunctions(solanaKyi);

const HISTORICAL = "Solana RPC cannot read historical account state";

async function checkProof(
  verification: KyiVerification,
  _token: KyiToken,
): Promise<CheckResult> {
  const t = new CheckTrail();
  checkWalletBacksAuthority(t, verification);
  await checkMethod(t, verification.wallet_address, verification.method);
  return t.result();
}

async function checkVerificationAt(
  { wallet_address: wallet, method }: KyiVerification,
  _token: KyiToken,
  at: KyiInstant,
  _options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail();
  if (at.time !== "now") t.skip(HISTORICAL);
  else await checkMethod(t, wallet, method);
  return t.result();
}

async function checkMethod(
  t: CheckTrail,
  wallet: string,
  method: KyiVerificationMethod,
): Promise<void> {
  switch (method.type) {
    case "signature":
      return checkSignature(t, wallet, method);
    case "admin_manual":
      return t.skip("admin_manual is not part of the public trust model");
    default:
      return t.skip(`${kyiMethodLabel(method)} is not supported on Solana`);
  }
}

const utf8 = getUtf8Codec();
const offchainCodec = getTupleCodec([
  fixCodecSize(getBytesCodec(), 16),
  getU8Codec(),
  getU8Codec(),
  getU16Codec(),
  getBytesCodec(),
]);
const offchainDomain = Uint8Array.from([
  0xff,
  ...utf8.encode("solana offchain"),
]);

function offchainPayload(message: string): ReadonlyUint8Array {
  const body = utf8.encode(message);
  return offchainCodec.encode([offchainDomain, 0, 0, body.length, body]);
}

async function checkSignature(
  t: CheckTrail,
  wallet: string,
  { scheme, message, signature }: KyiSignatureMethod,
): Promise<void> {
  if (!message || !signature) return t.skip("proof material missing");
  if (
    scheme !== null &&
    scheme !== "solana_raw" &&
    scheme !== "solana_offchain_v0"
  ) {
    return t.skip(`signature:${scheme} is not supported on Solana`);
  }

  const key = await getPublicKeyFromAddress(wallet as Address);
  const sig = getBase58Encoder().encode(signature) as SignatureBytes;
  const raw = () => verifySignature(key, sig, utf8.encode(message));
  const offchain = () => verifySignature(key, sig, offchainPayload(message));

  if (scheme === "solana_raw") {
    t.check("solana_raw signature verifies for wallet", await raw());
  } else if (scheme === "solana_offchain_v0") {
    t.check(
      "solana_offchain_v0 signature verifies for wallet",
      await offchain(),
    );
  } else {
    const matched = (await raw())
      ? "solana_raw"
      : (await offchain())
        ? "solana_offchain_v0"
        : null;
    t.check(
      matched
        ? `signature verifies for wallet (scheme not recorded, matched ${matched})`
        : "signature verifies for wallet (scheme not recorded)",
      matched !== null,
    );
  }
}

async function checkAuthorityAt(
  authority: KyiAuthority,
  token: KyiToken,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail();
  const mintStep = mintStepFor(authority.type);
  const multisig = authority.account_type === "multisig";

  if (mintStep || multisig) {
    if (at.time !== "now") {
      t.skip(HISTORICAL);
      return t.result();
    }
    const rpc = client(token.caip2, options);
    t.via = "rpc";
    if (multisig) await checkMultisig(t, rpc, authority);
    if (mintStep) await checkMint(t, rpc, token, authority, mintStep);
  }
  if (!mintStep) t.skip(`no Solana check for ${authority.type}`);
  return t.result();
}

async function fetchAccount(
  t: CheckTrail,
  rpc: Rpc<GetAccountInfoApi>,
  address: Address,
): Promise<MaybeEncodedAccount> {
  const { context, value } = await rpc
    .getAccountInfo(address, { encoding: "base64" })
    .send();
  t.position ??= { slot: context.slot.toString() };
  return parseBase64RpcAccount(address, value);
}

function mintStepFor(type: string): MintStep | undefined {
  switch (type) {
    case "mint_authority":
      return { step: "mint authority", field: "mintAuthority" };
    case "freeze_authority":
      return { step: "freeze authority", field: "freezeAuthority" };
  }
}

type MintStep = { step: string; field: "mintAuthority" | "freezeAuthority" };

async function checkMint(
  t: CheckTrail,
  rpc: Rpc<GetAccountInfoApi>,
  token: KyiToken,
  authority: KyiAuthority,
  { step, field }: MintStep,
): Promise<void> {
  const account = await fetchAccount(t, rpc, token.address as Address);
  t.check("mint account exists", account.exists);
  if (!account.exists) return;
  if (!checkTokenProgramOwner(t, "mint", account)) return;
  const mint = tryDecodeInitializedMint(account);
  t.check("account is a token mint", mint !== null);
  if (!mint) return;
  t.address(step, authority.address, unwrapOption(mint[field]));
}

function tryDecodeInitializedMint(account: EncodedAccount): Mint | null {
  if (
    account.programAddress === TOKEN_PROGRAM_ADDRESS &&
    account.data.length !== getMintSize()
  ) {
    return null;
  }
  try {
    const { data } = decodeMint(account);
    return data.isInitialized ? data : null;
  } catch {
    return null;
  }
}

function checkTokenProgramOwner(
  t: CheckTrail,
  label: string,
  { programAddress }: { programAddress: Address },
): boolean {
  const ok =
    programAddress === TOKEN_PROGRAM_ADDRESS ||
    programAddress === TOKEN_2022_PROGRAM_ADDRESS;
  t.check(
    `${label} is owned by a token program`,
    ok,
    [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS],
    programAddress,
  );
  return ok;
}

async function checkMultisig(
  t: CheckTrail,
  rpc: Rpc<GetAccountInfoApi>,
  authority: KyiAuthority,
): Promise<void> {
  const account = await fetchAccount(t, rpc, authority.address as Address);
  t.check("multisig account exists", account.exists);
  if (!account.exists) return;
  if (!checkTokenProgramOwner(t, "multisig", account)) return;
  const multisig =
    account.data.length === getMultisigSize()
      ? decodeMultisig(account).data
      : null;
  t.check("account is a token multisig", multisig?.isInitialized === true);
  if (!multisig?.isInitialized) return;
  const { m, n, signers } = multisig;
  const onchain = new Set(signers.slice(0, n));
  const claimed = new Set(authority.signers);
  t.check(
    "multisig signers match claimed signers",
    onchain.size === claimed.size &&
      [...claimed].every((s) => onchain.has(s as Address)),
    authority.signers,
    [...onchain],
  );
  if (authority.threshold !== null) {
    t.check(
      "multisig threshold",
      m === authority.threshold,
      authority.threshold,
      m,
    );
  }
}

function client(caip2: ChainId, options: KyiCheckOptions) {
  return createSolanaRpc(kyiRpcUrl(caip2, options));
}
