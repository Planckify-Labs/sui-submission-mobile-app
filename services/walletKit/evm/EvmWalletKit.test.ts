/**
 * Unit tests for `EvmWalletKit`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletKit/evm/EvmWalletKit.test.ts
 *
 * Style matches `services/walletKit/registry.test.ts` — Node test
 * runner, no react / react-native / expo imports at the test bench.
 *
 * The companion `_test-resolver.mjs` resolves the `@/*` path alias and
 * `.ts` extensions so the kit and its helper chain load under plain
 * Node. Network-bound methods (`getNativeBalance`,
 * `sendNativeTransfer`, `estimateMaxTransferable`) defer to viem
 * clients constructed inside `utils/clients.ts` with no DI seam; they
 * are stubbed below via `TODO` to avoid hitting mainnet.
 *
 * R4b guard: `validateAddress`, `validateMnemonic`, `formatNativeAmount`,
 * `parseNativeAmount`, and `truncateAddress` are asserted byte-identical
 * to the underlying helpers (`isAddress`, `isValidMnemonic`,
 * `formatUnits` / `parseUnits`, `truncateAddress` in `walletUtils.ts`).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUnits, isAddress, parseUnits } from "viem";
import { mainnet } from "viem/chains";

import type { ChainConfig } from "../../../constants/configs/chainConfig.ts";
import { truncateAddress as truncateAddressUtil } from "../../../utils/walletUtils.ts";
import { createEvmWalletKit } from "./EvmWalletKit.ts";

const ethereumChain: ChainConfig = {
  namespace: "eip155",
  chain: mainnet,
};

const solanaChain: ChainConfig = {
  namespace: "solana",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
};

const VALID_ADDRESS = "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97";
const INVALID_ADDRESS = "0xNOT_AN_ADDRESS";
const VALID_MNEMONIC =
  "test test test test test test test test test test test junk";

describe("EvmWalletKit — interface wiring", () => {
  const kit = createEvmWalletKit();

  it("advertises the eip155 namespace and capability flags", () => {
    assert.equal(kit.namespace, "eip155");
    assert.equal(kit.supportsTokenTransfer, true);
    assert.equal(kit.supportsPrivateKeyImport, true);
  });
});

describe("EvmWalletKit.validateAddress (R4b bytes-out parity)", () => {
  const kit = createEvmWalletKit();

  it("returns true for a valid EVM address", () => {
    assert.equal(kit.validateAddress(VALID_ADDRESS), true);
  });

  it("returns false for garbage input", () => {
    assert.equal(kit.validateAddress(INVALID_ADDRESS), false);
    assert.equal(kit.validateAddress(""), false);
  });

  it("matches viem `isAddress` byte-for-byte on mixed inputs", () => {
    const cases = [
      VALID_ADDRESS,
      VALID_ADDRESS.toLowerCase(),
      INVALID_ADDRESS,
      "",
      "0x0000000000000000000000000000000000000000",
      "not-hex",
    ];
    for (const c of cases) {
      assert.equal(
        kit.validateAddress(c),
        isAddress(c),
        `parity broken for input ${JSON.stringify(c)}`,
      );
    }
  });
});

describe("EvmWalletKit.validateMnemonic", () => {
  const kit = createEvmWalletKit();

  it("accepts a canonical 12-word mnemonic", () => {
    assert.equal(kit.validateMnemonic(VALID_MNEMONIC), true);
  });

  it("rejects a mnemonic with the wrong word count", () => {
    assert.equal(kit.validateMnemonic("too few words"), false);
  });

  it("trims surrounding whitespace like the underlying helper", () => {
    assert.equal(kit.validateMnemonic(`  ${VALID_MNEMONIC}  `), true);
  });
});

describe("EvmWalletKit.formatNativeAmount / parseNativeAmount", () => {
  const kit = createEvmWalletKit();

  it("formatNativeAmount renders `<amount> <symbol>` matching the spec (R4b)", () => {
    const raw = 1_234_567_890_123_456_789n;
    const human = parseFloat(
      formatUnits(raw, mainnet.nativeCurrency.decimals),
    ).toFixed(4);
    assert.equal(
      kit.formatNativeAmount(raw, ethereumChain),
      `${human} ${mainnet.nativeCurrency.symbol}`,
    );
  });

  it("round-trips a human-denominated ETH value through parse → format", () => {
    const human = "1.5";
    const raw = kit.parseNativeAmount(human, ethereumChain);
    assert.equal(raw, parseUnits(human, mainnet.nativeCurrency.decimals));
    const display = parseFloat(
      formatUnits(raw, mainnet.nativeCurrency.decimals),
    ).toFixed(4);
    assert.equal(
      kit.formatNativeAmount(raw, ethereumChain),
      `${display} ${mainnet.nativeCurrency.symbol}`,
    );
  });

  it("throws a clear error when handed a non-eip155 chain", () => {
    assert.throws(
      () => kit.formatNativeAmount(1n, solanaChain),
      /EvmWalletKit: expected eip155 chain/,
    );
    assert.throws(
      () => kit.parseNativeAmount("1", solanaChain),
      /EvmWalletKit: expected eip155 chain/,
    );
  });
});

describe("EvmWalletKit.truncateAddress (parity with utils/walletUtils)", () => {
  const kit = createEvmWalletKit();

  it("default preset matches the existing util", () => {
    assert.equal(
      kit.truncateAddress(VALID_ADDRESS),
      truncateAddressUtil({ address: VALID_ADDRESS }),
    );
  });

  it("honors custom start/end lengths via the kit's opts shape", () => {
    const opts = { start: 6, end: 4 };
    assert.equal(
      kit.truncateAddress(VALID_ADDRESS, opts),
      truncateAddressUtil({
        address: VALID_ADDRESS,
        startLength: opts.start,
        endLength: opts.end,
      }),
    );
  });

  it("handles empty-string address the same way as the util", () => {
    assert.equal(kit.truncateAddress(""), truncateAddressUtil({ address: "" }));
  });
});

describe("EvmWalletKit network methods — namespace guard", () => {
  const kit = createEvmWalletKit();

  it("getNativeBalance rejects non-eip155 chains", async () => {
    await assert.rejects(
      () => kit.getNativeBalance(VALID_ADDRESS, solanaChain),
      /EvmWalletKit: expected eip155 chain/,
    );
  });

  it("sendNativeTransfer rejects non-eip155 chains", async () => {
    await assert.rejects(
      () =>
        kit.sendNativeTransfer({
          wallet: { address: VALID_ADDRESS } as never,
          to: VALID_ADDRESS,
          amount: 1n,
          chain: solanaChain,
        }),
      /EvmWalletKit: expected eip155 chain/,
    );
  });

  it("estimateMaxTransferable rejects non-eip155 chains", async () => {
    await assert.rejects(
      () =>
        kit.estimateMaxTransferable({
          balance: 1n,
          chain: solanaChain,
          from: VALID_ADDRESS,
        }),
      /EvmWalletKit: expected eip155 chain/,
    );
  });

  // TODO(Task 05): live-wire a mocked public/wallet client to exercise
  // the EVM happy paths for getNativeBalance / sendNativeTransfer /
  // estimateMaxTransferable without hitting mainnet. Left as a TODO
  // because the real viem clients are instantiated inside
  // `utils/clients.ts` (no DI seam), and Task 05 is explicitly
  // *relocation only* — no refactor of that seam permitted here.
});
