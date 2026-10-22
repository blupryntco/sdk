import { fileURLToPath } from "node:url";
import {
  checkKyiVerification,
  verifyKyiResponse,
} from "@bluprynt/sdk-chain-xrpl";
import { deriveAddress, deriveKeypair, sign, verify } from "ripple-keypairs";
import { convertStringToHex } from "xrpl";

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];
type KyiTokenLookupItem = KyiTokenLookup["data"][number];
type KyiVerification = KyiTokenLookupItem["verifications"][number];

// Public test seeds: anyone can rebuild these keys, so they must never be funded or set on a real account.
const ED25519_SEED = "sEdSKaVGtEer9RrxMSMhFM2WVSW5LT3";
const SECP256K1_SEED = "sp5vYGGekvDhXJSn6f7oPdcjheQXW";

const CAIP2 = "xrpl:0";
const VERIFIED_AT = "2026-10-01T12:00:00.000Z";

function account(seed: string) {
  const keys = deriveKeypair(seed);
  return { ...keys, address: deriveAddress(keys.publicKey) };
}

const challenge = (wallet: string) =>
  [
    "Please, sign this message to verify your Bluprynt KYI credentials",
    "",
    "Purpose: Verify wallet ownership",
    "Issued to: example",
    `Address: ${wallet}::1790000000000::example-nonce`,
  ].join("\n");

function signed(signer: ReturnType<typeof account>, wallet: string) {
  const message = challenge(wallet);
  const signature = sign(convertStringToHex(message), signer.privateKey);
  return { wallet, message, signature, signerPublicKey: signer.publicKey };
}

function independentCheck({
  wallet,
  message,
  signature,
  signerPublicKey,
}: ReturnType<typeof signed>) {
  const derivedAddress = deriveAddress(signerPublicKey);
  return {
    wallet,
    signerPublicKey,
    signatureVerifies: verify(
      convertStringToHex(message),
      signature,
      signerPublicKey,
    ),
    derivedAddress,
    derivedAddressIsWallet: derivedAddress === wallet,
  };
}

function issuerToken(
  currency: string,
  issuer: string,
  proofs: ReturnType<typeof signed>[],
): KyiTokenLookupItem {
  const authority = {
    type: "issuer",
    address: issuer,
    account_type: "regular" as const,
    signers: [],
    threshold: null,
    observed_at: VERIFIED_AT,
  };
  const verifications: KyiVerification[] = proofs.map((p) => ({
    verified_at: VERIFIED_AT,
    expires_at: null,
    wallet_address: p.wallet,
    authority,
    method: {
      type: "signature",
      scheme: "xrpl",
      message: p.message,
      signature: p.signature,
      signer_public_key: p.signerPublicKey,
    },
  }));
  return {
    kyi_verified: true,
    token: {
      caip19: `${CAIP2}/iou:${currency}.${issuer}`,
      caip2: CAIP2,
      chain_slug: "xrpl",
      address: `${currency}.${issuer}`,
      standard: null,
      decimals: null,
      verified_at: VERIFIED_AT,
    },
    asset: {
      slug: null,
      name: `Example ${currency}`,
      symbol: currency,
      description: null,
      website_url: null,
      whitepaper_url: null,
    },
    issuer: null,
    authorities: [authority],
    verifications,
  };
}

export async function run() {
  const ed = account(ED25519_SEED);
  const secp = account(SECP256K1_SEED);

  const edMaster = signed(ed, ed.address);
  const secpMaster = signed(secp, secp.address);
  const edWithRegularKey = signed(secp, ed.address);
  const tampered = {
    ...edMaster,
    message: edMaster.message.replace(
      "Issued to: example",
      "Issued to: someone-else",
    ),
  };

  const lookup: KyiTokenLookup = {
    kyi_verified: true,
    data: [
      issuerToken("USD", ed.address, [edMaster, edWithRegularKey]),
      issuerToken("EUR", secp.address, [secpMaster]),
    ],
  };
  const tamperedItem = issuerToken("USD", ed.address, [tampered]);
  const [tamperedVerification] = tamperedItem.verifications;
  if (!tamperedVerification) throw new Error("no tampered verification");

  return {
    independent: {
      ed25519MasterKey: independentCheck(edMaster),
      secp256k1MasterKey: independentCheck(secpMaster),
      regularKey: independentCheck(edWithRegularKey),
      tamperedMessage: independentCheck(tampered),
    },
    sdk: {
      report: await verifyKyiResponse(lookup),
      tamperedMessage: (
        await checkKyiVerification(tamperedVerification, tamperedItem.token)
      ).proof,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await run(), null, 2));
}
