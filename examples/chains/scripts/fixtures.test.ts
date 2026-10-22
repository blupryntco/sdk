import { writeFileSync } from "node:fs";
import {
  createKeyPairFromPrivateKeyBytes,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase64Decoder,
} from "@solana/kit";
import { deriveAddress, deriveKeypair } from "ripple-keypairs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  keccak256,
  numberToHex,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { it, vi } from "vitest";
import { Client, unixTimeToRippleTime } from "xrpl";

interface JsonRpcRequest {
  method: string;
  params: unknown[];
}

interface RippledRequest {
  command: string;
  ledger_index?: number | "validated";
  signer_lists?: boolean;
}

const recording = vi.hoisted(() => ({
  respond: (_request: never): unknown => {
    throw new Error("no responder set");
  },
  records: [] as { request: unknown; response: unknown }[],
}));

function record(request: unknown) {
  const response = recording.respond(request as never);
  const key = JSON.stringify(request);
  if (!recording.records.some((r) => JSON.stringify(r.request) === key)) {
    recording.records.push({ request, response });
  }
  return response;
}

vi.mock("../src/replay.ts", () => ({
  withRecordedFetch: async <T>(_records: unknown, run: () => Promise<T>) => {
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const { id, method, params } = JSON.parse(String(init?.body));
      return Response.json({
        jsonrpc: "2.0",
        id,
        result: record({ method, params }),
      });
    };
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  },
  recordedXrplClient: () => (url: string) =>
    Object.assign(new Client(url), {
      connect: async () => {},
      disconnect: async () => {},
      request: async (request: unknown) => record(request),
    }),
}));

function write(name: string, synthetic: string) {
  writeFileSync(
    new URL(`../src/fixtures/${name}.json`, import.meta.url),
    `${JSON.stringify({ synthetic, records: recording.records }, null, 2)}\n`,
  );
  recording.records = [];
}

const synthetic = (label: string) => keccak256(toHex(`synthetic ${label}`));

it("evm-safe", async () => {
  const latest = 9_480_000n;
  const latestTime = Date.parse("2026-10-20T15:00:00Z");
  const ownersSwappedAt = Date.parse("2026-08-03T10:00:00Z");
  const timestamp = (n: bigint) =>
    BigInt(latestTime / 1000) - 12n * (latest - n);
  const swapBlock =
    latest - BigInt(Math.floor((latestTime - ownersSwappedAt) / 12_000));
  const safe = getAddress("0x5afe00000000000000000000000000000000a11c");
  const [a, b, c, d] = ["11", "22", "33", "44"].map(
    (byte) => privateKeyToAccount(`0x${byte.repeat(32)}`).address,
  );
  const abi = parseAbi([
    "function getOwners() view returns (address[])",
    "function getThreshold() view returns (uint256)",
    "function owner() view returns (address)",
  ]);
  const blockNumber = (tag: unknown) =>
    tag === "latest" ? latest : BigInt(String(tag));

  recording.respond = ({ method, params }: JsonRpcRequest) => {
    if (method === "eth_getBlockByNumber") {
      const n = blockNumber(params[0]);
      return {
        baseFeePerGas: numberToHex(1_000_000_000n + (n % 977n) * 1_000_000n),
        difficulty: "0x0",
        extraData: toHex("synthetic"),
        gasLimit: numberToHex(36_000_000n),
        gasUsed: numberToHex(12_000_000n + (n % 1_000n) * 9_000n),
        hash: synthetic(`block ${n}`),
        logsBloom: `0x${"00".repeat(256)}`,
        miner: "0x0000000000000000000000000000000000000000",
        mixHash: synthetic(`mix ${n}`),
        nonce: "0x0000000000000000",
        number: numberToHex(n),
        parentHash: synthetic(`block ${n - 1n}`),
        receiptsRoot: synthetic(`receipts ${n}`),
        sha3Uncles:
          "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
        size: numberToHex(3_000n + (n % 500n)),
        stateRoot: synthetic(`state ${n}`),
        timestamp: numberToHex(timestamp(n)),
        transactions: [],
        transactionsRoot: synthetic(`txs ${n}`),
        uncles: [],
        withdrawals: [],
        withdrawalsRoot: synthetic(`withdrawals ${n}`),
      };
    }
    if (method === "eth_call") {
      const [call, tag] = params as [{ data: Hex }, string];
      const n = blockNumber(tag);
      const { functionName } = decodeFunctionData({ abi, data: call.data });
      switch (functionName) {
        case "getOwners":
          return encodeFunctionResult({
            abi,
            functionName,
            result: n >= swapBlock ? [a, b, d] : [a, b, c],
          } as never);
        case "getThreshold":
          return encodeFunctionResult({ abi, functionName, result: 2n });
        case "owner":
          return encodeFunctionResult({ abi, functionName, result: safe });
      }
    }
    throw new Error(`unexpected ${method}`);
  };
  const { run } = await import("../src/evm-safe.ts");
  await run();
  write(
    "evm-safe",
    "Synthetic Sepolia responses for a made-up ERC-20 owned by a made-up 2-of-3 Safe, whose third owner was swapped after the verification. Not a real chain.",
  );
});

it("xrpl-rotated", async () => {
  const latest = 99_204_000;
  const first = 99_201_000;
  const latestTime = Date.parse("2026-10-20T14:05:00Z");
  const closeMs = (n: number) =>
    latestTime - Math.round((latest - n) * 3.9) * 1000;
  let rotatedAt = latest;
  while (closeMs(rotatedAt - 1) >= Date.parse("2026-10-20T12:40:00Z")) {
    rotatedAt--;
  }
  const address = (seed: string) =>
    deriveAddress(deriveKeypair(seed).publicKey);
  const issuer = address("sEdSKaVGtEer9RrxMSMhFM2WVSW5LT3");
  const regular = address("sp5vYGGekvDhXJSn6f7oPdcjheQXW");
  const hash = (label: string) => synthetic(label).slice(2).toUpperCase();
  const ledgerOf = (index: RippledRequest["ledger_index"]) =>
    index === "validated" || index === undefined ? latest : index;
  const lsfDefaultRipple = 0x00800000;
  const lsfDisableMaster = 0x00100000;

  recording.respond = (req: RippledRequest) => {
    if (req.command === "server_info") {
      return {
        result: {
          info: {
            build_version: "2.6.1",
            complete_ledgers: `${first}-${latest}`,
            server_state: "full",
            validated_ledger: {
              seq: latest,
              hash: hash(`ledger ${latest}`),
              age: 2,
            },
          },
          status: "success",
        },
        type: "response",
      };
    }
    const n = ledgerOf(req.ledger_index);
    if (req.command === "ledger") {
      const close = new Date(closeMs(n));
      return {
        result: {
          ledger: {
            account_hash: hash(`accounts ${n}`),
            close_flags: 0,
            close_time: unixTimeToRippleTime(close.getTime()),
            close_time_human: close
              .toISOString()
              .replace("T", " ")
              .replace(".000Z", ".000000000 UTC"),
            close_time_iso: close.toISOString().replace(".000Z", "Z"),
            close_time_resolution: 10,
            closed: true,
            ledger_hash: hash(`ledger ${n}`),
            ledger_index: n,
            parent_close_time: unixTimeToRippleTime(closeMs(n - 1)),
            parent_hash: hash(`ledger ${n - 1}`),
            total_coins: "99985687626634189",
            transaction_hash: hash(`transactions ${n}`),
          },
          ledger_hash: hash(`ledger ${n}`),
          ledger_index: n,
          status: "success",
          validated: true,
        },
        type: "response",
      };
    }
    if (req.command === "account_info") {
      const rotated = n >= rotatedAt;
      return {
        result: {
          account_data: {
            Account: issuer,
            Balance: "48750000",
            Flags: lsfDefaultRipple | (rotated ? lsfDisableMaster : 0),
            LedgerEntryType: "AccountRoot",
            OwnerCount: 3,
            PreviousTxnID: hash(rotated ? "disable master" : "trust lines"),
            PreviousTxnLgrSeq: rotated ? rotatedAt : first - 812_400,
            ...(rotated && { RegularKey: regular }),
            Sequence: rotated ? 98_765_437 : 98_765_435,
            index: hash(`account root ${issuer}`),
          },
          account_flags: {
            allowTrustLineClawback: false,
            defaultRipple: true,
            depositAuth: false,
            disableMasterKey: rotated,
            disallowIncomingCheck: false,
            disallowIncomingNFTokenOffer: false,
            disallowIncomingPayChan: false,
            disallowIncomingTrustline: false,
            disallowIncomingXRP: false,
            globalFreeze: false,
            noFreeze: false,
            passwordSpent: false,
            requireAuthorization: false,
            requireDestinationTag: false,
          },
          ...(req.signer_lists && { signer_lists: [] }),
          ledger_index: n,
          status: "success",
          validated: true,
        },
        type: "response",
      };
    }
    throw new Error(`unexpected ${req.command}`);
  };
  const { run } = await import("../src/xrpl-rotated.ts");
  await run();
  write(
    "xrpl-rotated",
    `Synthetic rippled responses for a test-seed issuer that set a regular key and disabled its master key at ledger ${rotatedAt}. Not a real network.`,
  );
});

it("solana-now", async () => {
  const addressOf = async (fill: number) =>
    getAddressFromPublicKey(
      (await createKeyPairFromPrivateKeyBytes(new Uint8Array(32).fill(fill)))
        .publicKey,
    );
  const wallet = await addressOf(1);
  const kept = await addressOf(2);
  const handedOver = await addressOf(3);
  const newAuthority = await addressOf(4);
  const mintData = (authority: typeof wallet, supply: bigint) => {
    const data = new Uint8Array(82);
    const view = new DataView(data.buffer);
    view.setUint32(0, 1, true);
    data.set(getAddressEncoder().encode(authority), 4);
    view.setBigUint64(36, supply, true);
    data[44] = 6;
    data[45] = 1;
    return getBase64Decoder().decode(data);
  };
  const accounts = {
    [kept]: {
      slot: 412_345_678,
      data: mintData(wallet, 1_000_000_000_000n),
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    },
    [handedOver]: {
      slot: 412_345_679,
      data: mintData(newAuthority, 250_000_000_000n),
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    },
  };

  recording.respond = ({ method, params }: JsonRpcRequest) => {
    const account = accounts[String(params[0])];
    if (method !== "getAccountInfo" || !account) {
      throw new Error(`unexpected ${method} ${params[0]}`);
    }
    return {
      context: { apiVersion: "3.0.6", slot: account.slot },
      value: {
        data: [account.data, "base64"],
        executable: false,
        lamports: 1_461_600,
        owner: account.owner,
        rentEpoch: 0,
        space: 82,
      },
    };
  };
  const { run } = await import("../src/solana-now.ts");
  await run();
  write(
    "solana-now",
    "Synthetic Solana RPC responses for two made-up mints: a Token-2022 mint whose mint authority is still the test wallet, and an SPL mint whose mint authority was handed to another test key. Not a real cluster.",
  );
});
