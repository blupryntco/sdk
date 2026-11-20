# @bluprynt/sdk-chain-solana

## 0.2.0

### Minor Changes

- 6659375: Re-check Solana signatures recorded as `solana_offchain_v0_signers`: the message behind the full version 0 off-chain header, with an application domain and the signer's public key. A signature with no recorded scheme is now also tried in this format.

### Patch Changes

- Updated dependencies [a70fc0a]
- Updated dependencies [6659375]
  - @bluprynt/sdk-core@0.2.0

## 0.1.0

### Minor Changes

- bf22fe9: Initial release.

  `sdk-core` ships the credential model (`Credential`, `parseCredential`, `SchemaError`) and the
  CAIP-2 `ChainId` type, with zero runtime dependencies. `sdk-client` provides `createClient` for
  credential retrieval over the global `fetch`. `sdk` re-exports both as a batteries-included
  umbrella.

  The `chain-evm`, `chain-solana`, and `chain-xrpl` add-ons expose their CAIP-2 chain-id helpers;
  `chain-evm` additionally ships `/tx` and `/events` subpaths. Their `checkWalletVerification`
  implementations are stubs that always return `isVerified: false` — signature and on-chain
  verification are not implemented yet.

### Patch Changes

- Updated dependencies [bf22fe9]
  - @bluprynt/sdk-core@0.1.0
