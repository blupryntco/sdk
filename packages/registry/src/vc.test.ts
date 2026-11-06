import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import { createSignCryptosuite } from "@digitalbazaar/ecdsa-jcs-2019-cryptosuite";
import * as EcdsaMultikey from "@digitalbazaar/ecdsa-multikey";
import * as vc from "@digitalbazaar/vc";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { documentLoader, verifyCredential } from "./vc.js";

const ISSUER = "did:web:registry.bluprynt.com";
const KEY_ID = `${ISSUER}#key-1`;

const unsigned = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "did:web:registry.bluprynt.com:credentials:01JE2B9TWN4R",
  type: ["VerifiableCredential", "DisclosureCredential"],
  issuer: ISSUER,
  validFrom: "2026-07-01T00:00:00Z",
  credentialSubject: {
    id: "did:web:registry.bluprynt.com:identities:0xabc",
    regime: "MiCA",
    jurisdiction: "EU",
  },
};

function didDocument(
  did: string,
  key: EcdsaMultikey.KeyPair,
  { assert = true } = {},
) {
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: key.id,
        type: "Multikey",
        controller: did,
        publicKeyMultibase: key.publicKeyMultibase,
      },
    ],
    assertionMethod: assert ? [key.id] : [],
  };
}

async function sign(
  key: EcdsaMultikey.KeyPair,
  credential: Record<string, unknown> = unsigned,
) {
  const suite = new DataIntegrityProof({
    signer: key.signer(),
    cryptosuite: createSignCryptosuite(),
  });
  return vc.issue({
    credential: structuredClone(credential),
    suite,
    documentLoader,
  });
}

const resolveFrom =
  (documents: Record<string, unknown>) => async (did: string) =>
    documents[did] ?? null;

let key: EcdsaMultikey.KeyPair;
let signed: Record<string, unknown>;
let resolveDid: (did: string) => Promise<unknown>;

beforeAll(async () => {
  key = await EcdsaMultikey.generate({
    curve: "P-256",
    id: KEY_ID,
    controller: ISSUER,
  });
  signed = await sign(key);
  resolveDid = resolveFrom({ [ISSUER]: didDocument(ISSUER, key) });
});

describe("verifyCredential", () => {
  it("accepts a VC signed by the issuer's assertion key", async () => {
    const result = await verifyCredential(signed, { resolveDid });

    expect(result.status).toBe("valid");
  });

  it("rejects a VC whose claims changed after signing", async () => {
    const tampered = structuredClone(signed);
    (tampered.credentialSubject as Record<string, unknown>).regime = "SEC";

    const result = await verifyCredential(tampered, { resolveDid });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("proof verifies failed");
  });

  it("rejects a VC signed by a key the issuer doesn't list", async () => {
    const other = await EcdsaMultikey.generate({
      curve: "P-256",
      id: KEY_ID,
      controller: ISSUER,
    });

    const result = await verifyCredential(await sign(other), { resolveDid });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("proof verifies failed");
  });

  it("rejects a key the issuer lists but not for assertions", async () => {
    const result = await verifyCredential(signed, {
      resolveDid: resolveFrom({
        [ISSUER]: didDocument(ISSUER, key, { assert: false }),
      }),
    });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("proof verifies failed");
  });

  it("rejects an issuer that isn't accepted", async () => {
    const result = await verifyCredential(signed, {
      resolveDid,
      issuers: ["did:web:registry-sandbox.bluprynt.com"],
    });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("issuer is accepted failed");
  });

  it("rejects something that isn't a VC", async () => {
    const { type: _, ...untyped } = signed;

    const result = await verifyCredential(untyped, { resolveDid });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("credential is well-formed failed");
  });

  it("rejects a VC past its validUntil", async () => {
    const expiring = await sign(key, {
      ...unsigned,
      validUntil: "2026-08-01T00:00:00Z",
    });

    const result = await verifyCredential(expiring, {
      resolveDid,
      now: new Date("2026-09-01T00:00:00Z"),
    });

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("credential is well-formed failed");
  });

  it("resolves the issuer over did:web by default", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return Response.json(didDocument(ISSUER, key));
    });

    try {
      const result = await verifyCredential(signed);

      expect(result.status).toBe("valid");
      expect(fetched).toEqual([
        "https://registry.bluprynt.com/.well-known/did.json",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("can't vouch for a VC whose issuer DID doesn't resolve", async () => {
    const result = await verifyCredential(signed, {
      resolveDid: async () => null,
    });

    expect(result.status).toBe("unverifiable");
  });

  it("can't vouch for status it doesn't check", async () => {
    const withStatus = await sign(key, {
      ...unsigned,
      credentialStatus: {
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "4211",
        statusListCredential: "https://registry.bluprynt.com/status/eu-1",
      },
    });

    const result = await verifyCredential(withStatus, { resolveDid });

    expect(result.status).toBe("unverifiable");
    expect(result.reason).toBe("credentialStatus not checked");
  });
});
