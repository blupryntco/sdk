# @bluprynt/sdk-core

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

Credential data models, shared types, and schema parsing for the Bluprynt SDK. **Zero runtime
dependencies.**

Most users want the umbrella package [`@bluprynt/sdk`][sdk] instead, which re-exports everything
here.

```sh
npm install @bluprynt/sdk-core
```

```ts
import { parseCredential, SchemaError, type ChainId } from "@bluprynt/sdk-core";

try {
  const credential = parseCredential(await res.json());
} catch (err) {
  if (err instanceof SchemaError) { /* malformed payload */ }
}
```

- `parseCredential(input)` — validate an `unknown` into a `Credential`, throwing `SchemaError`.
- `ChainId` — CAIP-2 style chain identifier, e.g. `"eip155:1"`.
- Wallet-verification types (`CheckWalletVerification` and friends) that the chain add-ons
  implement.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
