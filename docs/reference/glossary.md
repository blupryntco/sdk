# Glossary

## KYI {#kyi}

"Know your issuer". Bluprynt's check that a token's issuer is a verified organization that controls the token on-chain. A KYI token lookup says whether a token passed (`kyi_verified`) and lists the evidence: the token's authorities and the verifications that back them.

## KYB {#kyb}

"Know your business". The check that an organization is who it says it is. Bluprynt's KYB of the issuer happens outside the chain. The SDK doesn't re-check it, and the lookup reports it as `issuer.kyb_verified`.

## Authority {#authority}

An address that controls a token on-chain, as Bluprynt lists it in a lookup's `authorities`. It has a `type` (such as `owner`, `mint_authority`, `freeze_authority`, `issuer` or `controlled_by`), an `address`, an `account_type` (`"regular"` or `"multisig"`), the multisig's `signers` and `threshold`, and `observed_at`, when Bluprynt saw it. The SDK reads authorities on-chain only at moments, and only the types each chain can check. See the Reference for [EVM](/reference/evm#authorities), [Solana](/reference/solana#authorities) and [XRPL](/reference/xrpl#authorities).

## Verification {#verification}

A record that a wallet proved control, backing one authority. It has the `wallet_address`, the `authority` it backs, `verified_at`, an optional `expires_at`, and the `method` with its proof. See [Lookup fields](/reference/lookup#verifications).

## Proof {#proof}

The evidence that a wallet's key took part: a signature, a contract signature or a transfer, stored in a verification's `method`. When the SDK re-checks it offline, the result is the verification's `proof` result in the report. See [Reading the report](/sdk/report#checks).

## Moment, `at` {#moment}

A point in time to read chain state at. Pass moments in the `at` option: `"verified"` (each record's own moment), `"now"` (the latest state), or a `Date`. With no `at`, the SDK checks offline only. Results for each moment are under `at[label]`. See [Moments](/sdk/moments).

## Position {#position}

Where on the chain a result was read: `block` and `time` on EVM, `slot` on Solana, `ledger` on XRPL (plus `time` for a past moment).

## Evidence {#evidence}

The SDK's summary of a token's checks: `confirmed`, `contradicted` or `inconclusive`. There is one offline, from the `proof` results, and one per moment. See [Reading the report](/sdk/report#evidence-and-summaries).

## CAIP-2 and CAIP-19 {#caip}

Chain-agnostic IDs. A [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) ID names a chain, such as `eip155:1` for Ethereum mainnet, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for Solana mainnet or `xrpl:0` for XRPL mainnet. `rpcUrls` is keyed by it. A [CAIP-19](https://chainagnostic.org/CAIPs/caip-19) ID names an asset on a chain, such as `eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3`.

## EOA {#eoa}

An externally owned account on EVM: an address controlled by a secp256k1 key pair. It proves control by signing a message, and the same key controls the same address on every EVM chain. See [EVM](/chains/evm#how-wallets-prove-control-on-evm).

## Contract wallet {#contract-wallet}

An EVM account that is code, such as a Safe. It has no private key. It accepts or rejects signatures through ERC-1271, and it exists only on the chain it was deployed to.

## ERC-1271 {#erc-1271}

The EVM standard for contract signatures. A contract's `isValidSignature(hash, signature)` returns `0x1626ba7e` when it accepts the signature. The answer depends on the contract's state, so the SDK checks it at a block, over your RPC. See [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271).

## Off-chain message {#off-chain-message}

On Solana, a message signed with a header that no transaction can start with, so a signed message can't be mistaken for a transaction. The Solana CLI signs this way. Wallet apps usually sign the raw message instead. The scheme `solana_offchain_v0` is the legacy header the CLI uses, not Kit's newer "version 0" layout. See [Solana](/chains/solana#quirks).

## SPL Token and Token-2022 {#spl-token}

Solana's two token programs. SPL Token is the original. Token-2022 is a newer one with extensions. Each token has a mint account holding its mint and freeze authorities. The SDK reads mint and multisig accounts of both programs.

## Master key {#master-key}

On XRPL, the key pair an account's address is derived from. It can sign for the account unless the account sets `lsfDisableMaster`.

## Regular key {#regular-key}

On XRPL, a second key pair an account can assign with `SetRegularKey`. It can sign for the account like the master key, and it can be changed or removed. Only account state shows whether a key was the regular key at a given time.

## `controlled_by` {#controlled-by}

An authority type for an address that controls a token when there's no standard on-chain way to read that control. The SDK has no check for it, so it is `unverifiable` at every moment, and so is a verification backed by it. A `controlled_by` multisig is the exception on EVM and Solana: see the Reference for [EVM](/reference/evm#authorities) and [Solana](/reference/solana#authorities).
