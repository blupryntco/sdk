// @bluprynt/sdk — umbrella. Re-exports core + client; tree-shaking drops what you don't use.
// Chain add-ons stay separate: install @bluprynt/sdk-chain-* directly.

import type { CheckWalletVerification } from "@bluprynt/sdk-core";

export * from "@bluprynt/sdk-client";
export * from "@bluprynt/sdk-core";

// ponytail: no-op universal router — returns not-verified. Replace body to look up
// options.rpcUrls[metadata.chain.caip2] and dispatch to the matching chain verifier.
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
