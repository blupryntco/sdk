# @bluprynt/sdk-core

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
