import type { ChainId, CheckWalletVerification } from "@bluprynt/sdk-core";

// EVM chain add-on. Depends only on core. Fine-grained capabilities live in subpaths:
//   @bluprynt/sdk-chain-evm/tx      transaction helpers
//   @bluprynt/sdk-chain-evm/events  log/event helpers

export const EVM_NAMESPACE = "eip155" as const;

// ponytail: no-op stub — returns not-verified. Replace body with real EVM verification:
// eip191 ecrecover (EOA), erc1271 isValidSignature via RPC (contract wallets),
// and unique-wei transfer checks (onchain_tx).
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

/** Build a CAIP-2 chain id for an EVM network, e.g. evmChainId(1) => "eip155:1". */
export function evmChainId(reference: number): ChainId {
  return `${EVM_NAMESPACE}:${reference}`;
}
