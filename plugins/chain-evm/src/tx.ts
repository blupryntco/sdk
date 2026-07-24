// @bluprynt/sdk-chain-evm/tx — transaction helpers (subpath capability).

export interface EvmTxRequest {
  to: string;
  value?: bigint;
  data?: string;
}

export function encodeTx(req: EvmTxRequest): EvmTxRequest {
  return req;
}
