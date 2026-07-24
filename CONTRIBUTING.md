# Contributing to Bluprynt SDK

## Development

```sh
pnpm install
pnpm build       # topological; tsdown emits dist + .d.ts per package
pnpm typecheck   # run after build — resolves workspace types from dist
pnpm test
pnpm lint        # pnpm lint:fix to auto-format
```

See the [README](./README.md) for the package layout and the one-way dependency rules
(`core` → nothing · `client` → `core` · `plugins/*` → `core` · umbrella → core+client).

## Releases — Changesets

This repo uses [Changesets](https://github.com/changesets/changesets), matching the rest of the
Bluprynt org (e.g. `forms-engine`). **Releases are driven by changeset files, not by commit
messages.**

Every PR that changes a **published** package must include a changeset:

```sh
pnpm changeset
```

- Select the affected packages and a semver bump for each (patch / minor / major).
- Write a human-readable summary — it becomes the changelog entry.
- Commit the generated `.changeset/*.md` file as part of your PR.

Bump guidance:

| Bump  | When |
|-------|------|
| patch | bug fixes, internal-only changes |
| minor | new backwards-compatible features |
| major | breaking API changes |

Skip the changeset only for changes that touch **no** published package — docs, CI, examples, or
tests. (The `@bluprynt/sdk-example-basic` package is private and ignored by Changesets.)

On merge to `main`, the **Release** workflow opens or updates a "Version Packages" PR that applies
the pending changesets (bumps versions + writes changelogs). Merging that PR publishes to npm.

## Commit messages — Conventional Commits

Releases come from changesets, but we still write commits in
[Conventional Commits](https://www.conventionalcommits.org/) style for a readable history:

```
<type>(<scope>): <subject>
```

- **type** — `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`
- **scope** (optional) — the package without the `@bluprynt/` prefix: `core`, `client`, `sdk`,
  `chain-evm`, `chain-xrpl`, `chain-solana`
- **breaking change** — append `!` after the type/scope (`feat(core)!: …`) and reflect it with a
  major bump in the changeset

Examples:

```
feat(client): add retry option to createClient
fix(chain-evm): correct eip155 chain id formatting
docs: expand the capability model in the README
```
