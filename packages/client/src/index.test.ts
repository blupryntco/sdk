import { describe, expect, it } from "vitest";
import { ApiError, createClient } from "./index.js";

function stub(status: number, body: unknown, contentType = "application/json") {
  const requests: Request[] = [];
  const fetch = async (request: Request) => {
    requests.push(request);
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status, headers: { "content-type": contentType } },
    );
  };
  return { requests, fetch: fetch as typeof globalThis.fetch };
}

const chain = {
  caip2: "eip155:1",
  namespace: "eip155",
  reference: "1",
  slug: "ethereum",
  name: "Ethereum",
  mainnet: true,
};

describe("createClient", () => {
  it("sends the API key verbatim to the default base URL", async () => {
    const { requests, fetch } = stub(200, { data: [chain] });
    const client = createClient({ apiKey: "key_123", fetch });

    expect(await client.listChains()).toEqual({ data: [chain] });
    expect(requests[0]?.url).toBe(
      "https://integrations.bluprynt.com/reference/v1/chains",
    );
    expect(requests[0]?.headers.get("authorization")).toBe("key_123");
  });

  it("passes the lookup query through", async () => {
    const { requests, fetch } = stub(200, { kyi_verified: false, data: [] });
    const client = createClient({
      apiKey: "k",
      baseUrl: "http://api.test",
      fetch,
    });

    await client.lookupTokens({ address: "0xabc", chain_slug: "ethereum" });
    expect(requests[0]?.url).toBe(
      "http://api.test/kyi/v1/tokens?address=0xabc&chain_slug=ethereum",
    );
  });

  it("treats an unindexed token as not verified", async () => {
    const { fetch } = stub(404, { kyi_verified: false, data: [] });
    const client = createClient({ apiKey: "k", fetch });

    expect(await client.lookupTokens({ caip19: "eip155:1/erc20:0x0" })).toEqual(
      {
        kyi_verified: false,
        data: [],
      },
    );
  });

  it("returns undefined for an unknown chain", async () => {
    const { requests, fetch } = stub(404, { statusCode: 404 });
    const client = createClient({ apiKey: "k", fetch });

    expect(await client.getChain("eip155:999999")).toBeUndefined();
    expect(requests[0]?.url).toBe(
      "https://integrations.bluprynt.com/reference/v1/chains/eip155%3A999999",
    );
  });

  it("throws ApiError with the status and body", async () => {
    const body = { statusCode: 401, message: "Invalid API key" };
    const { fetch } = stub(401, body);
    const client = createClient({ apiKey: "bad", fetch });

    const error = await client.listChains().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, body });
  });

  it("rethrows network failures", async () => {
    const failure = new TypeError("fetch failed");
    const fetch = (async () => {
      throw failure;
    }) as typeof globalThis.fetch;
    const client = createClient({ apiKey: "k", fetch });

    await expect(client.listChains()).rejects.toBe(failure);
  });

  it("returns a badge as a Blob", async () => {
    const { requests, fetch } = stub(200, "<svg/>", "image/svg+xml");
    const client = createClient({ apiKey: "k", fetch });

    const badge = await client.getBadge("kyi_verified", { format: "svg" });
    expect(await badge.text()).toBe("<svg/>");
    expect(requests[0]?.url).toBe(
      "https://integrations.bluprynt.com/api/v1/badges/kyi_verified?format=svg",
    );
  });
});
