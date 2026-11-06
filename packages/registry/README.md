# @bluprynt/sdk-registry

> **Pre-alpha — not usable yet.** The API surface can change or disappear without notice. No
> support, no stability guarantees.

Read and verify what Bluprynt publishes: identities, credentials and attestations. Optional —
install it alongside [`@bluprynt/sdk`][sdk] only if you need it.

```sh
npm install @bluprynt/sdk-registry
```

```ts
import { verifyCredential } from "@bluprynt/sdk-registry";

const result = await verifyCredential(credential);
result.status; // "valid" | "invalid" | "unverifiable"
```

Everything Bluprynt publishes to IPFS is a W3C verifiable credential (VC). `verifyCredential`
tells whether one was really published by Bluprynt: it's well-formed, comes from an accepted
issuer (Bluprynt by default), and carries an `ecdsa-jcs-2019` proof by a key its issuer's
`did:web` document lists for assertions. Status lists aren't read yet. See
[Checking published data](https://sdk.bluprynt.com/sdk/published-data).

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
