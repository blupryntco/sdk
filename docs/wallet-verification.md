# Wallet verification

> Source: [Notion — Wallet verification](https://app.notion.com/p/morozzzko/Wallet-verification-3a6431a103d580f6ac61c3a8d41411cc?source=copy_link)

[Wallet: data migration](https://app.notion.com/p/3a7431a103d580f8844dda5c4112f24b)

One of the most important KYI/KYA steps is wallet verification.

Every claim, attestation, or credential Bluprynt issues for an asset or an issuer ultimately depends on one foundational assumption: **the on-chain addresses referenced by that record are actually controlled by the issuer who submitted the information**.

In other words, when Bluprynt makes an attestation about an asset, or issues a credential to an issuer, it means we first verified the issuer’s identity and established a verifiable link between that identity and one or more wallets.

This document explains how we perform that wallet verification, the principles behind it, and how integrators can review and double-check the underlying verification structures.

At a high level, wallet verification answers one question: **can this user (or organization) prove control of a specific on-chain address?** We use that proof to bind wallets to the KYI identity we create, enabling automated compliance workflows downstream.

Wallet verification is required whether a user is KYI’ing an issuer or an asset:

- **KYI an asset:** Bluprynt identifies which wallets can control the token. The user must then authenticate one of those controlling wallets.
- **KYI an issuer:** The user can verify the issuer entity using a partner service, then add and verify the wallets that represent the issuer’s on-chain identity.

Because identities are chain-specific by design, **each chain we support comes with its own set of permissions and verification mechanics**.

---

## Principles

We aim for a verification flow that is:

1. **Cryptographically strong:** Prefer proofs that are hard to forge and easy to validate.
2. **User-friendly:** A flow that works with common wallets and requires minimal setup.
3. **Chain-native:** Use the primitives each chain ecosystem expects (signatures, transactions, etc.).
4. **Auditable:** Produce an artifact we can validate deterministically and (when applicable) correlate on-chain.
5. **Compatible with custody:** Support setups where an operator may not be able to sign arbitrary messages (e.g., certain HSM/custody configurations).

---

## Verification methods (at a glance)

We support multiple ways to prove wallet control. The correct one depends on the chain and on the user’s wallet/custody setup.

1. **Wallet extensions (preferred)**
	- We generate a message.
	- The user signs it with the wallet.
	- We verify the signature and bind the wallet to the KYI identity.
2. **CLI / programmatic signing**
	- For some ecosystems, standard tooling (CLI/SDK) can generate signatures programmatically.
	- This is useful for automation and some custody environments, but availability and UX vary.
3. **On-chain transaction verification (HSM/custody-friendly)**
	- When off-chain message signing isn’t available, we verify control via an on-chain action.
	- The exact transaction and validation rules are chain-specific.

---

## Multi-sig wallets

Multi-sig (multisignature) wallets require multiple independent signers to authorize an action. Depending on the chain and wallet architecture, this can affect what “proving control” looks like.

When an issuer uses a multi-sig wallet, Bluprynt supports two verification approaches:

1. **Verify the signer wallets (delegated verification)**
	- The issuer verifies the individual wallets/keys that can produce valid signatures on behalf of the multi-sig.
	- This is often the most practical option when the multi-sig address itself can’t easily sign off-chain messages directly.
2. **Verify the multi-sig wallet itself (address-level verification)**
	- The issuer verifies the multi-sig address using a chain-appropriate method (message signing if supported, otherwise an on-chain transaction verification).
	- This is useful when the chain/wallet tooling makes it straightforward to produce a proof attributable to the multi-sig address.

Which option is used depends on what is feasible in the issuer’s custody setup and on the chain’s multi-sig tooling. The same decision logic applies across all supported chains.

---

## Method 1 — Wallet extensions (preferred)

This is the most secure, most optimal, and typically the easiest verification flow for end users.

In this method, the wallet signs an **off-chain message** (sometimes called a **typed message**). This is **not a transaction**: it’s cryptographic text that can be verified using the wallet’s public key to prove control of the address.

### How it works

1. Bluprynt generates a **verification message** for the user to sign.
2. The user signs the message via a wallet connection flow.
3. Bluprynt validates the signature and records the association between the KYI identity and the wallet on that chain.

#### Challenge freshness & proof storage

For wallet extension flows (e.g., WalletConnect/XRPL Connect) and CLI/programmatic signing, Bluprynt uses a **short-lived challenge** that is refreshed on a regular cadence (every 15 minutes) to ensure the signed message is fresh.

For the proof of verification, we store:

- the original challenge message
- the wallet address being verified
- the resulting signature

This makes the verification **auditable** and enables optional **re-verification** (cryptographic re-checking of the signature against the stored challenge and wallet).

### Solana

**WalletConnect** is supported for Solana wallet verification. The flow is:

- Connect wallet via WalletConnect
- Sign a Bluprynt-generated message
- Bluprynt verifies the signature and completes verification

### EVM chains

**WalletConnect** is supported for EVM-based wallet verification. The flow is:

- Connect wallet via WalletConnect
- Sign a Bluprynt-generated message (EIP-191 style message signing)
- Bluprynt verifies the signature and completes verification

### XRPL

For XRPL we use **XRPL Connect**, which follows the same conceptual model:

- Connect wallet via XRPL Connect
- Sign a Bluprynt-generated message
- Bluprynt verifies the signature and completes verification

---

## Method 2 — CLI / programmatic signing

Some ecosystems provide standard tooling (CLI or SDK) that can generate signatures programmatically. This method can be useful for automation and for power users, but it tends to have:

- More setup/operational complexity than WalletConnect-style flows
- Ecosystem-specific constraints (tooling maturity, supported signature types, etc.)
- Reduced “guided UX” compared to in-app signing flows

Bluprynt still uses a challenge-based model here: generate a challenge, have it signed via CLI/SDK tooling, then validate and store the challenge + wallet + signature as the proof.

Because CLI verification often involves additional coordination (for example, interacting with colleagues who have access to the keys), **CLI challenges typically live longer than 15 minutes**. This makes the process more practical, while being **slightly less strict** than short-lived interactive challenges — but it remains a secure, cryptographic verification method.

Where available, Bluprynt treats the output of this method equivalently to interactive message signing: we validate the signature and bind the wallet to the KYI identity for the corresponding chain.

### Chain-specific tooling

- **Solana:** Solana CLI — see [Off-Chain Message Signing with the Solana CLI](https://docs.anza.xyz/cli/examples/sign-offchain-message) (includes `solana sign-offchain-message` and verification examples)
- **EVM chains:** Cast `wallet sign`.
- **XRPL:** XRPL.js — [GitHub repo](https://github.com/XRPLF/xrpl.js) and [reference docs](https://js.xrpl.org/)

### Solana gotcha — off-chain message formats

Solana’s off-chain message signing has evolved over time, and Solana off-chain messages include a **standard prefix/preamble** that distinguishes them from transactions. This is intentional: it makes it impractical to “slip in” a transaction under the guise of a message-signing prompt.

Practically, this means the bytes that are actually signed can differ from the raw challenge string due to required formatting. Bluprynt’s Solana tooling/SDK handles these details internally.

---

## Method 3 — On-chain transaction verification (HSM-compatible)

Some custody setups (including certain HSM-backed configurations) do not expose an interface to sign arbitrary off-chain messages. In these cases, we verify wallet control through an on-chain transaction.

When available, Bluprynt uses a **long-lived challenge** for this method to give operators enough time to coordinate signing/broadcasting in custody workflows.

Because chains differ in what they can carry on-chain, verification is defined by a small set of chain-specific variables that Bluprynt provides as part of the wallet verification payload. These parameters are **auditable** and are exposed through Bluprynt’s wallet verification data structures so the SDK can surface what was requested and what was observed.

### Common mechanics

If the chain architecture does not let us embed an arbitrary challenge text exactly as-is, Bluprynt uses a **randomly generated identifier** that is associated with the specific Bluprynt account / KYI subject. This identifier is then carried in a chain-appropriate way (memo/data fields, amount encoding, etc.), which helps prevent tampering and replay across identities.

Conceptually, this works as:

1. Bluprynt prompts the operator to submit a chain-native transaction from the wallet being verified.
2. Bluprynt validates that the expected on-chain action occurred and is attributable to the wallet.
3. Bluprynt uses that result to establish wallet control for the KYI identity on that chain.

### Solana

Across chains, there are typically **two variables** at play:

- **Challenge carrier:** a memo or other chain-appropriate, randomly generated (and rotating) identifier that the transaction must contain.
- **Transaction recipient:** the address the transaction must interact with.

On Solana, the challenge carrier is typically a **transaction memo**, and the memo contains the challenge.

Because this flow may require manual approvals (for example, through internal departments), Solana transaction challenges are **long-lived** and can be valid for up to **one week**.

Depending on the verification flow, Bluprynt may ask an issuer/operator to either:

- submit a transaction **to their own address** with the specified memo, or
- submit a transaction **to a Bluprynt-provided address** (optionally with the memo).

### EVM chains

EVM chains typically do not support arbitrary memos on a plain value transfer. Instead, Bluprynt uses a **unique gwei amount** that the issuer/operator must send to a Bluprynt-provided address. This amount acts as the identifier and helps prevent tampering.

### XRPL

XRPL transfer-based verification is **not currently implemented**.

---

## How to verify an issuer’s wallet verification

Bluprynt’s SDK uses the same underlying verification artifacts described above to streamline re-checks and re-verifications. If you want to independently verify an issuer’s wallet authentication (for example, in your own integration), you can follow the approach below.

### Where the data comes from

Each credential/attestation references an **issuer identity** (created during KYI/KYA). That identity includes a set of **associated addresses**. Each address association includes metadata describing **how** that association was established — for example, whether it was verified via:

- **Cryptographic signature** (wallet extension or CLI/programmatic signing)
- **On-chain transaction verification**

The verification metadata is the authoritative source for what to check.

### Verification algorithm — signatures

The association metadata should include enough signals to decide whether verification can be done **offline** (pure cryptography) or whether you must use an **RPC-based** check (for example, for contract wallets).

1. Read the address association metadata and confirm the verification method (wallet extension vs CLI/programmatic).
2. Retrieve the stored proof material for the verification (at minimum: **challenge/message**, **wallet address**, and **signature**).
3. Verify the signature according to the chain and wallet type:
	- For **EOA** wallets: perform local cryptographic verification against the wallet’s public key.
	- For **EVM contract wallets**: validate using **ERC-1271 / EIP-1271** by calling `isValidSignature(...)` via RPC (see Caveats).
4. Confirm the verified signer/wallet matches the associated address in the identity.

### Verification algorithm — on-chain transactions

For transaction-based verification, the association metadata typically includes:

- the **challenge carrier** (e.g., memo text, or a unique gwei amount)
- the expected **recipient/target address**
- a **transaction hash / link** for the transaction that completed verification

To validate the verification end-to-end:

1. Choose an RPC endpoint for the relevant chain.
2. Fetch the transaction and its metadata by hash.
3. Compare the on-chain values to the expected values from the verification metadata:
	- **Sender** matches the wallet being verified
	- **Recipient** matches the expected target address
	- **Challenge carrier** matches (memo contents / amount / chain-specific encoding)

If all checks match, the verification is correct.

### Wallet-type metadata

The address association metadata may also include wallet-type hints (for example, whether the wallet is a **multi-sig** or a contract account). Use these hints to select the correct verification procedure and to understand chain scoping (see Caveats).

In Bluprynt’s model, wallet/controller *type* is also a signal for whether “control of the same-looking address” can be reused across compatible networks, or must be treated as chain-specific:

#### EVM-family semantics

- **EOA:** Plain externally owned account (no bytecode). Control generally carries across EVM-family chains: the same private key controls the same `0x…` address on each chain.
- **Contract wallets** (chain-scoped): deployed contracts do not have private keys; verification is per-chain and often requires RPC interaction.
	- **SAFE_MULTISIG:** Safe (Gnosis/Safe) multi-sig.
	- **TIMELOCK:** OpenZeppelin TimelockController.
	- **GOVERNOR:** OZ-style Governor.
	- **ROLES_AUTHORITY:** Solmate RolesAuthority.

#### Non-EVM semantics

For non-EVM chains there is generally no “compatible chain reuse” assumption; verification should be treated as chain-specific:

- **Solana:**
	- **ED25519_KEYPAIR:** standard keypair-backed address (same key ⇒ same pubkey/address across clusters).
	- **MULTISIG_PROGRAM:** program-controlled multisig (deployment/config can differ per cluster).
	- **PROGRAM_DERIVED_ADDRESS:** PDA (no private key; controlled by program logic).
- **XRPL:**
	- **SECP256K1_KEYPAIR** / **ED25519_KEYPAIR:** keypair-backed accounts (same key ⇒ same classic address across networks).
	- **MULTISIGN:** XRPL multisigning (signer list + quorum). The address may remain the same if keys are the same, but signer lists/quorum are configured per network.

### Checking wallet verification with the SDK

The easiest way to check wallet verification is to call a single SDK method that evaluates the wallet verification record and returns a yes/no (plus structured details on why).

In most compliance workflows, you’ll be operating on **one chain at a time**. For that reason, we generally recommend using a **chain-specific SDK package** so you only bundle the code that’s relevant to your target chain.

```typescript
import { checkWalletVerification } from "@bluprynt/sdk-chain-solana"

const verificationMetadata = { ... } // verification metadata available through IPFS or API

const result = await checkWalletVerification(
	verificationMetadata, 
	{ rpcUrl: 'https://..' }
)

result.isVerified // -> boolean
result.method // -> "wallet_extension" | "cli" | "onchain_tx" | ...
result.signature // ...
```

If you need to support **multiple chains** in one integration, you can also use a **universal router** (multi-chain) SDK entrypoint. In this mode, what *doesn’t* change is your calling pattern: you still call a single `checkWalletVerification(...)` method with the verification metadata, and the SDK automatically routes to the appropriate chain-aware verifier.

What *does* change is how you configure RPC access. Instead of providing a single `rpcUrl`, you provide an `rpcUrls` map keyed by **CAIP-2 chain IDs** (for example `eip155:1` for Ethereum mainnet). When verification encounters a case that needs chain access (for example, transaction verification or EVM contract signature checks via ERC-1271), it will look up the appropriate RPC by CAIP-2 id and use it.

If a verification requires an RPC (for example, transactions or contract signatures) but no RPC is configured for that chain, the SDK throws an error indicating that the chain RPC is not configured.

```typescript
import { checkWalletVerification } from "@bluprynt/sdk"

const verificationMetadata = { ... } // verification metadata available through IPFS or API

const result = await checkWalletVerification(
	verificationMetadata, 
	{ 
	  rpcUrls: { 
	    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": 'https://mainnet-solana.rpc.example.com',
	    "eip155:1": 'https://mainnet-eth.rpc.example.com',
	  }
	}
)

result.isVerified // -> boolean
result.method // -> "wallet_extension" | "cli" | "onchain_tx" | ...
result.signature // ...
result.chain.name // "Solana"
result.chain.caip2 // "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (mainnet)
```

## Caveats

### Smart contract wallets on EVM (ERC-1271 / EIP-1271)

On EVM, some “wallets” (including many multi-sig setups such as Safe) are **smart contracts**, not externally owned accounts (EOAs). Smart contracts do not have a private key, so they cannot produce a signature that can be verified with normal ECDSA recovery (`ecrecover`) alone.

Instead, smart contract wallets typically rely on **ERC-1271 / EIP-1271** (Standard Signature Validation Method for Contracts): [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271)

In practice this means that a wallet-extension flow (for example, WalletConnect) may return a “signature”, but verifying it may require an **on-chain check** by calling the contract’s `isValidSignature(hash, signature)` method.

As a result, for contract wallets, signature verification is not purely local cryptography: Bluprynt must query an RPC endpoint (or otherwise execute an `eth_call`) against the wallet contract to validate the signature according to the contract’s logic.

### Cross-chain applicability (EOA vs contract wallets)

In some ecosystems — especially EVM chains addressed by **EIP-155** — a wallet verification can be meaningful **across multiple EVM-compatible chains**.

If the wallet is a traditional cryptographic wallet (an **EOA**, externally owned account), control of the address is derived from the same underlying private key, which generally implies the same owner can control the corresponding address across compatible EVM chains.

This is **not** generally true for smart contract wallets and many multi-sig setups (contract accounts): those are deployed on a specific chain and are therefore **chain-scoped**.

As a result, it’s normal to see cases where (for example) a Plume asset is verified using an Ethereum wallet verification, as long as the verification method and chain-scoping assumptions match what the SDK reports. We encourage integrators to rely on the SDK’s verification method metadata to confirm how a given wallet proof should be interpreted.
