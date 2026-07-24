// @bluprynt/sdk-chain-evm/events — log/event helpers (subpath capability).

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
}

export function isEvmLog(x: unknown): x is EvmLog {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as EvmLog).address === "string" &&
    Array.isArray((x as EvmLog).topics)
  );
}
