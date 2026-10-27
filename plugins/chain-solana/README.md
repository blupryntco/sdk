# @bluprynt/sdk-chain-solana

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

Solana chain add-on for the Bluprynt SDK. Optional — install it alongside
[`@bluprynt/sdk`][sdk] only if you need Solana support. Depends on
[`@bluprynt/sdk-core`][core] and nothing else.

```sh
npm install @bluprynt/sdk-chain-solana
```

```ts
import { SOLANA_MAINNET, solanaChainId } from "@bluprynt/sdk-chain-solana";

SOLANA_MAINNET; // "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
solanaChainId(genesisHash);
```

`checkWalletVerification` is a stub that always returns `isVerified: false`. Real ed25519
signature and memo-transaction verification are not implemented yet.

## KYI verification

Re-checks a Bluprynt KYI token lookup (`GET /kyi/v1/tokens`) against public Solana data and your own RPC, instead of trusting the `kyi_verified` flag.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-solana";

const report = await verifyKyiResponse(response, {
  rpcUrls: { "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "https://solana.rpc.example.com" },
  at: ["now"],
});

report.claimed; // what Bluprynt says
report.verified; // what the timeless proofs support
report.at.now?.verified; // what the evidence supports as of now
```

By default it works offline and reads no chain state. Pass `at: ["now"]` to read the current chain state. A Solana RPC can't read past account state, so any other moment is reported as `unverifiable`.

What it checks:

- Raw and off-chain Ed25519 message signatures verify for the wallet.
- Mint and freeze authorities match the token's mint account (SPL Token and Token-2022).
- Multisig authorities match the on-chain signers and threshold.

Every verification must also name one of the token's listed authorities. See the [Solana page](https://sdk.bluprynt.com/chains/solana) and [Solana checks](https://sdk.bluprynt.com/reference/solana) for details.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
