import { type CheckResult, CheckTrail } from "@bluprynt/sdk-core";
import { contexts as credentialsContexts } from "@digitalbazaar/credentials-context";
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import { contexts as dataIntegrityContexts } from "@digitalbazaar/data-integrity-context";
import { createVerifyCryptosuite } from "@digitalbazaar/ecdsa-jcs-2019-cryptosuite";
import { contexts as multikeyContexts } from "@digitalbazaar/multikey-context";
import * as vc from "@digitalbazaar/vc";
import { Resolver } from "did-resolver";
import { getResolver } from "web-did-resolver";

export const BLUPRYNT_ISSUER = "did:web:registry.bluprynt.com";

export interface VerifyCredentialOptions {
  /** Issuer DIDs to accept; defaults to Bluprynt's. */
  issuers?: string[];
  /** Returns the DID document, or null when it can't be resolved; defaults to `did:web` over HTTPS. */
  resolveDid?: (did: string) => Promise<unknown>;
  /** Moment `validFrom` / `validUntil` are checked against; defaults to now. */
  now?: Date;
}

interface DidDocument {
  verificationMethod?: { id: string }[];
}

const contexts = new Map<string, unknown>([
  ...credentialsContexts,
  ...dataIntegrityContexts,
  ...multikeyContexts,
]);

const loaded = (url: string, document: unknown) => ({
  contextUrl: null,
  documentUrl: url,
  document,
});

/** Serves bundled JSON-LD contexts only, so verifying never fetches a context. */
export const documentLoader = async (url: string) => {
  if (!contexts.has(url)) throw new Error(`Refusing to load ${url}`);
  return loaded(url, contexts.get(url));
};

const webResolver = new Resolver(getResolver());

async function resolveDidWeb(did: string): Promise<unknown> {
  const { didDocument } = await webResolver.resolve(did);
  return didDocument;
}

function didLoader(resolveDid: (did: string) => Promise<unknown>) {
  return async (url: string) => {
    if (!url.startsWith("did:")) return documentLoader(url);
    const [did = url] = url.split("#");
    const document = (await resolveDid(did)) as DidDocument | null;
    if (!document) throw new Error(`Could not resolve ${did}`);
    if (did === url) return loaded(url, document);
    const method = document.verificationMethod?.find((m) => m.id === url);
    if (!method) throw new Error(`${did} has no verification method ${url}`);
    return loaded(url, {
      "@context": "https://w3id.org/security/multikey/v1",
      ...method,
    });
  };
}

const issuerOf = (credential: Record<string, unknown>) => {
  const { issuer } = credential;
  return typeof issuer === "object" && issuer !== null
    ? (issuer as { id?: unknown }).id
    : issuer;
};

/** Whether a VC from IPFS was really published by an accepted issuer: well-formed, and signed by that issuer's assertion key. */
export async function verifyCredential(
  credential: Record<string, unknown>,
  {
    issuers = [BLUPRYNT_ISSUER],
    resolveDid = resolveDidWeb,
    now = new Date(),
  }: VerifyCredentialOptions = {},
): Promise<CheckResult> {
  const t = new CheckTrail();

  let shapeError: unknown;
  try {
    vc._checkCredential({ credential, now });
  } catch (error) {
    shapeError = error;
  }
  if (
    !t.check(
      "credential is well-formed",
      !shapeError,
      undefined,
      shapeError instanceof Error ? shapeError.message : undefined,
    )
  ) {
    return t.result();
  }

  const issuer = issuerOf(credential);
  if (
    !t.check(
      "issuer is accepted",
      typeof issuer === "string" && issuers.includes(issuer),
      issuers,
      issuer,
    )
  ) {
    return t.result();
  }

  t.via = "web";
  let unresolved: string | undefined;
  const resolved = new Map<string, Promise<unknown>>();
  const { verified, error } = await vc.verifyCredential({
    credential,
    suite: new DataIntegrityProof({ cryptosuite: createVerifyCryptosuite() }),
    documentLoader: didLoader(async (did) => {
      if (!resolved.has(did)) {
        resolved.set(
          did,
          resolveDid(did).catch(() => null),
        );
      }
      const document = await resolved.get(did);
      if (!document) unresolved = did;
      return document;
    }),
    now,
    checkStatus: async () => ({ verified: true }),
  });
  if (unresolved) {
    t.skip(`could not resolve ${unresolved}`);
    return t.result();
  }
  t.check(
    "proof verifies",
    verified,
    undefined,
    error instanceof Error ? error.message : undefined,
  );

  if (credential.credentialStatus) t.skip("credentialStatus not checked");
  return t.result();
}
