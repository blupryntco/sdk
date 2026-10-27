# Quickstart

This page re-checks one KYI token lookup for an EVM token, a test token on Sepolia: first offline, then against the chain as of now.

## Install a chain package

Install the package for the token's chain, and the API client:

```sh
npm install @bluprynt/sdk-chain-evm @bluprynt/sdk-client
```

For other chains, the steps are the same with a different package and `rpcUrls` key: `@bluprynt/sdk-chain-solana` with `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` ([Solana](/chains/solana)), or `@bluprynt/sdk-chain-xrpl` with `xrpl:0` and a `wss://` URL ([XRPL](/chains/xrpl)). To handle several chains with one call, see [Reading the report](/sdk/report#one-call-several-chains).

Each package ships ESM and CommonJS builds with TypeScript types. The packages don't declare a Node version. The repository builds and tests them on Node 22 or later. Each chain package depends on its ecosystem's library: viem for EVM, `@solana/kit` and the token program clients for Solana, `xrpl` and `ripple-keypairs` for XRPL.

## Fetch a lookup

[Bluprynt's public API](https://integrations.bluprynt.com/) serves KYI token lookups at `GET /kyi/v1/tokens`. Look a token up by its [CAIP-19](/reference/glossary#caip) ID, or by `address` with an optional `chain_slug`. The request needs an API key.

```ts
import { createClient } from "@bluprynt/sdk-client";

const client = createClient({ apiKey: process.env.BLUPRYNT_API_KEY ?? "" });

const response = await client.lookupTokens({
  caip19: "eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3",
});
```

[Querying the API](/sdk/api-client) covers the client. To call the API without it, send the key as-is in the `Authorization` header.

The response says whether the token passed KYI (`kyi_verified`). It also lists the token's [authorities](/reference/glossary#authority) and the [verifications](/reference/glossary#verification) that back them. [Reading the report](/sdk/report#example) shows this lookup in full.

## Verify offline

The values in the comments are for this Sepolia lookup.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-evm";

const report = await verifyKyiResponse(response);

report.claimed; // true: what Bluprynt says
report.evidence; // "confirmed"
report.verified; // true: what the re-checked proofs support
report.matchesClaim; // true: the two agree
```

With no options, the SDK makes no network calls. It checks each verification's proof: the signature recovers to the wallet, the wallet is the authority or one of its signers, and the authority is listed for the token.

- **`evidence`:** `confirmed` when at least one verification is valid and no check is invalid. `contradicted` when a check is invalid. `inconclusive` otherwise.
- **`verified`:** `true` only when the evidence is `confirmed`.
- **`matchesClaim`:** whether `verified` agrees with `claimed`. It's `null` when Bluprynt claims the token is verified but the evidence is inconclusive.

These three are the offline summary. They cover signatures and the binding between wallet, authority and token, but not authorities on-chain or expiry. Don't show a badge from `verified` alone: [Showing a badge](/sdk/badge) explains which fields to use.

Each token's `checks` hold the steps behind these values. See [Reading the report](/sdk/report).

## Check the chain as of now

Offline checks can't tell you whether an authority still controls the token. To read chain state, pass an RPC for the token's chain and ask for a [moment](/reference/glossary#moment):

```ts
const report = await verifyKyiResponse(response, {
  rpcUrls: { "eip155:11155111": "https://sepolia.rpc.example.com" },
  at: ["now"],
});

report.at.now?.evidence; // the same summary, from the chain as of now
report.tokens[0]?.checks[0]?.at.now; // one check's result at that moment
```

The offline summary stays the same. `report.at.now` sums up what held as of now. For this lookup it is `inconclusive`, because its authority is `controlled_by`, which the SDK can't read on EVM. No RPC call is made: a signature reads no chain state either. [Reading the report](/sdk/report#example) walks through it. To see `at.now` read real authorities, run the worked examples at a moment for [EVM](/chains/evm#at-a-moment), [Solana](/chains/solana#at-a-moment) and [XRPL](/chains/xrpl#at-a-moment).

You can also ask for `"verified"` (each record's own moment) or any `Date`. [Moments](/sdk/moments) explains which to use. [RPC and errors](/sdk/rpc) covers RPC setup and what throws.

The snippets on this page aren't run by our tests. The same lookup is checked offline by a tested example on the [EVM page](/chains/evm#check-it-yourself).
