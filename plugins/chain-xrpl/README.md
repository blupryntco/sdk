# @bluprynt/sdk-chain-xrpl

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

XRPL chain add-on for the Bluprynt SDK. Optional — install it alongside
[`@bluprynt/sdk`][sdk] only if you need XRPL support. Depends on
[`@bluprynt/sdk-core`][core] and nothing else.

```sh
npm install @bluprynt/sdk-chain-xrpl
```

```ts
import { xrplChainId } from "@bluprynt/sdk-chain-xrpl";

xrplChainId("0"); // "xrpl:0"
```

`checkWalletVerification` is a stub that always returns `isVerified: false`. Real signature
verification (classic address derivation, signer list + quorum for `MULTISIGN`) is not
implemented yet. Transfer-based transaction verification is not planned for XRPL.

## KYI verification

Re-checks a Bluprynt KYI token lookup (`GET /kyi/v1/tokens`) against public XRPL data and your own RPC, instead of trusting the `kyi_verified` flag.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-xrpl";

const report = await verifyKyiResponse(response, {
  rpcUrls: { "xrpl:0": "wss://xrpl.rpc.example.com" },
  at: ["verified", "now"],
});

report.claimed; // what Bluprynt says
report.verified; // what the timeless proofs support
report.at.now?.verified; // what the evidence supports as of now
```

By default it works offline and reads no ledger state. Pass `at` to read the ledger at each record's own moment (`"verified"`), at `"now"`, or at any `Date`. Past moments need a server whose history covers them.

What it checks:

- Signatures verify for the recorded signer key. Offline, a master key is accepted. At each moment, the key must have been authorised then: the master key while not disabled, or the account's regular key.
- The issuer authority matches the token's issuer, and the issuer account exists at each moment.

Every verification must also name one of the token's listed authorities. See the [XRPL page](https://sdk.bluprynt.com/chains/xrpl) and [XRPL checks](https://sdk.bluprynt.com/reference/xrpl) for details.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
