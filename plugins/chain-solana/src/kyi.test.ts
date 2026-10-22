import type {
  KyiAuthority,
  KyiToken,
  KyiTokenLookupItem,
  KyiVerification,
} from "@bluprynt/sdk-core";
import {
  type Address,
  address,
  generateKeyPair,
  getAddressFromPublicKey,
  getBase58Decoder,
  getBase64Decoder,
  type ReadonlyUint8Array,
  signBytes,
  some,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  AccountState,
  getMintEncoder,
  getMultisigEncoder,
  getTokenEncoder,
  type MintArgs,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkKyiAuthority,
  checkKyiVerification,
  verifyKyiResponse,
  verifyKyiToken,
} from "./kyi.js";

const keys = await generateKeyPair();
const wallet = await getAddressFromPublicKey(keys.publicKey);
const mint = await getAddressFromPublicKey((await generateKeyPair()).publicKey);

const solToken: KyiToken = {
  caip19: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:${mint}`,
  caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  chain_slug: "solana",
  address: mint,
  standard: null,
  decimals: null,
  verified_at: null,
};

const authority: KyiAuthority = {
  type: "owner",
  address: wallet,
  account_type: "regular",
  signers: [],
  threshold: null,
  observed_at: null,
};

const verification = (
  method: KyiVerification["method"],
  a: KyiAuthority = authority,
): KyiVerification => ({
  verified_at: "2026-10-01T00:00:00Z",
  expires_at: null,
  wallet_address: wallet,
  authority: a,
  method,
});

const encode = (text: string) => new TextEncoder().encode(text);

async function sign(data: Uint8Array) {
  return getBase58Decoder().decode(await signBytes(keys.privateKey, data));
}

function offchain(message: string) {
  const body = encode(message);
  return Uint8Array.from([
    0xff,
    ...encode("solana offchain"),
    0,
    0,
    body.length & 0xff,
    body.length >> 8,
    ...body,
  ]);
}

const rawVerification = async (
  message: string,
  signedMessage = message,
  a: KyiAuthority = authority,
) =>
  verification(
    {
      type: "signature",
      scheme: "solana_raw",
      message,
      signature: await sign(encode(signedMessage)),
      signer_public_key: null,
    },
    a,
  );

const lookupItem = (verifications: KyiVerification[]): KyiTokenLookupItem => ({
  token: solToken,
  asset: {
    slug: null,
    name: null,
    symbol: null,
    description: null,
    website_url: null,
    whitepaper_url: null,
  },
  issuer: null,
  kyi_verified: true,
  verifications,
  authorities: [authority],
});

const offchainVerification = async (
  scheme: "solana_raw" | "solana_offchain_v0" | null,
  message = "hello",
) =>
  verification({
    type: "signature",
    scheme,
    message,
    signature: await sign(offchain(message)),
    signer_public_key: null,
  });

const proofOf = async (v: KyiVerification) => {
  const check = await checkKyiVerification(v, solToken);
  expect(check.at).toEqual({});
  if (!check.proof) throw new Error("verification without a proof");
  return check.proof;
};

describe("solana KYI signatures", () => {
  it("accepts a valid solana_raw signature", async () => {
    const check = await checkKyiVerification(
      await rawVerification("hello"),
      solToken,
    );
    expect(check.proof?.status).toBe("valid");
    expect(check.method).toBe("signature:solana_raw");
  });

  it("accepts a valid solana_offchain_v0 signature", async () => {
    const check = await proofOf(
      await offchainVerification("solana_offchain_v0"),
    );
    expect(check.status).toBe("valid");
  });

  it("rejects an off-chain signature checked as raw", async () => {
    const check = await proofOf(await offchainVerification("solana_raw"));
    expect(check.status).toBe("invalid");
  });

  it("rejects a signature over a different message", async () => {
    const check = await proofOf(await rawVerification("hello", "goodbye"));
    expect(check.status).toBe("invalid");
  });

  it("matches an unrecorded scheme", async () => {
    const check = await proofOf(await offchainVerification(null));
    expect(check.status).toBe("valid");
    expect(check.steps.map((s) => s.check).join()).toContain(
      "matched solana_offchain_v0",
    );
  });

  it("compares Solana addresses exactly", async () => {
    const i = [...wallet].findIndex((c) => c.toLowerCase() !== c.toUpperCase());
    const letter = wallet.charAt(i);
    const flipped =
      wallet.slice(0, i) +
      (letter === letter.toLowerCase()
        ? letter.toUpperCase()
        : letter.toLowerCase()) +
      wallet.slice(i + 1);
    const base = await rawVerification("hello");
    const check = await proofOf({
      ...base,
      authority: { ...authority, address: flipped },
    });
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe(
      "wallet is the authority or one of its signers failed",
    );
  });

  it("does not support transfers on Solana", async () => {
    const transfer = verification({
      type: "transfer",
      kind: "memo",
      caip2: solToken.caip2,
      transaction_hash: "sig",
      sender: wallet,
      recipient: null,
      memo: "m",
    });
    const check = await proofOf(transfer);
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe("transfer:memo is not supported on Solana");
    const now = await checkKyiVerification(transfer, solToken, {
      rpcUrls: { [solToken.caip2]: "https://rpc.test" },
      at: ["now"],
    });
    expect(now.at.now?.status).toBe("unverifiable");
  });

  it("verifyKyiResponse routes a Solana token", async () => {
    const item = lookupItem([await rawVerification("hello")]);
    const report = await verifyKyiResponse({
      kyi_verified: true,
      data: [item],
    });
    expect(report.verified).toBe(true);
    expect((await checkKyiAuthority(authority, solToken)).at).toEqual({});
  });
});

const rpcUrls = { [solToken.caip2]: "https://rpc.test" };
const randomAddress = async () =>
  getAddressFromPublicKey((await generateKeyPair()).publicKey);
const mintAuthority = await randomAddress();
const freezeAuthority = await randomAddress();

type StubbedAccount = { owner: Address; data: ReadonlyUint8Array } | null;

function stubAccounts(accounts: Record<string, StubbedAccount>) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const { id, method, params } = JSON.parse(init.body as string);
    expect(method).toBe("getAccountInfo");
    const account = accounts[params[0]] ?? null;
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        context: { slot: 1 },
        value: account && {
          data: [getBase64Decoder().decode(account.data), "base64"],
          owner: account.owner,
          executable: false,
          lamports: 1,
          rentEpoch: 0,
          space: account.data.length,
        },
      },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const mintAccount = (
  args: Partial<MintArgs> = {},
  owner: Address = TOKEN_PROGRAM_ADDRESS,
): StubbedAccount => ({
  owner,
  data: getMintEncoder().encode({
    mintAuthority,
    supply: 1n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority,
    extensions: null,
    ...args,
  }),
});

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const multisigAddress = await randomAddress();
const signers = [await randomAddress(), await randomAddress()];
const multisigAccount = (
  m = 2,
  owner: Address = TOKEN_PROGRAM_ADDRESS,
): StubbedAccount => ({
  owner,
  data: getMultisigEncoder().encode({
    m,
    n: signers.length,
    isInitialized: true,
    signers: [...signers, ...Array(11 - signers.length).fill(SYSTEM_PROGRAM)],
  }),
});

const authorityOf = (
  type: string,
  address: string,
  extra: Partial<KyiAuthority> = {},
): KyiAuthority => ({ ...authority, type, address, ...extra });

const checkAuthority = async (a: KyiAuthority) => {
  const check = await checkKyiAuthority(a, solToken, { rpcUrls, at: ["now"] });
  if (!check.at.now) throw new Error("no result now");
  return check.at.now;
};

const HISTORICAL = "Solana RPC cannot read historical account state";

describe("solana KYI authority checks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("confirms the mint authority", async () => {
    stubAccounts({ [mint]: mintAccount() });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("valid");
    expect(check.steps.every((s) => s.via === "rpc")).toBe(true);
    expect(check.position).toEqual({ slot: "1" });
  });

  it("makes no RPC call by default", async () => {
    const fetch = stubAccounts({ [mint]: mintAccount() });
    const mintAuthorityClaim = authorityOf("mint_authority", wallet);
    const report = await verifyKyiToken({
      ...lookupItem([
        await rawVerification("hello", "hello", mintAuthorityClaim),
      ]),
      authorities: [mintAuthorityClaim],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(report.checks.map((c) => c.at)).toEqual([{}, {}]);
    expect(report.evidence).toBe("confirmed");
  });

  it("checks a verification's mint authority now", async () => {
    stubAccounts({ [mint]: mintAccount({ mintAuthority: wallet }) });
    const mintAuthorityClaim = authorityOf("mint_authority", wallet);
    const check = await checkKyiVerification(
      await rawVerification("hello", "hello", mintAuthorityClaim),
      solToken,
      { rpcUrls, at: ["now"] },
    );
    expect(check.at.now).toMatchObject({
      status: "valid",
      position: { slot: "1" },
    });
    expect(check.at.now?.steps.map((s) => s.check)).toContain("mint authority");
  });

  it("cannot read past account state", async () => {
    const fetch = stubAccounts({ [mint]: mintAccount() });
    const mintAuthorityClaim = authorityOf("mint_authority", wallet);
    const report = await verifyKyiToken(
      {
        ...lookupItem([
          await rawVerification("hello", "hello", mintAuthorityClaim),
        ]),
        authorities: [mintAuthorityClaim],
      },
      { rpcUrls, at: ["verified", new Date("2026-10-02T00:00:00Z")] },
    );
    expect(fetch).not.toHaveBeenCalled();
    for (const check of report.checks) {
      expect(check.at["2026-10-02T00:00:00.000Z"]?.reason).toBe(HISTORICAL);
    }
    expect(report.checks[0]?.at.verified?.reason).toBe(HISTORICAL);
    expect(report.checks[1]?.at.verified?.reason).toBe("no recorded moment");
  });

  it("rejects a different mint authority", async () => {
    stubAccounts({ [mint]: mintAccount() });
    const check = await checkAuthority(
      authorityOf("mint_authority", freezeAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("mint authority failed");
  });

  it("rejects a mint with no freeze authority", async () => {
    stubAccounts({ [mint]: mintAccount({ freezeAuthority: null }) });
    const check = await checkAuthority(
      authorityOf("freeze_authority", freezeAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("freeze authority failed");
  });

  it("reads authorities from a Token-2022 mint with extensions", async () => {
    stubAccounts({
      [mint]: mintAccount(
        {
          extensions: some([
            { __kind: "MintCloseAuthority", closeAuthority: mintAuthority },
          ]),
        },
        TOKEN_2022_PROGRAM_ADDRESS,
      ),
    });
    const check = await checkAuthority(
      authorityOf("freeze_authority", freezeAuthority),
    );
    expect(check.status).toBe("valid");
  });

  it("rejects a token account at the mint address", async () => {
    stubAccounts({
      [mint]: {
        owner: TOKEN_PROGRAM_ADDRESS,
        data: getTokenEncoder().encode({
          mint: freezeAuthority,
          owner: mintAuthority,
          amount: 1n,
          delegate: null,
          state: AccountState.Initialized,
          isNative: null,
          delegatedAmount: 0n,
          closeAuthority: null,
          extensions: null,
        }),
      },
    });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("account is a token mint failed");
  });

  it("rejects an uninitialized mint", async () => {
    stubAccounts({ [mint]: mintAccount({ isInitialized: false }) });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("account is a token mint failed");
    expect(check.steps.map((s) => s.check)).not.toContain("mint authority");
  });

  it("rejects a Token-2022 token account at the mint address", async () => {
    stubAccounts({
      [mint]: {
        owner: TOKEN_2022_PROGRAM_ADDRESS,
        data: getTokenEncoder().encode({
          mint: freezeAuthority,
          owner: mintAuthority,
          amount: 1n,
          delegate: null,
          state: AccountState.Initialized,
          isNative: null,
          delegatedAmount: 0n,
          closeAuthority: null,
          extensions: some([{ __kind: "ImmutableOwner" }]),
        }),
      },
    });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("account is a token mint failed");
  });

  it("rejects a multisig at the mint address", async () => {
    stubAccounts({ [mint]: multisigAccount() });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("account is a token mint failed");
  });

  it("rejects a missing mint account", async () => {
    stubAccounts({});
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("mint account exists failed");
  });

  it("rejects a mint owned by another program", async () => {
    stubAccounts({ [mint]: mintAccount({}, wallet) });
    const check = await checkAuthority(
      authorityOf("mint_authority", mintAuthority),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("mint is owned by a token program failed");
  });

  it("confirms multisig signers and threshold", async () => {
    stubAccounts({
      [mint]: mintAccount({ mintAuthority: multisigAddress }),
      [multisigAddress]: multisigAccount(),
    });
    const check = await checkAuthority(
      authorityOf("mint_authority", multisigAddress, {
        account_type: "multisig",
        signers: [...signers].reverse(),
        threshold: 2,
      }),
    );
    expect(check.status).toBe("valid");
  });

  it("rejects a multisig threshold mismatch", async () => {
    stubAccounts({ [multisigAddress]: multisigAccount() });
    const check = await checkAuthority(
      authorityOf("controlled_by", multisigAddress, {
        account_type: "multisig",
        signers,
        threshold: 1,
      }),
    );
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("multisig threshold failed");
  });

  const multisigClaim = () =>
    authorityOf("controlled_by", multisigAddress, {
      account_type: "multisig",
      signers,
      threshold: 2,
    });

  it("rejects a multisig owned by another program", async () => {
    stubAccounts({ [multisigAddress]: multisigAccount(2, wallet) });
    const check = await checkAuthority(multisigClaim());
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("multisig is owned by a token program failed");
  });

  it("rejects an account that is not a multisig", async () => {
    stubAccounts({ [multisigAddress]: mintAccount() });
    const check = await checkAuthority(multisigClaim());
    expect(check.status).toBe("invalid");
    expect(check.reason).toBe("account is a token multisig failed");
  });

  it("rejects a missing multisig account", async () => {
    stubAccounts({});
    const check = await checkAuthority(
      authorityOf("controlled_by", multisigAddress, {
        account_type: "multisig",
        signers,
        threshold: 2,
      }),
    );
    expect(check.reason).toBe("multisig account exists failed");
  });

  it("does not check unknown authority types", async () => {
    const check = await checkAuthority(authorityOf("controlled_by", wallet));
    expect(check.status).toBe("unverifiable");
    expect(check.reason).toBe("no Solana check for controlled_by");
  });

  it("treats prototype property names as unknown authority types", async () => {
    for (const type of ["constructor", "toString"]) {
      const check = await checkAuthority(authorityOf(type, wallet));
      expect(check.status).toBe("unverifiable");
      expect(check.reason).toBe(`no Solana check for ${type}`);
    }
  });

  it("throws when no RPC is configured", async () => {
    await expect(
      checkKyiAuthority(
        authorityOf("mint_authority", mintAuthority),
        solToken,
        {
          at: ["now"],
        },
      ),
    ).rejects.toThrow(`RPC not configured for ${solToken.caip2}`);
  });

  it("throws on transport errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    await expect(
      checkAuthority(authorityOf("mint_authority", mintAuthority)),
    ).rejects.toThrow();
  });
});
