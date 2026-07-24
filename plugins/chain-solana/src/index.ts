import type { ChainId, CheckWalletVerification } from "@bluprynt/sdk-core";

// Solana chain add-on. Depends only on core.

export const SOLANA_NAMESPACE = "solana" as const;

// ponytail: no-op stub — returns not-verified. Replace body with real Solana
// signature (ed25519, off-chain preamble) + memo-tx verification.
export const checkWalletVerification: CheckWalletVerification = async (
  metadata,
  _options,
) => ({
  isVerified: false,
  method: metadata.method,
  chain: metadata.chain,
  staleness: {
    authenticatedAt: metadata.authenticatedAt,
    ageMs: 0,
    withinMaxAge: false,
  },
  details: { reason: "not implemented", usedRpc: false, checkedNative: false },
});

/** Solana mainnet-beta (CAIP-2 genesis-hash reference). */
export const SOLANA_MAINNET: ChainId =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** Build a CAIP-2 chain id for a Solana cluster by genesis hash. */
export function solanaChainId(genesisHash: string): ChainId {
  return `${SOLANA_NAMESPACE}:${genesisHash}`;
}
