# Solana

This page covers Solana: how a wallet proves control, how Bluprynt records the proof, and what `@bluprynt/sdk-chain-solana` re-checks. For the report format, see [Reading the report](/sdk/report).

## How wallets prove control on Solana

A Solana wallet is an **Ed25519 key pair**. The address is the 32-byte public key, written in base58. So the address is all a verifier needs to check a signature. There's nothing to recover and no key to look up.

A wallet proves control by signing a message off-chain. There are two ways it gets signed:

- **Raw.** The wallet signs the message's UTF-8 bytes as they are. Wallet apps do this when asked to sign a message.
- **[Off-chain message](/reference/glossary#off-chain-message) format.** The signed bytes start with a header that no transaction can start with. The Solana CLI signs this way, with `solana sign-offchain-message`. The header makes it impossible to trick someone into signing a transaction that looks like a message.

The two produce different signatures for the same text. A verifier has to know which one was used.

Tokens live in a program. **[SPL Token](/reference/glossary#spl-token)** is the original token program. **Token-2022** is a newer one with extensions. In both, each token has a **mint account** that holds two optional authorities:

- the **mint authority**, which can create new tokens, and
- the **freeze authority**, which can freeze holders' token accounts.

Either authority can be a plain wallet or an **SPL multisig**: an account owned by the token program that lists up to 11 signers and needs `m` of them to act.

## How Bluprynt verifies it

The flows are described in [Wallet verification](/wallet-verification). On Solana:

- **Wallet extension.** The user connects through WalletConnect and signs a Bluprynt-generated message. Wallet apps sign it raw.
- **CLI.** The user signs the challenge with `solana sign-offchain-message`. See [Off-chain message signing with the Solana CLI](https://docs.anza.xyz/cli/examples/sign-offchain-message).
- **On-chain transaction.** Not used: [transfer proofs aren't available on Solana today](/wallet-verification#onchain-transaction).

The SDK re-checks signature verifications:

| `method` | Used for | Stored evidence |
| --- | --- | --- |
| `signature` / `solana_raw` | Wallet apps | `message`, `signature` (base58) |
| `signature` / `solana_offchain_v0` | The Solana CLI | `message`, `signature` (base58) |
| `signature` with no `scheme` | Older records | `message`, `signature`. The SDK tries both formats |
| `admin_manual` | Set by hand | Nothing to re-check |

Every verification also names the `wallet_address` and the `authority` it backs. On Solana, authorities are usually `mint_authority` or `freeze_authority`.

## What the SDK checks

Offline, with no `at`, the SDK verifies the signature against the wallet address. It never calls an RPC.

With `at`, it reads the token's accounts. A Solana RPC can only answer for the current state, so only `"now"` reads anything. The SDK doesn't set a commitment, so reads use `confirmed`, the default of Kit's `createSolanaRpc`.

The package uses `@solana/kit`, and the `@solana-program/token` and `@solana-program/token-2022` clients to decode accounts.

| Question | How it's answered |
| --- | --- |
| Did this wallet sign the message? | `verifySignature` from `@solana/kit`, with the public key taken from the address. Offline |
| Is the authority still the mint or freeze authority? | `getAccountInfo` on the mint, decoded with the SPL Token or Token-2022 layout. At `"now"` |
| Does the multisig have the claimed signers and threshold? | `getAccountInfo` on the multisig account. At `"now"` |

The [Solana checks](/reference/solana) reference lists every step and reason by name.

## Quirks

**Raw and off-chain signatures differ.** The legacy off-chain format the CLI signs puts a 20-byte header before the message:

| Bytes | Field | Value |
| --- | --- | --- |
| 16 | Signing domain | `\xff` followed by `solana offchain` |
| 1 | Version | `0` |
| 1 | Format | `0` (restricted ASCII) |
| 2 | Message length | little-endian `u16` |

The wallet signs the whole buffer: the header followed by the message bytes (`header || message`). A signature over the raw message doesn't verify over these bytes, and the other way round. A record that names the wrong scheme is `invalid`.

Format `0` means restricted ASCII: printable characters only (0x20–0x7e), no newlines. Bluprynt's CLI challenge is one line of printable ASCII, so the CLI signs it as format `0`. The SDK always uses format `0`. A message the CLI signs as format `1` or `2` (for example one with a newline) won't verify. Bluprynt's multi-line wallet challenge is signed raw, so its format doesn't matter.

**Two things called "version 0".** The scheme name `solana_offchain_v0` refers to the legacy header above, whose version byte is `0`. `@solana/kit` has its own off-chain message codec, and it also calls its layout "version 0". That layout is newer: it adds an application domain and a list of signers to the header. Its bytes differ from what the CLI signs, so the SDK doesn't use it. It builds the legacy header with Kit's generic codecs instead. That header is the one piece the SDK and the example build by hand. Everything else comes from Kit.

**Signatures are base58.** A signature is 64 bytes, stored as a base58 string. The SDK decodes it before verifying.

**SPL Token and Token-2022.** Both programs use the same mint and multisig layouts for the fields the SDK reads. The SDK accepts accounts owned by either program. An account owned by any other program fails the `… is owned by a token program` step.

**Token-2022 extensions aren't checked.** The SDK reads only the base mint's mint and freeze authorities. A Token-2022 mint can carry extensions with their own authorities, such as a permanent delegate, a transfer hook, a mint close authority or a pausable authority. A permanent delegate can transfer or burn tokens from any holder's account. A transfer hook runs a program on every transfer. A pause authority can stop transfers. A wallet that shows a badge should know that a confirmed mint authority says nothing about these. Read the mint's extensions yourself if they matter to you.

**SPL multisig signers are compared as a set.** An SPL multisig account has 11 signer slots, of which the first `n` are in use. The SDK reads those `n` signers and compares them with the claimed `signers` as a set: order doesn't matter. It compares the threshold `m` only when the claim has one.

**Squads vaults and other PDA authorities aren't supported.** A Squads vault is a program-derived address (PDA) controlled by the Squads program. It isn't an SPL Token multisig. Listed as a multisig, it fails `multisig is owned by a token program`, or `multisig account exists` if the vault account was never funded. Listed as a regular authority, it can't sign a message, because a PDA has no private key.

**Only "now".** A Solana RPC serves current account state. It can't tell you who the mint authority was last month. The SDK's Solana checker doesn't try to read historical state, so every moment except `"now"` is `unverifiable` with `Solana RPC cannot read historical account state`. That includes signature verifications.

**Addresses are exact.** Base58 is case-sensitive. The SDK compares Solana addresses byte for byte. Changing the case of one letter makes a different address.

## Check it yourself

To re-check a verification by hand, verify its signature as shown below. Then confirm that the `wallet_address` is the authority's `address` or one of its `signers`, and that the authority's `type` and `address` appear in the token's `authorities`.

### Synthetic data (fixed public test keys)

This script uses a test key pair built from fixed bytes. It's public, holds nothing, and must never be used on-chain. The script signs Bluprynt's multi-line wallet challenge raw, as a wallet app would, and the one-line CLI challenge in the legacy off-chain format, as the CLI would. It builds a lookup in the shape the API returns for a Solana token. It then checks the signatures twice: with Kit alone, and through the SDK. Neither needs a network.

<<< @/../examples/chains/src/solana.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/solana.json
:::

What it shows:

- `messages`: the wallet challenge has newlines; the CLI challenge is one line of printable ASCII.
- `legacyOffchainHeader` is the 20-byte header of the CLI challenge in hex: the signing domain, version `00`, format `00`, and the length.
- `independent`: for each message, its signature verifies only over the bytes it was made from, raw or with the header.
- `sdk.report`: both verifications are `valid` when recorded with their real scheme.
- `sdk.rawSignatureRecordedAsOffchain` and `sdk.offchainSignatureRecordedAsRaw`: swapping the scheme makes the proof `invalid`.
- `sdk.offchainSignatureWithoutScheme`: with no scheme, the SDK finds the format that matches and names it.

Kit and the SDK agree: each signature verifies only in the format it was made in, and a proof recorded with the other format is `invalid`.

Source: [`examples/chains/src/solana.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/solana.ts) · output: [`examples/chains/output/solana.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/solana.json)

### With the Solana CLI (not run by our tests)

You can sign and verify the same way with the Solana CLI. See [Off-chain message signing with the Solana CLI](https://docs.anza.xyz/cli/examples/sign-offchain-message) for the exact options of your CLI version. `message.txt` holds the one-line CLI challenge, with no trailing newline.

```sh
solana sign-offchain-message --keypair wallet.json "$(cat message.txt)"
solana verify-offchain-signature --signer <WALLET_ADDRESS> "$(cat message.txt)" <SIGNATURE>
```

### At a moment: synthetic data (recorded RPC responses) {#at-a-moment}

This script builds a lookup with two made-up tokens. In both, the test wallet is the listed `mint_authority`, and it signed Bluprynt's challenge raw. It asks for `at: ["verified", "now"]`. In the recorded chain, the first mint is a Token-2022 mint whose mint authority is still the wallet. The second is an SPL Token mint whose mint authority was handed to another key. The RPC responses are recorded in [`src/fixtures/solana-now.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/fixtures/solana-now.json), so the example runs offline. `pnpm -C examples/chains fixtures` regenerates them.

<<< @/../examples/chains/src/solana-now.ts

Its test checks that this output stays the same:

::: details Output
<<< @/../examples/chains/output/solana-now.json
:::

- `at.verified`: `unverifiable` with `Solana RPC cannot read historical account state`, for both tokens. So each token's `at.verified.evidence` is `inconclusive`.
- `at.now` for the first token, read at slot 412345678: the mint authority is the wallet. `valid`, and the token's `at.now.evidence` is `confirmed`.
- `at.now` for the second token, read at slot 412345679: the mint authority is another key, so the result is `invalid` with `mint authority failed`. The token's `at.now.evidence` is `contradicted`.

The response-level `at.now.evidence` is `confirmed`, because one token is confirmed. For a badge, read each token's own report. See [Showing a badge](/sdk/badge).

Source: [`examples/chains/src/solana-now.ts`](https://github.com/blupryntco/sdk/blob/main/examples/chains/src/solana-now.ts) · output: [`examples/chains/output/solana-now.json`](https://github.com/blupryntco/sdk/blob/main/examples/chains/output/solana-now.json)

## Limits

These come back `unverifiable` on Solana:

- **Every moment except `"now"`.** The RPC can't read past account state. The SDK can't tell either way.
- **Transfers and contract signatures.** The SDK doesn't re-check them on Solana.
- **`admin_manual` verifications.** There is nothing to re-check.
- **Authority types other than `mint_authority` and `freeze_authority`.** A multisig of another type is partly checked: see [Solana checks](/reference/solana#authorities).
- **Expired verifications,** at moments at or after `expires_at`.
