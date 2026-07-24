// @bluprynt/sdk-core — types, credential data models, and schema parsing. Zero runtime deps.

/** CAIP-2 style chain identifier, e.g. "eip155:1", "solana:mainnet". */
export type ChainId = string;

export * from "./wallet-verification.js";

export interface Credential {
  id: string;
  issuer: string;
  subject: string;
  type: string[];
  issuedAt: string;
  claims: Record<string, unknown>;
}

export class SchemaError extends Error {}

const REQUIRED = ["id", "issuer", "subject", "issuedAt"] as const;

/** Validate an unknown value into a Credential, throwing SchemaError on mismatch. */
export function parseCredential(input: unknown): Credential {
  if (typeof input !== "object" || input === null) {
    throw new SchemaError("credential must be an object");
  }
  const c = input as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (typeof c[key] !== "string") {
      throw new SchemaError(`credential.${key} must be a string`);
    }
  }
  if (!Array.isArray(c.type) || !c.type.every((t) => typeof t === "string")) {
    throw new SchemaError("credential.type must be a string[]");
  }
  if (typeof c.claims !== "object" || c.claims === null) {
    throw new SchemaError("credential.claims must be an object");
  }
  return c as unknown as Credential;
}
