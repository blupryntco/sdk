import type { KyiTokenLookup } from "@bluprynt/sdk-core";
import { createClient as createFetchClient } from "./generated/client";
import {
  badgesGetBadge,
  kyiLookupTokens,
  referenceGetChain,
  referenceListChains,
} from "./generated/sdk.gen";
import type {
  BadgesGetBadgeData,
  ReferenceChain,
  ReferenceChainList,
} from "./generated/types.gen";

export type { ReferenceChain, ReferenceChainList };

export const DEFAULT_BASE_URL = "https://integrations.bluprynt.com";

export interface ClientOptions {
  /** Sent verbatim in the `Authorization` header. */
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type TokenLookupQuery =
  | { caip19: string }
  | { address: string; chain_slug?: string };

export type BadgeCredentialType = BadgesGetBadgeData["path"]["credential_type"];
export type BadgeOptions = NonNullable<BadgesGetBadgeData["query"]>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Bluprynt API responded ${status}`);
    this.name = "ApiError";
  }
}

export interface BlupryntClient {
  /** `GET /kyi/v1/tokens`. A token Bluprynt hasn't indexed gives `{ kyi_verified: false, data: [] }`. */
  lookupTokens(query: TokenLookupQuery): Promise<KyiTokenLookup>;
  /** `GET /reference/v1/chains`. Changes rarely; cache it. */
  listChains(): Promise<ReferenceChainList>;
  /** `GET /reference/v1/chains/{caip2}`. `undefined` for a CAIP-2 id Bluprynt doesn't know. */
  getChain(caip2: string): Promise<ReferenceChain | undefined>;
  /** `GET /api/v1/badges/{credential_type}`. */
  getBadge(type: BadgeCredentialType, options?: BadgeOptions): Promise<Blob>;
}

async function unwrap<T, N = never>(
  call: Promise<{ data?: T; error?: unknown; response?: Response }>,
  notFound?: () => N,
): Promise<T | N> {
  const { data, error, response } = await call;
  if (!response) throw error;
  if (response.ok) return data as T;
  if (response.status === 404 && notFound) return notFound();
  throw new ApiError(response.status, error);
}

export function createClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetch,
}: ClientOptions): BlupryntClient {
  const client = createFetchClient({ baseUrl, fetch, auth: apiKey });

  return {
    lookupTokens: (query) =>
      unwrap(kyiLookupTokens({ client, query }), () => ({
        kyi_verified: false,
        data: [],
      })),
    listChains: () => unwrap(referenceListChains({ client })),
    getChain: (caip2) =>
      unwrap(referenceGetChain({ client, path: { caip2 } }), () => undefined),
    getBadge: (type, options) =>
      unwrap(
        badgesGetBadge({
          client,
          path: { credential_type: type },
          query: options,
          parseAs: "blob",
        }),
      ),
  };
}
