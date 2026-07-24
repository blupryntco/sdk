import { describe, expect, it } from "vitest";
import { parseCredential, SchemaError } from "./index.js";

const valid = {
  id: "urn:cred:1",
  issuer: "did:example:issuer",
  subject: "did:example:subject",
  type: ["VerifiableCredential"],
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { name: "Ada" },
};

describe("parseCredential", () => {
  it("accepts a well-formed credential", () => {
    expect(parseCredential(valid).id).toBe("urn:cred:1");
  });

  it("rejects a missing required field", () => {
    const { id, ...missing } = valid;
    expect(() => parseCredential(missing)).toThrow(SchemaError);
  });

  it("rejects a non-string type array", () => {
    expect(() => parseCredential({ ...valid, type: [1] })).toThrow(SchemaError);
  });
});
