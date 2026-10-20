// KYI token lookup record as served by the Bluprynt public API (`GET /kyi/v1/tokens`).
//
// @experimental — mirrors public-api `KyiTokenLookupResponseDto`; will drift until generated from OpenAPI.

export interface KyiSignatureMethod {
  type: "signature";
  scheme:
    | "eip191"
    | "eip712"
    | "solana_raw"
    | "solana_offchain_v0"
    | "xrpl"
    | null;
  /** Exact signed string. */
  message: string | null;
  signature: string | null;
  /** Key that produced the signature; required for XRPL. */
  signer_public_key: string | null;
}

export interface KyiContractSignatureMethod {
  type: "contract_signature";
  scheme: "eip1271";
  inner_scheme: "eip191" | "eip712";
  message: string;
  signature: string;
  caip2: string;
  block_number: number;
}

export interface KyiAmountTransferMethod {
  type: "transfer";
  kind: "amount";
  caip2: string | null;
  transaction_hash: string | null;
  sender: string;
  recipient: string | null;
  /** CAIP-19 of the transferred asset, e.g. "eip155:1/slip44:60". */
  asset: string | null;
  /** Amount in base units of `asset`. */
  amount: string | null;
}

export interface KyiMemoTransferMethod {
  type: "transfer";
  kind: "memo";
  caip2: string | null;
  transaction_hash: string;
  sender: string;
  recipient: string | null;
  memo: string;
}

export interface KyiAdminManualMethod {
  type: "admin_manual";
}

export type KyiVerificationMethod =
  | KyiSignatureMethod
  | KyiContractSignatureMethod
  | KyiAmountTransferMethod
  | KyiMemoTransferMethod
  | KyiAdminManualMethod;

export interface KyiAuthority {
  /** Open set, e.g. "owner". */
  type: string;
  address: string;
  account_type: "regular" | "multisig";
  signers: string[];
  threshold: number | null;
  observed_at: string | null;
}

export interface KyiVerification {
  verified_at: string;
  expires_at: string | null;
  /** Wallet whose proof backs the verification. */
  wallet_address: string;
  authority: KyiAuthority;
  method: KyiVerificationMethod;
}

export interface KyiToken {
  caip19: string;
  caip2: string;
  chain_slug: string | null;
  address: string;
  standard: string | null;
  decimals: number | null;
  verified_at: string | null;
}

export interface KyiAsset {
  slug: string | null;
  name: string | null;
  symbol: string | null;
  description: string | null;
  website_url: string | null;
  whitepaper_url: string | null;
}

export interface KyiIssuer {
  name: string | null;
  kyb_verified: boolean;
}

export interface KyiTokenLookupItem {
  kyi_verified: boolean;
  token: KyiToken;
  asset: KyiAsset;
  issuer: KyiIssuer | null;
  authorities: KyiAuthority[];
  verifications: KyiVerification[];
}

export interface KyiTokenLookup {
  kyi_verified: boolean;
  data: KyiTokenLookupItem[];
}

/** One comparison performed while re-checking a claim. */
export interface CheckStep {
  check: string;
  via: "offline" | "rpc";
  ok: boolean;
  expected?: unknown;
  actual?: unknown;
}

/** Outcome of independently re-checking one KYI claim. */
export interface ClaimCheck {
  kind: "verification" | "authority";
  /** Wallet (verification) or authority address being checked. */
  subject: string;
  /** How the claim was established, e.g. "signature:eip191", "transfer:amount", "owner". */
  method: string;
  status: "valid" | "invalid" | "unverifiable";
  reason?: string;
  steps: CheckStep[];
}

/**
 * confirmed    — at least one verification re-checked valid and nothing contradicted the record.
 * contradicted — some claim was checked and did not hold.
 * inconclusive — nothing contradicted, but nothing could be independently confirmed either.
 */
export type KyiEvidence = "confirmed" | "contradicted" | "inconclusive";

export interface KyiTokenReport {
  caip19: string;
  /** What Bluprynt says (`kyi_verified`). */
  claimed: boolean;
  /** Whether the re-checked evidence lets us consider the asset verified. */
  verified: boolean;
  /** null when the record claims verification but the evidence can neither confirm nor refute it. */
  matchesClaim: boolean | null;
  evidence: KyiEvidence;
  checks: ClaimCheck[];
}

export interface KyiReport {
  /** Response-level `kyi_verified`: true if any token is claimed verified. */
  claimed: boolean;
  /** True if any token is independently verified. */
  verified: boolean;
  matchesClaim: boolean | null;
  tokens: KyiTokenReport[];
}
