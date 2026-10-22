# XRPL

This page covers the XRP Ledger: how a wallet proves control, how Bluprynt records the proof, and what `@bluprynt/sdk-chain-xrpl` re-checks. For the report format, see [Reading the report](/sdk/report).

## How wallets prove control on XRPL

An XRPL account has a **classic address**, such as `r3sNTMefq5gsRumMYsNznnX6yzzxVH6dTC`. The address is a hash of a public key, encoded in base58. The key can be secp256k1 or Ed25519. Ed25519 public keys are written with an `ED` prefix.

The key the address comes from is the account's **[master key](/reference/glossary#master-key)**. An account can also have other keys:

- **[Regular key](/reference/glossary#regular-key).** The account owner can assign one more key pair with a `SetRegularKey` transaction. It can sign for the account like the master key. It can be changed or removed later.
- **Disabled master key.** The owner can set the `lsfDisableMaster` flag. After that, the master key can't sign for the account. Only the regular key (or a signer list) can.
- **Signer list.** A list of other accounts and a quorum, for multisigning.

So on XRPL, "who can sign for this address" is account state. It can change over time.

A wallet proves control by signing a message with one of these keys. The signature is hex. Since the address is only a hash of the key, the address alone can't check a signature. The public key has to travel with it.

Bluprynt handles **issued currencies** (IOUs). An issued currency is a currency code plus the account that issues it, for example `USD` issued by `r3sN…6dTC`. Bluprynt writes a token's address as `CURRENCY.rIssuer`, such as `USD.r3sNTMefq5gsRumMYsNznnX6yzzxVH6dTC`. The issuer is the authority that matters.

Chains are named by [CAIP-2](/reference/glossary#caip) IDs: `xrpl:0` for mainnet, `xrpl:1` for testnet and `xrpl:2` for devnet. `rpcUrls` is keyed by them. A token's CAIP-19 ID has the form `xrpl:0/iou:CURRENCY.rIssuer`.

## How Bluprynt verifies it

The flows are described in [Wallet verification](/wallet-verification). On XRPL:

- **Wallet extension.** The user connects through XRPL Connect and signs a Bluprynt-generated message.
- **CLI / programmatic.** The user signs the challenge with xrpl.js. See its [GitHub repo](https://github.com/XRPLF/xrpl.js) and [reference docs](https://js.xrpl.org/).
- **On-chain transaction.** Not used: [transfer proofs aren't available on XRPL today](/wallet-verification#onchain-transaction).

The SDK re-checks signature verifications:

| `method` | Used for | Stored evidence |
| --- | --- | --- |
| `signature` / `xrpl` | XRPL wallets | `message`, `signature` (hex), `signer_public_key` |
| `admin_manual` | Set by hand | Nothing to re-check |

Every verification also names the `wallet_address` and the `authority` it backs. On XRPL, the authority is the token's `issuer`.

## What the SDK checks

Offline, with no `at`, the SDK checks the signature against the recorded key. It then checks whether that key is the wallet's master key. It never calls a server.

With `at`, it reads the wallet's and the issuer's accounts at the ledger for each moment. For `"now"`, that's the latest validated ledger. For a past instant, it's the last ledger closed at or before it.

| Question | How it's answered |
| --- | --- |
| Did this key sign the message? | `verify` from `ripple-keypairs`, over the message's UTF-8 bytes in hex. Offline |
| Is the key the wallet's master key? | `deriveAddress` from `ripple-keypairs` gives the wallet address. Offline |
| Could the key sign for the wallet at that ledger? | `account_info` on the wallet: the master key not disabled by `lsfDisableMaster`, or the account's `RegularKey` |
| Is the authority the token's issuer? | The issuer is parsed from the token address. Offline step, run at moments |
| Did the issuer account exist at that ledger? | `account_info` on the issuer |
| Which ledger is the moment? | `ledger` for close times, with a binary search, within the range `server_info` reports in `complete_ledgers` |

The [XRPL checks](/reference/xrpl) reference lists every step and reason by name.

## Quirks

**The public key travels separately.** On EVM, the signer's address is recovered from the signature. On Solana, the address is the key. On XRPL, neither works: the address is a hash of the key. So Bluprynt stores `signer_public_key` next to the signature. Without it, the proof is `unverifiable`.

**The address derives from the key.** `deriveAddress(signer_public_key)` gives an address. If it's the wallet, the key is the master key, and the `proof` result is `valid`. If it isn't, the key may be a regular key, and only account state can tell.

**Regular keys and `lsfDisableMaster`.** Offline, the SDK accepts a master-key signature without reading the account. It can't see `lsfDisableMaster` offline. At a moment, it reads the account and checks both: a master key counts only if it wasn't disabled then, and any other key counts only if it was the `RegularKey` then. A key that wasn't authorized, or an account that didn't exist, makes the verification `invalid` at that moment.

**Signer lists aren't supported.** An account can authorize a signer list for multisigning. The SDK doesn't read signer lists. At a moment, a key that is neither the master key nor the `RegularKey`, on an account that has a signer list, is `unverifiable` with `XRPL signer lists are not supported`. A master key that the account disabled stays `invalid`, signer list or not.

**Pruned servers.** Most XRPL servers keep only recent ledgers. Their `server_info` reports what they have in `complete_ledgers`, such as `32570-96000000`. The SDK reads that range. A moment outside it is `unverifiable` with `XRPL server has no ledger <n>`, not `invalid`. To check past moments, use a server whose history covers them: check its `complete_ledgers` before you rely on it. Public servers are often pruned, and they rate-limit.

**Gaps in history.** `complete_ledgers` can list several ranges, such as `32570-50000,60000-96000000`. The SDK uses only the range that contains the latest validated ledger. A moment before that range is `unverifiable`, even if an older range covers it. A server that reports `empty` has no validated ledger to read, so the call throws. See [RPC and errors](/sdk/rpc#what-throws-and-what-s-reported).

**Finding a past ledger takes many requests.** XRPL has no "ledger at time" lookup, so the SDK binary-searches ledger close times. On a server with long history, that's roughly 20 to 30 `ledger` requests for each distinct point in time. The SDK shares the search between the checks of one token, not across tokens.

**WebSocket only.** The SDK talks to XRPL servers through the `Client` of `xrpl.js`, which uses WebSocket. RPC URLs must be `wss://` (or `ws://`). A server that offers only JSON-RPC over HTTP won't work.

**Keys are uppercased.** The SDK uppercases `signer_public_key` before it verifies the signature or derives an address, so a key recorded in lowercase hex works too.

**Issuer from `CURRENCY.rIssuer`.** The SDK takes the issuer from the token address: everything after the last `.`. Addresses are compared exactly.

## Check it yourself

To re-check a verification by hand, verify its signature as shown below, and check the ledger side at a moment. Then confirm that the `wallet_address` is the authority's `address` or one of its `signers`, and that the authority's `type` and `address` appear in the token's `authorities`.

### Synthetic data (fixed public test keys)

This script uses two test seeds, one Ed25519 and one secp256k1. They're public, hold nothing, and must never be funded or set on a real account. The script signs a challenge with each key and builds a lookup with two tokens. The first token's issuer has two verifications: one signed with its master key, and one signed with the secp256k1 key acting as its regular key. It then checks the signatures twice: first with `ripple-keypairs` alone, then through the SDK. Last, it changes one line of a signed message and checks it again both ways. Neither needs a network.

<<< @/../examples/chains/src/xrpl.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/xrpl.json
:::

What it shows:

- `independent`: every signature verifies for its key. For both master keys, the derived address is the wallet. For the regular key, it's a different address. The signature over the tampered message doesn't verify.
- `sdk.report`: both master-key proofs are `valid`. The regular-key proof is `unverifiable` with `signer is not the master key; online check needed`. Only the ledger can say whether that key was the wallet's `RegularKey`.
- `sdk.tamperedMessage`: the proof is `invalid` with `xrpl signature verifies for signer key failed`.

`ripple-keypairs` and the SDK agree: the SDK's `xrpl signature verifies for signer key` step matches `signatureVerifies`, and its master-key step matches `derivedAddressIsWallet`.

Source: [`examples/chains/src/xrpl.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/xrpl.ts) · output: [`examples/chains/output/xrpl.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/xrpl.json)

### At a moment: synthetic data (recorded RPC responses) {#at-a-moment}

Whether a key could sign for the wallet is account state, so it needs a server. This script builds a lookup for a made-up issued currency. The issuer signed Bluprynt's challenge with its master key. Then it set a regular key and disabled its master key. Then it signed again with the regular key. The script asks for `at: ["verified", "now"]`. The server responses are recorded in [`src/fixtures/xrpl-rotated.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/fixtures/xrpl-rotated.json), so the example runs offline. `pnpm -C examples/chains fixtures` regenerates them.

<<< @/../examples/chains/src/xrpl-rotated.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/xrpl-rotated.json
:::

- The master-key verification: its `proof` result is `valid`. At `"verified"`, ledger 99202077, the master key could sign: `valid`. At `"now"`, ledger 99204000, the master key is disabled, so the result is `invalid` with `signer key was authorised for the wallet failed`.
- The regular-key verification: its `proof` result is `unverifiable` with `signer is not the master key; online check needed`. At `"verified"`, ledger 99203307, and at `"now"`, the key is the account's `RegularKey`: `valid`.
- The token's `at.verified.evidence` is `confirmed`. Its `at.now.evidence` is `contradicted`, because the master-key check fails now, even though the regular-key check holds.

The master-key proof held when verified and no longer holds now. [Showing a badge](/sdk/badge#rotation) suggests how to present that.

Source: [`examples/chains/src/xrpl-rotated.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/xrpl-rotated.ts) · output: [`examples/chains/output/xrpl-rotated.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/xrpl-rotated.json)

### The ledger side by hand (not run by our tests)

You can check whether a key could sign for the wallet at a moment with any XRPL server:

1. **Find the ledger.** For `"now"`, use `ledger_index: "validated"`. For a past instant, find the last ledger that closed at or before it. The `ledger` command returns `close_time` in seconds since the Ripple epoch, 2000-01-01T00:00:00Z. Add 946684800 to get Unix time. Binary-search ledger indexes within the server's `complete_ledgers`.
2. **Read the wallet's account at that ledger.**

   ```json
   {
     "command": "account_info",
     "account": "r3sNTMefq5gsRumMYsNznnX6yzzxVH6dTC",
     "ledger_index": 99202077,
     "signer_lists": true
   }
   ```

   Use the wallet address and the ledger you found. An `actNotFound` error means the account didn't exist at that ledger.
3. **Derive the signer's address** from `signer_public_key` with `deriveAddress` from `ripple-keypairs`.
4. **Decide.** If the derived address is the wallet, the key is the master key. It could sign if `account_data.Flags & 0x00100000` (`lsfDisableMaster`) is `0`. Otherwise, it could sign if `account_data.RegularKey` is the derived address. If the key is neither the master key nor the `RegularKey`, and `signer_lists` isn't empty, the key may belong to the signer list, which the SDK doesn't check.

For the `issuer` authority, run `account_info` on the issuer at the same ledger. The account must exist.

## Limits

These come back `unverifiable` on XRPL:

- **Signatures by a key other than the master key, offline.** Ask for a moment to read the account's `RegularKey`.
- **Signatures with no `signer_public_key`.** There's no key to verify against.
- **Transfers and contract signatures.** The SDK doesn't re-check them on XRPL.
- **`admin_manual` verifications.** There is nothing to re-check.
- **Multisig authorities and authority types other than `issuer`.**
- **Keys that may belong to a signer list,** at a moment, when the key is neither the master key nor the `RegularKey`.
- **Past moments the server doesn't have.** Use a server whose `complete_ledgers` covers them.
- **Expired verifications,** at moments at or after `expires_at`.
