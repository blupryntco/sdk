# @bluprynt/sdk

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

Batteries-included umbrella for the Bluprynt SDK. Re-exports [`@bluprynt/sdk-core`][core] and
[`@bluprynt/sdk-client`][client]; tree-shaking drops what you don't import.

```sh
npm install @bluprynt/sdk
```

```ts
import { createClient, parseCredential } from "@bluprynt/sdk";

const client = createClient({ baseUrl: "https://api.example.com", apiKey: process.env.API_KEY });
const credential = await client.getCredential("cred_123");
```

Chain add-ons are **not** bundled here — install them à la carte:
[`@bluprynt/sdk-chain-evm`][evm] · [`@bluprynt/sdk-chain-solana`][solana] ·
[`@bluprynt/sdk-chain-xrpl`][xrpl].

`checkWalletVerification` is exported but currently a no-op that always returns
`isVerified: false`.

Requires Node >= 22 (uses global `fetch`). ESM + CJS, bundled types.

[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
[client]: https://www.npmjs.com/package/@bluprynt/sdk-client
[evm]: https://www.npmjs.com/package/@bluprynt/sdk-chain-evm
[solana]: https://www.npmjs.com/package/@bluprynt/sdk-chain-solana
[xrpl]: https://www.npmjs.com/package/@bluprynt/sdk-chain-xrpl
