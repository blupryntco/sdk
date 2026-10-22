import { fileURLToPath } from "node:url";
import {
  checkKyiVerification,
  verifyKyiResponse,
} from "@bluprynt/sdk-chain-solana";
import {
  type Address,
  createKeyPairFromPrivateKeyBytes,
  fixCodecSize,
  getAddressFromPublicKey,
  getBase16Decoder,
  getBase58Decoder,
  getBase58Encoder,
  getBytesCodec,
  getPublicKeyFromAddress,
  getTupleCodec,
  getU8Codec,
  getU16Codec,
  getUtf8Codec,
  type ReadonlyUint8Array,
  type SignatureBytes,
  signBytes,
  verifySignature,
} from "@solana/kit";

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];
type KyiVerification = Parameters<typeof checkKyiVerification>[0];
type KyiSignatureScheme = "solana_raw" | "solana_offchain_v0" | null;

// Public test keys: anyone can rebuild them from these bytes, so they must never hold funds or authority on-chain.
const WALLET_SECRET = new Uint8Array(32).fill(1);
const MINT_SECRET = new Uint8Array(32).fill(2);

const CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const VERIFIED_AT = "2026-10-01T12:00:00.000Z";

const utf8 = getUtf8Codec();
const legacyOffchain = getTupleCodec([
  fixCodecSize(getBytesCodec(), 16),
  getU8Codec(),
  getU8Codec(),
  getU16Codec(),
  getBytesCodec(),
]);
const signingDomain = Uint8Array.from([
  0xff,
  ...utf8.encode("solana offchain"),
]);

function legacyOffchainMessage(message: string): ReadonlyUint8Array {
  const body = utf8.encode(message);
  return legacyOffchain.encode([signingDomain, 0, 0, body.length, body]);
}

async function verifiesFor(
  wallet: Address,
  signature: string,
  bytes: ReadonlyUint8Array,
) {
  return verifySignature(
    await getPublicKeyFromAddress(wallet),
    getBase58Encoder().encode(signature) as SignatureBytes,
    bytes,
  );
}

export async function run() {
  const keys = await createKeyPairFromPrivateKeyBytes(WALLET_SECRET);
  const wallet = await getAddressFromPublicKey(keys.publicKey);
  const mint = await getAddressFromPublicKey(
    (await createKeyPairFromPrivateKeyBytes(MINT_SECRET)).publicKey,
  );

  const walletMessage = [
    "Please, sign this message to verify your Bluprynt KYI credentials",
    "",
    "Purpose: Verify wallet ownership",
    "Issued to: example",
    `Address: ${wallet}::1790000000000::example-nonce`,
  ].join("\n");
  const cliMessage = `Bluprynt wallet verification || Issued to: example || Address: ${wallet}::1790000000000::example-nonce`;
  const offchainBytes = legacyOffchainMessage(cliMessage);
  const base58 = getBase58Decoder();
  const rawSignature = base58.decode(
    await signBytes(keys.privateKey, utf8.encode(walletMessage)),
  );
  const offchainSignature = base58.decode(
    await signBytes(keys.privateKey, offchainBytes),
  );
  const formats = async (signature: string, message: string) => ({
    overRawMessage: await verifiesFor(wallet, signature, utf8.encode(message)),
    overOffchainMessage: await verifiesFor(
      wallet,
      signature,
      legacyOffchainMessage(message),
    ),
  });

  const token = {
    caip19: `${CAIP2}/token:${mint}`,
    caip2: CAIP2,
    chain_slug: "solana",
    address: mint,
    standard: null,
    decimals: null,
    verified_at: VERIFIED_AT,
  };
  const authority = {
    type: "mint_authority",
    address: wallet,
    account_type: "regular" as const,
    signers: [],
    threshold: null,
    observed_at: VERIFIED_AT,
  };
  const verification = (
    scheme: KyiSignatureScheme,
    message: string,
    signature: string,
  ): KyiVerification => ({
    verified_at: VERIFIED_AT,
    expires_at: null,
    wallet_address: wallet,
    authority,
    method: {
      type: "signature",
      scheme,
      message,
      signature,
      signer_public_key: null,
    },
  });
  const lookup: KyiTokenLookup = {
    kyi_verified: true,
    data: [
      {
        kyi_verified: true,
        token,
        asset: {
          slug: null,
          name: "Example Token",
          symbol: "EXMPL",
          description: null,
          website_url: null,
          whitepaper_url: null,
        },
        issuer: null,
        authorities: [authority],
        verifications: [
          verification("solana_raw", walletMessage, rawSignature),
          verification("solana_offchain_v0", cliMessage, offchainSignature),
        ],
      },
    ],
  };
  const proof = async (
    scheme: KyiSignatureScheme,
    message: string,
    signature: string,
  ) =>
    (
      await checkKyiVerification(
        verification(scheme, message, signature),
        token,
      )
    ).proof;

  return {
    wallet,
    mint,
    messages: { wallet: walletMessage, cli: cliMessage },
    legacyOffchainHeader: getBase16Decoder().decode(offchainBytes.slice(0, 20)),
    signatures: { raw: rawSignature, offchain: offchainSignature },
    independent: {
      rawSignature: await formats(rawSignature, walletMessage),
      offchainSignature: await formats(offchainSignature, cliMessage),
    },
    sdk: {
      report: await verifyKyiResponse(lookup),
      rawSignatureRecordedAsOffchain: await proof(
        "solana_offchain_v0",
        walletMessage,
        rawSignature,
      ),
      offchainSignatureRecordedAsRaw: await proof(
        "solana_raw",
        cliMessage,
        offchainSignature,
      ),
      offchainSignatureWithoutScheme: await proof(
        null,
        cliMessage,
        offchainSignature,
      ),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await run(), null, 2));
}
