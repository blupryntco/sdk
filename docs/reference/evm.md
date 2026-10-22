# EVM checks

What `@bluprynt/sdk-chain-evm` checks, step by step. For background, see the [EVM page](/chains/evm). For the report format, see [Reading the report](/sdk/report).

## Methods

| Method | Check | Reads chain state |
| --- | --- | --- |
| `signature` / `eip191` | The signature over the stored message recovers to the wallet | No |
| `signature` / `eip712` | The typed-data signature recovers to the wallet | No |
| `signature` with no `scheme` | Treated as `eip191` when the wallet is a `0x` address | No |
| `contract_signature` / `eip1271` | `isValidSignature` on the wallet contract, at the block for the moment. At `"verified"`, that's the recorded block | Yes |
| `transfer` / `amount` | The transaction succeeded, was sent from the wallet, and the asset is on the transaction's chain. For the native asset (`slip44`), its recipient and value match. For an ERC-20 token, the receipt contains a matching `Transfer` event | Yes |
| `transfer` / `memo` | The transaction succeeded, its sender and recipient match, and its calldata carries the memo | Yes |
| `admin_manual` | Not re-checkable. Reported as `unverifiable` | — |

Contract signatures and transfers need chain state, so offline their `proof` is `unverifiable` with the reason `online checks not requested`. Ask for a moment to check them. A transaction mined after the moment's block is `unverifiable` at that moment with the reason `record postdates this moment`. The same applies to a contract signature whose recorded block is after it.

A contract signature or transfer is read on the chain it records (`caip2`), not necessarily the token's chain.

## Authorities

- **`owner`:** the token's `owner()` returns the authority's address.
- **Multisig** (`account_type: "multisig"`, of any `type`, including `controlled_by`): read as a Safe. The Safe's `getOwners()` and `getThreshold()` match the claimed signers and threshold. The threshold is compared only when the claim has one.

Authority types without a generic EVM check, such as `controlled_by`, are `unverifiable` at every moment and need no RPC. A verification backed by such an authority is `unverifiable` at every moment too, even when its `proof` result is `valid`. A moment before the record still reports `record postdates this moment`, and `"verified"` on a record with no moment reports `no recorded moment`.

## Steps

The steps the EVM checker can report. Their names are exact.

| Step | Where |
| --- | --- |
| `wallet is the authority or one of its signers` | `proof` |
| `eip191 signature recovers to wallet` | `proof` and each moment |
| `eip191 signature recovers to wallet (scheme not recorded, assumed eip191)` | `proof` and each moment, when `scheme` is `null` and the wallet is a `0x` address |
| `eip712 signature recovers to wallet` | `proof` and each moment |
| `verification's authority is listed for the token` | `proof`, from `verifyKyiToken` and `verifyKyiResponse` |
| `eip1271 isValidSignature on <caip2> at block <n>` | Moments |
| `claimed sender is the wallet` | Moments (transfers) |
| `transaction succeeded` | Moments (transfers) |
| `transaction sender` | Moments (transfers) |
| `transaction recipient` | Moments (native transfers with a recipient, memo transfers with a recipient) |
| `asset is on the transaction's chain` | Moments (amount transfers) |
| `transferred amount` | Moments (native `slip44` transfers) |
| `matching ERC-20 Transfer in receipt` | Moments (`erc20` transfers) |
| `calldata carries the memo` | Moments (memo transfers) |
| `Safe owners match claimed signers` | Moments (multisig authorities) |
| `Safe threshold` | Moments (multisig authorities with a threshold) |
| `token owner()` | Moments (`owner` authorities) |
| `on-chain lookup` | Moments, when the transaction doesn't exist or a contract call reverts or hits an address with no code |

## Reasons

A failed step makes the result `invalid` with the reason `<step> failed`. These reasons leave a result `unverifiable`:

| `reason` | When |
| --- | --- |
| `proof material missing` | The method lacks the fields it needs |
| `scheme <scheme> is not EVM` | A `signature` with a non-EVM scheme, or with no scheme on a wallet that isn't a `0x` address |
| `online checks not requested` | A contract signature or transfer in `proof`. It needs a moment |
| `admin_manual is not part of the public trust model` | `admin_manual` verifications |
| `no generic EVM check for <type>` | An authority that is neither `owner` nor a multisig, such as `controlled_by` |
| `asset <asset> is not supported` | An amount transfer of something other than `slip44` or `erc20` |
| `record postdates this moment` | The moment is before the record, its transaction's block, or its contract signature's block |
| `chain has no block at or before this moment` | The moment is before the chain's first block |
| `RPC has no state for block <n>` | A past block the RPC can't serve |

Reasons from the SDK core apply on every chain. They're listed in [Reading the report](/sdk/report#reasons-for-moments).

## How a moment is read

Each moment is read at one block. For `"now"`, that's the latest block. For a past instant, the SDK finds the last block mined at or before it with a binary search over block headers. The search runs once per distinct point in time for each token, and all checks for that token share it: once for `"now"` or a `Date`, and once per distinct `verified_at` or `observed_at` for `"verified"`. A contract signature at `"verified"` is read at its recorded `block_number`, while its authority is read at the block for `verified_at`. If the chain has no block that early, the check is `unverifiable` with the reason `chain has no block at or before this moment`.

Past blocks need an archive RPC. A regular node keeps only recent state. When the RPC has no state for the block, the check is `unverifiable` with the reason `RPC has no state for block <n>`.

A result read on-chain has a `position` with the `block` and its `time`.
