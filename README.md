# Bluprynt SDK

> **Pre-alpha — not usable yet.** This is scaffolding: the packages are mostly empty, the API
> surface is a sketch, and everything can change or disappear without notice. Don't install it,
> don't build on it, don't expect it to work. No releases, no support, no stability guarantees.

TypeScript SDK for accessing credential data, parsing schemas, and interacting with Bluprynt
APIs — plus optional, à-la-carte chain add-ons.

## Layout

```
packages/                core — released together
  sdk/     @bluprynt/sdk         umbrella (re-exports core + client)
  core/    @bluprynt/sdk-core    types + credential models + schema parsing (0 runtime deps)
  client/  @bluprynt/sdk-client  API access (auth, HTTP)
plugins/                 optional add-ons — install à la carte
  chain-evm/    @bluprynt/sdk-chain-evm     + subpaths: /tx, /events
  chain-xrpl/   @bluprynt/sdk-chain-xrpl
  chain-solana/ @bluprynt/sdk-chain-solana
examples/                private workspace apps, type-checked in CI
```

A `react` add-on would follow the same pattern as the chain plugins.

## Design rules

- **Dependencies flow one way:** `core` → nothing · `client` → `core` · `plugins/*` → `core`
  (+`client` if they call APIs) · `sdk` umbrella → core+client. **Nothing depends on a plugin** —
  that's what keeps add-ons optional.
- **Capabilities are static:** install the add-on you need; tree-shaking drops what you don't
  import; subpath exports (`/tx`, `/events`) give fine-grained selection. No runtime plugin
  registry.

## Usage

```ts
import { createClient } from "@bluprynt/sdk";        // batteries included
import { evmChainId } from "@bluprynt/sdk-chain-evm"; // add-on, install separately
import { encodeTx } from "@bluprynt/sdk-chain-evm/tx"; // fine-grained subpath
```

## Toolchain

pnpm workspaces · TypeScript · tsdown (ESM+CJS+dts) · Biome · Vitest · Changesets · Node >=22.
Task running is plain `pnpm -r`; reach for Turborepo only if CI build times hurt.

## Develop

```sh
pnpm install
pnpm build       # topological; tsdown emits dist + .d.ts per package
pnpm typecheck   # run after build — resolves workspace types from dist
pnpm test
pnpm lint
```

## CI / Release

- **`.github/workflows/ci.yml`** — on push to `main` and every PR: install (frozen lockfile) →
  build → typecheck → test → lint.
- **`.github/workflows/release.yml`** — on push to `main`: the Changesets action opens/updates a
  "Version Packages" PR as changesets accumulate, and publishes to npm when that PR merges.
  Requires an `NPM_TOKEN` repo secret; `GITHUB_TOKEN` is provided automatically.

Locally: add a changeset with `pnpm changeset`. Versioning/publishing is otherwise handled by the
release workflow. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full changeset + commit workflow.
