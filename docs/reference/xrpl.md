# XRPL checks

What `@bluprynt/sdk-chain-xrpl` checks, step by step. For background, see the [XRPL page](/chains/xrpl). For the report format, see [Reading the report](/sdk/report).

## Methods

| Method | Check | Reads chain state |
| --- | --- | --- |
| `signature` / `xrpl` | The signature over the message, hex-encoded, verifies for the recorded signer public key. At a moment, that key was authorized for the wallet | At a moment only |
| `signature` with no `scheme` | Checked as `xrpl` | At a moment only |
| `admin_manual` | Not re-checkable. Reported as `unverifiable` | — |

Offline, the signer key decides how the wallet is matched:

- **[Master key](/reference/glossary#master-key):** the key derives the wallet's address. The proof is `valid`.
- **Any other key:** the proof is `unverifiable` until it's checked at a moment.
- **No signer public key recorded:** reported as `unverifiable`.

At a moment, the SDK reads the wallet's account at that moment's ledger. The key was authorized if it's the master key and the master key wasn't disabled then, or if it was the account's `RegularKey` then. A key that wasn't authorized, or an account that didn't exist, makes the verification `invalid` at that moment. It may still be valid at another one. The exception is a key that is neither the master key nor the `RegularKey` on an account with a signer list: the SDK doesn't read signer lists, so that verification is `unverifiable` with `XRPL signer lists are not supported`. A disabled master key is `invalid` either way.

A signature that doesn't verify for the signer key is `invalid`. Other signature schemes, contract signatures and transfers are not supported on XRPL and are reported as `unverifiable`.

## Authorities

- **`issuer`:** the authority's address is the issuer of the token, and the issuer account exists at the moment. The issuer is everything after the last `.` in the token address. The account lookup runs only after the issuer matches the token.

XRPL multisig authorities are not supported. They and every other authority type are reported as `unverifiable` and need no RPC.

At a moment, an `issuer` authority on a token address without a `.` throws `Malformed XRPL token address`.

## Steps

The steps the XRPL checker can report. Their names are exact.

| Step | Where |
| --- | --- |
| `wallet is the authority or one of its signers` | `proof` |
| `xrpl signature verifies for signer key` | `proof` and each moment |
| `signer key is the wallet's master key` | `proof`, when the key derives the wallet's address |
| `verification's authority is listed for the token` | `proof`, from `verifyKyiToken` and `verifyKyiResponse` |
| `signer key was authorised for the wallet` | Moments |
| `issuer matches the token` | Moments (`issuer` authorities) |
| `issuer account exists` | Moments (`issuer` authorities) |

## Reasons

A failed step makes the result `invalid` with the reason `<step> failed`. These reasons leave a result `unverifiable`:

| `reason` | When |
| --- | --- |
| `proof material missing` | No `message` or `signature` |
| `signature:<scheme> is not supported on XRPL` | A signature with a non-XRPL scheme |
| `signer public key not recorded` | No `signer_public_key` |
| `signer is not the master key; online check needed` | Offline, when the key isn't the wallet's master key |
| `<method> is not supported on XRPL` | Contract signatures and transfers |
| `admin_manual is not part of the public trust model` | `admin_manual` verifications |
| `XRPL multisig is not supported` | Multisig authorities |
| `XRPL signer lists are not supported` | At a moment, a key that is neither the master key nor the `RegularKey`, on an account with a signer list |
| `no XRPL check for <type>` | Authorities other than `issuer` |
| `XRPL server has no ledger <n>` | A past ledger the server doesn't have |
| `chain has no ledger at or before this moment` | The moment is before the first ledger |

Reasons from the SDK core apply on every chain. They're listed in [Reading the report](/sdk/report#reasons-for-moments).

## How a moment is read

For `"now"`, the SDK reads the latest validated ledger. For a past instant, it finds the last ledger closed at or before it, with a binary search over ledger close times. On a server with long history, that's roughly 20 to 30 `ledger` requests. The search runs once per distinct point in time for each token, and all checks for that token share it.

Past ledgers need a server whose history covers them. Most servers keep only recent ledgers. The SDK reads the server's `complete_ledgers` from `server_info`. When it lists several ranges, the SDK uses the one that contains the latest validated ledger. When the moment is before that range, or the server can't serve a ledger, the check is `unverifiable` with the reason `XRPL server has no ledger <n>`. When the server's history reaches back to the first ledger and the moment is earlier still, the reason is `chain has no ledger at or before this moment`.

The SDK connects with the `Client` of `xrpl.js`, over WebSocket only.

A result read on-chain has a `position` with the `ledger`, plus its close `time` for a past moment.
