# Showing a badge

A wallet, explorer or exchange often shows a short label next to a token: a badge. This page suggests how to pick one from the SDK's report. The SDK reports facts. The states and wording below are suggestions, not part of the SDK.

## Which fields to use

A report has one summary offline and one for each moment you ask for. They answer different questions.

| Field | What it covers | Question it answers |
| --- | --- | --- |
| `evidence`, `verified`, `matchesClaim` | The offline summary: the `proof` results only. Signatures and the binding between wallet, authority and token. It ignores authorities on-chain and expiry | Do the stored proofs check out? |
| `at.verified` | Every check at each record's own moment, including authorities on-chain and expiry | Did the claim hold when it was made? |
| `at.now` | Every check at the latest state your RPC serves, including authorities on-chain and expiry | Does the claim hold now? |

Always ask for both moments, `at: ["verified", "now"]`, so a failure now can be told apart from a claim that never held. Don't base a badge on the top-level `verified` alone. It stays `true` for a token whose authority changed hands after the proof was made, and for a proof that has expired. Ask for `at: ["verified", "now"]` and read `at.now` first.

The response report and each token report (`report.tokens[i]`) have the same three summaries. For a badge on one token, read its token report.

```ts
const report = await verifyKyiResponse(response, {
  rpcUrls: { "eip155:1": "https://mainnet-eth.rpc.example.com" },
  at: ["verified", "now"],
});

const token = report.tokens[0];
token?.evidence; // offline summary
token?.at.verified?.evidence; // when each record was made
token?.at.now?.evidence; // now
```

## Suggested states {#states}

Go down the table and use the first row that matches. "Any" means the value doesn't matter for that row.

| `claimed` | Offline `evidence` | `at.verified` | `at.now` | What it means | Suggested badge |
| --- | --- | --- | --- | --- | --- |
| `false` | Any | Any | Any | Bluprynt doesn't claim the token passed KYI | No badge |
| `true` | `contradicted` | Any | Any | A stored proof doesn't check out: the signature fails, the wallet doesn't back its authority, or the authority isn't listed for the token | Proof check failed |
| `true` | Any | Any | `confirmed` | At least one proof holds at the latest state, and no check failed | Verified now |
| `true` | Any | `confirmed` | `contradicted` | The claim held when it was made. A check fails now | Verified on &lt;date&gt;; control has changed since |
| `true` | Any | `inconclusive` | `contradicted` | The past couldn't be read. A check fails now | Proof checked; doesn't hold now |
| `true` | Any | Not asked for | `contradicted` | A check fails now | Doesn't hold now |
| `true` | Any | `contradicted` | `contradicted` | A check failed at every moment read | Not confirmed on-chain |
| `true` | Any | Any | `inconclusive` | Nothing failed now, and nothing confirmed the claim now. Decide by the reasons alone: see [Telling inconclusive results apart](#inconclusive) | By reason |
| `true` | `confirmed` | Not asked for | Not asked for | Offline only: the proofs check out | Proof checked |
| `true` | `inconclusive` | Not asked for | Not asked for | Offline only, and no proof could be confirmed offline | Couldn't check |

If the call throws, for example on an RPC timeout or a rate limit, nothing was checked. Show "Couldn't check" and try again later. Don't show a failure. [RPC and errors](/sdk/rpc#what-throws-and-what-s-reported) lists what throws.

For &lt;date&gt;, use the verification's `verified_at`, or the `time` in the `position` of its `at.verified` result.

### Telling inconclusive results apart {#inconclusive}

An `inconclusive` summary means nothing failed and nothing was confirmed. Decide by the `reason` on each check's result alone, whatever the offline summary says: it is `inconclusive` by design for some proofs, such as EVM contract signatures and transfers, and XRPL regular-key signatures. Look at the token's `checks[i].at.now.reason`:

| `reason` | What happened | Suggested badge |
| --- | --- | --- |
| `no generic EVM check for <type>`, `no Solana check for <type>`, `no XRPL check for <type>`, `XRPL multisig is not supported` | The SDK can't read this kind of authority on this chain, such as `controlled_by` | Proof checked; authority can't be read on this chain |
| `XRPL signer lists are not supported` | The signing key may belong to the account's signer list, which the SDK doesn't read | Signer can't be checked on this chain |
| `verification expired at <expires_at>` | The proof had a lifetime, and it's over | Proof expired on &lt;date&gt; |
| `admin_manual is not part of the public trust model`, `proof material missing`, `signer public key not recorded`, `<method> is not supported on Solana`, `<method> is not supported on XRPL`, `scheme <scheme> is not EVM` | There's no proof the SDK can re-check | Couldn't check |

The Sepolia lookup in the [Quickstart](/quickstart) is the first case: its authority is `controlled_by`, so the summary is `inconclusive` at every moment, while its `proof` result is `valid`.

Missing history affects past moments only. `RPC has no state for block <n>` (no archive RPC), `XRPL server has no ledger <n>` (no full-history server) and `Solana RPC cannot read historical account state` leave `at.verified` `unverifiable`. That says nothing about the token. With `at.now` `confirmed`, "Verified now" still fits.

The reason tables for each chain are in the Reference: [EVM](/reference/evm#reasons), [Solana](/reference/solana#reasons) and [XRPL](/reference/xrpl#reasons).

## When an authority or key changes {#rotation}

A proof can hold when it was made and stop holding later. The SDK reports that as two facts: the verification is `valid` at `"verified"` (it held when verified) and `invalid` at `"now"` (it no longer holds now). The token's `at.now.evidence` is then `contradicted`, because one of its checks failed at that moment. Each moment answers its own question:

| Question | Moment | Read |
| --- | --- | --- |
| Did the claim hold when Bluprynt verified it? | `"verified"` | `at.verified` |
| Does it hold today? | `"now"` | `at.now` |

Two worked examples show this with recorded RPC responses:

- **EVM: a Safe's owners changed.** A token's `owner()` is a 2-of-3 Safe, and one of its owners signed. At `"verified"`, the Safe's owners match the claimed ones, so the verification is `valid`. Later, one owner was swapped. At `"now"`, the verification is `invalid` with `Safe owners match claimed signers failed`. See [EVM: at a moment](/chains/evm#at-a-moment).
- **XRPL: the master key was disabled.** An issuer signed with its master key, then set a regular key and disabled its master key, then signed again with the regular key. The master-key proof is `valid` at `"verified"` and `invalid` at `"now"` with `signer key was authorised for the wallet failed`. The regular-key proof is `valid` at both. The token's `at.now.evidence` is still `contradicted`, because one check fails. See [XRPL: at a moment](/chains/xrpl#at-a-moment).

In both, the offline summary is `confirmed`, `at.verified` is `confirmed` and `at.now` is `contradicted`. A suggested badge is "Verified on &lt;date&gt;; control has changed since". In the XRPL case, a check that's `valid` at `"now"` shows a current proof too. You can show that next to the badge.

## Show where it was read

Show the `position` of the result next to the badge, so a reader can look it up. It's on each check's result, under `checks[i].at[label].position`:

- **EVM:** `block` and its `time`.
- **Solana:** `slot`.
- **XRPL:** `ledger`, plus its close `time` for a past moment.

For `"now"` on Solana and XRPL there's no `time`. Record when you made the call. Checks of one token can be read at slightly different positions, so show the one from the verification behind the badge.

## Your RPC is part of the result

`at.now` is only as reliable as the RPC you configure. The SDK reads what the RPC returns and doesn't cross-check it with another source. An endpoint that lags or returns wrong data can make a check pass or fail. Use an endpoint you trust. [RPC and errors](/sdk/rpc) covers setup.

## What the badge claims, and what it doesn't

You can give this to an auditor, with your own RPC and positions filled in:

> **"Verified now"** means: at the stated block, slot or ledger, read through our RPC, at least one wallet proof recorded by Bluprynt checked out. The wallet was the token's listed authority or one of its signers, that authority held on-chain, the proof hadn't expired, and no check failed.
>
> It doesn't mean that the issuer is the organization Bluprynt names (that comes from Bluprynt's KYB process), that Bluprynt's list of authorities is complete, or that the wallet's key hasn't leaked. It says nothing about token features beyond the authorities the SDK reads.

[What a proof shows, and what it doesn't](/trust-model) lists what the SDK re-checks and what takes more effort to verify.
