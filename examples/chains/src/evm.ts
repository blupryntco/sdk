import { fileURLToPath } from "node:url";
import {
  checkKyiVerification,
  verifyKyiResponse,
} from "@bluprynt/sdk-chain-evm";
import { type Hex, isAddressEqual, recoverMessageAddress } from "viem";
import sepolia from "./data/sepolia.json" with { type: "json" };

type KyiTokenLookup = Parameters<typeof verifyKyiResponse>[0];

export async function run() {
  const lookup = sepolia as KyiTokenLookup;
  const item = lookup.data[0];
  const verification = item?.verifications[0];
  const method = verification?.method;
  if (
    !item ||
    !verification ||
    method?.type !== "signature" ||
    !method.message ||
    !method.signature
  ) {
    throw new Error("sepolia.json has no signature verification");
  }
  const wallet = verification.wallet_address;
  const { message } = method;
  const signature = method.signature as Hex;
  const tamperedMessage = message.replace("Issued to: 1173", "Issued to: 1174");

  const recover = async (signed: string) => {
    const recovered = await recoverMessageAddress({
      message: signed,
      signature,
    });
    return {
      recovered,
      recoversToWallet: isAddressEqual(recovered, wallet as Hex),
    };
  };

  return {
    independent: {
      wallet,
      ...(await recover(message)),
      tamperedMessage: await recover(tamperedMessage),
    },
    sdk: {
      report: await verifyKyiResponse(lookup),
      tamperedMessage: (
        await checkKyiVerification(
          { ...verification, method: { ...method, message: tamperedMessage } },
          item.token,
        )
      ).proof,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await run(), null, 2));
}
