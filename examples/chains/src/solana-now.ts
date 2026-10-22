import { fileURLToPath } from "node:url";
import { verifyKyiResponse } from "@bluprynt/sdk-chain-solana";
import {
  type Address,
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
  getBase58Decoder,
  getUtf8Encoder,
  signBytes,
} from "@solana/kit";
import fixture from "./fixtures/solana-now.json" with { type: "json" };
import { withRecordedFetch } from "./replay.ts";

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];
type KyiTokenLookupItem = KyiTokenLookup["data"][number];

// Public test keys: anyone can rebuild them from these bytes, and the mint accounts recorded in fixtures/solana-now.json are synthetic.
const WALLET_SECRET = new Uint8Array(32).fill(1);
const KEPT_MINT_SECRET = new Uint8Array(32).fill(2);
const HANDED_OVER_MINT_SECRET = new Uint8Array(32).fill(3);

const CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const RPC_URL = "https://solana.rpc.example.invalid";
const VERIFIED_AT = "2026-10-01T12:00:00.000Z";

const addressOf = async (secret: Uint8Array) =>
  getAddressFromPublicKey(
    (await createKeyPairFromPrivateKeyBytes(secret)).publicKey,
  );

export async function run() {
  const keys = await createKeyPairFromPrivateKeyBytes(WALLET_SECRET);
  const wallet = await getAddressFromPublicKey(keys.publicKey);
  const keptMint = await addressOf(KEPT_MINT_SECRET);
  const handedOverMint = await addressOf(HANDED_OVER_MINT_SECRET);

  const message = [
    "Please, sign this message to verify your Bluprynt KYI credentials",
    "",
    "Purpose: Verify wallet ownership",
    "Issued to: example",
    `Address: ${wallet}::1790856000000::example-nonce`,
  ].join("\n");
  const signature = getBase58Decoder().decode(
    await signBytes(keys.privateKey, getUtf8Encoder().encode(message)),
  );

  const mintToken = (mint: Address, symbol: string): KyiTokenLookupItem => {
    const authority = {
      type: "mint_authority",
      address: wallet,
      account_type: "regular" as const,
      signers: [],
      threshold: null,
      observed_at: VERIFIED_AT,
    };
    return {
      kyi_verified: true,
      token: {
        caip19: `${CAIP2}/token:${mint}`,
        caip2: CAIP2,
        chain_slug: "solana",
        address: mint,
        standard: null,
        decimals: 6,
        verified_at: VERIFIED_AT,
      },
      asset: {
        slug: null,
        name: `Example ${symbol}`,
        symbol,
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
          wallet_address: wallet,
          authority,
          method: {
            type: "signature",
            scheme: "solana_raw",
            message,
            signature,
            signer_public_key: null,
          },
        },
      ],
    };
  };
  const lookup: KyiTokenLookup = {
    kyi_verified: true,
    data: [mintToken(keptMint, "KEPT"), mintToken(handedOverMint, "MOVED")],
  };

  return {
    wallet,
    mints: { kept: keptMint, handedOver: handedOverMint },
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
