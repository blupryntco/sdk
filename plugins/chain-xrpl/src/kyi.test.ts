import type {
  KyiAuthority,
  KyiCheckOptions,
  KyiInstant,
  KyiToken,
  KyiTokenLookupItem,
  KyiVerification,
} from "@bluprynt/sdk-core";
import {
  deriveAddress,
  deriveKeypair,
  generateSeed,
  sign,
} from "ripple-keypairs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Client,
  convertStringToHex,
  LedgerEntry,
  RippledError,
  unixTimeToRippleTime,
} from "xrpl";

const fake = vi.hoisted(() => ({
  created: [] as string[],
  connect: vi.fn(),
  request: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("xrpl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xrpl")>();
  return {
    ...actual,
    Client: class {
      connect = fake.connect;
      request = fake.request;
      disconnect = fake.disconnect;
      constructor(url: string) {
        fake.created.push(url);
      }
    },
  };
});

import {
  checkKyiAuthority,
  checkKyiVerification,
  verifyKyiToken,
  type XrplKyiCheckOptions,
  xrplKyi,
} from "./kyi.js";

function account(algorithm: "ed25519" | "ecdsa-secp256k1") {
  const { publicKey, privateKey } = deriveKeypair(generateSeed({ algorithm }));
  return { publicKey, privateKey, address: deriveAddress(publicKey) };
}

const ed = account("ed25519");
const secp = account("ecdsa-secp256k1");
const regular = account("ed25519");
const issuer = account("ed25519");
const other = account("ed25519");

const rpcUrls = { "xrpl:0": "wss://xrpl.example" };
const now = { rpcUrls, at: ["now" as const] };
const nowInstant: KyiInstant = { label: "now", time: "now" };

const token: KyiToken = {
  caip19: `xrpl:0/iou:USD.${issuer.address}`,
  caip2: "xrpl:0",
  chain_slug: "xrpl",
  address: `USD.${issuer.address}`,
  standard: null,
  decimals: null,
  verified_at: null,
};

const authority = (
  address: string,
  overrides: Partial<KyiAuthority> = {},
): KyiAuthority => ({
  type: "issuer",
  address,
  account_type: "regular",
  signers: [],
  threshold: null,
  observed_at: null,
  ...overrides,
});

const signed = (
  signer: ReturnType<typeof account>,
  wallet: string,
  message: string,
  signedMessage = message,
  signerKey: string | null = signer.publicKey,
): KyiVerification => ({
  verified_at: "2026-10-01T00:00:00Z",
  expires_at: null,
  wallet_address: wallet,
  authority: authority(wallet),
  method: {
    type: "signature",
    scheme: "xrpl",
    message,
    signature: sign(convertStringToHex(signedMessage), signer.privateKey),
    signer_public_key: signerKey,
  },
});

const accountInfo = (RegularKey?: string, Flags = 0) => ({
  result: { account_data: { RegularKey, Flags }, ledger_index: 7 },
});

const notFound = (ledger_index?: number) =>
  new RippledError("Account not found.", {
    error: "actNotFound",
    ledger_index,
  });

const missingLedger = () =>
  new RippledError("ledgerNotFound", { error: "lgrNotFound" });

const LATEST = 1000;
const EPOCH = Date.UTC(2030, 0, 1);
const closeMs = (index: number) => EPOCH + index * 4000;
const closeIso = (index: number) => new Date(closeMs(index)).toISOString();
const moment = (index: number) => new Date(closeMs(index) + 1000);

interface Chain {
  first?: number;
  latest?: number;
  ranges?: [number, number][];
  data?: (index: number) => Record<string, unknown>;
}

const chain = ({
  first = 1,
  latest = LATEST,
  ranges = [[first, latest]],
  data = () => ({}),
}: Chain = {}) => {
  fake.request.mockImplementation(
    async (req: { command: string; ledger_index: number | "validated" }) => {
      if (req.command === "server_info") {
        const complete = ranges.map(([from, to]) => `${from}-${to}`).join(",");
        return { result: { info: { complete_ledgers: complete } } };
      }
      const index =
        req.ledger_index === "validated" ? latest : req.ledger_index;
      if (!ranges.some(([from, to]) => index >= from && index <= to)) {
        throw missingLedger();
      }
      if (req.command === "ledger") {
        return {
          result: {
            ledger_index: index,
            ledger: { close_time: unixTimeToRippleTime(closeMs(index)) },
          },
        };
      }
      return {
        result: {
          account_data: { Flags: 0, ...data(index) },
          ledger_index: index,
        },
      };
    },
  );
};

const requested = (command: string) =>
  fake.request.mock.calls
    .map(([req]) => req)
    .filter((req) => req.command === command);

beforeEach(() => {
  fake.created.length = 0;
  fake.connect.mockReset().mockResolvedValue(undefined);
  fake.request.mockReset().mockResolvedValue(accountInfo());
  fake.disconnect.mockReset().mockResolvedValue(undefined);
});

const proofOf = async (v: KyiVerification) => {
  const check = await checkKyiVerification(v, token);
  expect(check.at).toEqual({});
  if (!check.proof) throw new Error("verification without a proof");
  return check.proof;
};

describe("xrpl KYI signatures", () => {
  it("accepts a master-key ed25519 signature offline", async () => {
    const check = await checkKyiVerification(
      signed(ed, ed.address, "hello"),
      token,
    );
    expect(check.proof?.status).toBe("valid");
    expect(check.method).toBe("signature:xrpl");
    expect(check.proof?.steps.every((s) => s.via === "offline")).toBe(true);
    expect(check.proof?.steps.at(-1)).toMatchObject({
      check: "signer key is the wallet's master key",
      ok: true,
    });
    expect(fake.created).toEqual([]);
  });

  it("accepts a master-key secp256k1 signature", async () => {
    expect((await proofOf(signed(secp, secp.address, "hello"))).status).toBe(
      "valid",
    );
  });

  it("accepts a lowercase signer key", async () => {
    const check = await proofOf(
      signed(ed, ed.address, "hello", "hello", ed.publicKey.toLowerCase()),
    );
    expect(check.status).toBe("valid");
  });

  it("rejects a signature over a different message", async () => {
    const check = await proofOf(signed(ed, ed.address, "hello", "goodbye"));
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("xrpl signature verifies for signer key failed");
  });

  it("needs an online check for a key other than the master key", async () => {
    const check = await proofOf(signed(regular, ed.address, "hello"));
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe(
      "signer is not the master key; online check needed",
    );
    expect(fake.created).toEqual([]);
  });

  it("accepts the account's current regular key now", async () => {
    fake.request.mockResolvedValue(accountInfo(regular.address));
    const check = await checkKyiVerification(
      signed(regular, issuer.address, "hello"),
      token,
      now,
    );
    expect(check.proof?.status).toBe("unverifiable");
    expect(check.at.now?.status).toBe("valid");
    expect(check.at.now?.position).toEqual({ ledger: 7 });
    expect(
      check.at.now?.steps.find(
        (s) => s.check === "signer key was authorised for the wallet",
      )?.via,
    ).toBe("rpc");
    expect(fake.request).toHaveBeenCalledWith({
      command: "account_info",
      account: issuer.address,
      ledger_index: "validated",
      signer_lists: true,
    });
    expect(fake.disconnect).toHaveBeenCalled();
  });

  it("rejects a key that is neither master nor current regular key", async () => {
    fake.request.mockResolvedValue(accountInfo(other.address));
    const check = await xrplKyi.checkVerificationAt(
      signed(regular, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe(
      "signer key was authorised for the wallet failed",
    );
  });

  it("treats a signer on an account with a signer list as unverifiable", async () => {
    fake.request.mockResolvedValue({
      result: {
        account_data: { Flags: 0 },
        ledger_index: 7,
        signer_lists: [
          {
            LedgerEntryType: "SignerList",
            SignerQuorum: 2,
            SignerEntries: [
              { SignerEntry: { Account: regular.address, SignerWeight: 1 } },
              { SignerEntry: { Account: other.address, SignerWeight: 1 } },
            ],
          },
        ],
      },
    });
    const check = await xrplKyi.checkVerificationAt(
      signed(regular, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe("XRPL signer lists are not supported");
    expect(fake.request).toHaveBeenCalledWith({
      command: "account_info",
      account: ed.address,
      ledger_index: "validated",
      signer_lists: true,
    });
    expect(fake.created).toEqual(["wss://xrpl.example"]);
  });

  it("still rejects a disabled master key on an account with a signer list", async () => {
    fake.request.mockResolvedValue({
      result: {
        account_data: { Flags: LedgerEntry.AccountRootFlags.lsfDisableMaster },
        ledger_index: 7,
        signer_lists: [
          {
            LedgerEntryType: "SignerList",
            SignerQuorum: 1,
            SignerEntries: [
              { SignerEntry: { Account: other.address, SignerWeight: 1 } },
            ],
          },
        ],
      },
    });
    const check = await xrplKyi.checkVerificationAt(
      signed(ed, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe(
      "signer key was authorised for the wallet failed",
    );
  });

  it("still rejects an unauthorised key on an account without a signer list", async () => {
    fake.request.mockResolvedValue({
      result: {
        account_data: { RegularKey: other.address, Flags: 0 },
        ledger_index: 7,
        signer_lists: [],
      },
    });
    const check = await xrplKyi.checkVerificationAt(
      signed(regular, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe(
      "signer key was authorised for the wallet failed",
    );
  });

  it("rejects a key for a missing wallet account without a position", async () => {
    fake.request.mockRejectedValue(notFound());
    const check = await xrplKyi.checkVerificationAt(
      signed(regular, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.status).toBe("invalid");
    expect(check.position).toBeUndefined();
  });

  it("keeps the ledger of a missing wallet account", async () => {
    fake.request.mockRejectedValue(notFound(9));
    const check = await xrplKyi.checkVerificationAt(
      signed(regular, ed.address, "hello"),
      token,
      nowInstant,
      { rpcUrls },
    );
    expect(check.position).toEqual({ ledger: 9 });
  });

  describe("at a past moment", () => {
    const at = moment(500);
    const label = at.toISOString();
    const run = (v: KyiVerification) =>
      checkKyiVerification(v, token, { rpcUrls, at: [at] });

    it("resolves a date to a validated ledger", async () => {
      chain({ data: () => ({ RegularKey: regular.address }) });
      const check = await run(signed(regular, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("valid");
      expect(check.at[label]?.position).toEqual({
        ledger: 500,
        time: closeIso(500),
      });
      expect(requested("account_info").map((req) => req.ledger_index)).toEqual([
        500, 500,
      ]);
    });

    it("resolves a date after the latest ledger to the latest validated one", async () => {
      chain({ data: () => ({ RegularKey: regular.address }) });
      const check = await checkKyiVerification(
        signed(regular, issuer.address, "hello"),
        token,
        { rpcUrls, at: [moment(LATEST + 50)] },
      );
      const [result] = Object.values(check.at);
      expect(result?.position?.ledger).toBe(LATEST);
    });

    it("master key disabled at a moment is invalid there", async () => {
      chain({
        data: () => ({ Flags: LedgerEntry.AccountRootFlags.lsfDisableMaster }),
      });
      const check = await run(signed(issuer, issuer.address, "hello"));
      expect(check.proof?.status).toBe("valid");
      expect(check.at[label]?.status).toBe("invalid");
      expect(check.at[label]?.reason).toBe(
        "signer key was authorised for the wallet failed",
      );
    });

    it("master key enabled at a moment is authorised", async () => {
      chain();
      const check = await run(signed(issuer, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("valid");
    });

    it("regular key at a past ledger is authorised", async () => {
      chain({
        data: (index) => (index === 500 ? { RegularKey: regular.address } : {}),
      });
      const check = await run(signed(regular, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("valid");
    });

    it("regular key not current at that ledger is invalid", async () => {
      chain({
        data: (index) => (index > 500 ? { RegularKey: regular.address } : {}),
      });
      const check = await run(signed(regular, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("invalid");
    });

    it("reports a missing ledger as unverifiable", async () => {
      chain();
      const resolved = fake.request.getMockImplementation();
      fake.request.mockImplementation(async (req) => {
        if (req.command === "account_info") throw missingLedger();
        return resolved?.(req);
      });
      const check = await run(signed(regular, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("unverifiable");
      expect(check.at[label]?.reason).toBe("XRPL server has no ledger 500");
    });

    it("searches only the ledgers the server has", async () => {
      chain({ first: 1000, latest: 2000 });
      const inside = moment(1500);
      const check = await checkKyiVerification(
        signed(regular, issuer.address, "hello"),
        token,
        { rpcUrls, at: [inside] },
      );
      const ledger = check.at[inside.toISOString()]?.position?.ledger;
      expect(ledger).toBeGreaterThanOrEqual(1000);
      expect(ledger).toBeLessThanOrEqual(2000);
      for (const req of requested("ledger")) {
        expect(
          req.ledger_index === "validated" ||
            (req.ledger_index >= 1000 && req.ledger_index <= 2000),
        ).toBe(true);
      }
    });

    it("reports a moment before the server's history as unverifiable", async () => {
      chain({ first: 1000, latest: 2000 });
      const check = await run(signed(regular, issuer.address, "hello"));
      expect(check.at[label]?.status).toBe("unverifiable");
      expect(check.at[label]?.reason).toBe("XRPL server has no ledger 999");
    });

    it("uses the ledger range that contains the latest ledger", async () => {
      chain({
        ranges: [
          [100, 200],
          [1000, 2000],
        ],
        latest: 2000,
      });
      const v = signed(regular, issuer.address, "hello");
      const inside = moment(1500);
      const found = await checkKyiVerification(v, token, {
        rpcUrls,
        at: [inside],
      });
      const ledger = found.at[inside.toISOString()]?.position?.ledger;
      expect(ledger).toBeGreaterThanOrEqual(1000);
      expect(ledger).toBeLessThanOrEqual(2000);
      const gap = moment(150);
      const missing = await checkKyiVerification(v, token, {
        rpcUrls,
        at: [gap],
      });
      expect(missing.at[gap.toISOString()]?.status).toBe("unverifiable");
      expect(missing.at[gap.toISOString()]?.reason).toBe(
        "XRPL server has no ledger 999",
      );
    });

    it("is unverifiable before the first ledger closed", async () => {
      chain();
      const check = await checkKyiVerification(
        signed(regular, issuer.address, "hello"),
        token,
        { rpcUrls, at: [new Date(EPOCH)] },
      );
      const [result] = Object.values(check.at);
      expect(result?.status).toBe("unverifiable");
      expect(result?.reason).toBe(
        "chain has no ledger at or before this moment",
      );
    });
  });

  it('throws when the server has no validated ledger at "now"', async () => {
    fake.request.mockRejectedValue(missingLedger());
    await expect(
      checkKyiVerification(
        signed(regular, issuer.address, "hello"),
        token,
        now,
      ),
    ).rejects.toThrow();
  });

  it("throws on a malformed signature", async () => {
    const v = signed(ed, ed.address, "hello");
    if (v.method.type === "signature") v.method.signature = "not hex";
    await expect(checkKyiVerification(v, token)).rejects.toThrow();
  });

  it("skips proofs without a signer key", async () => {
    const v = signed(ed, issuer.address, "hello", "hello", null);
    const check = await checkKyiVerification(v, token, now);
    expect(check.proof?.status).toBe("unverifiable");
    expect(check.proof?.reason).toBe("signer public key not recorded");
    expect(check.at.now?.status).toBe("unverifiable");
  });
});

describe("xrpl KYI authority", () => {
  const checkNow = async (
    a: KyiAuthority,
    t: KyiToken = token,
    options: KyiCheckOptions = now,
  ) => {
    const check = await checkKyiAuthority(a, t, options);
    if (!check.at.now) throw new Error("no result now");
    return check.at.now;
  };

  it("confirms the issuer authority", async () => {
    const check = await checkNow(authority(issuer.address));
    expect(check.status).toBe("valid");
    expect(check.position).toEqual({ ledger: 7 });
    expect(check.steps.map((s) => s.via)).toEqual(["offline", "rpc"]);
    expect(fake.created).toEqual(["wss://xrpl.example"]);
    expect(fake.disconnect).toHaveBeenCalled();
  });

  it("parses the issuer from a 40-hex currency", async () => {
    const hex = "0123456789ABCDEF0123456789ABCDEF01234567";
    const check = await checkNow(authority(issuer.address), {
      ...token,
      address: `${hex}.${issuer.address}`,
    });
    expect(check.status).toBe("valid");
  });

  it("throws on a malformed token address", async () => {
    for (const address of ["USD", `USD.`]) {
      await expect(
        checkNow(authority(issuer.address), { ...token, address }),
      ).rejects.toThrow(`Malformed XRPL token address: ${address}`);
    }
  });

  it("rejects an issuer that does not match the token", async () => {
    const check = await checkNow(authority(other.address));
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("issuer matches the token failed");
  });

  it("rejects a missing issuer account", async () => {
    fake.request.mockRejectedValue(notFound());
    const check = await checkNow(authority(issuer.address));
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("issuer account exists failed");
  });

  it("throws when the connection fails", async () => {
    fake.connect.mockRejectedValue(new Error("unreachable"));
    await expect(checkNow(authority(issuer.address))).rejects.toThrow();
  });

  it("throws when RPC is not configured", async () => {
    await expect(
      checkNow(authority(issuer.address), token, { at: ["now"] }),
    ).rejects.toThrow("RPC not configured for xrpl:0");
  });

  it("skips multisig authorities without an RPC client", async () => {
    const check = await checkNow(
      authority(issuer.address, { account_type: "multisig" }),
    );
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe("XRPL multisig is not supported");
    expect(fake.created).toEqual([]);
  });

  it("skips authority types it cannot check without an RPC client", async () => {
    const check = await checkNow(authority(issuer.address, { type: "owner" }));
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe("no XRPL check for owner");
    expect(fake.created).toEqual([]);
  });

  it("reads the issuer at the resolved ledger", async () => {
    chain();
    const at = moment(500);
    const check = await checkKyiAuthority(authority(issuer.address), token, {
      rpcUrls,
      at: [at],
    });
    const result = check.at[at.toISOString()];
    expect(result?.status).toBe("valid");
    expect(result?.position).toEqual({ ledger: 500, time: closeIso(500) });
    expect(requested("account_info")).toEqual([
      { command: "account_info", account: issuer.address, ledger_index: 500 },
    ]);
  });
});

describe("xrpl KYI connections", () => {
  const lookup = (verifications: KyiVerification[]): KyiTokenLookupItem => ({
    kyi_verified: true,
    token,
    asset: {
      slug: null,
      name: null,
      symbol: null,
      description: null,
      website_url: null,
      whitepaper_url: null,
    },
    issuer: null,
    authorities: [authority(issuer.address)],
    verifications,
  });

  it("makes no RPC call by default", async () => {
    const report = await verifyKyiToken(
      lookup([
        signed(regular, issuer.address, "hello"),
        signed(issuer, issuer.address, "hello"),
      ]),
      {},
    );
    expect(fake.created).toEqual([]);
    expect(fake.request).not.toHaveBeenCalled();
    expect(report.checks.map((c) => c.at)).toEqual([{}, {}, {}]);
    expect(report.evidence).toBe("confirmed");
  });

  it("shares one connection across lookups on the same chain", async () => {
    fake.request.mockResolvedValue(accountInfo(regular.address));
    const report = await verifyKyiToken(
      lookup([signed(regular, issuer.address, "hello")]),
      now,
    );
    expect(report.checks.map((c) => c.at.now?.status)).toEqual([
      "valid",
      "valid",
    ]);
    expect(fake.request).toHaveBeenCalledTimes(3);
    expect(fake.created).toEqual(["wss://xrpl.example"]);
    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
  });

  it("resolves each moment's ledger once per token", async () => {
    chain({ data: () => ({ RegularKey: regular.address }) });
    await verifyKyiToken(lookup([signed(regular, issuer.address, "hello")]), {
      rpcUrls,
      at: [moment(500)],
    });
    const ledgers = requested("ledger").map((req) => req.ledger_index);
    expect(new Set(ledgers).size).toBe(ledgers.length);
    expect(ledgers).toContain("validated");
    expect(requested("account_info")).toHaveLength(3);
  });

  it("disconnects when a lookup throws", async () => {
    fake.request.mockRejectedValue(new Error("boom"));
    await expect(verifyKyiToken(lookup([]), now)).rejects.toThrow("boom");
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not let a failing disconnect mask the original error", async () => {
    fake.request.mockRejectedValue(new Error("boom"));
    fake.disconnect.mockRejectedValue(new Error("socket closed"));
    await expect(verifyKyiToken(lookup([]), now)).rejects.toThrow("boom");
  });

  it("refuses new lookups after the connections are closed", async () => {
    let scoped: KyiCheckOptions = {};
    await xrplKyi.session?.({ rpcUrls }, async (options) => {
      scoped = options;
    });
    await expect(
      xrplKyi.checkAuthorityAt(
        authority(issuer.address),
        token,
        nowInstant,
        scoped,
      ),
    ).rejects.toThrow("closed");
    expect(fake.created).toEqual([]);
  });

  it("uses a supplied client in place of a WebSocket one", async () => {
    const replay = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockResolvedValue(accountInfo()),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const options: XrplKyiCheckOptions = {
      ...now,
      createClient: (url) => {
        expect(url).toBe("wss://xrpl.example");
        return replay as unknown as Client;
      },
    };
    const report = await verifyKyiToken(lookup([]), options);
    expect(report.checks[0]?.at.now?.status).toBe("valid");
    expect(replay.request).toHaveBeenCalledTimes(1);
    expect(replay.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.created).toEqual([]);
  });

  it("does not disconnect a connection that never opened", async () => {
    fake.connect.mockRejectedValue(new Error("unreachable"));
    await expect(verifyKyiToken(lookup([]), now)).rejects.toThrow(
      "unreachable",
    );
    expect(fake.disconnect).not.toHaveBeenCalled();
  });
});
