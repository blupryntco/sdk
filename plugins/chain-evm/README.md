# @bluprynt/sdk-chain-evm

> **Pre-alpha — not usable yet.** Scaffolding only: the API surface is a sketch and can change or
> disappear without notice. No support, no stability guarantees.

EVM chain add-on for the Bluprynt SDK. Optional — install it alongside
[`@bluprynt/sdk`][sdk] only if you need EVM support. Depends on
[`@bluprynt/sdk-core`][core] and nothing else.

```sh
npm install @bluprynt/sdk-chain-evm
```

```ts
import { evmChainId } from "@bluprynt/sdk-chain-evm";
import { encodeTx } from "@bluprynt/sdk-chain-evm/tx";
import { isEvmLog } from "@bluprynt/sdk-chain-evm/events";

evmChainId(1); // "eip155:1"
```

Subpaths keep capability selection fine-grained: `/tx` for transaction helpers, `/events` for
log/event helpers.

`checkWalletVerification` is a stub that always returns `isVerified: false`. Real EIP-191
ecrecover, ERC-1271 contract-wallet, and onchain-transfer verification are not implemented yet.

## KYI verification

Re-checks a Bluprynt KYI token lookup (`GET /kyi/v1/tokens`) against public EVM data and your own RPC, instead of trusting the `kyi_verified` flag.

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-evm";

const report = await verifyKyiResponse(response, {
  rpcUrls: { "eip155:1": "https://mainnet-eth.rpc.example.com" },
  at: ["verified", "now"],
});

report.claimed; // what Bluprynt says
report.verified; // what the timeless proofs support
report.at.now?.verified; // what the evidence supports as of now
```

By default it works offline and reads no chain state. Pass `at` to read the chain at each record's own moment (`"verified"`), at `"now"`, or at any `Date`. Past moments need an archive RPC.

What it checks:

- EIP-191 and EIP-712 signatures recover to the wallet.
- EIP-1271 contract signatures validate on-chain at the block for each moment.
- Amount and memo transfers exist on-chain and match the claim.
- `owner()` and Safe owners and threshold match the listed authorities at each moment.

Every verification must also name one of the token's listed authorities. See the [EVM page](https://sdk.bluprynt.com/chains/evm) and [EVM checks](https://sdk.bluprynt.com/reference/evm) for details.

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
