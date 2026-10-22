# What a proof shows, and what it doesn't

A KYI lookup mixes two kinds of statements. Some the SDK re-checks for you from public data: a signature, a transaction, an account on-chain. Others come from Bluprynt's verification process and take more effort to confirm independently. This page says which is which, so you know what the SDK's report covers and where to look for the rest.

## What you can re-check yourself

The SDK re-checks these against public data. You can also re-check them with each chain's own library, as the chain pages show under **Check it yourself**.

- **Signatures.** A wallet signed the stored message. On EVM, the signature recovers to the wallet ([EIP-191 or EIP-712](/chains/evm#how-wallets-prove-control-on-evm)). On Solana, it verifies for the wallet's public key, raw or in the [off-chain message](/reference/glossary#off-chain-message) format. On XRPL, it verifies for the recorded signer key, and offline that key must be the wallet's [master key](/reference/glossary#master-key). No network is needed.
- **Contract signatures.** On EVM, a [contract wallet](/reference/glossary#contract-wallet) accepted the signature through [ERC-1271](/reference/glossary#erc-1271) at a given block. This needs your RPC.
- **Transfers.** On EVM, the transaction exists, succeeded, and matches the recorded sender, recipient and amount or calldata. This needs your RPC.
- **The wallet backs the authority.** The wallet is the authority or one of its signers, and the authority is one of the token's listed authorities.
- **Authorities at a moment.** At the [moments](/sdk/moments) you ask for, the SDK reads who controls the token: `owner()` and Safe owners on EVM, the mint and freeze authorities on Solana (now only), the issuer account on XRPL. On XRPL it also reads whether the signer key could sign for the wallet then.

The [Reference](/reference/evm) lists each check by name.

## What takes more effort to verify {#more-effort}

These parts of a lookup come from Bluprynt's process. The SDK doesn't re-check them today, but most can still be confirmed with some extra work.

- **The listed authorities, offline.** Offline, the SDK checks that a verification's authority is in the token's `authorities`, but not that the list is right. To confirm it, ask for a [moment](/sdk/moments): the SDK then reads the authority types it knows on-chain. Other types, such as `controlled_by`, need you to inspect the token's contracts or accounts yourself. A multisig can be an exception, depending on the chain. See the Reference for [EVM](/reference/evm#authorities), [Solana](/reference/solana#authorities) and [XRPL](/reference/xrpl#authorities).
- **`admin_manual` verifications.** Bluprynt set these by hand, so there is no proof for the SDK to re-check, and they can never be `valid`. They can still be `invalid`, if the wallet doesn't back the authority or the authority isn't listed for the token. Confirming one means going through the evidence behind it with Bluprynt.
- **The claim and the lists themselves.** `kyi_verified`, the `asset` metadata, and whether the `verifications` and `authorities` lists are complete describe Bluprynt's records. You can compare the authorities with what you read on-chain, but the lookup alone can't show that nothing is missing.
- **The issuer.** The SDK doesn't read `issuer`. `issuer.name` and `issuer.kyb_verified` reflect Bluprynt's issuer verification, which happens outside the chain.
- **The challenge's content.** The SDK checks that the wallet signed the stored message, not what the message says. It doesn't parse the address, the nonce or the "Issued to" line, and it doesn't check that Bluprynt issued that challenge, or when. You can read the message yourself: it's in the lookup in plain text. The same goes for a transfer's amount or memo: the SDK checks that the transaction matches the stored values, not that those values were the challenge.
- **Token features beyond the listed authorities.** The SDK reads only the authorities it can check. Other controls over the token, such as access-control roles on EVM or Token-2022 extensions like a permanent delegate on Solana, aren't read.
- **The link between wallet and issuer.** A proof shows that whoever holds the wallet's key took part. That this party is the issuer Bluprynt verified comes from Bluprynt's verification process.
- **Which chain a proof counts for.** The SDK doesn't compare a proof's chain with the token's chain. An [EOA](/reference/glossary#eoa) signature is valid on every EVM chain. A contract signature or transfer is checked on the chain it records (`caip2`), which may not be the token's chain. Whether that counts for your token is your call. The [EVM page](/chains/evm#quirks) explains why.

## Keys can leak or change hands

A valid signature shows that someone held the key when the signature was made. It can't show that the key wasn't stolen, or that the same party holds it today.

- An EVM or Solana key pair can't be rotated. If it leaks, the attacker can sign as the wallet from then on.
- A Safe's owners and threshold can change. The SDK reads them at the block for each moment.
- An XRPL account can set a regular key or disable its master key. At a moment, the SDK checks that the signer key could sign for the account at that ledger. Offline, a master-key signature is accepted even if the account has set `lsfDisableMaster`. Only a moment read checks that.

When control changes, an old proof can be `valid` at `"verified"` and `invalid` at `"now"`: it held when verified, and no longer holds now. The token's `at.now` evidence is then `contradicted`. `at.verified` answers whether the claim held when it was made. `at.now` answers whether it holds today. Worked examples show both cases: [a Safe's owners changed](/chains/evm#at-a-moment) and [an XRPL master key was disabled](/chains/xrpl#at-a-moment). [Showing a badge](/sdk/badge#rotation) suggests how to present it.

A signature carries no time of its own. When it was made comes from the record's `verified_at`, which Bluprynt records when it checks the proof.

## Expiry

A verification can have an `expires_at`. The SDK applies it only at moments: at a moment on or after `expires_at`, a verification that would otherwise be valid is `unverifiable`. The `proof` result ignores expiry, so the offline summary can count an expired verification as `confirmed`. Ask for `"now"` if expiry matters to you. [Reading the report](/sdk/report#expiry) has the details.

## Facts, not verdicts

The SDK doesn't decide whether a token is trustworthy. It reports what it could check, what held, and when: the block, slot or ledger it read. It doesn't pick a moment for you, and it has no maximum age. At a moment, the facts are what your RPC returned, so they're only as reliable as that RPC.

Whether a six-month-old proof is good enough, whether an `inconclusive` result is acceptable, and whether a proof from another chain counts are your decisions. [Moments](/sdk/moments) shows how to ask the questions that matter to you.
