import { describe, expect, it, vi } from "vitest";
import type {
  CheckResult,
  CheckStep,
  KyiAuthority,
  KyiToken,
  KyiTokenLookupItem,
  KyiVerification,
} from "./index.js";
import {
  CheckTrail,
  checkWalletBacksAuthority,
  type KyiChainChecker,
  type KyiInstant,
  kyiChainFunctions,
  kyiMethodLabel,
  kyiRpcUrl,
  verifyKyiResponse,
  verifyKyiToken,
} from "./kyi-verify.js";

const authority: KyiAuthority = {
  type: "owner",
  address: "owner-1",
  account_type: "regular",
  signers: [],
  threshold: null,
  observed_at: null,
};

const verification = (expires_at: string | null = null): KyiVerification => ({
  verified_at: "2026-10-01T00:00:00Z",
  expires_at,
  wallet_address: "owner-1",
  authority,
  method: { type: "admin_manual" },
});

const item = (
  verifications: KyiVerification[],
  caip2 = "test:1",
  authorities: KyiAuthority[] = [authority],
): KyiTokenLookupItem => ({
  kyi_verified: true,
  token: {
    caip19: `${caip2}/token:abc`,
    caip2,
    chain_slug: null,
    address: "abc",
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
  authorities,
  verifications,
});

type Status = CheckResult["status"];

const step = (check: string, ok: boolean): CheckStep => ({
  check,
  via: "rpc",
  ok,
});

const result = (status: Status, check: string): CheckResult => ({
  status,
  reason: status === "valid" ? undefined : `${check} ${status}`,
  steps: [step(check, status !== "invalid")],
});

const fakeChecker = (
  {
    proof = "valid",
    verificationAt = "valid",
    authorityAt = "valid",
  }: { proof?: Status; verificationAt?: Status; authorityAt?: Status } = {},
  namespace = "test",
) => {
  const checkProof = vi.fn(async () => result(proof, "proof"));
  const checkVerificationAt = vi.fn(
    async (
      _v: KyiVerification,
      _t: KyiToken,
      at: KyiInstant,
    ): Promise<CheckResult> => ({
      ...result(verificationAt, "verification state"),
      position: { block: "7", time: at.label },
    }),
  );
  const checkAuthorityAt = vi.fn(async () =>
    result(authorityAt, "authority state"),
  );
  const checker: KyiChainChecker = {
    namespace,
    checkProof,
    checkVerificationAt,
    checkAuthorityAt,
  };
  return { checker, checkProof, checkVerificationAt, checkAuthorityAt };
};

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

describe("verifyKyiResponse", () => {
  it("routes tokens to the checker for their namespace", async () => {
    const { checker, checkProof } = fakeChecker();
    const lookup = item([verification()]);
    const report = await verifyKyiResponse(
      { kyi_verified: true, data: [lookup] },
      { chains: [checker] },
    );
    expect(checkProof).toHaveBeenCalledTimes(1);
    expect(checkProof).toHaveBeenCalledWith(
      lookup.verifications[0],
      lookup.token,
    );
    expect(report.verified).toBe(true);
  });

  it("routes each token in a mixed response to its own checker", async () => {
    const solana = fakeChecker({}, "solana");
    const xrpl = fakeChecker({}, "xrpl");
    const solanaItem = item([verification()], "solana:1");
    const xrplItem = item([verification()], "xrpl:0");
    const report = await verifyKyiResponse(
      { kyi_verified: true, data: [solanaItem, xrplItem] },
      { chains: [solana.checker, xrpl.checker], at: ["now"] },
    );
    expect(solana.checkProof).toHaveBeenCalledWith(
      solanaItem.verifications[0],
      solanaItem.token,
    );
    expect(solana.checkVerificationAt).toHaveBeenCalledWith(
      solanaItem.verifications[0],
      solanaItem.token,
      { label: "now", time: "now" },
      expect.anything(),
    );
    expect(xrpl.checkProof).toHaveBeenCalledWith(
      xrplItem.verifications[0],
      xrplItem.token,
    );
    expect(xrpl.checkVerificationAt).toHaveBeenCalledTimes(1);
    expect(report.tokens.map((t) => t.caip19)).toEqual([
      solanaItem.token.caip19,
      xrplItem.token.caip19,
    ]);
  });

  it("summarises the response offline and per moment", async () => {
    const { checker } = fakeChecker({ authorityAt: "invalid" });
    const report = await verifyKyiResponse(
      { kyi_verified: true, data: [item([verification()])] },
      { chains: [checker], at: ["now"] },
    );
    expect(report).toMatchObject({
      claimed: true,
      evidence: "confirmed",
      verified: true,
      matchesClaim: true,
      at: {
        now: { evidence: "contradicted", verified: false, matchesClaim: false },
      },
    });
  });

  it("response-level matchesClaim follows response-level evidence", async () => {
    const contradicted = fakeChecker({ proof: "invalid" }, "solana");
    const inconclusive = fakeChecker({ proof: "unverifiable" }, "xrpl");
    const report = await verifyKyiResponse(
      {
        kyi_verified: true,
        data: [
          item([verification()], "solana:1"),
          item([verification()], "xrpl:0"),
        ],
      },
      { chains: [contradicted.checker, inconclusive.checker] },
    );
    expect(report).toMatchObject({
      evidence: "contradicted",
      verified: false,
      matchesClaim: false,
    });
  });
});

describe("verifyKyiToken", () => {
  it("throws when no checker handles a token's namespace", async () => {
    const { checker } = fakeChecker();
    await expect(
      verifyKyiToken(item([verification()], "other:1"), { chains: [checker] }),
    ).rejects.toThrow("No KYI checker for namespace other");
  });

  it("is offline by default", async () => {
    const { checker, checkVerificationAt, checkAuthorityAt } = fakeChecker();
    const report = await verifyKyiToken(item([verification()]), {
      chains: [checker],
    });
    expect(checkVerificationAt).not.toHaveBeenCalled();
    expect(checkAuthorityAt).not.toHaveBeenCalled();
    expect(report.checks[0]).toMatchObject({
      kind: "verification",
      subject: "owner-1",
      method: "admin_manual",
      proof: { status: "valid" },
      at: {},
    });
    expect(report.checks[1]).toEqual({
      kind: "authority",
      subject: "owner-1",
      method: "owner",
      at: {},
    });
    expect(report).toMatchObject({
      evidence: "confirmed",
      verified: true,
      matchesClaim: true,
      at: {},
    });
  });

  it("reports each requested moment under its label", async () => {
    const { checker, checkVerificationAt } = fakeChecker();
    const report = await verifyKyiToken(item([verification()]), {
      chains: [checker],
      at: ["verified", "now", new Date("2030-01-01T00:00:00Z")],
    });
    const labels = ["verified", "now", "2030-01-01T00:00:00.000Z"];
    expect(Object.keys(report.checks[0]?.at ?? {})).toEqual(labels);
    expect(Object.keys(report.at)).toEqual(labels);
    expect(checkVerificationAt.mock.calls.map((c) => c[2])).toEqual([
      { label: "verified", time: new Date("2026-10-01T00:00:00Z") },
      { label: "now", time: "now" },
      {
        label: "2030-01-01T00:00:00.000Z",
        time: new Date("2030-01-01T00:00:00Z"),
      },
    ]);
    expect(report.checks[0]?.at.now).toMatchObject({
      status: "valid",
      position: { block: "7", time: "now" },
    });
  });

  it("marks records that postdate a moment", async () => {
    const { checker, checkVerificationAt, checkAuthorityAt } = fakeChecker();
    const observed = { ...authority, observed_at: "2026-10-05T00:00:00Z" };
    const report = await verifyKyiToken(
      item([verification()], "test:1", [observed]),
      { chains: [checker], at: [new Date("2026-09-01T00:00:00Z")] },
    );
    const label = "2026-09-01T00:00:00.000Z";
    for (const check of report.checks) {
      expect(check.at[label]).toEqual({
        status: "unverifiable",
        reason: "record postdates this moment",
        steps: [],
      });
    }
    expect(checkVerificationAt).not.toHaveBeenCalled();
    expect(checkAuthorityAt).not.toHaveBeenCalled();
  });

  it("has no recorded moment for an authority without observed_at", async () => {
    const { checker, checkAuthorityAt } = fakeChecker();
    const report = await verifyKyiToken(
      item([verification()], "test:1", [authority]),
      { chains: [checker], at: ["verified"] },
    );
    expect(report.checks[1]?.at.verified).toEqual({
      status: "unverifiable",
      reason: "no recorded moment",
      steps: [],
    });
    expect(checkAuthorityAt).toHaveBeenCalledTimes(1);
  });

  it("checks a listed authority at its own observed_at", async () => {
    const { checker, checkAuthorityAt } = fakeChecker();
    const observed = { ...authority, observed_at: "2026-10-05T00:00:00Z" };
    await verifyKyiToken(item([], "test:1", [observed]), {
      chains: [checker],
      at: ["verified"],
    });
    expect(checkAuthorityAt).toHaveBeenCalledWith(
      observed,
      expect.anything(),
      { label: "verified", time: new Date("2026-10-05T00:00:00Z") },
      expect.anything(),
    );
  });

  it("merges the verification's authority state into each moment", async () => {
    const { checker, checkAuthorityAt } = fakeChecker({
      authorityAt: "invalid",
    });
    const v = { ...verification(), authority: { ...authority } };
    const report = await verifyKyiToken(item([v]), {
      chains: [checker],
      at: ["now"],
    });
    expect(checkAuthorityAt).toHaveBeenCalledWith(
      v.authority,
      expect.anything(),
      { label: "now", time: "now" },
      expect.anything(),
    );
    const now = report.checks[0]?.at.now;
    expect(report.checks[0]?.proof?.status).toBe("valid");
    expect(now?.status).toBe("invalid");
    expect(now?.reason).toBe("authority state invalid");
    expect(now?.steps.map((s) => s.check)).toEqual([
      "verification state",
      "authority state",
    ]);
    expect(now?.position).toEqual({ block: "7", time: "now" });
  });

  it("applies expiry per moment", async () => {
    const { checker } = fakeChecker();
    const report = await verifyKyiToken(
      item([verification("2027-01-01T00:00:00Z")]),
      {
        chains: [checker],
        at: [
          new Date("2026-12-01T00:00:00Z"),
          new Date("2027-02-01T00:00:00Z"),
        ],
      },
    );
    const check = report.checks[0];
    expect(check?.proof?.status).toBe("valid");
    expect(check?.at["2026-12-01T00:00:00.000Z"]?.status).toBe("valid");
    expect(check?.at["2027-02-01T00:00:00.000Z"]).toMatchObject({
      status: "unverifiable",
      reason: "verification expired at 2027-01-01T00:00:00Z",
    });
  });

  it("applies expiry now against the current time", async () => {
    const { checker } = fakeChecker();
    const report = await verifyKyiToken(item([verification(hoursAgo(1))]), {
      chains: [checker],
      at: ["now"],
    });
    expect(report.checks[0]?.proof?.status).toBe("valid");
    expect(report.checks[0]?.at.now?.reason).toMatch(/expired/);
    expect(report.evidence).toBe("confirmed");
    expect(report.at.now?.evidence).toBe("inconclusive");
  });

  it("combines proof and moment", async () => {
    const failing = fakeChecker({ proof: "invalid" });
    const invalid = await verifyKyiToken(item([verification()]), {
      chains: [failing.checker],
      at: ["verified", "now"],
    });
    for (const label of ["verified", "now"]) {
      expect(invalid.checks[0]?.at[label]).toMatchObject({
        status: "invalid",
        reason: "proof invalid",
      });
    }
    const deferred = fakeChecker({ proof: "unverifiable" });
    const completed = await verifyKyiToken(item([verification()]), {
      chains: [deferred.checker],
      at: ["now"],
    });
    expect(completed.checks[0]?.proof?.status).toBe("unverifiable");
    expect(completed.checks[0]?.at.now?.status).toBe("valid");
    expect(completed.evidence).toBe("inconclusive");
    expect(completed.at.now?.evidence).toBe("confirmed");
  });

  it("summarises per moment", async () => {
    const { checker } = fakeChecker();
    const listed = { ...checker };
    listed.checkAuthorityAt = async (a) =>
      result(a === authority ? "invalid" : "valid", "authority state");
    const report = await verifyKyiToken(
      item([{ ...verification(), authority: { ...authority } }]),
      { chains: [listed], at: ["now"] },
    );
    expect(report.checks[0]?.at.now?.status).toBe("valid");
    expect(report.checks[1]?.at.now?.status).toBe("invalid");
    expect(report.evidence).toBe("confirmed");
    expect(report.at.now).toEqual({
      evidence: "contradicted",
      verified: false,
      matchesClaim: false,
    });
  });

  it("throws on a malformed expires_at", async () => {
    const { checker } = fakeChecker();
    await expect(
      verifyKyiToken(item([verification("not a date")]), { chains: [checker] }),
    ).rejects.toThrow("Malformed expires_at: not a date");
  });

  it("keeps an expired invalid verification invalid", async () => {
    const { checker } = fakeChecker({ verificationAt: "invalid" });
    const report = await verifyKyiToken(item([verification(hoursAgo(1))]), {
      chains: [checker],
      at: ["now"],
    });
    expect(report.checks[0]?.at.now?.status).toBe("invalid");
  });

  it("rejects a verification whose authority is not listed for the token", async () => {
    const { checker } = fakeChecker();
    const listed: KyiAuthority = { ...authority, address: "owner-2" };
    const report = await verifyKyiToken(
      item([verification()], "test:1", [listed]),
      { chains: [checker], at: ["now"] },
    );
    const check = report.checks[0];
    expect(check?.proof?.status).toBe("invalid");
    expect(check?.proof?.reason).toBe(
      "verification's authority is listed for the token failed",
    );
    expect(check?.proof?.steps.at(-1)).toMatchObject({
      check: "verification's authority is listed for the token",
      via: "offline",
      ok: false,
      expected: [{ type: "owner", address: "owner-2" }],
      actual: { type: "owner", address: "owner-1" },
    });
    expect(check?.at.now?.status).toBe("invalid");
    expect(report.evidence).toBe("contradicted");
  });

  it("rejects an unlisted authority even when the proof is expired", async () => {
    const { checker } = fakeChecker();
    const report = await verifyKyiToken(
      item([verification(hoursAgo(1))], "test:1", []),
      { chains: [checker], at: ["now"] },
    );
    expect(report.checks[0]?.at.now?.status).toBe("invalid");
  });

  it("rejects a listed address with a different authority type", async () => {
    const { checker } = fakeChecker();
    const listed: KyiAuthority = { ...authority, type: "mint_authority" };
    const report = await verifyKyiToken(
      item([verification()], "test:1", [listed]),
      { chains: [checker] },
    );
    expect(report.checks[0]?.proof?.status).toBe("invalid");
  });

  it("accepts a verification whose authority is listed", async () => {
    const { checker } = fakeChecker();
    const report = await verifyKyiToken(item([verification()]), {
      chains: [checker],
    });
    const proof = report.checks[0]?.proof;
    expect(proof?.status).toBe("valid");
    expect(proof?.reason).toBeUndefined();
    expect(proof?.steps.at(-1)).toMatchObject({
      check: "verification's authority is listed for the token",
      ok: true,
    });
  });

  it("uses the checker's address comparator for the authority binding", async () => {
    const { checker } = fakeChecker();
    const listed: KyiAuthority = { ...authority, address: "OWNER-1" };
    const exact = await verifyKyiToken(
      item([verification()], "test:1", [listed]),
      { chains: [checker] },
    );
    expect(exact.checks[0]?.proof?.status).toBe("invalid");
    const insensitive = await verifyKyiToken(
      item([verification()], "test:1", [listed]),
      {
        chains: [
          {
            ...checker,
            sameAddress: (a, b) => a.toLowerCase() === b.toLowerCase(),
          },
        ],
      },
    );
    expect(insensitive.checks[0]?.proof?.status).toBe("valid");
  });

  it("runs every check of a token inside the checker's session", async () => {
    const { checker, checkVerificationAt } = fakeChecker();
    const scoped = { rpcUrls: { "test:1": "scoped" } };
    const order: string[] = [];
    const session: NonNullable<KyiChainChecker["session"]> = async (
      options,
      run,
    ) => {
      order.push("open");
      try {
        return await run({ ...options, ...scoped });
      } finally {
        order.push("close");
      }
    };
    const report = await verifyKyiToken(item([verification()]), {
      chains: [{ ...checker, session }],
      at: ["now"],
    });
    expect(order).toEqual(["open", "close"]);
    expect(checkVerificationAt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining(scoped),
    );
    expect(report.checks).toHaveLength(2);
  });

  it("one valid and one expired verification confirm the token", async () => {
    const { checker } = fakeChecker();
    const report = await verifyKyiToken(
      item([verification(), verification(hoursAgo(1))]),
      { chains: [checker], at: ["now"] },
    );
    expect(report.at.now?.evidence).toBe("confirmed");
    expect(report.at.now?.matchesClaim).toBe(true);
  });
});

describe("kyiMethodLabel", () => {
  it("labels each verification method", () => {
    expect(
      kyiMethodLabel({
        type: "signature",
        scheme: null,
        message: null,
        signature: null,
        signer_public_key: null,
      }),
    ).toBe("signature:unrecorded");
    expect(
      kyiMethodLabel({
        type: "contract_signature",
        scheme: "eip1271",
        inner_scheme: "eip712",
        message: "",
        signature: "",
        caip2: "eip155:1",
        block_number: 1,
      }),
    ).toBe("contract_signature:eip1271/eip712");
    expect(
      kyiMethodLabel({
        type: "transfer",
        kind: "memo",
        caip2: null,
        transaction_hash: "",
        sender: "",
        recipient: null,
        memo: "",
      }),
    ).toBe("transfer:memo");
    expect(kyiMethodLabel({ type: "admin_manual" })).toBe("admin_manual");
  });
});

describe("kyiRpcUrl", () => {
  it("returns the configured url", () => {
    expect(kyiRpcUrl("test:1", { rpcUrls: { "test:1": "http://rpc" } })).toBe(
      "http://rpc",
    );
  });

  it("throws when the chain has no rpc url", () => {
    expect(() => kyiRpcUrl("test:1", {})).toThrow(
      "RPC not configured for test:1",
    );
  });
});

describe("kyiChainFunctions", () => {
  it("binds the public entry points to one checker", async () => {
    const { checker, checkProof } = fakeChecker();
    const fns = kyiChainFunctions(checker);
    const lookup = item([verification()]);
    const report = await fns.verifyKyiResponse({
      kyi_verified: true,
      data: [lookup],
    });
    expect(report.verified).toBe(true);
    expect((await fns.verifyKyiToken(lookup)).verified).toBe(true);
    await fns.checkKyiVerification(
      lookup.verifications[0] as KyiVerification,
      lookup.token,
    );
    await fns.checkKyiAuthority(authority, lookup.token);
    expect(checkProof).toHaveBeenCalledTimes(3);
  });

  it("checks one claim per moment without the authority binding", async () => {
    const { checker } = fakeChecker();
    const fns = kyiChainFunctions(checker);
    const lookup = item([verification("2027-01-01T00:00:00Z")]);
    const check = await fns.checkKyiVerification(
      lookup.verifications[0] as KyiVerification,
      lookup.token,
      { at: ["now", new Date("2026-09-01T00:00:00Z"), new Date("2028-01-01")] },
    );
    expect(check.kind).toBe("verification");
    expect(check.proof?.steps.map((s) => s.check)).toEqual(["proof"]);
    expect(check.at.now?.status).toBe("valid");
    expect(check.at["2026-09-01T00:00:00.000Z"]?.reason).toBe(
      "record postdates this moment",
    );
    expect(check.at["2028-01-01T00:00:00.000Z"]?.reason).toBe(
      "verification expired at 2027-01-01T00:00:00Z",
    );
    const offline = await fns.checkKyiAuthority(authority, lookup.token);
    expect(offline).toEqual({
      kind: "authority",
      subject: "owner-1",
      method: "owner",
      at: {},
    });
    const now = await fns.checkKyiAuthority(authority, lookup.token, {
      at: ["now"],
    });
    expect(now.at.now?.status).toBe("valid");
  });
});

describe("CheckTrail", () => {
  it("compares addresses exactly by default", () => {
    expect(new CheckTrail().address("x", "Abc", "abc")).toBe(false);
  });

  it("reports its result with the position read", () => {
    const t = new CheckTrail();
    t.check("x", true);
    t.position = { slot: "5" };
    expect(t.result()).toEqual({
      status: "valid",
      reason: undefined,
      steps: [{ check: "x", via: "offline", ok: true }],
      position: { slot: "5" },
    });
  });
});

describe("checkWalletBacksAuthority", () => {
  it("accepts a listed signer", () => {
    const v: KyiVerification = {
      ...verification(),
      wallet_address: "signer-1",
      authority: {
        ...authority,
        account_type: "multisig",
        signers: ["signer-1", "signer-2"],
        threshold: 2,
      },
    };
    expect(checkWalletBacksAuthority(new CheckTrail(), v)).toBe(true);
  });
});
