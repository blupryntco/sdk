# Lookup fields

The SDK re-checks a response from `GET /kyi/v1/tokens`. This page lists the fields it reads and what it does with them. The [API docs](https://integrations.bluprynt.com/) describe the full response.

::: warning Experimental
The SDK's types for the response follow the public API's current shape. Each build checks them against the API's OpenAPI spec, but they can still change.
:::

## Response

| Field | What the SDK does with it |
| --- | --- |
| `kyi_verified` | Bluprynt's claim for the whole response. Reported as the report's `claimed` |
| `data[]` | One item per token. Each is checked on its own |

## Token item

| Field | What the SDK does with it |
| --- | --- |
| `kyi_verified` | Bluprynt's claim for this token. Reported as the token report's `claimed` |
| `token.caip19` | Copied to the token report |
| `token.caip2` | Picks the chain's checker and the RPC from `rpcUrls` |
| `token.address` | The token contract on EVM, the mint on Solana, `CURRENCY.rIssuer` on XRPL |
| `authorities[]` | Each one is checked at each moment. See [Authorities](#authorities) |
| `verifications[]` | Each one is checked offline and at each moment. See [Verifications](#verifications) |

The SDK doesn't read `asset`, `issuer`, or the token's `chain_slug`, `standard`, `decimals` and `verified_at`. [What a proof shows](/trust-model#more-effort) explains what that leaves to you.

## Authorities {#authorities}

An authority is an address that controls the token on-chain, as Bluprynt lists it.

| Field | Meaning |
| --- | --- |
| `type` | What kind of control it is, such as `owner`, `mint_authority`, `freeze_authority`, `issuer` or `controlled_by` |
| `address` | The authority's address |
| `account_type` | `"regular"` or `"multisig"` |
| `signers` | A multisig's signers. A wallet backs the authority if it's the `address` or one of these |
| `threshold` | A multisig's threshold, or `null`. Compared only when it isn't `null` |
| `observed_at` | When Bluprynt saw the authority. It's the authority's `"verified"` moment. With `null`, `"verified"` gives `no recorded moment` |

Which types each chain reads on-chain, and how it treats a multisig, is in the Reference: [EVM](/reference/evm#authorities), [Solana](/reference/solana#authorities) and [XRPL](/reference/xrpl#authorities).

## Verifications {#verifications}

A verification records that a wallet proved control, backing one authority. Bluprynt stores enough with it to re-check it.

| Field | Meaning |
| --- | --- |
| `wallet_address` | The wallet whose proof backs the verification |
| `authority` | The authority it backs, with the same fields as above. Its `type` and `address` must match one of the token's `authorities` |
| `method` | How control was proven, with the proof material. See [Methods](#methods) |
| `verified_at` | When Bluprynt checked the proof. It's the verification's `"verified"` moment |
| `expires_at` | When the proof stops counting, or `null`. Applied at moments only. See [Expiry](/sdk/report#expiry) |

A timestamp that doesn't parse throws, such as `Malformed verified_at: <value>`.

## Methods {#methods}

`method.type` says how the wallet proved control. The other fields are the proof material.

| `type` | Fields | Chains |
| --- | --- | --- |
| `signature` | `scheme` (`eip191`, `eip712`, `solana_raw`, `solana_offchain_v0`, `xrpl` or `null`), `message`, `signature`, `signer_public_key` (needed on XRPL) | EVM, Solana, XRPL |
| `contract_signature` | `scheme` (`eip1271`), `inner_scheme` (`eip191` or `eip712`), `message`, `signature`, `caip2`, `block_number` | EVM |
| `transfer` with `kind: "amount"` | `caip2`, `transaction_hash`, `sender`, `recipient`, `asset` (a CAIP-19 ID), `amount` (in base units) | EVM |
| `transfer` with `kind: "memo"` | `caip2`, `transaction_hash`, `sender`, `recipient`, `memo` | EVM |
| `admin_manual` | None. Set by hand, so there is nothing to re-check | Any |

The chain pages show what each method looks like and how it's produced: [EVM](/chains/evm#how-bluprynt-verifies-it), [Solana](/chains/solana#how-bluprynt-verifies-it) and [XRPL](/chains/xrpl#how-bluprynt-verifies-it).
