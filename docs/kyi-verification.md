# Verifying KYI claims

When you look up a token through Bluprynt's public API (`GET /kyi/v1/tokens`), the response tells you whether the token passed KYI (`kyi_verified`). It also includes the evidence behind that claim:

- **Authorities:** the addresses that control the token, such as its `owner()` or a Safe multi-sig and its signers.
- **Verifications:** the wallet proofs showing that the issuer controls one of those authorities. A proof is a signature, a contract signature or an on-chain transfer (see [Wallet verification](/wallet-verification)).

The SDK re-checks that evidence against public data and your own RPC, so you don't have to rely on the `kyi_verified` flag alone.

::: warning Experimental
The KYI response types follow the public API's current shape. They will change until they are generated from the OpenAPI spec. Only EVM chains are supported for now.
:::

## One call

```ts
import { verifyKyiResponse } from "@bluprynt/sdk-chain-evm";

const response = await fetch(".../kyi/v1/tokens?...").then((r) => r.json());

const report = await verifyKyiResponse(response, {
  rpcUrls: { "eip155:1": "https://mainnet-eth.rpc.example.com" },
});

report.claimed; // what Bluprynt says
report.verified; // what the re-checked evidence supports
report.matchesClaim; // true | false | null
```

If you already hold a single item from the response, use `verifyKyiToken(item, options)` instead. To re-check one verification or authority on its own, use `checkKyiVerification` or `checkKyiAuthority`.

## What gets checked

### Verifications

For each verification, the SDK first checks that `wallet_address` is the authority itself or one of its signers. It also checks that the verification hasn't expired. It then re-checks the proof according to its method:

| Method | Check | Needs RPC |
| --- | --- | --- |
| `signature` / `eip191` | The signature over the stored message recovers to the wallet | No |
| `signature` / `eip712` | The typed-data signature recovers to the wallet | No |
| `contract_signature` / `eip1271` | `isValidSignature` on the wallet contract, at the recorded block | Yes |
| `transfer` / `amount` | The transaction succeeded and was sent from the wallet. For the native asset (`slip44`), its recipient and value match. For an ERC-20 token, the receipt contains a matching `Transfer` event | Yes |
| `transfer` / `memo` | The transaction succeeded, its sender and recipient match, and its calldata carries the memo | Yes |
| `admin_manual` | Not re-checkable. Reported as `unverifiable` | — |

When a signature's scheme wasn't recorded, the SDK assumes EIP-191 for `0x…` wallets. It notes this assumption in the step description.

### Authorities

For each authority, the SDK reads the current on-chain state:

- **`owner`:** the token's `owner()` returns the authority's address.
- **`multisig`:** the Safe's `getOwners()` and `getThreshold()` match the claimed signers and threshold.

Authority types without a generic EVM check are reported as `unverifiable`.

## Reading the report

Every check returns a `ClaimCheck` with a `status`:

- **`valid`:** every step passed.
- **`invalid`:** a step failed. `reason` names the failed step. A transaction that doesn't exist or a contract call that reverts also counts as a failure.
- **`unverifiable`:** the claim couldn't be checked, for example because the proof material is missing or the method isn't supported.

Each check also lists its `steps`, including the expected and actual values and whether the step ran `offline` or over `rpc`. You can log or store them as an audit trail.

The SDK sums up the checks for each token as `evidence`:

| `evidence` | Meaning | `verified` |
| --- | --- | --- |
| `confirmed` | At least one verification is valid and no check is invalid | `true` |
| `contradicted` | At least one check is invalid | `false` |
| `inconclusive` | Nothing is invalid, but no verification could be confirmed | `false` |

`matchesClaim` compares `verified` with what Bluprynt claimed. It is `null` when Bluprynt claims the token is verified but the evidence is inconclusive. In that case, the SDK can neither confirm nor refute the claim.

At the response level, `verified` is `true` if any token is verified.

## RPC configuration

Pass RPC endpoints in `rpcUrls`, keyed by CAIP-2 chain ID. Signature checks run offline. Contract signatures, transfers and authorities need an RPC for their chain. If one isn't configured, the call throws `RPC not configured for <caip2>`. Transport errors are also thrown, not reported as failed checks. This way, a flaky RPC can't make a valid claim look `invalid`.
