# Verifying KYI claims

When you look up a token through [Bluprynt's public API](https://integrations.bluprynt.com/) (`GET /kyi/v1/tokens`), the response tells you whether the token passed KYI (`kyi_verified`). It also includes the evidence behind that claim:

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

## Example

Below is a lookup for a test token on Sepolia. Its issuer proved control of the token's controlling wallet with an EIP-191 signature.

::: details API response
```json
{
  "kyi_verified": true,
  "data": [
    {
      "kyi_verified": true,
      "token": {
        "caip19": "eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3",
        "caip2": "eip155:11155111",
        "chain_slug": "sepolia",
        "address": "0xCBc76CeB0Afa037cBb975Fd330Bd683754998Cc3",
        "standard": null,
        "decimals": null,
        "verified_at": "2026-10-06T13:30:46.372Z"
      },
      "asset": {
        "slug": "onvi-2mdu3y",
        "name": "Onyx Viper",
        "symbol": "ONVI",
        "description": "https://coo.coo",
        "website_url": "https://coo.coo",
        "whitepaper_url": "https://coo.coo"
      },
      "issuer": {
        "name": "Example Organization",
        "kyb_verified": true
      },
      "authorities": [
        {
          "type": "controlled_by",
          "address": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "account_type": "regular",
          "signers": [],
          "threshold": null,
          "observed_at": "2026-10-06T13:29:21.759Z"
        }
      ],
      "verifications": [
        {
          "verified_at": "2026-10-06T13:30:46.372Z",
          "expires_at": null,
          "wallet_address": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "authority": {
            "type": "controlled_by",
            "address": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
            "account_type": "regular",
            "signers": [],
            "threshold": null,
            "observed_at": "2026-10-06T13:29:21.759Z"
          },
          "method": {
            "type": "signature",
            "scheme": "eip191",
            "message": "Please, sign this message to verify your Bluprynt KYI credentials\n\nPurpose: Verify wallet ownership\nIssued to: 1173\nAddress: 0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c::1791293432710::37ae7bb2fb93c56f09e7c5f523d8060b.b163c968e50ed343ad4aa773bce98de8dea7def92bddb4f16ebdf8265c14e062",
            "signature": "0xec83133187bf78019c3c4b4137d14e1876b167c2f64ca05bfc06f5491c9c257e1477862593d19651ede7268e9f7470c773d46e1a818d2eb3b2b82ede600010141b",
            "signer_public_key": null
          }
        }
      ]
    }
  ]
}
```
:::

Passing it to `verifyKyiResponse` returns:

```json
{
  "claimed": true,
  "verified": true,
  "matchesClaim": true,
  "tokens": [
    {
      "caip19": "eip155:11155111/erc20:0xcbc76ceb0afa037cbb975fd330bd683754998cc3",
      "claimed": true,
      "verified": true,
      "matchesClaim": true,
      "evidence": "confirmed",
      "checks": [
        {
          "kind": "verification",
          "subject": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "method": "signature:eip191",
          "status": "valid",
          "steps": [
            {
              "check": "wallet is the authority or one of its signers",
              "via": "offline",
              "ok": true,
              "expected": ["0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"],
              "actual": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c"
            },
            {
              "check": "eip191 signature recovers to wallet",
              "via": "offline",
              "ok": true,
              "expected": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
              "actual": "0xf748a9220B9B0D79D6eeD2D927fCdFE80055b19c"
            }
          ]
        },
        {
          "kind": "authority",
          "subject": "0xf748a9220b9b0d79d6eed2d927fcdfe80055b19c",
          "method": "controlled_by",
          "status": "unverifiable",
          "reason": "no generic EVM check for controlled_by",
          "steps": []
        }
      ]
    }
  ]
}
```

The signature recovers to the wallet without any network access, so the verification is `valid`. The SDK has no generic on-chain check for a `controlled_by` authority, so that check is `unverifiable`. An unverifiable check doesn't count against the token. One valid verification and no invalid checks make the evidence `confirmed`, which matches Bluprynt's claim.

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
