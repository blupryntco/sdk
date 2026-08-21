# @bluprynt/sdk-client

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

API client for Bluprynt. Uses the global `fetch` — no HTTP client dependency.

Most users want the umbrella package [`@bluprynt/sdk`][sdk] instead, which re-exports everything
here.

```sh
npm install @bluprynt/sdk-client
```

```ts
import { createClient } from "@bluprynt/sdk-client";

const client = createClient({
  baseUrl: "https://api.example.com",
  apiKey: process.env.API_KEY,
  fetch: myFetch, // optional — defaults to global fetch
});

const credential = await client.getCredential("cred_123");
```

Responses are validated through `parseCredential` from [`@bluprynt/sdk-core`][core], so a
malformed payload throws `SchemaError` rather than surfacing as a bad object.

Requires Node >= 22. ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
