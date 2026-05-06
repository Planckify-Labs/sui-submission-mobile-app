/**
 * Unit tests for `SuiWalletKit`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        services/walletKit/sui/SuiWalletKit.test.ts
 *
 * Style matches `services/walletKit/solana/SolanaWalletKit.test.ts` —
 * Node test runner, no react / react-native / expo imports at the test
 * bench. We reuse the EVM resolver hook because the kit transitively
 * imports `services/walletService.ts` (for `getSuiSignerForWallet` +
 * `generateWalletMnemonic`), which in turn imports the Expo /
 * MMKV-backed secure-store modules. The resolver stubs both so the
 * tests run under plain Node. Network-bound methods
 * (`getNativeBalance`, `sendNativeTransfer`) are only asserted for
 * their namespace guards + delegation hand-off here — the happy path is
 * covered by `services/chains/sui/transferService.ts` against a mocked
 * RPC.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mainnet } from "viem/chains";

import type { ChainConfig } from "../../../constants/configs/chainConfig.ts";
import { mnemonicToSuiKeypair } from "../../chains/sui/derivation.ts";
import { createSuiWalletKit } from "./SuiWalletKit.ts";

const suiMainnetChain: ChainConfig = {
  namespace: "sui",
  network: "mainnet",
  rpcUrl: "https://fullnode.mainnet.sui.io:443",
};

const suiTestnetChain: ChainConfig = {
  namespace: "sui",
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io:443",
};

const suiDevnetChain: ChainConfig = {
  namespace: "sui",
  network: "devnet",
  rpcUrl: "https://fullnode.devnet.sui.io:443",
};

const ethereumChain: ChainConfig = {
  namespace: "eip155",
  chain: mainnet,
};

// BIP-39 canonical zero mnemonic; the same vector used in
// `services/chains/sui/derivation.test.ts`.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// Task 03 golden vector — verified against Sui Wallet / Suiet / Surf at
// path m/44'/784'/0'/0'/0'.
const EXPECTED_ADDRESS =
  "0x5e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f1";

const VALID_EVM_ADDRESS = "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97";

// 0.05 SUI safety reserve — must mirror the constant in `SuiWalletKit.ts`.
// Duplicated here so the test stays readable without importing a
// non-exported constant.
const MAX_GAS_BUDGET_MIST: bigint = 50_000_000n;

describe("SuiWalletKit — interface wiring", () => {
  const kit = createSuiWalletKit();

  it("advertises the sui namespace and capability flags", () => {
    assert.equal(kit.namespace, "sui");
    assert.equal(kit.supportsTokenTransfer, true);
    assert.equal(kit.supportsPrivateKeyImport, true);
    assert.equal(kit.displayName, "Sui");
    assert.equal(kit.requireBiometricForConnect, true);
  });

  it("does not declare a brandColor (spec §11 decision 4 — falls back to DEFAULT_BRAND_COLOR)", () => {
    assert.equal(kit.brandColor, undefined);
  });
});

describe("SuiWalletKit.validateAddress", () => {
  const kit = createSuiWalletKit();

  it("accepts the golden-vector canonical 0x + 64-hex address", () => {
    assert.equal(kit.validateAddress(EXPECTED_ADDRESS), true);
  });

  it("rejects an EVM hex address (cross-chain guard)", () => {
    assert.equal(kit.validateAddress(VALID_EVM_ADDRESS), false);
  });

  it("rejects an empty string", () => {
    assert.equal(kit.validateAddress(""), false);
  });
});

describe("SuiWalletKit.validatePrivateKey", () => {
  const kit = createSuiWalletKit();

  it("rejects an empty string", () => {
    assert.equal(kit.validatePrivateKey(""), false);
  });

  it("rejects garbage", () => {
    assert.equal(kit.validatePrivateKey("not a key"), false);
  });
});

describe("SuiWalletKit.validateMnemonic", () => {
  const kit = createSuiWalletKit();

  it("accepts the canonical BIP-39 mnemonic", () => {
    assert.equal(kit.validateMnemonic(TEST_MNEMONIC), true);
  });

  it("trims surrounding whitespace before validation", () => {
    assert.equal(kit.validateMnemonic(`  ${TEST_MNEMONIC}  `), true);
  });

  it("rejects garbage", () => {
    assert.equal(kit.validateMnemonic("not a valid mnemonic"), false);
  });
});

describe("SuiWalletKit.createWalletFromMnemonic (golden vector)", () => {
  const kit = createSuiWalletKit();

  it("derives the Task 03 golden-vector address for the canonical mnemonic", async () => {
    const wallet = await kit.createWalletFromMnemonic({
      mnemonic: TEST_MNEMONIC,
    });
    assert.equal(wallet.address, EXPECTED_ADDRESS);
    assert.equal(wallet.namespace, "sui");
    assert.equal(wallet.type, "SeedPhrase");
    assert.equal(wallet.source, "Created");
    assert.equal(wallet.sui?.suiAddress, EXPECTED_ADDRESS);
    assert.equal(wallet.sui?.scheme, "ed25519");
  });

  it("throws on a malformed mnemonic", async () => {
    await assert.rejects(
      () => kit.createWalletFromMnemonic({ mnemonic: "not a mnemonic" }),
      /SuiWalletKit: invalid BIP-39 mnemonic/,
    );
  });
});

describe("SuiWalletKit.signAuthMessage", () => {
  const kit = createSuiWalletKit();

  it("produces a signature byte-for-byte equivalent to a direct keypair sign over the same UTF-8 bytes", async () => {
    // Build the wallet via the kit so the dwell-site signer maps it.
    const wallet = await kit.createWalletFromMnemonic({
      mnemonic: TEST_MNEMONIC,
    });
    const message = "twv: hello sui";

    // Independently re-derive the keypair from the same mnemonic and
    // sign the same bytes. Sui's `signPersonalMessage` is deterministic
    // (ed25519 with intent prefixing) so the kit's output must match.
    const kp = mnemonicToSuiKeypair(TEST_MNEMONIC);
    const expected = await kp.signPersonalMessage(
      new TextEncoder().encode(message),
    );

    const actual = await kit.signAuthMessage(wallet, message);
    assert.equal(actual, expected.signature);
  });
});

describe("SuiWalletKit.estimateMaxTransferable", () => {
  const kit = createSuiWalletKit();

  it("subtracts the 0.05 SUI gas reserve from a comfortable balance", async () => {
    const max = await kit.estimateMaxTransferable({
      balance: 1_000_000_000n,
      chain: suiMainnetChain,
      from: EXPECTED_ADDRESS,
    });
    assert.equal(max, 1_000_000_000n - MAX_GAS_BUDGET_MIST);
  });

  it("clamps to 0n when balance is at or below the gas reserve (no negatives)", async () => {
    const max = await kit.estimateMaxTransferable({
      balance: MAX_GAS_BUDGET_MIST,
      chain: suiMainnetChain,
      from: EXPECTED_ADDRESS,
    });
    assert.equal(max, 0n);
  });

  it("clamps to 0n when balance is well below the gas reserve", async () => {
    const max = await kit.estimateMaxTransferable({
      balance: 100n,
      chain: suiMainnetChain,
      from: EXPECTED_ADDRESS,
    });
    assert.equal(max, 0n);
  });
});

describe("SuiWalletKit.formatNativeAmount / parseNativeAmount", () => {
  const kit = createSuiWalletKit();

  it("formatNativeAmount(1.5 SUI) renders '1.5000 SUI'", () => {
    assert.equal(
      kit.formatNativeAmount(1_500_000_000n, suiMainnetChain),
      "1.5000 SUI",
    );
  });

  it("parseNativeAmount('1.5') returns 1_500_000_000n MIST", () => {
    assert.equal(kit.parseNativeAmount("1.5", suiMainnetChain), 1_500_000_000n);
  });

  it("round-trip: parse then format returns the input", () => {
    const raw = kit.parseNativeAmount("1.5", suiMainnetChain);
    assert.equal(kit.formatNativeAmount(raw, suiMainnetChain), "1.5000 SUI");
  });

  it("format throws on a non-sui chain", () => {
    assert.throws(
      () => kit.formatNativeAmount(1n, ethereumChain),
      /assertSuiChain: expected Sui chain/,
    );
  });

  it("parse throws on a non-sui chain", () => {
    assert.throws(
      () => kit.parseNativeAmount("1", ethereumChain),
      /assertSuiChain: expected Sui chain/,
    );
  });
});

describe("SuiWalletKit.buildTxExplorerUrl", () => {
  const kit = createSuiWalletKit();

  it("returns the SuiVision URL for mainnet (no subdomain prefix)", () => {
    assert.equal(
      kit.buildTxExplorerUrl?.("abc", suiMainnetChain),
      "https://suivision.xyz/txblock/abc",
    );
  });

  it("returns the testnet-prefixed SuiVision URL for testnet", () => {
    assert.equal(
      kit.buildTxExplorerUrl?.("abc", suiTestnetChain),
      "https://testnet.suivision.xyz/txblock/abc",
    );
  });

  it("returns the devnet-prefixed SuiVision URL for devnet", () => {
    assert.equal(
      kit.buildTxExplorerUrl?.("abc", suiDevnetChain),
      "https://devnet.suivision.xyz/txblock/abc",
    );
  });

  it("returns null for a non-sui chain", () => {
    assert.equal(kit.buildTxExplorerUrl?.("abc", ethereumChain), null);
  });
});

describe("SuiWalletKit display hooks — null on non-sui chains", () => {
  const kit = createSuiWalletKit();

  it("getChainId returns null for non-sui chains", () => {
    assert.equal(kit.getChainId?.(ethereumChain), null);
  });

  it("getChainId returns the network string for sui chains", () => {
    assert.equal(kit.getChainId?.(suiMainnetChain), "mainnet");
    assert.equal(kit.getChainId?.(suiTestnetChain), "testnet");
  });

  it("formatChainLabel returns null for non-sui chains", () => {
    assert.equal(kit.formatChainLabel?.(ethereumChain), null);
  });

  it("formatChainLabel capitalises the network for sui chains", () => {
    assert.equal(kit.formatChainLabel?.(suiMainnetChain), "Sui Mainnet");
    assert.equal(kit.formatChainLabel?.(suiTestnetChain), "Sui Testnet");
    assert.equal(kit.formatChainLabel?.(suiDevnetChain), "Sui Devnet");
  });

  it("nativeSymbol returns null for non-sui chains", () => {
    assert.equal(kit.nativeSymbol?.(ethereumChain), null);
  });

  it("nativeSymbol returns 'SUI' for sui chains", () => {
    assert.equal(kit.nativeSymbol?.(suiMainnetChain), "SUI");
  });

  it("formatConnectChipLabel renders 'Sui · Mainnet' from a payload missing network", () => {
    assert.equal(kit.formatConnectChipLabel?.({}), "Sui · Mainnet");
  });

  it("formatConnectChipLabel capitalises non-default networks", () => {
    assert.equal(
      kit.formatConnectChipLabel?.({ network: "testnet" }),
      "Sui · Testnet",
    );
    assert.equal(
      kit.formatConnectChipLabel?.({ network: "devnet" }),
      "Sui · Devnet",
    );
  });
});

describe("SuiWalletKit.truncateAddress", () => {
  const kit = createSuiWalletKit();

  it("returns a start...end slice with the spec defaults (start=6, end=4)", () => {
    const out = kit.truncateAddress(EXPECTED_ADDRESS);
    assert.equal(
      out,
      `${EXPECTED_ADDRESS.slice(0, 6)}...${EXPECTED_ADDRESS.slice(-4)}`,
    );
    assert.equal(out, "0x5e93...61f1");
  });

  it("honours custom start/end lengths", () => {
    const out = kit.truncateAddress(EXPECTED_ADDRESS, { start: 10, end: 8 });
    assert.equal(
      out,
      `${EXPECTED_ADDRESS.slice(0, 10)}...${EXPECTED_ADDRESS.slice(-8)}`,
    );
  });

  it("returns an empty string for an empty input", () => {
    assert.equal(kit.truncateAddress(""), "");
  });
});

describe("SuiWalletKit network methods — namespace guard", () => {
  const kit = createSuiWalletKit();

  it("getNativeBalance rejects non-sui chains", async () => {
    await assert.rejects(
      () => kit.getNativeBalance(EXPECTED_ADDRESS, ethereumChain),
      /assertSuiChain: expected Sui chain/,
    );
  });

  it("getTokenBalance rejects non-sui chains", async () => {
    await assert.rejects(
      () =>
        kit.getTokenBalance(EXPECTED_ADDRESS, ethereumChain, "0x2::sui::SUI"),
      /assertSuiChain: expected Sui chain/,
    );
  });

  it("sendNativeTransfer rejects non-sui chains", async () => {
    await assert.rejects(
      () =>
        kit.sendNativeTransfer({
          wallet: { address: EXPECTED_ADDRESS } as never,
          to: EXPECTED_ADDRESS,
          amount: 1n,
          chain: ethereumChain,
        }),
      /assertSuiChain: expected Sui chain/,
    );
  });

  it("sendTokenTransfer rejects non-sui chains", async () => {
    await assert.rejects(
      () =>
        kit.sendTokenTransfer({
          wallet: { address: EXPECTED_ADDRESS } as never,
          to: EXPECTED_ADDRESS,
          amount: 1n,
          chain: ethereumChain,
          contractAddress: "0x2::sui::SUI",
          decimals: 9,
        }),
      /assertSuiChain: expected Sui chain/,
    );
  });

  it("exposes getSignerForWallet as a function (dwell-site delegation)", () => {
    assert.equal(typeof kit.getSignerForWallet, "function");
  });
});

describe("SuiWalletKit signing-path delegation — fail-loud guards", () => {
  // These tests act as a regression guard against drift from the Solana
  // pattern: the kit must call `getSuiSignerForWallet` BEFORE constructing
  // a transfer PTB (so a wallet without a usable signer fails loud at the
  // dwell site, never reaching `buildAndSendSuiTransfer` /
  // `buildAndSendSuiCoinTransfer`). We trigger this by passing a Sui
  // chain (so `assertSuiChain` passes) with a wallet whose namespace
  // makes `getSuiSignerForWallet` return `null`.
  const kit = createSuiWalletKit();

  it("sendNativeTransfer throws 'No Sui signer for wallet' when the dwell site returns null", async () => {
    await assert.rejects(
      () =>
        kit.sendNativeTransfer({
          // Non-sui namespace → `getSuiSignerForWallet` returns null → kit throws.
          wallet: {
            address: VALID_EVM_ADDRESS,
            namespace: "eip155",
          } as never,
          to: EXPECTED_ADDRESS,
          amount: 1n,
          chain: suiMainnetChain,
        }),
      /No Sui signer for wallet/,
    );
  });

  it("sendTokenTransfer throws 'No Sui signer for wallet' when the dwell site returns null", async () => {
    await assert.rejects(
      () =>
        kit.sendTokenTransfer({
          wallet: {
            address: VALID_EVM_ADDRESS,
            namespace: "eip155",
          } as never,
          to: EXPECTED_ADDRESS,
          amount: 1n,
          chain: suiMainnetChain,
          contractAddress: "0x2::sui::SUI",
          decimals: 9,
        }),
      /No Sui signer for wallet/,
    );
  });

  it("signAuthMessage throws 'no signer available' when the dwell site returns null", async () => {
    await assert.rejects(
      () =>
        kit.signAuthMessage(
          { address: VALID_EVM_ADDRESS, namespace: "eip155" } as never,
          "msg",
        ),
      /SuiWalletKit\.signAuthMessage: no signer available/,
    );
  });

  // TODO(Task 13+): live-wire a mocked `@mysten/sui/jsonRpc` client to
  // exercise the Sui happy path for `getNativeBalance` /
  // `sendNativeTransfer` / `sendTokenTransfer` at the kit surface. The
  // primitives are already covered in
  // `services/chains/sui/transferService.ts` + `coinTransferService.ts`;
  // the kit surface only adds thin RPC construction + namespace narrowing
  // over them.
});
