# @bluprynt/sdk-chain-xrpl

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

XRPL chain add-on for the Bluprynt SDK. Optional — install it alongside
[`@bluprynt/sdk`][sdk] only if you need XRPL support. Depends on
[`@bluprynt/sdk-core`][core] and nothing else.

```sh
npm install @bluprynt/sdk-chain-xrpl
```

```ts
import { xrplChainId } from "@bluprynt/sdk-chain-xrpl";

xrplChainId("0"); // "xrpl:0"
```

`checkWalletVerification` is a stub that always returns `isVerified: false`. Real signature
verification (classic address derivation, signer list + quorum for `MULTISIGN`) is not
implemented yet. Transfer-based transaction verification is not planned for XRPL.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
