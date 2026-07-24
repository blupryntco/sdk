// Wallet verification metadata — the auditable artifact stored on IPFS/API.
// Types only; the checkWalletVerification implementation lives in chain packages.
//
// @experimental / PRE-RELEASE — this schema is unstable and WILL change drastically
// before 1.0. Do not persist records against it expecting forward compatibility.
// The `version` discriminant will bump when the shape changes.

import type { ChainId } from "./index.js";

export interface Chain {
  caip2: ChainId; // e.g. "eip155:1", "solana:5eykt4Us…"
  name: string; // human label, e.g. "Ethereum", "Solana"
}

// ── Controller (wallet) type ─────────────────────────────────────────────────
export type ControllerFamily = "evm" | "solana" | "xrpl";

export type EvmControllerType =
  | "EOA"
  | "SAFE_MULTISIG"
  | "TIMELOCK"
  | "GOVERNOR"
  | "ROLES_AUTHORITY";

export type SolanaControllerType =
  | "ED25519_KEYPAIR"
  | "MULTISIG_PROGRAM"
  | "PROGRAM_DERIVED_ADDRESS";

export type XrplControllerType =
  | "SECP256K1_KEYPAIR"
  | "ED25519_KEYPAIR"
  | "MULTISIGN";

export type ControllerType =
  | EvmControllerType
  | SolanaControllerType
  | XrplControllerType;

export interface Controller {
  family: ControllerFamily;
  type: ControllerType;
  /**
   * false → control derives from a key and reuses across the family
   *   (EOA across eip155:*, keypair across clusters/networks).
   * true  → deployed/program-controlled, verify per-chain only.
   */
  chainScoped: boolean;
}

// ── Proof (discriminated by `kind`) ──────────────────────────────────────────
export type SignatureScheme =
  | "eip191" // EVM personal_sign
  | "ed25519" // Solana / XRPL
  | "secp256k1" // XRPL
  | "erc1271"; // EVM contract wallet — needs RPC isValidSignature()

/**
 * The key that actually produced the signature. May differ from the verified
 * WalletVerification.address when a multisig signee signs on the wallet's behalf.
 */
export interface Signer {
  /** Address controlled by this key. Equals the verified address for a self-sign;
   *  a member of the signer set for a multisig-signee sign. */
  address: string;
  /**
   * Public key of the signer. Presence is the verify-path signal:
   *  - present  ⇒ verifiable OFFLINE — check the signature against this key
   *    (EOA pubkey recovered & stored at auth time, Solana/XRPL keypair, each multisig signee).
   *  - absent   ⇒ NOT cryptographically checkable — verify via RPC/on-chain
   *    (erc1271 contract wallets, program-controlled / PDA addresses).
   */
  publicKey?: string;
}

export interface NativeSignature {
  /** Exact bytes that were signed (Solana preamble etc. already applied). */
  signedBytes: string;
  encoding: "base64";
}

export interface SignatureProof {
  kind: "signature";
  /** scheme === "erc1271" tells the SDK an eth_call is needed — no separate flag stored. */
  scheme: SignatureScheme;
  challenge: string; // the exact stored challenge/message
  signature: string;
  signer: Signer;
  /** Optional trust-minimized re-verify path (verify without the SDK's normalization). */
  native?: NativeSignature;
}

export type ChallengeCarrier =
  | { type: "memo"; value: string }
  | { type: "amount"; value: string; unit: "wei" | "drops" | "lamports" };

export interface NativeTransaction {
  rawTx: string; // signed tx (≤~2KB); verify offline / before confirmation
  encoding: "base64" | "hex";
}

export interface TransactionProof {
  kind: "transaction";
  txHash: string;
  expected: {
    sender: string; // must equal the address being verified
    recipient: string; // Bluprynt-provided address or self
    carrier: ChallengeCarrier;
  };
  native?: NativeTransaction;
}

export type Proof = SignatureProof | TransactionProof;

// ── Record ───────────────────────────────────────────────────────────────────
export type VerificationMethod = "wallet_extension" | "cli" | "onchain_tx";

export interface WalletVerification {
  version: "1";
  chain: Chain;
  address: string;
  controller: Controller;
  method: VerificationMethod; // provenance surfaced to callers
  proof: Proof; // verification algorithm is driven by proof.kind
  /** Set on a signer-wallet record that proves control of a multisig it isn't. */
  delegatedFor?: string;
  /** When the proof was produced. No ttl/expiry — freshness is an SDK policy. */
  authenticatedAt: string; // ISO 8601
}

/** A KYI identity holds many address verifications. */
export interface IssuerIdentity {
  identityId: string;
  addresses: WalletVerification[];
}

// ── SDK contract (implemented per-chain) ───────────────────────────────────────
export interface CheckOptions {
  rpcUrl?: string; // single-chain package
  rpcUrls?: Record<ChainId, string>; // universal router, keyed by CAIP-2
  /** Max age before a proof is reported stale. SDK default when omitted; 0/Infinity disables. */
  maxAge?: number; // ms
}

export interface VerificationResult {
  isVerified: boolean;
  method: VerificationMethod;
  chain: Chain;
  signature?: string;
  staleness: { authenticatedAt: string; ageMs: number; withinMaxAge: boolean };
  details?: { reason?: string; usedRpc: boolean; checkedNative: boolean };
}

export type CheckWalletVerification = (
  metadata: WalletVerification,
  options?: CheckOptions,
) => Promise<VerificationResult>;
