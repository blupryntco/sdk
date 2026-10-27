# Querying the API

`@bluprynt/sdk-client` calls [Bluprynt's public API](https://integrations.bluprynt.com/). It's generated from the API's OpenAPI spec. `@bluprynt/sdk` re-exports it.

```sh
npm install @bluprynt/sdk-client
```

## Create a client

```ts
import { createClient } from "@bluprynt/sdk-client";

const client = createClient({ apiKey: process.env.BLUPRYNT_API_KEY ?? "" });
```

| Option | Meaning |
| --- | --- |
| `apiKey` | Your API key. It's sent as-is in the `Authorization` header |
| `baseUrl` | Defaults to `https://integrations.bluprynt.com` |
| `fetch` | Defaults to the global `fetch`. Pass your own to add retries, logging or a proxy |

## Look up a token

```ts
const response = await client.lookupTokens({
  caip19: "eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3",
});
```

Look a token up by its [CAIP-19](/reference/glossary#caip) ID, or by `address` with an optional `chain_slug`:

```ts
await client.lookupTokens({ address: "0xA0b8…", chain_slug: "ethereum" });
```

The result is the response of `GET /kyi/v1/tokens`. Pass it to `verifyKyiResponse` to re-check it: see the [Quickstart](/quickstart#verify-offline). [Lookup fields](/reference/lookup) lists what the SDK reads from it.

A token Bluprynt hasn't indexed isn't an error. The API answers 404, and `lookupTokens` returns `{ kyi_verified: false, data: [] }`.

## List chains

```ts
const { data } = await client.listChains();
const chain = await client.getChain("eip155:1");
```

Each chain has a `caip2` ID, a `slug`, a `name` and `mainnet`. Use the `slug` as `chain_slug` in a lookup. `getChain` returns `undefined` for a CAIP-2 ID Bluprynt doesn't know.

A chain in this list is one Bluprynt can identify. It doesn't mean Bluprynt has indexed tokens on it. The list changes rarely. Fetch it once and cache it.

## Get a badge image

```ts
const svg = await client.getBadge("kyi_verified", { format: "svg", theme: "dark" });
```

It returns a `Blob`. The options are `size` (`"16"`, `"24"`, `"32"` or `"64"`), `format` (`"svg"` or `"png"`), `theme` (`"dark"` or `"light"`) and `variant` (`"icon"` or `"full"`). [Showing a badge](/sdk/badge) explains when to show one.

## Errors

| What happened | What you get |
| --- | --- |
| The API answers with a non-2xx status, other than the 404s above | `ApiError`, with `status` and the response `body` |
| The request doesn't reach the API | The error your `fetch` throws |

```ts
import { ApiError } from "@bluprynt/sdk-client";

try {
  await client.listChains();
} catch (error) {
  if (error instanceof ApiError && error.status === 401) {
    // the API key is wrong
  }
}
```
