---
layout: home

hero:
  name: Bluprynt SDK
  text: Re-check what Bluprynt claims.
  tagline: Re-check the wallet proofs and token authorities behind Bluprynt's KYI lookups, on EVM, Solana and XRPL.
  image:
    src: /hero.svg
    alt: A verified shield connected to EVM, Solana and XRPL
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: How verification works
      link: /wallet-verification
    - theme: alt
      text: View on GitHub
      link: https://github.com/blupryntco/sdk

features:
  - icon: 🔑
    title: Wallet proofs
    details: Re-check the signatures, contract signatures and transfers that show the issuer controls one of the token's authorities.
  - icon: 🏛️
    title: Token authorities
    details: Read who controls the token on-chain, such as its owner(), a Safe, a mint or freeze authority or an XRPL issuer, at the moments you ask for.
  - icon: 🧪
    title: Reproducible
    details: Every chain page has tested scripts you can run. One checks proofs with the chain's own library and with the SDK. Another reads chain state at a moment from recorded RPC responses, so it runs offline.
  - icon: 🧩
    title: Install only what you need
    details: Chain support ships as separate packages. Only the core package, @bluprynt/sdk-core, has no runtime dependencies. Each chain package uses its ecosystem's library, such as viem, @solana/kit or xrpl.js.
---

KYI ("know your issuer") is Bluprynt's check that a token's issuer is a verified organization that controls the token on-chain. Bluprynt's API publishes the result for each token, with the evidence behind it. This SDK lets you re-check that evidence yourself.

::: warning Pre-alpha
The SDK is under active development and its APIs will change. Today it re-checks KYI token lookups on EVM, Solana and XRPL. Attestation and credential checks are not available yet.
:::

## Why an SDK?

A KYI token lookup from Bluprynt's public API says whether a token passed KYI. Behind that claim is a chain of facts:

<ol class="trust-chain">
  <li><strong>KYI claim</strong><span>Bluprynt says the token passed KYI (<code>kyi_verified</code>)</span></li>
  <li><strong>Issuer</strong><span>the organization Bluprynt verified</span></li>
  <li><strong>Wallets</strong><span>the addresses the issuer proved it controls</span></li>
  <li><strong>Wallet proofs</strong><span>signatures or transactions showing that control</span></li>
  <li><strong>Authorities</strong><span>the addresses that control the token on-chain</span></li>
</ol>

The SDK re-checks the last three links against public data: each wallet proof, that the wallet backs one of the token's authorities, and, at the moments you ask for, that each authority holds on-chain where the SDK can read it. The issuer's identity comes from Bluprynt's verification process. [What a proof shows, and what it doesn't](/trust-model) lists what the SDK re-checks and what takes more effort to verify.

Following that chain by hand is harder than it looks:

| What you'd have to handle | By hand | With the SDK |
| --- | --- | --- |
| Signature formats differ per chain (the Solana CLI adds an off-chain message header, XRPL needs the signer's public key) | Re-implement each format | Handled |
| Smart-contract wallets (Safe) have no private key and need an ERC-1271 call over RPC | Detect and call contracts yourself | Handled, using your RPC |
| EVM transfer proofs carry the challenge in a unique amount or in calldata | Fetch and decode each transaction | Handled, using your RPC |
| Chain state changes over time | Find the block or ledger for each moment | Done for the moments you ask for |

The SDK reports [facts, not verdicts](/trust-model#facts-not-verdicts): what held, and when.

## One call

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-solana";

const report = await verifyKyiResponse(response);

report.evidence; // "confirmed" | "contradicted" | "inconclusive"
report.verified; // what the re-checked proofs support, offline
report.matchesClaim; // true | false | null
```

With no options, these are the offline summary: they don't read authorities on-chain or apply expiry. To show a badge, ask for a moment and read `report.at.now`. See [Showing a badge](/sdk/badge).

To check a response that spans chains in one call, see [One call, several chains](/sdk/report#one-call-several-chains).

## Pick your packages

| Package | What it's for |
| --- | --- |
| `@bluprynt/sdk` | Core types and the multi-chain `verifyKyiResponse`. Add the chain packages you need |
| [`@bluprynt/sdk-chain-evm`](/chains/evm) | Ethereum and EVM-compatible chains |
| [`@bluprynt/sdk-chain-solana`](/chains/solana) | Solana |
| [`@bluprynt/sdk-chain-xrpl`](/chains/xrpl) | XRP Ledger |

## Using a coding agent?

These docs are published in an agent-friendly form too. Point your agent at [`/llms.txt`](/llms.txt) for a map of the docs, or [`/llms-full.txt`](/llms-full.txt) for everything in one file.

Start with the [Quickstart](/quickstart). Read [Wallet verification](/wallet-verification) for how each proof is produced, and [Moments](/sdk/moments) for what the SDK checks and when.
