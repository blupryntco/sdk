import type {
  KyiAuthority,
  KyiTokenLookupItem,
  KyiVerification,
} from "@bluprynt/sdk-core";
import { numberToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkKyiVerification, verifyKyiResponse } from "./kyi.js";

const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const recipient = "0x000000000000000000000000000000000000b10b";
const txHash = `0x${"ab".repeat(32)}`;
const rpcUrls = { "eip155:1": "https://rpc.test" };

const authority: KyiAuthority = {
  type: "owner",
  address: account.address,
  account_type: "regular",
  signers: [],
  threshold: null,
  observed_at: null,
};

const verification = (
  method: KyiVerification["method"],
  wallet = account.address,
): KyiVerification => ({
  verified_at: "2026-10-01T00:00:00Z",
  expires_at: null,
  wallet_address: wallet,
  authority,
  method,
});

async function signed(message: string) {
  return verification({
    type: "signature",
    scheme: "eip191",
    message,
    signature: await account.signMessage({ message }),
    signer_public_key: null,
  });
}

function mockRpc(
  tx: { from: string; to: string; value: bigint },
  status = "0x1",
) {
  const results: Record<string, unknown> = {
    eth_getTransactionByHash: {
      hash: txHash,
      from: tx.from,
      to: tx.to,
      value: numberToHex(tx.value),
      input: "0x",
      nonce: "0x0",
      gas: "0x5208",
      gasPrice: "0x1",
      blockHash: `0x${"cd".repeat(32)}`,
      blockNumber: "0x1",
      transactionIndex: "0x0",
      type: "0x0",
      v: "0x1b",
      r: "0x1",
      s: "0x1",
    },
    eth_getTransactionReceipt: {
      transactionHash: txHash,
      from: tx.from,
      to: tx.to,
      status,
      logs: [],
      blockHash: `0x${"cd".repeat(32)}`,
      blockNumber: "0x1",
      transactionIndex: "0x0",
      gasUsed: "0x5208",
      cumulativeGasUsed: "0x5208",
      effectiveGasPrice: "0x1",
      logsBloom: `0x${"00".repeat(256)}`,
      contractAddress: null,
      type: "0x0",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { id, method } = JSON.parse(init.body as string);
      return Response.json({ jsonrpc: "2.0", id, result: results[method] });
    }),
  );
}

const amountTransfer = (amount: string): KyiVerification["method"] => ({
  type: "transfer",
  kind: "amount",
  caip2: "eip155:1",
  transaction_hash: txHash,
  sender: account.address,
  recipient,
  asset: "eip155:1/slip44:60",
  amount,
});

afterEach(() => vi.unstubAllGlobals());

describe("checkKyiVerification", () => {
  it("accepts a valid eip191 signature", async () => {
    const result = await checkKyiVerification(
      await signed("bluprynt challenge"),
    );
    expect(result.status).toBe("valid");
  });

  it("assumes eip191 when an EVM wallet's scheme is not recorded", async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.scheme = null;
    expect((await checkKyiVerification(v)).status).toBe("valid");
  });

  it("rejects a signature over a different message", async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.message = "tampered";
    expect((await checkKyiVerification(v)).status).toBe("invalid");
  });

  it("rejects a wallet that does not back the authority", async () => {
    const message = "bluprynt challenge";
    const v = verification(
      {
        type: "signature",
        scheme: "eip191",
        message,
        signature: await other.signMessage({ message }),
        signer_public_key: null,
      },
      other.address,
    );
    expect((await checkKyiVerification(v)).reason).toMatch(
      /wallet is the authority or one of its signers/,
    );
  });

  it("does not vouch for admin_manual", async () => {
    const v = verification({ type: "admin_manual" });
    expect((await checkKyiVerification(v)).status).toBe("unverifiable");
  });

  it("accepts a matching native amount transfer", async () => {
    mockRpc({ from: account.address, to: recipient, value: 1230n });
    const v = verification(amountTransfer("1230"));
    const result = await checkKyiVerification(v, { rpcUrls });
    expect(result.status).toBe("valid");
    expect(result.steps).toContainEqual({
      check: "transferred amount",
      via: "rpc",
      ok: true,
      expected: "1230",
      actual: "1230",
    });
  });

  it("rejects a transfer with the wrong amount", async () => {
    mockRpc({ from: account.address, to: recipient, value: 999n });
    const v = verification(amountTransfer("1230"));
    const result = await checkKyiVerification(v, { rpcUrls });
    expect(result.reason).toBe("transferred amount failed");
    expect(result.steps.at(-1)).toMatchObject({
      expected: "1230",
      actual: "999",
    });
  });

  it("rejects a reverted transfer", async () => {
    mockRpc({ from: account.address, to: recipient, value: 1230n }, "0x0");
    const v = verification(amountTransfer("1230"));
    expect((await checkKyiVerification(v, { rpcUrls })).reason).toBe(
      "transaction succeeded failed",
    );
  });

  it("throws when the chain RPC is not configured", async () => {
    const v = verification(amountTransfer("1230"));
    await expect(checkKyiVerification(v)).rejects.toThrow(/RPC not configured/);
  });
});

describe("verifyKyiResponse", () => {
  const item = (
    claimed: boolean,
    verifications: KyiVerification[],
  ): KyiTokenLookupItem => ({
    kyi_verified: claimed,
    token: {
      caip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjF",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      chain_slug: "solana",
      address: "EPjF",
      standard: null,
      decimals: null,
      verified_at: null,
    },
    asset: {
      slug: null,
      name: null,
      symbol: null,
      description: null,
      website_url: null,
      whitepaper_url: null,
    },
    issuer: null,
    authorities: [authority],
    verifications,
  });

  const verify = (claimed: boolean, verifications: KyiVerification[]) =>
    verifyKyiResponse({
      kyi_verified: claimed,
      data: [item(claimed, verifications)],
    });

  const tampered = async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.message = "x";
    return v;
  };

  it("claimed and proven: verified, matches", async () => {
    const report = await verify(true, [await signed("bluprynt challenge")]);
    expect(report).toMatchObject({
      claimed: true,
      verified: true,
      matchesClaim: true,
    });
    expect(report.tokens[0]?.checks.map((c) => c.status)).toEqual([
      "valid",
      "unverifiable",
    ]);
  });

  it("claimed but only admin_manual: undecided", async () => {
    const report = await verify(true, [verification({ type: "admin_manual" })]);
    expect(report).toMatchObject({ verified: false, matchesClaim: null });
    expect(report.tokens[0]?.evidence).toBe("inconclusive");
  });

  it("claimed but a proof fails: does not match", async () => {
    const report = await verify(true, [
      await signed("bluprynt challenge"),
      await tampered(),
    ]);
    expect(report).toMatchObject({ verified: false, matchesClaim: false });
    expect(report.tokens[0]?.evidence).toBe("contradicted");
  });

  it("not claimed and nothing to check: matches", async () => {
    const report = await verify(false, []);
    expect(report).toMatchObject({
      claimed: false,
      verified: false,
      matchesClaim: true,
    });
  });

  it("not claimed but proofs hold: does not match", async () => {
    const report = await verify(false, [await signed("bluprynt challenge")]);
    expect(report).toMatchObject({ verified: true, matchesClaim: false });
  });
});
