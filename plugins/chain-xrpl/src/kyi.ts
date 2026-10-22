import {
  type ChainId,
  type CheckResult,
  CheckTrail,
  checkWalletBacksAuthority,
  type KyiAuthority,
  type KyiChainChecker,
  type KyiCheckOptions,
  type KyiInstant,
  type KyiSignatureMethod,
  type KyiToken,
  type KyiVerification,
  type KyiVerificationMethod,
  kyiChainFunctions,
  kyiMethodLabel,
  kyiRpcUrl,
} from "@bluprynt/sdk-core";
import { deriveAddress, verify } from "ripple-keypairs";
import {
  Client,
  convertStringToHex,
  LedgerEntry,
  RippledError,
  rippleTimeToUnixTime,
} from "xrpl";

export interface XrplKyiCheckOptions extends KyiCheckOptions {
  /** For tests and examples that replay recorded responses instead of opening a WebSocket. */
  createClient?: (url: string) => Client;
}

export const xrplKyi: KyiChainChecker = {
  namespace: "xrpl",
  checkProof,
  checkVerificationAt,
  checkAuthorityAt,
  session: (options, run) =>
    withConnections((connections) => {
      const scoped = { ...options };
      sessions.set(scoped, connections);
      return run(scoped);
    }),
};

interface ClosedLedger {
  index: number;
  closedAt: number;
}

interface AccountRead {
  data: LedgerEntry.AccountRoot | null;
  ledger?: number;
  signerLists: number;
}

class MissingLedger extends Error {
  constructor(readonly index: number | "validated") {
    super(`XRPL server has no ledger ${index}`);
  }
}

/** Shares connections and ledger lookups between the concurrent checks of one token; failed lookups stay cached so the whole report fails once. */
class Connections {
  private readonly clients = new Map<ChainId, Promise<Client>>();
  private readonly lookups = new Map<string, Promise<unknown>>();
  private closed = false;

  async account(
    caip2: ChainId,
    account: string,
    options: KyiCheckOptions,
    ledger: number | "validated",
    withSignerLists: boolean,
  ): Promise<AccountRead> {
    const client = await this.client(caip2, options);
    try {
      const { result } = await client.request({
        command: "account_info",
        account,
        ledger_index: ledger,
        ...(withSignerLists && { signer_lists: true }),
      });
      return {
        data: result.account_data,
        ledger: result.ledger_index,
        signerLists: result.signer_lists?.length ?? 0,
      };
    } catch (error) {
      switch (rippledError(error)?.error) {
        case "actNotFound":
          return {
            data: null,
            ledger: rippledError(error)?.ledger_index,
            signerLists: 0,
          };
        case "lgrNotFound":
          throw new MissingLedger(ledger);
      }
      throw error;
    }
  }

  ledgerAt(
    caip2: ChainId,
    options: KyiCheckOptions,
    time: Date,
  ): Promise<ClosedLedger | null> {
    const target = time.getTime();
    return this.once(`${caip2}/at/${target}`, () =>
      this.search(caip2, options, target),
    );
  }

  private ledger(
    caip2: ChainId,
    options: KyiCheckOptions,
    index: number | "validated",
  ): Promise<ClosedLedger> {
    return this.once(`${caip2}/${index}`, async () => {
      const client = await this.client(caip2, options);
      try {
        const { result } = await client.request({
          command: "ledger",
          ledger_index: index,
        });
        return {
          index: result.ledger_index,
          closedAt: rippleTimeToUnixTime(result.ledger.close_time),
        };
      } catch (error) {
        if (rippledError(error)?.error === "lgrNotFound") {
          throw new MissingLedger(index);
        }
        throw error;
      }
    });
  }

  private async search(
    caip2: ChainId,
    options: KyiCheckOptions,
    target: number,
  ): Promise<ClosedLedger | null> {
    const latest = await this.ledger(caip2, options, "validated");
    if (latest.closedAt <= target) return latest;
    const first = await this.firstLedger(caip2, options, latest.index);
    let low = await this.ledger(caip2, options, first);
    if (low.closedAt > target) {
      if (first <= 1) return null;
      throw new MissingLedger(first - 1);
    }
    let high = latest.index;
    while (high - low.index > 1) {
      const mid = await this.ledger(
        caip2,
        options,
        low.index + Math.floor((high - low.index) / 2),
      );
      if (mid.closedAt <= target) low = mid;
      else high = mid.index;
    }
    return low;
  }

  private firstLedger(
    caip2: ChainId,
    options: KyiCheckOptions,
    latest: number,
  ): Promise<number> {
    return this.once(`${caip2}/first`, async () => {
      const client = await this.client(caip2, options);
      const { result } = await client.request({ command: "server_info" });
      for (const range of result.info.complete_ledgers.split(",")) {
        const [from, to] = range.split("-").map(Number);
        if (
          from !== undefined &&
          to !== undefined &&
          from <= latest &&
          latest <= to
        ) {
          return from;
        }
      }
      return 1;
    });
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let lookup = this.lookups.get(key) as Promise<T> | undefined;
    if (!lookup) {
      lookup = load();
      this.lookups.set(key, lookup);
    }
    return lookup;
  }

  async close(): Promise<void> {
    this.closed = true;
    const opened = await Promise.allSettled(this.clients.values());
    await Promise.all(
      opened.flatMap((r) =>
        r.status === "fulfilled" ? [r.value.disconnect()] : [],
      ),
    );
  }

  private async client(caip2: ChainId, options: KyiCheckOptions) {
    if (this.closed) throw new Error("XRPL connections are closed");
    const url = kyiRpcUrl(caip2, options);
    let client = this.clients.get(caip2);
    if (!client) {
      client = connect(url, options);
      this.clients.set(caip2, client);
    }
    return client;
  }
}

async function connect(
  url: string,
  { createClient }: XrplKyiCheckOptions,
): Promise<Client> {
  const client = createClient?.(url) ?? new Client(url);
  await client.connect();
  return client;
}

const sessions = new WeakMap<KyiCheckOptions, Connections>();

async function withConnections<T>(
  run: (connections: Connections) => Promise<T>,
): Promise<T> {
  const connections = new Connections();
  let result: T;
  try {
    result = await run(connections);
  } catch (error) {
    await connections.close().catch(() => {});
    throw error;
  }
  await connections.close();
  return result;
}

function inSession<T>(
  options: KyiCheckOptions,
  run: (connections: Connections) => Promise<T>,
): Promise<T> {
  const shared = sessions.get(options);
  return shared ? run(shared) : withConnections(run);
}

export const {
  verifyKyiResponse,
  verifyKyiToken,
  checkKyiVerification,
  checkKyiAuthority,
} = kyiChainFunctions(xrplKyi);

function rippledError(error: unknown) {
  return error instanceof RippledError
    ? (error.data as { error?: string; ledger_index?: number } | undefined)
    : undefined;
}

type SignerCheck = (signerAddress: string) => Promise<void>;

/** Reads an account as of the moment: data is null when it does not exist there, the read is undefined when the server cannot answer (the reason is already on the trail). */
async function accountAt(
  t: CheckTrail,
  caip2: ChainId,
  account: string,
  at: KyiInstant,
  options: KyiCheckOptions,
  withSignerLists = false,
): Promise<AccountRead | undefined> {
  t.via = "rpc";
  try {
    return await inSession(options, async (connections) => {
      if (at.time === "now") {
        const read = await connections.account(
          caip2,
          account,
          options,
          "validated",
          withSignerLists,
        );
        if (read.ledger !== undefined) t.position = { ledger: read.ledger };
        return read;
      }
      const closed = await connections.ledgerAt(caip2, options, at.time);
      if (!closed) {
        t.skip("chain has no ledger at or before this moment");
        return undefined;
      }
      t.position = {
        ledger: closed.index,
        time: new Date(closed.closedAt).toISOString(),
      };
      return connections.account(
        caip2,
        account,
        options,
        closed.index,
        withSignerLists,
      );
    });
  } catch (error) {
    if (error instanceof MissingLedger && error.index !== "validated") {
      t.skip(error.message);
      return undefined;
    }
    throw error;
  }
}

async function checkProof(
  verification: KyiVerification,
  _token: KyiToken,
): Promise<CheckResult> {
  const t = new CheckTrail();
  checkWalletBacksAuthority(t, verification);
  await checkMethod(t, verification.wallet_address, verification.method);
  return t.result();
}

async function checkVerificationAt(
  { wallet_address: wallet, method }: KyiVerification,
  token: KyiToken,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail();
  await checkMethod(t, wallet, method, async (signerAddress) => {
    const read = await accountAt(t, token.caip2, wallet, at, options, true);
    if (read === undefined) return;
    const { data, signerLists } = read;
    const masterEnabled =
      signerAddress === wallet &&
      !((data?.Flags ?? 0) & LedgerEntry.AccountRootFlags.lsfDisableMaster);
    const authorised =
      data !== null && (masterEnabled || data.RegularKey === signerAddress);
    if (!authorised && signerAddress !== wallet && signerLists > 0) {
      return t.skip("XRPL signer lists are not supported");
    }
    t.check("signer key was authorised for the wallet", authorised);
  });
  return t.result();
}

async function checkMethod(
  t: CheckTrail,
  wallet: string,
  method: KyiVerificationMethod,
  checkSigner?: SignerCheck,
): Promise<void> {
  switch (method.type) {
    case "signature":
      return checkSignature(t, wallet, method, checkSigner);
    case "admin_manual":
      return t.skip("admin_manual is not part of the public trust model");
    default:
      return t.skip(`${kyiMethodLabel(method)} is not supported on XRPL`);
  }
}

async function checkSignature(
  t: CheckTrail,
  wallet: string,
  { scheme, message, signature, signer_public_key }: KyiSignatureMethod,
  checkSigner?: SignerCheck,
): Promise<void> {
  if (!message || !signature) return t.skip("proof material missing");
  if (scheme !== null && scheme !== "xrpl") {
    return t.skip(`signature:${scheme} is not supported on XRPL`);
  }
  if (!signer_public_key) return t.skip("signer public key not recorded");

  const key = signer_public_key.toUpperCase();
  const signedByKey = verify(convertStringToHex(message), signature, key);
  if (!t.check("xrpl signature verifies for signer key", signedByKey)) return;

  const signerAddress = deriveAddress(key);
  if (checkSigner) {
    await checkSigner(signerAddress);
  } else if (signerAddress === wallet) {
    t.check("signer key is the wallet's master key", true);
  } else {
    t.skip("signer is not the master key; online check needed");
  }
}

async function checkAuthorityAt(
  authority: KyiAuthority,
  token: KyiToken,
  at: KyiInstant,
  options: KyiCheckOptions,
): Promise<CheckResult> {
  const t = new CheckTrail();
  if (authority.account_type === "multisig") {
    t.skip("XRPL multisig is not supported");
  } else if (authority.type !== "issuer") {
    t.skip(`no XRPL check for ${authority.type}`);
  } else {
    const issuer = token.address.slice(token.address.lastIndexOf(".") + 1);
    if (!issuer || !token.address.includes(".")) {
      throw new Error(`Malformed XRPL token address: ${token.address}`);
    }
    if (!t.address("issuer matches the token", authority.address, issuer)) {
      return t.result();
    }
    const read = await accountAt(t, token.caip2, issuer, at, options);
    if (read !== undefined) {
      t.check("issuer account exists", read.data !== null);
    }
  }
  return t.result();
}
