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

ESM + CJS, bundled types.

[sdk]: https://www.npmjs.com/package/@bluprynt/sdk
[core]: https://www.npmjs.com/package/@bluprynt/sdk-core
