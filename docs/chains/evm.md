# EVM

This page covers Ethereum and EVM-compatible chains: how a wallet proves control, how Bluprynt records the proof, and what `@bluprynt/sdk-chain-evm` re-checks. For the report format, see [Reading the report](/sdk/report).

## How wallets prove control on EVM

There are two kinds of accounts.

- **Externally owned account ([EOA](/reference/glossary#eoa)).** A secp256k1 key pair. The address is the last 20 bytes of the Keccak-256 hash of the public key. Whoever holds the private key controls the address.
- **Contract account.** Code deployed at an address. It has no private key. It does what its code allows, for example "any 2 of these 3 owners may act".

An EOA proves control by signing a message. Two message formats are common:

- **EIP-191** (`personal_sign`). The wallet signs the Keccak-256 hash of `"\x19Ethereum Signed Message:\n" + length + message`. The prefix keeps a signed message from ever being a valid transaction. Anyone can recover the signer's address from the message and the 65-byte signature. No network is needed.
- **EIP-712** (typed data). The wallet signs structured data with a domain (name, chain, contract). Wallets can show the fields to the user. Recovery works the same way.

A contract can't sign. Instead, it answers the question "is this signature valid for you?" through **[ERC-1271](/reference/glossary#erc-1271)**: `isValidSignature(hash, signature)` returns the magic value `0x1626ba7e` when the contract accepts it. The answer comes from the contract's code and storage, so checking it needs an RPC call. A wallet-extension flow, such as WalletConnect, may return a "signature" for a contract wallet, but normal ECDSA recovery (`ecrecover`) can't verify it. Only the contract can. See [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271).

A **Safe** is the most common contract wallet. It has a list of owners and a threshold. It accepts a signature when enough owners signed. Anyone can read its owners and threshold with `getOwners()` and `getThreshold()`.

## How Bluprynt verifies it

The flows are described in [Wallet verification](/wallet-verification). On EVM:

- **Wallet extension.** The user connects through WalletConnect and signs a Bluprynt-generated message with EIP-191 message signing.
- **CLI.** The user signs the challenge with Foundry's [`cast wallet sign`](https://www.getfoundry.sh/reference/cast/wallet/sign).
- **On-chain transaction.** Bluprynt uses either a unique amount sent to a Bluprynt-provided address, where the amount is the challenge, or a transaction whose calldata carries the challenge.

A verification's `method` is one of these, and the listed fields are the evidence Bluprynt stores:

| `method` | Used for | Stored evidence |
| --- | --- | --- |
| `signature` / `eip191` | EOAs signing in a wallet or with `cast wallet sign` | `message`, `signature` |
| `signature` / `eip712` | EOAs signing typed data | `message` (the typed data as JSON), `signature` |
| `contract_signature` / `eip1271` | Contract wallets such as Safe | `message`, `signature`, `inner_scheme` (`eip191` or `eip712`), `caip2`, `block_number` |
| `transfer` / `amount` | Custody setups that can't sign messages: a unique amount sent to a Bluprynt address | `caip2`, `transaction_hash`, `sender`, `recipient`, `asset`, `amount` |
| `transfer` / `memo` | A transaction whose calldata carries the challenge | `caip2`, `transaction_hash`, `sender`, `recipient`, `memo` |
| `admin_manual` | Set by hand | Nothing to re-check |

Every verification also names the `wallet_address` and the `authority` it backs.

## What the SDK checks

Offline, with no `at`, the SDK checks only what needs no chain state. It never calls an RPC.

With `at`, it reads chain state at each moment you ask for. Each moment is read at one block: the latest block for `"now"`, and the last block at or before the instant otherwise. A contract signature at `"verified"` is read at its recorded `block_number`.

The package uses viem for signatures and RPC calls.

| Question | How it's answered |
| --- | --- |
| Did this EOA sign the message? | `recoverMessageAddress` or `recoverTypedDataAddress` from viem. Offline |
| Did the contract wallet accept the signature at that block? | viem's `verifyHash` with the block number, over your RPC |
| Did the transfer happen as claimed? | `eth_getTransactionByHash` and `eth_getTransactionReceipt` |
| Does the token's `owner()` return the authority? | `owner()` called at the block |
| Does the Safe have the claimed owners and threshold? | `getOwners()` and `getThreshold()` called at the block |
| Which block is the moment? | `eth_getBlockByNumber`, with a binary search over block timestamps for a past instant |

The [EVM checks](/reference/evm) reference lists every step and reason by name.

## Quirks

**One key, every EVM chain.** An EOA's address comes from its key alone. The same key controls the same `0x` address on Ethereum, Base, Sepolia and every other EVM chain. An EIP-191 proof says nothing about which chain it was made for. An EIP-712 domain may name a chain, but the recovered address is the same on every EVM chain. A contract wallet is different: it exists only on the chain it was deployed to, and the same address on another chain may be empty or hold different code. That's why a `contract_signature` records its `caip2`, and the SDK checks it on that chain only.

So an EOA's proof can carry across EVM chains, and a contract wallet's can't. For example, a token on Plume can be backed by a signature made with the same EOA on Ethereum. A Safe's proof on Ethereum says nothing about the same address on Plume. The SDK doesn't compare a proof's chain with the token's chain. Whether a proof from another chain counts is your call (see [What a proof shows](/trust-model#more-effort)).

**ERC-1271 answers depend on the block.** A Safe's owners and threshold can change. A signature it accepted last month may be rejected today, and the other way round. The SDK reads `isValidSignature` at a specific block. At `"verified"`, that's the block Bluprynt recorded. At `"now"`, it's the latest block.

**Authorities for ERC-20 tokens.** The SDK reads two kinds. An `owner` authority is read through the token's `owner()`, as in OpenZeppelin's `Ownable`. A multisig authority, of any `type`, is read as a Safe. Other ways to control a token, such as access-control roles, have no generic check.

**A failed read is `invalid`.** If `owner()` reverts, or the address has no contract, the `on-chain lookup` step fails, and the result is `invalid` at that moment. The same goes for a Safe call. It means this read didn't confirm the claim, for example because the token has no `owner()` function. It doesn't by itself mean anyone made a false claim.

**Past reads need an archive RPC.** A regular node keeps state for recent blocks only. Calling `owner()`, `getOwners()` or `isValidSignature` at an old block needs an archive node. Without one, the check is `unverifiable` with `RPC has no state for block <n>`, not `invalid`. Only past moments need one. `"now"` works with a regular node.

**Many tokens.** Within one token, the SDK shares the RPC client and block lookups between checks. It doesn't share them across tokens or calls, and it checks a response's tokens at the same time. If you check many tokens, caching and rate limits are up to you. See [RPC and errors](/sdk/rpc#many-tokens).

**Addresses ignore case.** EVM addresses are hex. Mixed case is only an EIP-55 checksum. The SDK compares addresses with viem's `isAddressEqual`, so `0xf748…b19c` matches `0xf748…B19c`. The example below shows a lowercase wallet and a checksummed recovered address side by side.

## Check it yourself

To re-check a verification by hand, check its proof as shown below. Then confirm that the `wallet_address` is the authority's `address` or one of its `signers`, and that the authority's `type` and `address` appear in the token's `authorities`.

### Real Sepolia lookup

This script uses the public Sepolia lookup from [Reading the report](/sdk/report#example). It first recovers the signer with viem alone, then checks the same lookup through the SDK. It also changes one line of the signed message and checks it again both ways. Neither needs a network.

<<< @/../examples/chains/src/evm.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/evm.json
:::

- `independent`: viem recovers the wallet from the signature, ignoring case. Over the tampered message, it recovers a different address.
- `sdk.report`: the proof is `valid`, and the evidence is `confirmed`.
- `sdk.tamperedMessage`: the proof is `invalid` with `eip191 signature recovers to wallet failed`.

viem and the SDK agree: the SDK's `eip191 signature recovers to wallet` step shows the same recovered address as `independent.recovered`, and both reject the tampered message.

Source: [`examples/chains/src/evm.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/evm.ts) · output: [`examples/chains/output/evm.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/evm.json)

### With Foundry (not run by our tests)

You can check the same signature with Foundry. Save the exact `message` from the lookup to `message.txt`, with no trailing newline:

```sh
cast wallet verify \
  --address 0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c \
  "$(cat message.txt)" \
  0xec83133187bf78019c3c4b4137d14e1876b167c2f64ca05bfc06f5491c9c257e1477862593d19651ede7268e9f7470c773d46e1a818d2eb3b2b82ede600010141b
```

### Contract signatures and transfers by hand (not run by our tests)

These need an RPC for the chain the verification records in `caip2`.

- **Contract signature.** Hash the `message` the way its `inner_scheme` says: viem's `hashMessage` for `eip191`, or `hashTypedData` for `eip712`. Call `isValidSignature(hash, signature)` on the wallet contract at `block_number`. It must return `0x1626ba7e`. viem's `verifyHash` with `blockNumber` does this call.
- **Transfer.** Fetch the transaction and its receipt by `transaction_hash`. The receipt's status must be success, and the transaction's `from` must be the recorded `sender`, which must be the wallet. For an `amount` transfer, the `asset` must be on the same chain. For the native coin (`slip44`), the transaction's `value` must equal `amount`. For an ERC-20 token, the receipt must contain a `Transfer` event from the token contract in `asset`, from the sender, with the same value. In both, the recipient must match `recipient` when one is recorded. For a `memo` transfer, the calldata must be the UTF-8 bytes of `memo`, and `to` must match `recipient` when one is recorded.

### At a moment: synthetic data (recorded RPC responses) {#at-a-moment}

The Sepolia lookup above reads no chain state at a moment: its authority is `controlled_by`, which has no EVM check. See the [report with `at`](/sdk/report#example). This example reads a Safe instead.

The script builds a lookup for a made-up token whose `owner()` is a made-up 2-of-3 Safe. One owner signs Bluprynt's challenge with a public test key. It then asks for `at: ["verified", "now"]`. In the recorded chain, one of the Safe's owners was swapped after the verification. The RPC responses are recorded in [`src/fixtures/evm-safe.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/fixtures/evm-safe.json), so the example runs offline. `pnpm -C examples/chains fixtures` regenerates them.

<<< @/../examples/chains/src/evm-safe.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/evm-safe.json
:::

- `proof`: the signer is one of the claimed owners, and the signature recovers to it.
- `at.verified`, read at block 8124750: the Safe's owners and threshold match the claim, and `owner()` returns the Safe. `valid`.
- `at.now`, read at block 9480000: the owners no longer match, so the result is `invalid` with `Safe owners match claimed signers failed`. The token's `at.now.evidence` is `contradicted`, while `at.verified` is `confirmed`.

The claim held when verified and no longer holds now. [Showing a badge](/sdk/badge#rotation) suggests how to present that.

Source: [`examples/chains/src/evm-safe.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/evm-safe.ts) · output: [`examples/chains/output/evm-safe.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/evm-safe.json)

## Limits

These come back `unverifiable` on EVM:

- **`admin_manual` verifications.** There is nothing to re-check.
- **Contract signatures and transfers offline.** They need chain state. Ask for a moment.
- **Authority types other than `owner` and `multisig`,** such as `controlled_by`. There's no standard way to read who controls a contract. A verification backed by such an authority is `unverifiable` at every moment too, even when its `proof` is `valid`.
- **Past moments on a non-archive RPC.** The node no longer has the state.
- **Moments before the record or before the chain.** The record or block didn't exist yet.
- **Amount transfers of assets other than the native coin and ERC-20 tokens.**
- **Expired verifications,** at moments at or after `expires_at`.
