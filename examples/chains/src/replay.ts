import { Client } from "xrpl";

export interface Recorded {
  request: unknown;
  response: unknown;
}

function recorded(records: Recorded[], request: unknown): unknown {
  const key = JSON.stringify(request);
  const found = records.find((r) => JSON.stringify(r.request) === key);
  if (!found) throw new Error(`No recorded response for ${key}`);
  return found.response;
}

// Swaps the global fetch, so two replays must never run concurrently.
export async function withRecordedFetch<T>(
  records: Recorded[],
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (Array.isArray(body)) {
      throw new Error("Batched JSON-RPC requests are not recorded");
    }
    const { id, method, params } = body;
    const result = recorded(records, { method, params });
    return Response.json({ jsonrpc: "2.0", id, result });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

export function recordedXrplClient(records: Recorded[]) {
  return (url: string): Client =>
    Object.assign(new Client(url), {
      connect: async () => {},
      disconnect: async () => {},
      request: async (request: unknown) => recorded(records, request),
    });
}
