import { fileURLToPath } from "node:url";
import {
  verifyKyiResponse,
  type XrplKyiCheckOptions,
} from "@bluprynt/sdk-chain-xrpl";
import { deriveAddress, deriveKeypair, sign } from "ripple-keypairs";
import { convertStringToHex } from "xrpl";
import fixture from "./fixtures/xrpl-rotated.json" with { type: "json" };
import { recordedXrplClient } from "./replay.ts";

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];
type KyiVerification = KyiTokenLookup["data"][number]["verifications"][number];

// Public test seeds: the recorded ledgers in fixtures/xrpl-rotated.json are synthetic, and these keys must never be set on a real account.
const MASTER_SEED = "sEdSKaVGtEer9RrxMSMhFM2WVSW5LT3";
const REGULAR_SEED = "sp5vYGGekvDhXJSn6f7oPdcjheQXW";

const CAIP2 = "xrpl:0";
const RPC_URL = "wss://xrpl.rpc.example.invalid";
const SIGNED_WITH_MASTER_AT = "2026-10-20T12:00:00.000Z";
const SIGNED_WITH_REGULAR_AT = "2026-10-20T13:20:00.000Z";

function account(seed: string) {
  const keys = deriveKeypair(seed);
  return { ...keys, address: deriveAddress(keys.publicKey) };
}

export async function run() {
  const master = account(MASTER_SEED);
  const regular = account(REGULAR_SEED);
  const issuer = master.address;

  const authority = {
    type: "issuer",
    address: issuer,
    account_type: "regular" as const,
    signers: [],
    threshold: null,
    observed_at: SIGNED_WITH_MASTER_AT,
  };
  const verification = (
    signer: ReturnType<typeof account>,
    verifiedAt: string,
  ): KyiVerification => {
    const message = [
      "Please, sign this message to verify your Bluprynt KYI credentials",
      "",
      "Purpose: Verify wallet ownership",
      "Issued to: example",
      `Address: ${issuer}::${Date.parse(verifiedAt)}::example-nonce`,
    ].join("\n");
    return {
      verified_at: verifiedAt,
      expires_at: null,
      wallet_address: issuer,
      authority,
      method: {
        type: "signature",
        scheme: "xrpl",
        message,
        signature: sign(convertStringToHex(message), signer.privateKey),
        signer_public_key: signer.publicKey,
      },
    };
  };
  const lookup: KyiTokenLookup = {
    kyi_verified: true,
    data: [
      {
        kyi_verified: true,
        token: {
          caip19: `${CAIP2}/iou:USD.${issuer}`,
          caip2: CAIP2,
          chain_slug: "xrpl",
          address: `USD.${issuer}`,
          standard: null,
          decimals: null,
          verified_at: SIGNED_WITH_MASTER_AT,
        },
        asset: {
          slug: null,
          name: "Example USD",
          symbol: "USD",
          description: null,
          website_url: null,
          whitepaper_url: null,
        },
        issuer: null,
        authorities: [authority],
        verifications: [
          verification(master, SIGNED_WITH_MASTER_AT),
          verification(regular, SIGNED_WITH_REGULAR_AT),
        ],
      },
    ],
  };
  const options: XrplKyiCheckOptions = {
    rpcUrls: { [CAIP2]: RPC_URL },
    at: ["verified", "now"],
    createClient: recordedXrplClient(fixture.records),
  };

  return {
    issuer,
    regularKey: regular.address,
    report: await verifyKyiResponse(lookup, options),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await run(), null, 2));
}
