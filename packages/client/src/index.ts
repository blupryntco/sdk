import { type Credential, parseCredential } from "@bluprynt/sdk-core";

// Uses the global fetch (Node >=22) — no http client dependency.

export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface BlueprintClient {
  getCredential(id: string): Promise<Credential>;
}

export function createClient(opts: ClientOptions): BlueprintClient {
  const doFetch = opts.fetch ?? fetch;
  const headers = opts.apiKey
    ? { authorization: `Bearer ${opts.apiKey}` }
    : undefined;

  return {
    async getCredential(id) {
      const res = await doFetch(
        `${opts.baseUrl}/credentials/${encodeURIComponent(id)}`,
        {
          headers,
        },
      );
      if (!res.ok) {
        throw new Error(
          `getCredential(${id}) failed: ${res.status} ${res.statusText}`,
        );
      }
      return parseCredential(await res.json());
    },
  };
}
