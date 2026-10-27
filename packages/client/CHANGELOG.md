# @bluprynt/sdk-client

## 0.2.0

### Minor Changes

- 35f2c32: Generate the API client from the public API's OpenAPI spec. `createClient({ apiKey })` now returns `lookupTokens`, `listChains`, `getChain` and `getBadge`, defaults `baseUrl` to `https://integrations.bluprynt.com`, sends the API key as-is in `Authorization`, and throws `ApiError` on a non-2xx response. `getCredential` is removed: the API has no such endpoint.

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
