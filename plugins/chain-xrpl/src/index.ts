import type { ChainId, CheckWalletVerification } from "@bluprynt/sdk-core";

// XRPL chain add-on. Depends only on core.

export const XRPL_NAMESPACE = "xrpl" as const;

// ponytail: no-op stub — returns not-verified. Replace body with real XRPL
// signature verification (derive classic address from publicKey; signer list + quorum
// for MULTISIGN). Transfer-based tx verification is not planned for XRPL.
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

/** Build a CAIP-2 chain id for an XRPL network, e.g. xrplChainId("0") => "xrpl:0". */
export function xrplChainId(reference: string): ChainId {
  return `${XRPL_NAMESPACE}:${reference}`;
}
