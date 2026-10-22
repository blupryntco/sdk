# Moments

When you look up a token through [Bluprynt's public API](https://integrations.bluprynt.com/) (`GET /kyi/v1/tokens`), the response tells you whether the token passed KYI (`kyi_verified`). It also includes the evidence behind that claim:

- **[Authorities](/reference/glossary#authority):** the addresses that control the token, such as its `owner()` or a Safe multisig and its signers.
- **[Verifications](/reference/glossary#verification):** the wallet proofs showing that the issuer controls one of those authorities. A proof is a signature, a contract signature or an on-chain transfer (see [Wallet verification](/wallet-verification)). Each verification names the authority it backs, and that authority must be one of the token's listed authorities.

The SDK re-checks that evidence against public data and your own RPC, so you don't have to rely on the `kyi_verified` flag alone.

::: warning Experimental
The KYI response types follow the public API's current shape. They will change until they are generated from the OpenAPI spec.
:::

## Which moment to ask for

The SDK reports [facts, not verdicts](/trust-model#facts-not-verdicts): what held, and when.

Chain state changes. A wallet that controlled a token six months ago may not control it today. Whether that matters depends on your question:

| Your question | Moment to check |
| --- | --- |
| Did a claim made six months ago hold when it was made? | `"verified"` |
| Is a recent claim backed? | `"verified"` on the newer record, or the instant it was made |
| Does the wallet still control the token? | `"now"` |

By default the SDK works offline. It checks only timeless facts: who signed what, whether the wallet backs the authority it names, and whether that authority is listed for the token. It makes no RPC calls and needs no `rpcUrls`.

To read chain state, ask for moments with `at`:

```ts
const report = await verifyKyiResponse(response, {
  rpcUrls: { "eip155:1": "https://mainnet-eth.rpc.example.com" },
  at: ["verified", "now", new Date("2026-04-01T00:00:00Z")],
});
```

Each moment is reported separately, under its own label:

- **`"verified"`:** each record's own moment. For a verification, that's its `verified_at`, and its own authority is also read at that time. For a listed authority, it's `observed_at`. An EVM contract signature is read at its recorded block.
- **`"now"`:** the latest state the RPC serves.
- **A `Date`:** the instant you choose. Its label is the ISO string, such as `"2026-04-01T00:00:00.000Z"`.

The SDK doesn't pick a moment for you, and it has no maximum age. If a 6-month-old verification's wallet is no longer an authority, the report says it held then and doesn't hold now: `valid` at `"verified"`, `invalid` at `"now"`. [Showing a badge](/sdk/badge#rotation) walks through two examples. Each result carries the timestamps and chain [positions](/reference/glossary#position) it was read at, so you can apply your own freshness rule.

Some chains can't answer for every moment. A Solana RPC can't read past account state, so a past moment there is `unverifiable`. That is a limit of the chain, not a failed check.

## What gets checked, and when

For each verification, the SDK first checks that `wallet_address` is the authority itself or one of its signers. It then re-checks the proof according to its method. When you use `verifyKyiToken` or `verifyKyiResponse`, it last checks that the verification's `authority` is listed in the token's `authorities`, with the same `type` and the same address. Without that, a proof for some unrelated authority could vouch for the token, so the verification is `invalid`. Addresses are compared with the chain's rules: exactly on Solana and XRPL, ignoring case on EVM.

These checks are timeless and go in the verification's `proof`. Everything that depends on chain state runs only at the moments you ask for. At each moment, a verification is re-checked by its method and its own authority is read on-chain. Each listed authority is read on-chain at each moment too. Authority types the SDK can't check are `unverifiable` at every moment and need no RPC. A multisig can be an exception, depending on the chain: see the Reference for [EVM](/reference/evm#authorities), [Solana](/reference/solana#authorities) and [XRPL](/reference/xrpl#authorities). A moment before the record, or `"verified"` for a record with no moment, gets its own reason instead (see [Reading the report](/sdk/report#reasons-for-moments)).

How each chain reads a moment, and which methods and authorities it checks, is in the Reference: [EVM](/reference/evm), [Solana](/reference/solana) and [XRPL](/reference/xrpl).

## Which function to call

Each chain has its own checker: `evmKyi`, `solanaKyi` and `xrplKyi`. Each chain package also exports functions bound to its checker.

| Function | Checks |
| --- | --- |
| `verifyKyiResponse(response, options)` | A whole `GET /kyi/v1/tokens` response |
| `verifyKyiToken(item, options)` | One item from the response's `data` |
| `checkKyiVerification(verification, token, options)` | One verification on its own |
| `checkKyiAuthority(authority, token, options)` | One authority on its own |

All of them accept `at` and `rpcUrls`. The `@bluprynt/sdk` versions of `verifyKyiResponse` and `verifyKyiToken` also take `chains`, and route each token to the checker for its chain.

`verifyKyiToken` and `verifyKyiResponse` check that each verification's authority is listed for the token. `checkKyiVerification` skips that check. Use the token or response functions when it matters.
