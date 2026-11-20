---
"@bluprynt/sdk-core": minor
"@bluprynt/sdk-chain-solana": minor
---

Re-check Solana signatures recorded as `solana_offchain_v0_signers`: the message behind the full version 0 off-chain header, with an application domain and the signer's public key. A signature with no recorded scheme is now also tried in this format.
