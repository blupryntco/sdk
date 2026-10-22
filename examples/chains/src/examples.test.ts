import { describe, expect, it } from "vitest";
import { run as evm } from "./evm.js";
import { run as evmSafe } from "./evm-safe.js";
import { run as solana } from "./solana.js";
import { run as solanaNow } from "./solana-now.js";
import { run as xrpl } from "./xrpl.js";
import { run as xrplRotated } from "./xrpl-rotated.js";

describe("evm", () => {
  it("matches its recorded output", async () => {
    await expect(JSON.stringify(await evm(), null, 2)).toMatchFileSnapshot(
      "../output/evm.json",
    );
  });

  it("recovers the Sepolia proof to the wallet, with and without the SDK", async () => {
    const { independent, sdk } = await evm();
    expect(independent.recoversToWallet).toBe(true);
    expect(sdk.report.evidence).toBe("confirmed");
    expect(sdk.report.matchesClaim).toBe(true);
  });

  it("rejects the signature over a tampered message, with and without the SDK", async () => {
    const { independent, sdk } = await evm();
    expect(independent.tamperedMessage.recoversToWallet).toBe(false);
    expect(sdk.tamperedMessage?.status).toBe("invalid");
    expect(sdk.tamperedMessage?.reason).toBe(
      "eip191 signature recovers to wallet failed",
    );
  });
});

describe("evm-safe", () => {
  it("matches its recorded output", async () => {
    await expect(JSON.stringify(await evmSafe(), null, 2)).toMatchFileSnapshot(
      "../output/evm-safe.json",
    );
  });

  it("holds when verified and fails now that the Safe's owners changed", async () => {
    const { report } = await evmSafe();
    const [verification] = report.tokens[0]?.checks ?? [];
    const { verified, now } = verification?.at ?? {};
    expect(verification?.proof?.status).toBe("valid");
    expect(verified?.status).toBe("valid");
    expect(verified?.position?.block).toBe("8124750");
    expect(now?.status).toBe("invalid");
    expect(now?.reason).toBe("Safe owners match claimed signers failed");
    expect(now?.position?.block).toBe("9480000");
    expect(report.at.verified?.evidence).toBe("confirmed");
    expect(report.at.now?.evidence).toBe("contradicted");
  });
});

describe("solana", () => {
  it("matches its recorded output", async () => {
    await expect(JSON.stringify(await solana(), null, 2)).toMatchFileSnapshot(
      "../output/solana.json",
    );
  });

  it("verifies each signature only in the format it was made in", async () => {
    const { independent, sdk } = await solana();
    expect(independent).toEqual({
      rawSignature: { overRawMessage: true, overOffchainMessage: false },
      offchainSignature: { overRawMessage: false, overOffchainMessage: true },
    });
    expect(sdk.report.evidence).toBe("confirmed");
    expect(
      sdk.report.tokens[0]?.checks
        .filter((c) => c.kind === "verification")
        .map((c) => c.proof?.status),
    ).toEqual(["valid", "valid"]);
    expect(sdk.rawSignatureRecordedAsOffchain?.status).toBe("invalid");
    expect(sdk.offchainSignatureRecordedAsRaw?.status).toBe("invalid");
    expect(sdk.offchainSignatureWithoutScheme?.status).toBe("valid");
  });

  it("signs only printable one-line ASCII in the off-chain format", async () => {
    const { messages } = await solana();
    expect(messages.cli).toMatch(/^[\x20-\x7e]+$/);
    expect(messages.wallet).toContain("\n");
  });

  it("starts the legacy off-chain message with the 20-byte header", async () => {
    const { legacyOffchainHeader, messages } = await solana();
    const length = Buffer.alloc(2);
    length.writeUInt16LE(Buffer.byteLength(messages.cli));
    expect(legacyOffchainHeader).toBe(
      Buffer.concat([
        Buffer.from([0xff]),
        Buffer.from("solana offchain"),
        Buffer.from([0, 0]),
        length,
      ]).toString("hex"),
    );
  });
});

describe("solana-now", () => {
  it("matches its recorded output", async () => {
    await expect(
      JSON.stringify(await solanaNow(), null, 2),
    ).toMatchFileSnapshot("../output/solana-now.json");
  });

  it("checks mint authority now and cannot look back", async () => {
    const { report } = await solanaNow();
    const [kept, handedOver] = report.tokens.map(
      (t) => t.checks.find((c) => c.kind === "verification")?.at,
    );
    expect(kept?.now?.status).toBe("valid");
    expect(kept?.now?.position).toEqual({ slot: "412345678" });
    expect(handedOver?.now?.status).toBe("invalid");
    expect(handedOver?.now?.reason).toBe("mint authority failed");
    expect(handedOver?.now?.position).toEqual({ slot: "412345679" });
    for (const at of [kept, handedOver]) {
      expect(at?.verified?.status).toBe("unverifiable");
      expect(at?.verified?.reason).toBe(
        "Solana RPC cannot read historical account state",
      );
    }
  });
});

describe("xrpl-rotated", () => {
  it("matches its recorded output", async () => {
    await expect(
      JSON.stringify(await xrplRotated(), null, 2),
    ).toMatchFileSnapshot("../output/xrpl-rotated.json");
  });

  it("follows the issuer's key rotation across ledgers", async () => {
    const { report } = await xrplRotated();
    const [master, regular] =
      report.tokens[0]?.checks.filter((c) => c.kind === "verification") ?? [];
    expect(master?.at.verified?.status).toBe("valid");
    expect(master?.at.verified?.position?.ledger).toBe(99202077);
    expect(master?.at.now?.status).toBe("invalid");
    expect(master?.at.now?.reason).toBe(
      "signer key was authorised for the wallet failed",
    );
    expect(master?.at.now?.position).toEqual({ ledger: 99204000 });
    expect(regular?.proof?.status).toBe("unverifiable");
    expect(regular?.proof?.reason).toBe(
      "signer is not the master key; online check needed",
    );
    expect(regular?.at.verified?.status).toBe("valid");
    expect(regular?.at.now?.status).toBe("valid");
  });
});

describe("xrpl", () => {
  it("matches its recorded output", async () => {
    await expect(JSON.stringify(await xrpl(), null, 2)).toMatchFileSnapshot(
      "../output/xrpl.json",
    );
  });

  it("matches the wallet by master key offline and leaves a regular key open", async () => {
    const { independent, sdk } = await xrpl();
    expect(independent.ed25519MasterKey.derivedAddressIsWallet).toBe(true);
    expect(independent.secp256k1MasterKey.derivedAddressIsWallet).toBe(true);
    expect(independent.regularKey.signatureVerifies).toBe(true);
    expect(independent.regularKey.derivedAddressIsWallet).toBe(false);

    const [usd, eur] = sdk.report.tokens;
    const proofs = usd?.checks
      .filter((c) => c.kind === "verification")
      .map((c) => [c.proof?.status, c.proof?.reason]);
    expect(proofs).toEqual([
      ["valid", undefined],
      ["unverifiable", "signer is not the master key; online check needed"],
    ]);
    expect(usd?.evidence).toBe("confirmed");
    expect(eur?.evidence).toBe("confirmed");
  });

  it("rejects the signature over a tampered message, with and without the SDK", async () => {
    const { independent, sdk } = await xrpl();
    expect(independent.tamperedMessage.signatureVerifies).toBe(false);
    expect(sdk.tamperedMessage?.status).toBe("invalid");
    expect(sdk.tamperedMessage?.reason).toBe(
      "xrpl signature verifies for signer key failed",
    );
  });
});
