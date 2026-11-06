# @bluprynt/sdk-registry

## 0.1.0

### Minor Changes

- a70fc0a: Add `@bluprynt/sdk-registry` with `verifyCredential`: checks that a W3C verifiable credential is well-formed, comes from an accepted issuer, and carries an `ecdsa-jcs-2019` proof by a key its issuer's `did:web` document lists for assertions. `CheckStep.via` gains `"web"` for checks that resolve DIDs.

### Patch Changes

- Updated dependencies [a70fc0a]
  - @bluprynt/sdk-core@0.2.0
