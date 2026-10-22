# Wallet verification

Wallet verification is one of the steps of [KYI](/reference/glossary#kyi). Every record Bluprynt issues for a token or an issuer rests on one assumption: the on-chain addresses in the record are controlled by the issuer who submitted it. So before Bluprynt issues a record, it verifies the issuer's identity and links that identity to one or more wallets.

Wallet verification answers one question: can this organization prove control of a specific on-chain address? Bluprynt uses the proof to link the wallet to the issuer's KYI identity. It's part of both KYI flows:

- **Verifying a token:** Bluprynt finds the wallets that can control the token, its [authorities](/reference/glossary#authority). The issuer then proves control of one of them.
- **Verifying an issuer:** Bluprynt verifies the issuer entity using a partner service ([KYB](/reference/glossary#kyb)). The issuer then adds and verifies the wallets that represent it on-chain.

Each chain has its own keys, permissions and signing methods. The chain pages cover them: [EVM](/chains/evm), [Solana](/chains/solana) and [XRPL](/chains/xrpl).

## Principles

Bluprynt aims for a verification flow that is:

1. **Cryptographically strong:** proofs that are hard to forge and easy to check.
2. **Easy to use:** it works with common wallets and needs little setup.
3. **Chain-native:** it uses the signatures and transactions each chain expects.
4. **Auditable:** it produces a proof that anyone can check the same way and, where it applies, find on-chain.
5. **Compatible with custody:** it works where an operator can't sign arbitrary messages, as with some HSM and custody setups.

## Challenge lifetimes

Every method starts from a challenge that Bluprynt generates. How long a challenge stays usable depends on the method:

| Method | Challenge lifetime | Trade-off |
| --- | --- | --- |
| Wallet extension | 15 minutes | Strictest. The signer must act right away |
| CLI or programmatic signing | Longer than a wallet extension's | Gives time to coordinate with colleagues who hold the keys. Slightly less strict |
| On-chain transaction | Long-lived | Gives custody workflows time to approve and broadcast. Less strict |

A longer lifetime leaves more time between issuing the challenge and using it. The signature or transaction is just as hard to forge either way.

## Wallet extensions (preferred) {#wallet-extensions}

This is the easiest flow for most users. The wallet signs an off-chain message, sometimes a typed message. It's not a transaction: anyone can check the signature against the wallet's address or public key.

1. Bluprynt generates a verification message.
2. The user signs it through a wallet connection: WalletConnect on EVM and Solana, XRPL Connect on XRPL.
3. Bluprynt checks the signature and records the link between the issuer's KYI identity and the wallet on that chain.

The message format and how it's signed differ per chain. See [EVM](/chains/evm#how-bluprynt-verifies-it), [Solana](/chains/solana#how-bluprynt-verifies-it) and [XRPL](/chains/xrpl#how-bluprynt-verifies-it).

## CLI or programmatic signing {#cli}

Standard tooling can sign the challenge outside a wallet app. This suits automation and some custody setups. It takes more setup than a wallet extension, and what each tool supports varies.

Bluprynt generates the challenge, the user signs it with the tool, and Bluprynt checks the signature. It stores the challenge, the wallet and the signature as the proof, the same way as for a wallet extension. The tooling is chain-specific:

- **EVM chains:** Foundry's [`cast wallet sign`](https://www.getfoundry.sh/reference/cast/wallet/sign).
- **Solana:** the Solana CLI's `solana sign-offchain-message`. See [Off-chain message signing with the Solana CLI](https://docs.anza.xyz/cli/examples/sign-offchain-message).
- **XRPL:** xrpl.js. See its [GitHub repo](https://github.com/XRPLF/xrpl.js) and [reference docs](https://js.xrpl.org/).

## On-chain transactions {#onchain-transaction}

Some custody setups, including some HSM-backed ones, can't sign arbitrary off-chain messages. In that case, the wallet proves control with an on-chain transaction.

Transfer proofs are available on EVM chains only. They aren't available on Solana or XRPL today.

When a chain can't carry the challenge text as it is, Bluprynt uses a random identifier tied to the Bluprynt account and the KYI subject. The transaction carries it in a way that fits the chain. This prevents a proof from being reused for another identity. Two values matter:

- **Challenge carrier:** what the transaction must contain, such as a unique amount or calldata.
- **Recipient:** the address the transaction must interact with.

The flow:

1. Bluprynt asks the operator to send a transaction from the wallet being verified.
2. Bluprynt checks that the expected transaction happened and came from that wallet.
3. Bluprynt records that the issuer controls the wallet on that chain.

How the challenge is carried on EVM is on the [EVM page](/chains/evm#how-bluprynt-verifies-it).

## Multisig wallets

A multisig wallet needs several signers to act. When an issuer uses one, Bluprynt supports two approaches:

1. **Verify the signer wallets.** The issuer verifies the individual wallets that can sign for the multisig. This is often the practical choice when the multisig address can't sign off-chain messages.
2. **Verify the multisig itself.** The issuer proves control of the multisig address with a method that fits the chain: message signing where it's supported, otherwise an on-chain transaction.

Which approach fits depends on the issuer's custody setup and the chain's multisig tooling.

In a lookup, a multisig authority has `account_type: "multisig"`, with its `signers` and `threshold`. A verification can come from the multisig address or from one of its signers. How the SDK checks a multisig on each chain is in the Reference: [EVM](/reference/evm#authorities), [Solana](/reference/solana#authorities) and [XRPL](/reference/xrpl#authorities).

## Checking a verification yourself

Bluprynt stores the proof material with each verification. [Lookup fields](/reference/lookup#verifications) lists it. Each chain page shows how to re-check it with the chain's own library, under **Check it yourself**: [EVM](/chains/evm#check-it-yourself), [Solana](/chains/solana#check-it-yourself) and [XRPL](/chains/xrpl#check-it-yourself).

A match shows that the wallet's key took part when the signature or transaction was made. It doesn't show that the wallet's authority still controls the token, or that the proof hasn't expired. [What a proof shows, and what it doesn't](/trust-model) covers what a match leaves open. [Moments](/sdk/moments) covers checking authorities and expiry at a chosen time.
