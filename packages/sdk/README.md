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

## KYI verification

Re-checks a Bluprynt KYI token lookup (`GET /kyi/v1/tokens`) against public data and your own RPC, on any mix of chains.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk";
import { evmKyi } from "@bluprynt/sdk-chain-evm";
import { solanaKyi } from "@bluprynt/sdk-chain-solana";
import { xrplKyi } from "@bluprynt/sdk-chain-xrpl";

const report = await verifyKyiResponse(response, {
  chains: [evmKyi, solanaKyi, xrplKyi],
  rpcUrls: {
    "eip155:1": "https://mainnet-eth.rpc.example.com",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "https://solana.rpc.example.com",
    "xrpl:0": "wss://xrpl.rpc.example.com",
  },
  at: ["verified", "now"],
});

report.verified; // what the timeless proofs support
report.at.now?.verified; // what the evidence supports as of now
```

By default it works offline and makes no RPC calls. Pass `at` to read chain state at each record's own moment (`"verified"`), at `"now"`, or at any `Date`. Each moment is reported separately.

What it checks, per token:

- Each verification's proof holds on its chain.
- Each verification's authority is one of the token's listed authorities.
- Each listed authority matches the on-chain state at each moment, where the chain can be checked.

See the [Quickstart](https://blupryntco.github.io/sdk/quickstart) and [Reading the report](https://blupryntco.github.io/sdk/sdk/report) for details.

Requires Node >= 22 (uses global `fetch`). ESM + CJS, bundled types.

[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
[client]: https://www.npmjs.com/package/@bluprynt/sdk-client
[evm]: https://www.npmjs.com/package/@bluprynt/sdk-chain-evm
[solana]: https://www.npmjs.com/package/@bluprynt/sdk-chain-solana
[xrpl]: https://www.npmjs.com/package/@bluprynt/sdk-chain-xrpl
