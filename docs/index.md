---
layout: home

hero:
  name: Bluprynt SDK
  text: Don't take our word for it. Verify it.
  tagline: Check any Bluprynt credential against public data — who was allowed to make the claim, and whether Bluprynt really issued it — without trusting our servers.
  image:
    src: /hero.svg
    alt: A verified shield connected to EVM, Solana and XRPL
  actions:
    - theme: brand
      text: How verification works
      link: /wallet-verification
    - theme: alt
      text: View on GitHub
      link: https://github.com/blupryntco/sdk

features:
  - icon: 🔑
    title: Authorization
    details: Was the issuer allowed to make this claim? Re-check the wallet proofs showing they control the token — signatures, contract wallets, on-chain transfers.
  - icon: 🏛️
    title: Provenance
    details: Did Bluprynt really issue this credential? Confirm it was written to Bluprynt's registries by Bluprynt-controlled wallets.
  - icon: ⛓️
    title: Chain-native checks
    details: EIP-191 and ERC-1271 on EVM, off-chain message signing on Solana, keypair accounts on XRPL. Each chain is verified with its own rules, against your own RPC.
  - icon: 🧩
    title: Install only what you need
    details: Chain support ships as separate packages. The core has zero runtime dependencies, and tree-shaking drops everything you don't import.
---

::: warning Pre-alpha
The SDK is under active development and its APIs will change. Wallet proof re-verification comes first; attestation, authority and credential checks follow.
:::

## Why an SDK?

A Bluprynt credential says something about an asset or an issuer: it passed KYI, it filed a disclosure, it holds a license. Your compliance pipeline shouldn't have to take that on faith. Every credential can be traced back to public, on-chain facts:

<ol class="trust-chain">
  <li><strong>Credential</strong><span>issued by Bluprynt into an on-chain credential registry</span></li>
  <li><strong>Identity</strong><span>the subject the credential was issued to</span></li>
  <li><strong>KYI</strong><span>the process that verified who the issuer is</span></li>
  <li><strong>Wallets</strong><span>the addresses linked to that identity</span></li>
  <li><strong>Wallet proofs</strong><span>signatures or transactions showing the issuer controls them</span></li>
</ol>

Following that chain by hand is harder than it looks:

| What you'd have to handle | By hand | With the SDK |
| --- | --- | --- |
| Signature formats differ per chain (Solana adds an off-chain message preamble) | Re-implement each format | Handled |
| Smart-contract wallets (Safe, timelocks) have no private key and need an ERC-1271 call over RPC | Detect and call contracts yourself | Handled, using your RPC |
| Transaction proofs carry the challenge in a memo or a unique gwei amount | Fetch and decode each transaction | Handled |
| A wallet proven on one EVM chain may or may not count on another | Work out the scoping rules | Reported in the result |
| Registries are deployed per chain and per identity type | Find and read each one | Resolved for you |

## One call

::: code-group

```ts [Single chain]
import { checkWalletVerification } from "@bluprynt/sdk-chain-solana";

const result = await checkWalletVerification(verificationMetadata, {
  rpcUrl: "https://...",
});

result.isVerified; // true | false
result.method; // "wallet_extension" | "cli" | "onchain_tx"
```

```ts [Multi-chain]
import { checkWalletVerification } from "@bluprynt/sdk";

const result = await checkWalletVerification(verificationMetadata, {
  rpcUrls: {
    "eip155:1": "https://mainnet-eth.rpc.example.com",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "https://mainnet-solana.rpc.example.com",
  },
});

result.chain.caip2; // the chain the proof was checked on
```

:::

## Pick your packages

| Package | What it's for |
| --- | --- |
| `@bluprynt/sdk` | Everything in one import: credential models, schema parsing, API client |
| `@bluprynt/sdk-chain-evm` | Ethereum and EVM-compatible chains |
| `@bluprynt/sdk-chain-solana` | Solana |
| `@bluprynt/sdk-chain-xrpl` | XRP Ledger |

## Using a coding agent?

These docs are published in an agent-friendly form too. Point your agent at [`/llms.txt`](/llms.txt) for a map of the docs, or [`/llms-full.txt`](/llms-full.txt) for everything in one file.

Read [Wallet verification](/wallet-verification) for how each proof is produced and what the SDK checks.
