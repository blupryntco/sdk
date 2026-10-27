// Batteries-included: one import from the umbrella.
import { createClient } from "@bluprynt/sdk";
// À la carte add-on: install only the chain you need, import only the capability you use.
import { evmChainId } from "@bluprynt/sdk-chain-evm";
import { encodeTx } from "@bluprynt/sdk-chain-evm/tx";

const client = createClient({ apiKey: process.env.BLUPRYNT_API_KEY ?? "" });

async function main() {
  const lookup = await client.lookupTokens({
    caip19: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  });
  console.log("kyi verified:", lookup.kyi_verified);

  console.log("mainnet:", evmChainId(1)); // "eip155:1"
  console.log("tx:", encodeTx({ to: "0xabc", value: 1n }));
}

void main();
