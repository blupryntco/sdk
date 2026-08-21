# @bluprynt/sdk-chain-solana

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

Solana chain add-on for the Bluprynt SDK. Optional — install it alongside
[`@bluprynt/sdk`][sdk] only if you need Solana support. Depends on
[`@bluprynt/sdk-core`][core] and nothing else.

```sh
npm install @bluprynt/sdk-chain-solana
```

```ts
import { SOLANA_MAINNET, solanaChainId } from "@bluprynt/sdk-chain-solana";

SOLANA_MAINNET; // "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
solanaChainId(genesisHash);
```

`checkWalletVerification` is a stub that always returns `isVerified: false`. Real ed25519
signature and memo-transaction verification are not implemented yet.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
