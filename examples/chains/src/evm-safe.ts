import { fileURLToPath } from "node:url";
import { verifyKyiResponse } from "@bluprynt/sdk-chain-evm";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fixture from "./fixtures/evm-safe.json" with { type: "json" };
import { withRecordedFetch } from "./replay.ts";

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];

// Public test keys and made-up contract addresses: the recorded chain in fixtures/evm-safe.json is synthetic.
const OWNER_KEYS = [
  `0x${"11".repeat(32)}`,
  `0x${"22".repeat(32)}`,
  `0x${"33".repeat(32)}`,
] as const;
const SAFE = getAddress("0x5afe00000000000000000000000000000000a11c");
const TOKEN = getAddress("0x7e57000000000000000000000000000000000020");

const CAIP2 = "eip155:11155111";
const RPC_URL = "https://sepolia.rpc.example.invalid";
const VERIFIED_AT = "2026-04-15T09:30:00.000Z";

const owners = OWNER_KEYS.map((key) => privateKeyToAccount(key).address);

export async function run() {
  const [signer] = OWNER_KEYS;
  const wallet = privateKeyToAccount(signer);
  const message = [
    "Please, sign this message to verify your Bluprynt KYI credentials",
    "",
    "Purpose: Verify wallet ownership",
    "Issued to: example",
    `Address: ${wallet.address}::1776245400000::example-nonce`,
  ].join("\n");

  const authority = {
    type: "owner",
    address: SAFE,
    account_type: "multisig" as const,
    signers: owners,
    threshold: 2,
    observed_at: VERIFIED_AT,
  };
  const lookup: KyiTokenLookup = {
    kyi_verified: true,
    data: [
      {
        kyi_verified: true,
        token: {
          caip19: `${CAIP2}/erc20:${TOKEN}`,
          caip2: CAIP2,
          chain_slug: "sepolia",
          address: TOKEN,
          standard: "erc20",
          decimals: 18,
          verified_at: VERIFIED_AT,
        },
        asset: {
          slug: null,
          name: "Example Safe Token",
          symbol: "SAFEX",
          description: null,
          website_url: null,
          whitepaper_url: null,
        },
        issuer: null,
        authorities: [authority],
        verifications: [
          {
            verified_at: VERIFIED_AT,
            expires_at: null,
            wallet_address: wallet.address,
            authority,
            method: {
              type: "signature",
              scheme: "eip191",
              message,
              signature: await wallet.signMessage({ message }),
              signer_public_key: null,
            },
          },
        ],
      },
    ],
  };

  return {
    safe: SAFE,
    token: TOKEN,
    claimedOwners: owners,
    signer: wallet.address,
    report: await withRecordedFetch(fixture.records, () =>
      verifyKyiResponse(lookup, {
        rpcUrls: { [CAIP2]: RPC_URL },
        at: ["verified", "now"],
      }),
    ),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await run(), null, 2));
}
