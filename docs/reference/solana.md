# Solana checks

What `@bluprynt/sdk-chain-solana` checks, step by step. For background, see the [Solana page](/chains/solana). For the report format, see [Reading the report](/sdk/report).

## Methods

| Method | Check | Reads chain state |
| --- | --- | --- |
| `signature` / `solana_raw` | The Ed25519 signature over the UTF-8 message verifies for the wallet's public key | No |
| `signature` / `solana_offchain_v0` | The signature verifies over the message wrapped in the legacy Solana off-chain message format (the format the Solana CLI signs) | No |
| `signature` with no `scheme` | Tries both formats and notes which one matched | No |
| `admin_manual` | Not re-checkable. Reported as `unverifiable` | — |

Other signature schemes, contract signatures and transfers are not supported on Solana and are reported as `unverifiable` (see [transfer proofs](/wallet-verification#onchain-transaction)).

## Authorities

- **`mint_authority`:** the mint account's mint authority is the authority's address.
- **`freeze_authority`:** the mint account's freeze authority is the authority's address.
- **Multisig:** when the authority's `account_type` is `"multisig"`, the SDK reads the SPL Token multisig account. It takes the first `n` signers, the slots in use, and compares them with the claimed signers as a set, so order doesn't matter. The threshold `m` is compared only when the claim has one.

Mint and multisig accounts can belong to SPL Token or Token-2022. Only the base mint's mint and freeze authorities are read. Token-2022 extensions, such as a permanent delegate or a transfer hook, are not checked. Squads vaults and other PDA authorities are not SPL Token multisigs and are not supported (see [Solana quirks](/chains/solana#quirks)). An account owned by another program, an account that isn't a token mint, or one that isn't a token multisig fails the check. Other authority types are reported as `unverifiable` with `no Solana check for <type>`. If such an authority is a multisig, its signers and threshold are still read at `"now"`: a mismatch makes it `invalid`, a match leaves it `unverifiable`. Otherwise it needs no RPC.

## Steps

The steps the Solana checker can report. Their names are exact.

| Step | Where |
| --- | --- |
| `wallet is the authority or one of its signers` | `proof` |
| `solana_raw signature verifies for wallet` | `proof` and `"now"` |
| `solana_offchain_v0 signature verifies for wallet` | `proof` and `"now"` |
| `signature verifies for wallet (scheme not recorded, matched solana_raw)` | `proof` and `"now"`, when `scheme` is `null`. Ends in `solana_offchain_v0` when that format matched |
| `signature verifies for wallet (scheme not recorded)` | Same, when neither format matched |
| `verification's authority is listed for the token` | `proof`, from `verifyKyiToken` and `verifyKyiResponse` |
| `multisig account exists` | `"now"` (multisig authorities) |
| `multisig is owned by a token program` | `"now"` (multisig authorities) |
| `account is a token multisig` | `"now"` (multisig authorities) |
| `multisig signers match claimed signers` | `"now"` (multisig authorities) |
| `multisig threshold` | `"now"` (multisig authorities with a threshold) |
| `mint account exists` | `"now"` (`mint_authority`, `freeze_authority`) |
| `mint is owned by a token program` | `"now"` (`mint_authority`, `freeze_authority`) |
| `account is a token mint` | `"now"` (`mint_authority`, `freeze_authority`) |
| `mint authority` | `"now"` (`mint_authority`) |
| `freeze authority` | `"now"` (`freeze_authority`) |

## Reasons

A failed step makes the result `invalid` with the reason `<step> failed`. These reasons leave a result `unverifiable`:

| `reason` | When |
| --- | --- |
| `proof material missing` | No `message` or `signature` |
| `signature:<scheme> is not supported on Solana` | A signature with a non-Solana scheme |
| `<method> is not supported on Solana` | Contract signatures and transfers, such as `transfer:memo is not supported on Solana` |
| `admin_manual is not part of the public trust model` | `admin_manual` verifications |
| `Solana RPC cannot read historical account state` | Any moment other than `"now"`, for verifications and for the authorities the SDK can check |
| `no Solana check for <type>` | Authorities other than `mint_authority` and `freeze_authority` |

Reasons from the SDK core apply on every chain. They're listed in [Reading the report](/sdk/report#reasons-for-moments).

## How a moment is read

Solana answers only `"now"`. A Solana RPC can't read account state as of a past slot, so at every other moment, verifications and the authorities it can check are `unverifiable` with the reason `Solana RPC cannot read historical account state`. This applies to signature verifications too: the verification check itself skips past moments, even though a signature needs no chain state. It's a limit of the chain: the SDK can't tell either way.

At `"now"`, the SDK reads accounts with `getAccountInfo`, at `confirmed` commitment, the default of Kit's `createSolanaRpc`. A result read on-chain has a `position` with the `slot`. A multisig mint or freeze authority reads two accounts, the multisig and the mint. They may be served from different slots. `position.slot` is the slot of the first read, the multisig account.
