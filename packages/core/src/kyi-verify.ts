import type { ChainId } from "./index.js";
import type {
  CheckResult,
  CheckStep,
  ClaimCheck,
  KyiAuthority,
  KyiEvidence,
  KyiMoment,
  KyiPosition,
  KyiReport,
  KyiSummary,
  KyiToken,
  KyiTokenLookup,
  KyiTokenLookupItem,
  KyiTokenReport,
  KyiVerification,
  KyiVerificationMethod,
} from "./kyi.js";

export interface KyiCheckOptions {
  /** RPC endpoints keyed by CAIP-2, e.g. { "eip155:1": "https://…" }. Only needed when `at` is non-empty. */
  rpcUrls?: Record<ChainId, string>;
  /** Moments to read chain state at; none (the default) checks offline only. */
  at?: KyiMoment[];
}

/** A requested moment resolved for one record. */
export interface KyiInstant {
  label: string;
  time: Date | "now";
}

export interface KyiChainChecker {
  /** CAIP-2 namespace this checker handles, e.g. "eip155". */
  namespace: string;
  /** Address equality for this chain; exact match when omitted. */
  sameAddress?: (a: string, b: string) => boolean;
  /** Wraps all checks of one token so a checker can share resources such as connections; `run` takes the options to pass on. */
  session?<T>(
    options: KyiCheckOptions,
    run: (options: KyiCheckOptions) => Promise<T>,
  ): Promise<T>;
  /** Timeless facts only; must not read chain state. */
  checkProof(
    verification: KyiVerification,
    token: KyiToken,
  ): Promise<CheckResult>;
  /** The verification method's chain state at `at`. */
  checkVerificationAt(
    verification: KyiVerification,
    token: KyiToken,
    at: KyiInstant,
    options: KyiCheckOptions,
  ): Promise<CheckResult>;
  checkAuthorityAt(
    authority: KyiAuthority,
    token: KyiToken,
    at: KyiInstant,
    options: KyiCheckOptions,
  ): Promise<CheckResult>;
}

export interface KyiVerifyOptions extends KyiCheckOptions {
  chains: KyiChainChecker[];
}

const plain = (v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export class CheckTrail {
  readonly steps: CheckStep[] = [];
  via: CheckStep["via"] = "offline";
  skipped?: string;
  position?: KyiPosition;

  constructor(
    readonly sameAddress: (a: string, b: string) => boolean = (a, b) => a === b,
  ) {}

  check(check: string, ok: boolean, expected?: unknown, actual?: unknown) {
    this.steps.push({
      check,
      via: this.via,
      ok,
      expected: plain(expected),
      actual: plain(actual),
    });
    return ok;
  }

  address(check: string, expected: string, actual: string | null) {
    return this.check(
      check,
      actual !== null && this.sameAddress(expected, actual),
      expected,
      actual,
    );
  }

  skip(reason: string) {
    this.skipped = reason;
  }

  result(): CheckResult {
    const failed = this.steps.find((s) => !s.ok);
    const status = failed
      ? "invalid"
      : this.skipped || this.steps.length === 0
        ? "unverifiable"
        : "valid";
    const reason = failed ? `${failed.check} failed` : this.skipped;
    return { status, reason, steps: this.steps, position: this.position };
  }
}

export function checkWalletBacksAuthority(
  t: CheckTrail,
  { wallet_address: wallet, authority }: KyiVerification,
): boolean {
  const signers = [authority.address, ...authority.signers];
  return t.check(
    "wallet is the authority or one of its signers",
    signers.some((s) => t.sameAddress(wallet, s)),
    signers,
    wallet,
  );
}

/** null when the record claims verification but the evidence can neither confirm nor refute it. */
function matchesClaim(
  claimed: boolean,
  verified: boolean,
  undecided: boolean,
): boolean | null {
  if (claimed === verified) return true;
  return claimed && undecided ? null : false;
}

const AUTHORITY_LISTED = "verification's authority is listed for the token";

function bindAuthority(
  proof: CheckResult,
  { authority }: KyiVerification,
  listed: KyiAuthority[],
  sameAddress: (a: string, b: string) => boolean,
): CheckResult {
  const ok = listed.some(
    (a) =>
      a.type === authority.type && sameAddress(a.address, authority.address),
  );
  const step: CheckStep = {
    check: AUTHORITY_LISTED,
    via: "offline",
    ok,
    expected: listed.map(({ type, address }) => ({ type, address })),
    actual: { type: authority.type, address: authority.address },
  };
  const steps = [...proof.steps, step];
  return ok
    ? { ...proof, steps }
    : {
        ...proof,
        status: "invalid",
        reason: `${AUTHORITY_LISTED} failed`,
        steps,
      };
}

function parseTime(field: string, value: string): Date {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`Malformed ${field}: ${value}`);
  return new Date(time);
}

function expire(
  result: CheckResult,
  expiresAt: string | null,
  time: Date | "now",
): CheckResult {
  if (!expiresAt || result.status !== "valid") return result;
  const at = time === "now" ? Date.now() : time.getTime();
  if (Date.parse(expiresAt) > at) return result;
  return {
    ...result,
    status: "unverifiable",
    reason: `verification expired at ${expiresAt}`,
  };
}

const severity = { invalid: 0, unverifiable: 1, valid: 2 } as const;

function merge(first: CheckResult, second: CheckResult): CheckResult {
  const decisive =
    severity[second.status] < severity[first.status] ? second : first;
  return {
    status: decisive.status,
    reason: decisive.reason,
    steps: [...first.steps, ...second.steps],
    position: first.position ?? second.position,
  };
}

const momentLabel = (moment: KyiMoment) =>
  moment instanceof Date ? moment.toISOString() : moment;

async function atMoments(
  options: KyiCheckOptions,
  recorded: Date | null,
  run: (at: KyiInstant) => Promise<CheckResult>,
): Promise<Record<string, CheckResult>> {
  const unverifiable = (reason: string): CheckResult => ({
    status: "unverifiable",
    reason,
    steps: [],
  });
  const entries = await Promise.all(
    (options.at ?? []).map(async (moment) => {
      const label = momentLabel(moment);
      if (moment === "now") return [label, await run({ label, time: "now" })];
      const time = moment === "verified" ? recorded : moment;
      if (!time) return [label, unverifiable("no recorded moment")];
      if (recorded && time < recorded) {
        return [label, unverifiable("record postdates this moment")];
      }
      return [label, await run({ label, time })];
    }),
  );
  return Object.fromEntries(entries);
}

async function verificationCheck(
  checker: KyiChainChecker,
  verification: KyiVerification,
  token: KyiToken,
  options: KyiCheckOptions,
  listed?: KyiAuthority[],
): Promise<ClaimCheck> {
  const { verified_at, expires_at, authority, method } = verification;
  const recorded = parseTime("verified_at", verified_at);
  if (expires_at) parseTime("expires_at", expires_at);

  const own = await checker.checkProof(verification, token);
  const proof = listed
    ? bindAuthority(
        own,
        verification,
        listed,
        checker.sameAddress ?? ((a, b) => a === b),
      )
    : own;
  const at = await atMoments(options, recorded, async (instant) => {
    const [state, held] = await Promise.all([
      checker.checkVerificationAt(verification, token, instant, options),
      checker.checkAuthorityAt(authority, token, instant, options),
    ]);
    return expire(merge(state, held), expires_at, instant.time);
  });
  return {
    kind: "verification",
    subject: verification.wallet_address,
    method: kyiMethodLabel(method),
    proof,
    at:
      proof.status === "invalid"
        ? Object.fromEntries(
            Object.entries(at).map(([label, result]) => [
              label,
              { ...result, status: "invalid", reason: proof.reason },
            ]),
          )
        : at,
  };
}

async function authorityCheck(
  checker: KyiChainChecker,
  authority: KyiAuthority,
  token: KyiToken,
  options: KyiCheckOptions,
): Promise<ClaimCheck> {
  const recorded = authority.observed_at
    ? parseTime("observed_at", authority.observed_at)
    : null;
  return {
    kind: "authority",
    subject: authority.address,
    method: authority.type,
    at: await atMoments(options, recorded, (instant) =>
      checker.checkAuthorityAt(authority, token, instant, options),
    ),
  };
}

function inSession<T>(
  checker: KyiChainChecker,
  options: KyiCheckOptions,
  run: (options: KyiCheckOptions) => Promise<T>,
): Promise<T> {
  return checker.session ? checker.session(options, run) : run(options);
}

function evidenceOf(
  results: { kind: ClaimCheck["kind"]; status: CheckResult["status"] }[],
): KyiEvidence {
  return results.some((r) => r.status === "invalid")
    ? "contradicted"
    : results.some((r) => r.kind === "verification" && r.status === "valid")
      ? "confirmed"
      : "inconclusive";
}

function tokenSummary(claimed: boolean, evidence: KyiEvidence): KyiSummary {
  const verified = evidence === "confirmed";
  return {
    evidence,
    verified,
    matchesClaim: matchesClaim(claimed, verified, evidence === "inconclusive"),
  };
}

function responseSummary(claimed: boolean, tokens: KyiSummary[]): KyiSummary {
  const evidence = tokens.some((t) => t.evidence === "confirmed")
    ? "confirmed"
    : tokens.some((t) => t.evidence === "contradicted")
      ? "contradicted"
      : "inconclusive";
  const verified = evidence === "confirmed";
  return {
    evidence,
    verified,
    matchesClaim: matchesClaim(claimed, verified, evidence === "inconclusive"),
  };
}

function checkerFor(
  token: KyiToken,
  chains: KyiChainChecker[],
): KyiChainChecker {
  const namespace = token.caip2.split(":")[0];
  const checker = chains.find((c) => c.namespace === namespace);
  if (!checker) throw new Error(`No KYI checker for namespace ${namespace}`);
  return checker;
}

/** Feed a `GET /kyi/v1/tokens` response; independently re-check every claim in it. */
export async function verifyKyiResponse(
  response: KyiTokenLookup,
  options: KyiVerifyOptions,
): Promise<KyiReport> {
  const tokens = await Promise.all(
    response.data.map((item) => verifyKyiToken(item, options)),
  );
  const claimed = response.kyi_verified;
  const labels = (options.at ?? []).map(momentLabel);
  return {
    claimed,
    ...responseSummary(claimed, tokens),
    tokens,
    at: Object.fromEntries(
      labels.map((label) => [
        label,
        responseSummary(
          claimed,
          tokens.flatMap((t) => t.at[label] ?? []),
        ),
      ]),
    ),
  };
}

export async function verifyKyiToken(
  item: KyiTokenLookupItem,
  { chains, ...options }: KyiVerifyOptions,
): Promise<KyiTokenReport> {
  const { token } = item;
  const checker = checkerFor(token, chains);
  const checks = await inSession(checker, options, (opts) =>
    Promise.all([
      ...item.verifications.map((v) =>
        verificationCheck(checker, v, token, opts, item.authorities),
      ),
      ...item.authorities.map((a) => authorityCheck(checker, a, token, opts)),
    ]),
  );
  const claimed = item.kyi_verified;
  const labels = (options.at ?? []).map(momentLabel);
  return {
    caip19: token.caip19,
    claimed,
    ...tokenSummary(
      claimed,
      evidenceOf(
        checks.flatMap((c) =>
          c.proof ? [{ kind: c.kind, status: c.proof.status }] : [],
        ),
      ),
    ),
    checks,
    at: Object.fromEntries(
      labels.map((label) => [
        label,
        tokenSummary(
          claimed,
          evidenceOf(
            checks.flatMap((c) => {
              const result = c.at[label];
              return result ? [{ kind: c.kind, status: result.status }] : [];
            }),
          ),
        ),
      ]),
    ),
  };
}

export function kyiMethodLabel(method: KyiVerificationMethod): string {
  switch (method.type) {
    case "signature":
      return `signature:${method.scheme ?? "unrecorded"}`;
    case "contract_signature":
      return `contract_signature:${method.scheme}/${method.inner_scheme}`;
    case "transfer":
      return `transfer:${method.kind}`;
    case "admin_manual":
      return "admin_manual";
  }
}

export function kyiRpcUrl(caip2: ChainId, options: KyiCheckOptions): string {
  const url = options.rpcUrls?.[caip2];
  if (!url) throw new Error(`RPC not configured for ${caip2}`);
  return url;
}

export function kyiChainFunctions(checker: KyiChainChecker) {
  return {
    verifyKyiResponse: (
      response: KyiTokenLookup,
      options: KyiCheckOptions = {},
    ): Promise<KyiReport> =>
      verifyKyiResponse(response, { ...options, chains: [checker] }),
    verifyKyiToken: (
      item: KyiTokenLookupItem,
      options: KyiCheckOptions = {},
    ): Promise<KyiTokenReport> =>
      verifyKyiToken(item, { ...options, chains: [checker] }),
    /** One verification without the token's authority binding. */
    checkKyiVerification: (
      verification: KyiVerification,
      token: KyiToken,
      options: KyiCheckOptions = {},
    ): Promise<ClaimCheck> =>
      inSession(checker, options, (opts) =>
        verificationCheck(checker, verification, token, opts),
      ),
    checkKyiAuthority: (
      authority: KyiAuthority,
      token: KyiToken,
      options: KyiCheckOptions = {},
    ): Promise<ClaimCheck> =>
      inSession(checker, options, (opts) =>
        authorityCheck(checker, authority, token, opts),
      ),
  };
}
