// Batteries-included: one import from the umbrella.
import { createClient, parseCredential } from "@bluprynt/sdk";
// À la carte add-on: install only the chain you need, import only the capability you use.
import { evmChainId } from "@bluprynt/sdk-chain-evm";
import { encodeTx } from "@bluprynt/sdk-chain-evm/tx";

const client = createClient({
  baseUrl: "https://api.bluprynt.example",
  apiKey: "…",
});

async function main() {
  const cred = await client.getCredential("urn:cred:1");
  console.log("issuer:", cred.issuer);

  console.log("mainnet:", evmChainId(1)); // "eip155:1"
  console.log("tx:", encodeTx({ to: "0xabc", value: 1n }));

  // schema parsing is also available directly
  parseCredential(cred);
}

void main();
