# Reading the report

`verifyKyiResponse` returns one report for the whole response, with a report per token inside it. This page explains each part, then walks through a real lookup.

## Checks

Each token report has `checks`: one per verification and one per listed authority. A verification check has a `proof` and an `at`. An authority check has only an `at`.

- **`proof`:** the timeless facts: the wallet backs the authority, the signature recovers, the authority is listed for the token. It needs no network.
- **`at[label]`:** the result at one [moment](/sdk/moments) you asked for. It has a `status`, a `reason` when not `valid`, its `steps`, and a `position` when the chain was read.

`position` is the chain position the result was read at: `block` and `time` on EVM, `slot` on Solana, `ledger` on XRPL (plus `time` for a past moment). Compare its `time` with your own freshness rule.

Each check also has a `subject` (the wallet or authority address) and a `method`, such as `signature:eip191`, `contract_signature:eip1271/eip712`, `transfer:amount`, `admin_manual`, or the authority's `type`.

## Status

Each result has a `status`:

- **`valid`:** every step passed.
- **`invalid`:** a step failed. `reason` is `<step> failed`. On EVM, a transaction that doesn't exist, a contract call that reverts, or a call to an address with no contract also counts as a failure.
- **`unverifiable`:** the claim couldn't be checked, for example because the proof material is missing, the method isn't supported, or the verification has expired.

A verification's status at a moment combines its proof with that moment's state. If the proof is `invalid`, the verification is `invalid` at every moment, with the proof's reason. Otherwise the moment decides.

## Reasons for moments

A failed step makes the result `invalid` with the reason `<step> failed`. These reasons come from the SDK core and apply on every chain:

| `reason` | When |
| --- | --- |
| `verification's authority is listed for the token failed` | The verification's authority isn't in the token's `authorities`. Makes the `proof` result `invalid` |
| `record postdates this moment` | The moment is before `verified_at` or `observed_at` |
| `no recorded moment` | `"verified"` on an authority with no `observed_at` |
| `verification expired at <expires_at>` | A verification that would be valid at the moment had expired by then |

Each chain adds its own, such as `online checks not requested` on EVM. The Reference lists them, with when each applies: [EVM](/reference/evm#reasons), [Solana](/reference/solana#reasons) and [XRPL](/reference/xrpl#reasons).

## Steps

The same signature step can appear under both `proof` and `at[label]`. A moment's `steps` hold the method re-check and the chain-state steps for that moment, so `at.now` shows what was read without going back to `proof`. They don't repeat the steps that the wallet backs the authority and that the authority is listed. Those live only in `proof`. If the proof is `invalid`, every moment is `invalid` with the proof's reason, even when all of that moment's steps passed. On XRPL, a moment replaces the offline master-key step with the key authorization read at that ledger.

Steps include the expected and actual values and whether they ran `offline` or over `rpc`. You can log or store them as an audit trail. The Reference lists every step by name.

## Evidence and summaries

The SDK sums up the checks for each token as `evidence`:

| `evidence` | Meaning | `verified` |
| --- | --- | --- |
| `confirmed` | At least one verification is valid and no check is invalid | `true` |
| `contradicted` | At least one check is invalid | `false` |
| `inconclusive` | Nothing is invalid, but no verification could be confirmed | `false` |

`matchesClaim` compares `verified` with what Bluprynt claimed. It is `null` when Bluprynt claims the token is verified but the evidence is inconclusive. In that case, the SDK can neither confirm nor refute the claim.

There is one summary offline and one per moment:

- **Top-level `evidence`, `verified`, `matchesClaim`:** from the verifications' `proof` only. Authorities are not part of it, because they're checked only at moments.
- **`at[label]`:** from every check's result at that moment, verifications and authorities alike.

To show a token as verified, read a moment, not the offline summary. [Showing a badge](/sdk/badge) explains which fields to use.

The response has its own `evidence`, offline and at each moment: `confirmed` if any token is confirmed, otherwise `contradicted` if any token is contradicted, otherwise `inconclusive`. Its `verified` is `true` when its `evidence` is `confirmed`. Its `matchesClaim` compares `claimed` with `verified` and is `null` only when the evidence is inconclusive and Bluprynt claims the response is verified.

## Expiry

Expiry applies at each moment, not to `proof`. A verification whose `expires_at` is at or before the moment is `unverifiable` at that moment, with the reason `verification expired at <expires_at>`. For `"now"`, that's the current time. An expired proof no longer shows control, but it doesn't disprove anything either, so it can't override another, current proof. A verification that fails its check is still `invalid`.

Because `proof` ignores expiry, the offline summary can be `confirmed` by an expired verification. Ask for a moment when expiry matters.

## One call, several chains

Each chain has its own checker: `evmKyi`, `solanaKyi` and `xrplKyi`. To check a response that spans chains, import `verifyKyiResponse` from `@bluprynt/sdk` and pass the checkers you need in `chains`. A token is routed to the checker for its chain.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk";
import { evmKyi } from "@bluprynt/sdk-chain-evm";
import { solanaKyi } from "@bluprynt/sdk-chain-solana";
import { xrplKyi } from "@bluprynt/sdk-chain-xrpl";

const report = await verifyKyiResponse(response, {
  chains: [evmKyi, solanaKyi, xrplKyi],
  rpcUrls: {
    "eip155:1": "https://mainnet-eth.rpc.example.com",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "https://solana.rpc.example.com",
    "xrpl:0": "wss://xrpl.rpc.example.com",
  },
  at: ["now"],
});
```

A token on a chain with no checker in `chains` throws. See [RPC and errors](/sdk/rpc).

## Example

Below is a lookup for a test token on Sepolia. Its issuer proved control of the token's controlling wallet with an EIP-191 signature.

::: details API response
<<< @/../examples/chains/src/data/sepolia.json
:::

The [EVM example](/chains/evm#check-it-yourself) passes it to `verifyKyiResponse(lookup)` with no options. Its test checks that this output stays the same. The report is under `sdk.report`:

::: details Output of the EVM example
<<< @/../examples/chains/output/evm.json
:::

The signature recovers to the wallet without any network access, and the verification's authority is one of the token's listed authorities, so the proof is `valid`. No moments were asked for, so every `at` is empty. One valid proof makes the offline evidence `confirmed`, which matches Bluprynt's claim.

The SDK has no generic on-chain check for a `controlled_by` authority on EVM. Asking for `at: ["verified", "now"]` shows what that means: at every moment, both the authority and the verification are `unverifiable`. The verification is read with its own authority, so it can't be confirmed at a moment either. Its `proof` result is still `valid`. This report needs no RPC calls, because a signature and a `controlled_by` authority read no chain state.

::: details Report with <code>at: ["verified", "now"]</code>
```json
{
  "claimed": true,
  "evidence": "confirmed",
  "verified": true,
  "matchesClaim": true,
  "tokens": [
    {
      "caip19": "eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3",
      "claimed": true,
      "evidence": "confirmed",
      "verified": true,
      "matchesClaim": true,
      "checks": [
        {
          "kind": "verification",
          "subject": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "method": "signature:eip191",
          "proof": {
            "status": "valid",
            "steps": [
              {
                "check": "wallet is the authority or one of its signers",
                "via": "offline",
                "ok": true,
                "expected": [
                  "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"
                ],
                "actual": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"
              },
              {
                "check": "eip191 signature recovers to wallet",
                "via": "offline",
                "ok": true,
                "expected": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
                "actual": "0xf748a9220B9B0D79D6eeD2D927fCdFE80055b19c"
              },
              {
                "check": "verification's authority is listed for the token",
                "via": "offline",
                "ok": true,
                "expected": [
                  {
                    "type": "controlled_by",
                    "address": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"
                  }
                ],
                "actual": {
                  "type": "controlled_by",
                  "address": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"
                }
              }
            ]
          },
          "at": {
            "verified": {
              "status": "unverifiable",
              "reason": "no generic EVM check for controlled_by",
              "steps": [
                {
                  "check": "eip191 signature recovers to wallet",
                  "via": "offline",
                  "ok": true,
                  "expected": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
                  "actual": "0xf748a9220B9B0D79D6eeD2D927fCdFE80055b19c"
                }
              ]
            },
            "now": {
              "status": "unverifiable",
              "reason": "no generic EVM check for controlled_by",
              "steps": [
                {
                  "check": "eip191 signature recovers to wallet",
                  "via": "offline",
                  "ok": true,
                  "expected": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
                  "actual": "0xf748a9220B9B0D79D6eeD2D927fCdFE80055b19c"
                }
              ]
            }
          }
        },
        {
          "kind": "authority",
          "subject": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "method": "controlled_by",
          "at": {
            "verified": {
              "status": "unverifiable",
              "reason": "no generic EVM check for controlled_by",
              "steps": []
            },
            "now": {
              "status": "unverifiable",
              "reason": "no generic EVM check for controlled_by",
              "steps": []
            }
          }
        }
      ],
      "at": {
        "verified": {
          "evidence": "inconclusive",
          "verified": false,
          "matchesClaim": null
        },
        "now": {
          "evidence": "inconclusive",
          "verified": false,
          "matchesClaim": null
        }
      }
    }
  ],
  "at": {
    "verified": {
      "evidence": "inconclusive",
      "verified": false,
      "matchesClaim": null
    },
    "now": {
      "evidence": "inconclusive",
      "verified": false,
      "matchesClaim": null
    }
  }
}
```
:::

The offline summary still confirms the claim. At each moment, the evidence is `inconclusive` and `matchesClaim` is `null`: nothing contradicts Bluprynt, but nothing on-chain confirms the authority either. For an `owner` or Safe authority, the same request reads the chain at each moment and reports the block it read. The [Safe example](/chains/evm#at-a-moment) shows one. [Showing a badge](/sdk/badge) suggests how to turn these summaries into a label.
