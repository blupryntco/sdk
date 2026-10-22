# RPC and errors

## RPC configuration

Pass RPC endpoints in `rpcUrls`, keyed by [CAIP-2](/reference/glossary#caip) chain ID. They're needed only when you ask for moments, and only for checks that read chain state. Offline checks never call an RPC.

Which checks read chain state at a moment:

| Chain | Reads chain state | Needs no RPC |
| --- | --- | --- |
| EVM | Contract signatures, transfers, `owner` authorities and multisig authorities | Signatures and other authority types |
| Solana | `mint_authority`, `freeze_authority` and multisig authorities, at `"now"` only | Signatures, other authority types, and every moment except `"now"` |
| XRPL | Signature verifications (to read the wallet's keys) and `issuer` authorities | Multisig and other authority types |

A contract signature or transfer is read on the chain it records (`caip2`). Everything else is read on the token's chain.

If a needed RPC isn't configured, the call throws `RPC not configured for <caip2>`. XRPL URLs must be WebSocket URLs (`wss://` or `ws://`), because the SDK uses the `Client` of `xrpl.js`.

Past moments need history. On EVM that's an archive RPC. On XRPL it's a server whose `complete_ledgers` cover the moment. See [EVM checks](/reference/evm#how-a-moment-is-read) and [XRPL checks](/reference/xrpl#how-a-moment-is-read).

The SDK trusts what the RPC returns and doesn't cross-check it. Results at a moment are only as reliable as the endpoint you configure.

## Many tokens

`verifyKyiResponse` checks a response's tokens at the same time. Within one token, EVM checks share the RPC client and block lookups, and XRPL checks share the connection and ledger lookups. Solana checks don't share reads. Nothing is shared across tokens or across calls. If you check many tokens, or the same token often, caching and rate limits are up to you.

## What throws, and what's reported

The SDK reports what it could check as `valid`, `invalid` or `unverifiable`. When it can't run the checks at all, it throws.

**`invalid`** means a check ran and failed: a signature that doesn't recover or verify, a wallet that isn't the authority or one of its signers, an authority that isn't listed for the token, or chain state that doesn't match. On EVM, a transaction that doesn't exist, a contract call that reverts, or a call to an address with no contract is a failed `on-chain lookup` step. On XRPL, an account that didn't exist at the moment fails its step.

**`unverifiable`** means the SDK couldn't tell either way: missing proof material, a method or authority type it can't check, an expired verification, a moment before the record, or a past moment the RPC or chain can't serve. On EVM, an RPC without state for a past block gives `RPC has no state for block <n>`. On XRPL, a server without a past ledger gives `XRPL server has no ledger <n>`. On Solana, every moment except `"now"` gives `Solana RPC cannot read historical account state`.

**Throws:**

- `RPC not configured for <caip2>`: a check needs an RPC that isn't in `rpcUrls`.
- `No KYI checker for namespace <namespace>`: a token's chain has no checker in `chains`.
- `Malformed verified_at: <value>`, `Malformed expires_at: <value>`, `Malformed observed_at: <value>`: a timestamp that doesn't parse.
- `Malformed XRPL token address: <address>`: an `issuer` authority checked at a moment on an XRPL token address without a `.`.
- Network and RPC errors, such as timeouts, rate limits or a bad URL. On EVM and XRPL, a failed lookup is shared by the token's checks, so the call fails once.
- Proof material a chain library can't parse, such as an EIP-712 message that isn't JSON.

Network and RPC errors are thrown, not reported as failed checks. This way, a flaky RPC can't make a valid claim look `invalid`. An RPC or server that lacks history for a past moment is different: that's reported as `unverifiable` at that moment.
