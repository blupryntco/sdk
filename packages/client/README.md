# @bluprynt/sdk-client

> **Pre-alpha.** The API surface can change without notice. No support, no stability guarantees.

Client for the [Bluprynt public API](https://integrations.bluprynt.com/), generated from its
OpenAPI spec. Uses the global `fetch` — no HTTP client dependency.

Most users want the umbrella package [`@bluprynt/sdk`][sdk] instead, which re-exports everything
here.

```sh
npm install @bluprynt/sdk-client
```

```ts
import { createClient } from "@bluprynt/sdk-client";

const client = createClient({
  apiKey: process.env.BLUPRYNT_API_KEY, // sent verbatim in the Authorization header
  baseUrl: "https://integrations.bluprynt.com", // optional, this is the default
  fetch: myFetch, // optional — defaults to global fetch
});

const lookup = await client.lookupTokens({ caip19: "eip155:1/erc20:0xa0b8…" });
const { data: chains } = await client.listChains();
const chain = await client.getChain("eip155:1"); // undefined if unknown
const badge = await client.getBadge("kyi_verified", { format: "svg" }); // Blob
```

A non-2xx response throws `ApiError` with `status` and the response `body`. A token Bluprynt
hasn't indexed isn't an error: `lookupTokens` returns `{ kyi_verified: false, data: [] }`.

Pass the lookup to `verifyKyiResponse` from [`@bluprynt/sdk-core`][core] or a chain add-on to
re-check it.

Requires Node >= 22. ESM + CJS, bundled types.

## Regenerating

`openapi.json` is a snapshot of the live spec. A daily workflow opens a PR when it changes. To
update it and the generated code by hand:

```sh
pnpm --filter @bluprynt/sdk-client generate
```

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
