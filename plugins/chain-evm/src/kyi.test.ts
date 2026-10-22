import type {
  KyiAuthority,
  KyiToken,
  KyiTokenLookupItem,
  KyiVerification,
} from "@bluprynt/sdk-core";
import { encodeEventTopics, erc20Abi, numberToHex, pad } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkKyiAuthority,
  checkKyiVerification,
  verifyKyiResponse,
  verifyKyiToken,
} from "./kyi.js";

const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const recipient = "0x000000000000000000000000000000000000b10b";
const token = "0x000000000000000000000000000000000000c0de";
const txHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;
const rpcUrls = { "eip155:1": "https://rpc.test" };
const now = { rpcUrls, at: ["now" as const] };

const evmToken: KyiToken = {
  caip19: `eip155:1/erc20:${token}`,
  caip2: "eip155:1",
  chain_slug: "ethereum",
  address: token,
  standard: null,
  decimals: null,
  verified_at: null,
};

const authority: KyiAuthority = {
  type: "owner",
  address: account.address,
  account_type: "regular",
  signers: [],
  threshold: null,
  observed_at: null,
};

const controlledBy: KyiAuthority = { ...authority, type: "controlled_by" };

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

function stubRpc(reply: (method: string, params: unknown[]) => object) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const { id, method, params } = JSON.parse(init.body as string);
    return Response.json({ jsonrpc: "2.0", id, ...reply(method, params) });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const latestBlock = {
  number: "0x10",
  hash: blockHash,
  parentHash: blockHash,
  timestamp: "0x6a000000",
  transactions: [],
};

const latestBlockTime = new Date(0x6a000000 * 1000).toISOString();

function mockRpc(
  tx: { from: string; to: string; value: bigint },
  status = "0x1",
  logs: object[] = [],
  owner: string = account.address,
  block: (params: unknown[]) => object = () => latestBlock,
) {
  const results: Record<string, unknown> = {
    eth_getBlockByNumber: latestBlock,
    eth_call: pad(owner as `0x${string}`),
    eth_getTransactionByHash: {
      hash: txHash,
      from: tx.from,
      to: tx.to,
      value: numberToHex(tx.value),
      input: "0x",
      nonce: "0x0",
      gas: "0x5208",
      gasPrice: "0x1",
      blockHash,
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
      logs,
      blockHash,
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
  return stubRpc((method, params) => ({
    result: method === "eth_getBlockByNumber" ? block(params) : results[method],
  }));
}

const chainStart = Date.parse("2026-10-02T00:00:00Z") / 1000;
const blockTime = (n: number) => chainStart + n * 10;
const blockIso = (n: number) => new Date(blockTime(n) * 1000).toISOString();

const chainBlocks =
  (latest: number) =>
  ([tag]: unknown[]) => {
    const n = tag === "latest" ? latest : Number(tag);
    return {
      ...latestBlock,
      number: numberToHex(n),
      timestamp: numberToHex(blockTime(n)),
    };
  };

const callBlockTags = (fetch: ReturnType<typeof stubRpc>) =>
  fetch.mock.calls
    .map(([, init]) => JSON.parse(init.body as string))
    .filter((c) => c.method === "eth_call")
    .map((c) => c.params[1]);

const transferLog = (value: bigint) => ({
  address: token,
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from: account.address, to: recipient },
  }),
  data: pad(numberToHex(value)),
  blockHash,
  blockNumber: "0x1",
  transactionHash: txHash,
  transactionIndex: "0x0",
  logIndex: "0x0",
  removed: false,
});

const amountTransfer = (
  amount: string,
  asset = "eip155:1/slip44:60",
): KyiVerification["method"] => ({
  type: "transfer",
  kind: "amount",
  caip2: "eip155:1",
  transaction_hash: txHash,
  sender: account.address,
  recipient,
  asset,
  amount,
});

const inHours = (hours: number, offset: string) =>
  `${new Date(Date.now() + hours * 3_600_000).toISOString().slice(0, 19)}${offset}`;

const lookupItem = (
  claimed: boolean,
  verifications: KyiVerification[],
): KyiTokenLookupItem => ({
  kyi_verified: claimed,
  token: evmToken,
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

afterEach(() => vi.unstubAllGlobals());

describe("checkKyiVerification", () => {
  it("accepts a valid eip191 signature offline", async () => {
    const result = await checkKyiVerification(
      await signed("bluprynt challenge"),
      evmToken,
    );
    expect(result.proof?.status).toBe("valid");
    expect(result.at).toEqual({});
  });

  it("assumes eip191 when an EVM wallet's scheme is not recorded", async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.scheme = null;
    expect((await checkKyiVerification(v, evmToken)).proof?.status).toBe(
      "valid",
    );
  });

  it("rejects a signature over a different message", async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.message = "tampered";
    expect((await checkKyiVerification(v, evmToken)).proof?.status).toBe(
      "invalid",
    );
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
    expect((await checkKyiVerification(v, evmToken)).proof?.reason).toMatch(
      /wallet is the authority or one of its signers/,
    );
  });

  it("does not vouch for admin_manual at any moment", async () => {
    mockRpc({ from: account.address, to: recipient, value: 0n });
    const v = verification({ type: "admin_manual" });
    const result = await checkKyiVerification(v, evmToken, now);
    expect(result.proof?.status).toBe("unverifiable");
    expect(result.at.now?.status).toBe("unverifiable");
  });

  it("checks a signature's authority now", async () => {
    mockRpc({ from: account.address, to: recipient, value: 0n });
    const result = await checkKyiVerification(
      await signed("bluprynt challenge"),
      evmToken,
      now,
    );
    expect(result.at.now).toMatchObject({
      status: "valid",
      position: { block: "16", time: latestBlockTime },
    });
    expect(result.at.now?.steps.map((s) => s.check)).toEqual([
      "eip191 signature recovers to wallet",
      "token owner()",
    ]);
  });

  it("is unverifiable now when the authority has no generic check", async () => {
    const v = {
      ...(await signed("bluprynt challenge")),
      authority: controlledBy,
    };
    const result = await checkKyiVerification(v, evmToken, now);
    expect(result.proof?.status).toBe("valid");
    expect(result.at.now?.reason).toBe(
      "no generic EVM check for controlled_by",
    );
  });

  it("leaves a transfer unverifiable offline", async () => {
    const v = verification(amountTransfer("1230"));
    const result = await checkKyiVerification(v, evmToken);
    expect(result.proof).toMatchObject({
      status: "unverifiable",
      reason: "online checks not requested",
    });
  });

  it("accepts a matching native amount transfer now", async () => {
    mockRpc({ from: account.address, to: recipient, value: 1230n });
    const v = verification(amountTransfer("1230"));
    const result = await checkKyiVerification(v, evmToken, now);
    expect(result.at.now?.status).toBe("valid");
    expect(result.at.now?.position).toEqual({
      block: "16",
      time: latestBlockTime,
    });
    expect(result.at.now?.steps).toContainEqual({
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
    const result = await checkKyiVerification(v, evmToken, now);
    expect(result.at.now?.reason).toBe("transferred amount failed");
    expect(
      result.at.now?.steps.find((s) => s.check === "transferred amount"),
    ).toMatchObject({ expected: "1230", actual: "999" });
  });

  it("rejects a reverted transfer", async () => {
    mockRpc({ from: account.address, to: recipient, value: 1230n }, "0x0");
    const v = verification(amountTransfer("1230"));
    expect((await checkKyiVerification(v, evmToken, now)).at.now?.reason).toBe(
      "transaction succeeded failed",
    );
  });

  it("throws when the chain RPC is not configured", async () => {
    const v = verification(amountTransfer("1230"));
    await expect(
      checkKyiVerification(v, evmToken, { at: ["now"] }),
    ).rejects.toThrow(/RPC not configured/);
  });

  it("accepts a matching ERC-20 transfer with a non-canonical amount", async () => {
    mockRpc({ from: account.address, to: token, value: 0n }, "0x1", [
      transferLog(1230n),
    ]);
    const v = verification(amountTransfer("01230", `eip155:1/erc20:${token}`));
    expect((await checkKyiVerification(v, evmToken, now)).at.now?.status).toBe(
      "valid",
    );
  });

  it("rejects a transfer whose asset is on another chain", async () => {
    mockRpc({ from: account.address, to: recipient, value: 1230n });
    const v = verification(amountTransfer("1230", "eip155:137/slip44:60"));
    expect((await checkKyiVerification(v, evmToken, now)).at.now?.reason).toBe(
      "asset is on the transaction's chain failed",
    );
  });
});

describe("point-in-time reads", () => {
  const moment = new Date((blockTime(42) + 5) * 1000);
  const label = moment.toISOString();
  const atMoment = { rpcUrls, at: [moment] };
  const chain = () =>
    mockRpc(
      { from: account.address, to: recipient, value: 1230n },
      "0x1",
      [],
      account.address,
      chainBlocks(100),
    );

  it("resolves a date to the last block at or before it", async () => {
    chain();
    const result = await checkKyiAuthority(authority, evmToken, atMoment);
    expect(result.at[label]).toMatchObject({
      status: "valid",
      position: { block: "42", time: blockIso(42) },
    });
  });

  it("reads owner() at the resolved block", async () => {
    const fetch = chain();
    await checkKyiAuthority(authority, evmToken, atMoment);
    expect(callBlockTags(fetch)).toEqual(["0x2a"]);
  });

  it("reports the moment's block for a transfer, not the transaction's", async () => {
    chain();
    const result = await checkKyiVerification(
      verification(amountTransfer("1230")),
      evmToken,
      atMoment,
    );
    expect(result.at[label]).toMatchObject({
      status: "valid",
      position: { block: "42", time: blockIso(42) },
    });
  });

  it("is unverifiable when a transfer's block is after the moment", async () => {
    chain();
    const early = new Date((blockTime(0) + 5) * 1000);
    const v = {
      ...verification(amountTransfer("1230")),
      verified_at: new Date(blockTime(0) * 1000).toISOString(),
    };
    const result = await checkKyiVerification(v, evmToken, {
      rpcUrls,
      at: [early],
    });
    expect(result.at[early.toISOString()]).toMatchObject({
      status: "unverifiable",
      reason: "record postdates this moment",
      position: { block: "0", time: blockIso(0) },
    });
  });

  it('uses the contract signature\'s own block for "verified"', async () => {
    const fetch = stubRpc((method, params) => {
      if (method === "eth_getBlockByNumber")
        return { result: chainBlocks(100)(params) };
      const data = (params[0] as { data: string }).data;
      return {
        result: data.startsWith("0x8da5cb5b") ? pad(account.address) : "0x01",
      };
    });
    const v = verification({
      type: "contract_signature",
      scheme: "eip1271",
      inner_scheme: "eip191",
      message: "hello",
      signature: "0x1234",
      caip2: "eip155:1",
      block_number: 7,
    });
    v.verified_at = label;
    const result = await checkKyiVerification(v, evmToken, {
      rpcUrls,
      at: ["verified"],
    });
    expect(result.at.verified).toMatchObject({
      status: "valid",
      position: { block: "7", time: blockIso(7) },
    });
    expect(callBlockTags(fetch)).toContain("0x7");
    expect(callBlockTags(fetch)).toContain("0x2a");
  });

  it("reads a contract signature at the moment's block, not its own, now", async () => {
    const fetch = stubRpc((method, params) => {
      if (method === "eth_getBlockByNumber")
        return { result: chainBlocks(100)(params) };
      const data = (params[0] as { data: string }).data;
      return {
        result: data.startsWith("0x8da5cb5b") ? pad(account.address) : "0x01",
      };
    });
    const v = verification({
      type: "contract_signature",
      scheme: "eip1271",
      inner_scheme: "eip191",
      message: "hello",
      signature: "0x1234",
      caip2: "eip155:1",
      block_number: 7,
    });
    const result = await checkKyiVerification(v, evmToken, now);
    expect(result.at.now?.position).toEqual({
      block: "100",
      time: blockIso(100),
    });
    expect(new Set(callBlockTags(fetch))).toEqual(new Set(["0x64"]));
  });

  it("resolves each moment's block once per token", async () => {
    const fetch = chain();
    const report = await verifyKyiToken(
      lookupItem(true, [
        await signed("first challenge"),
        await signed("second challenge"),
      ]),
      atMoment,
    );
    expect(report.checks.map((c) => c.at[label]?.position?.block)).toEqual([
      "42",
      "42",
      "42",
    ]);
    const tags = fetch.mock.calls
      .map(([, init]) => JSON.parse(init.body as string))
      .filter((c) => c.method === "eth_getBlockByNumber")
      .map((c) => c.params[0]);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("resolves a date after the latest block to the latest block", async () => {
    chain();
    const later = new Date((blockTime(100) + 1000) * 1000);
    const result = await checkKyiAuthority(authority, evmToken, {
      rpcUrls,
      at: [later],
    });
    expect(result.at[later.toISOString()]?.position?.block).toBe("100");
  });

  it("resolves an exact timestamp to that block", async () => {
    chain();
    const exact = new Date(blockTime(42) * 1000);
    const result = await checkKyiAuthority(authority, evmToken, {
      rpcUrls,
      at: [exact],
    });
    expect(result.at[exact.toISOString()]?.position?.block).toBe("42");
  });

  it("is unverifiable for a date before the first block", async () => {
    chain();
    const early = new Date((blockTime(0) - 5) * 1000);
    const result = await checkKyiAuthority(authority, evmToken, {
      rpcUrls,
      at: [early],
    });
    expect(result.at[early.toISOString()]).toMatchObject({
      status: "unverifiable",
      reason: "chain has no block at or before this moment",
    });
  });

  it("is unverifiable when a contract signature's block is after the moment", async () => {
    chain();
    const v = verification({
      type: "contract_signature",
      scheme: "eip1271",
      inner_scheme: "eip191",
      message: "hello",
      signature: "0x1234",
      caip2: "eip155:1",
      block_number: 50,
    });
    v.verified_at = new Date(blockTime(0) * 1000).toISOString();
    const result = await checkKyiVerification(v, evmToken, atMoment);
    expect(result.at[label]).toMatchObject({
      status: "unverifiable",
      reason: "record postdates this moment",
    });
  });

  it("reports missing historical state as unverifiable", async () => {
    stubRpc((method, params) =>
      method === "eth_getBlockByNumber"
        ? { result: chainBlocks(123)(params) }
        : { error: { code: -32000, message: "missing trie node abc (path )" } },
    );
    const result = await checkKyiAuthority(authority, evmToken, atMoment);
    expect(result.at[label]).toMatchObject({
      status: "unverifiable",
      reason: "RPC has no state for block 42",
    });
  });

  it('throws on missing state at "now"', async () => {
    stubRpc((method, params) =>
      method === "eth_getBlockByNumber"
        ? { result: chainBlocks(123)(params) }
        : { error: { code: -32000, message: "header not found" } },
    );
    await expect(checkKyiAuthority(authority, evmToken, now)).rejects.toThrow();
  });

  it("still throws on other RPC errors", async () => {
    stubRpc((method, params) =>
      method === "eth_getBlockByNumber"
        ? { result: chainBlocks(123)(params) }
        : { error: { code: -32000, message: "something else broke" } },
    );
    await expect(checkKyiAuthority(authority, evmToken, now)).rejects.toThrow();
  });
});

describe("verifyKyiToken", () => {
  const firstCheck = async (v: KyiVerification) => {
    mockRpc({ from: account.address, to: recipient, value: 0n });
    return (await verifyKyiToken(lookupItem(true, [v]), now)).checks[0];
  };

  it("makes no RPC call by default", async () => {
    const fetch = mockRpc({
      from: account.address,
      to: recipient,
      value: 1230n,
    });
    const report = await verifyKyiToken(
      lookupItem(true, [
        verification(amountTransfer("1230")),
        await signed("bluprynt challenge"),
      ]),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(report.checks.map((c) => c.at)).toEqual([{}, {}, {}]);
    expect(report.evidence).toBe("confirmed");
  });

  it("treats an expired proof as unverifiable, not invalid", async () => {
    const v = await signed("bluprynt challenge");
    v.expires_at = inHours(2, "+05:00");
    const result = await firstCheck(v);
    expect(result?.proof?.status).toBe("valid");
    expect(result?.at.now).toMatchObject({ status: "unverifiable" });
    expect(result?.at.now?.reason).toMatch(/expired/);
  });

  it("accepts a proof that has not expired yet", async () => {
    const v = await signed("bluprynt challenge");
    v.expires_at = inHours(-2, "-05:00");
    expect((await firstCheck(v))?.at.now?.status).toBe("valid");
  });

  it("matches the verification's authority to the listed one regardless of address case", async () => {
    const item = lookupItem(true, [await signed("bluprynt challenge")]);
    item.authorities = [
      { ...authority, address: authority.address.toLowerCase() },
    ];
    const report = await verifyKyiToken(item);
    expect(report.checks[0]?.proof?.status).toBe("valid");
  });

  it("still rejects a tampered proof once expired", async () => {
    const v = await signed("bluprynt challenge");
    if (v.method.type === "signature") v.method.message = "tampered";
    v.expires_at = inHours(-1, "Z");
    expect((await firstCheck(v))?.at.now?.status).toBe("invalid");
  });
});

describe("checkKyiAuthority", () => {
  const check = () => checkKyiAuthority(authority, evmToken, now);

  it("confirms the token owner now", async () => {
    mockRpc({ from: account.address, to: recipient, value: 0n });
    expect((await check()).at.now).toMatchObject({
      status: "valid",
      position: { block: "16", time: latestBlockTime },
    });
  });

  it("rejects a different token owner", async () => {
    mockRpc(
      { from: account.address, to: recipient, value: 0n },
      "0x1",
      [],
      other.address,
    );
    expect((await check()).at.now?.reason).toBe("token owner() failed");
  });

  it("rejects an owner() call that reverts", async () => {
    stubRpc((method) =>
      method === "eth_getBlockByNumber"
        ? { result: latestBlock }
        : { error: { code: 3, message: "execution reverted", data: "0x" } },
    );
    expect((await check()).at.now?.reason).toBe("on-chain lookup failed");
  });

  it("rejects a token with no owner()", async () => {
    stubRpc((method) => ({
      result: method === "eth_getBlockByNumber" ? latestBlock : "0x",
    }));
    expect((await check()).at.now?.reason).toBe("on-chain lookup failed");
  });

  it("throws on transport errors instead of disproving the claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(check()).rejects.toThrow();
  });
});

describe("verifyKyiResponse", () => {
  const verify = (claimed: boolean, verifications: KyiVerification[]) =>
    verifyKyiResponse({
      kyi_verified: claimed,
      data: [lookupItem(claimed, verifications)],
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
      evidence: "confirmed",
      verified: true,
      matchesClaim: true,
      at: {},
    });
    expect(report.tokens[0]?.checks[0]?.proof?.status).toBe("valid");
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

  it("claimed with one valid and one expired proof: verified now", async () => {
    mockRpc({ from: account.address, to: recipient, value: 0n });
    const expired = await signed("old challenge");
    expired.expires_at = inHours(-1, "Z");
    const report = await verifyKyiResponse(
      {
        kyi_verified: true,
        data: [lookupItem(true, [await signed("bluprynt challenge"), expired])],
      },
      now,
    );
    expect(report.at.now).toMatchObject({
      verified: true,
      matchesClaim: true,
    });
    expect(report.tokens[0]?.at.now?.evidence).toBe("confirmed");
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
