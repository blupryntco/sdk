# Checking published data

Everything Bluprynt publishes to IPFS is a W3C [verifiable credential](https://www.w3.org/TR/vc-data-model-2.0/) (VC): identities, credentials, attestations, and whatever we publish next. A VC is a format, not a kind of data. Don't confuse it with a Bluprynt credential, such as a license or a disclosure, which is one of the things we publish *as* a VC.

Anyone can upload a lookalike document to IPFS. A VC carries what the lookalike can't: a proof, a signature by its issuer over everything in it. `verifyCredential` from `@bluprynt/sdk-registry` checks that proof, and so tells whether the data was really published by Bluprynt: it's well-formed, its issuer is one you accept, and it's signed by that issuer's key.

```sh
npm install @bluprynt/sdk-registry
```

```ts
import { verifyCredential } from "@bluprynt/sdk-registry";

const result = await verifyCredential(credential);

result.status; // "valid" | "invalid" | "unverifiable"
result.reason; // why, when not valid
result.steps; // each check, in order
```

`credential` is the parsed VC JSON from IPFS.

## What it checks

The checks run in order and stop at the first failure.

| Step | Fails when |
| --- | --- |
| `credential is well-formed` | The VC doesn't follow the VC data model, or `now` falls outside `validFrom` / `validUntil` |
| `issuer is accepted` | `issuer` isn't one of `options.issuers` |
| `proof verifies` | The proof isn't an `ecdsa-jcs-2019` signature by a key the issuer's DID document lists under `assertionMethod`, or anything in the VC changed after signing |

A failed step makes the result `invalid`, with `reason` set to `<step> failed`. A forged, altered, or foreign VC fails the same way.

The result is `unverifiable` when nothing failed but the SDK couldn't finish:

- `could not resolve <did>`: the issuer's DID document couldn't be fetched.
- `credentialStatus not checked`: the VC has a status entry, such as revocation or suspension, and the SDK doesn't read status lists yet. Its signature checked out.

## Options

| Option | Default | Use |
| --- | --- | --- |
| `issuers` | `["did:web:registry.bluprynt.com"]` | Issuer DIDs you accept |
| `resolveDid` | `did:web` over HTTPS | `(did) => Promise<document \| null>`, to cache DID documents or verify offline |
| `now` | The current time | The moment `validFrom` and `validUntil` are checked against |

`did:web:registry.bluprynt.com` resolves to `https://registry.bluprynt.com/.well-known/did.json`. JSON-LD contexts are bundled with the SDK; verifying never fetches one.

## What it doesn't check

A valid result says Bluprynt published the data and that it wasn't changed. It doesn't say that the claims in it are true, or that its subject is the one you care about: compare `credentialSubject.id` yourself.
