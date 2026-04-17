/**
 * Unit tests for `useWallet.helpers`.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types \
 *        --import ./services/walletKit/evm/_test-resolver.mjs \
 *        hooks/useWallet.helpers.test.ts
 *
 * Style mirrors `services/walletKit/evm/EvmWalletKit.test.ts` — we
 * reuse its `_test-resolver.mjs` so the `@/*` alias + `.ts` suffix
 * resolution + RN/Expo stubs are all in place.
 *
 * Scope: the pure `buildChainConfigFromBlockchain` helper (§7.5's
 * allowed namespace `if`). Kit accessors (`getActiveWalletKit`,
 * `getKitForWallet`) are covered via the registry round-trip test at
 * the bottom of this file — `useWallet` itself is a React hook and
 * not exercisable under node's test runner without a full react-dom
 * / react-native-test-renderer harness that the mobile-app does not
 * currently ship.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TBlockchain } from "../api/types/blockchain.ts";
import { buildChainConfigFromBlockchain } from "./useWallet.helpers.ts";
import { walletKitRegistry } from "../services/walletKit/registry.ts";
import type { WalletKitAdapter } from "../services/walletKit/types.ts";

function makeEvmBlockchain(overrides: Partial<TBlockchain> = {}): TBlockchain {
  return {
    id: "bc_evm_1",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://eth.llamarpc.com",
    blockExplorer: "https://etherscan.io",
    isEVM: true,
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    tokens: [],
    ...overrides,
  };
}

function makeSolanaBlockchain(
  overrides: Partial<TBlockchain> = {},
): TBlockchain {
  return {
    id: "bc_sol_1",
    name: "Solana Mainnet",
    chainId: 101,
    rpcUrl: "https://api.mainnet-beta.solana.com",
    blockExplorer: "https://solscan.io",
    isEVM: false,
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    tokens: [],
    ...overrides,
  };
}

describe("buildChainConfigFromBlockchain — EVM branch", () => {
  it("produces an eip155 ChainConfig for an EVM row", () => {
    const b = makeEvmBlockchain({
      chainId: 137,
      name: "Polygon",
      rpcUrl: "https://polygon-rpc.com",
    });
    const cc = buildChainConfigFromBlockchain(b);
    assert.equal(cc.namespace, "eip155");
    if (cc.namespace !== "eip155") throw new Error("narrowing guard");
    assert.equal(cc.chain.id, 137);
    assert.equal(cc.chain.name, "Polygon");
    assert.deepEqual(cc.chain.rpcUrls.default.http, [
      "https://polygon-rpc.com",
    ]);
  });

  it("flags testnet when the name contains 'sepolia'", () => {
    const cc = buildChainConfigFromBlockchain(
      makeEvmBlockchain({ name: "Ethereum Sepolia", chainId: 11155111 }),
    );
    assert.equal(cc.isTestnet, true);
  });

  it("falls back to N/A symbol and the blockchain's own name when tokens is empty", () => {
    // A chain with no native token row is rare but valid (freshly-
    // added chain, indexer behind). We surface "N/A" for the symbol
    // (obvious "data missing") rather than lying with "ETH" on what
    // could be Polygon or BSC. Decimals default to the EVM standard.
    const row = makeEvmBlockchain({ name: "Linea" });
    const cc = buildChainConfigFromBlockchain(row);
    if (cc.namespace !== "eip155") throw new Error("narrowing guard");
    assert.equal(cc.chain.nativeCurrency.symbol, "N/A");
    assert.equal(cc.chain.nativeCurrency.name, row.name);
    assert.equal(cc.chain.nativeCurrency.decimals, 18);
  });
});

describe("buildChainConfigFromBlockchain — Solana branch (§7.5)", () => {
  it("routes `isEVM: false` rows to the solana ChainConfig shape", () => {
    const cc = buildChainConfigFromBlockchain(makeSolanaBlockchain());
    assert.equal(cc.namespace, "solana");
    if (cc.namespace !== "solana") throw new Error("narrowing guard");
    assert.equal(cc.cluster, "mainnet-beta");
    assert.equal(cc.rpcUrl, "https://api.mainnet-beta.solana.com");
    assert.equal(cc.isTestnet, false);
  });

  it("infers `devnet` cluster when the name contains 'devnet'", () => {
    const cc = buildChainConfigFromBlockchain(
      makeSolanaBlockchain({
        name: "Solana Devnet",
        rpcUrl: "https://api.devnet.solana.com",
      }),
    );
    assert.equal(cc.namespace, "solana");
    if (cc.namespace !== "solana") throw new Error("narrowing guard");
    assert.equal(cc.cluster, "devnet");
    assert.equal(cc.isTestnet, true);
  });

  it("honors an explicit `namespace: 'solana'` field if the backend starts sending it", () => {
    const b = {
      ...makeEvmBlockchain({ isEVM: true as boolean }),
      namespace: "solana" as const,
      name: "Solana",
      rpcUrl: "https://rpc.solana",
    };
    const cc = buildChainConfigFromBlockchain(b as TBlockchain);
    assert.equal(cc.namespace, "solana");
  });

  it("defaults to eip155 when namespace is absent and isEVM is true", () => {
    const cc = buildChainConfigFromBlockchain(
      makeEvmBlockchain({ isEVM: true }),
    );
    assert.equal(cc.namespace, "eip155");
  });
});

describe("walletKitRegistry — kit accessor round-trip", () => {
  // `useWallet.getActiveWalletKit` / `getKitForWallet` are one-liners
  // over `walletKitRegistry.get(ns)`. We validate the registry
  // contract here so the hook-facing helpers stay covered without a
  // react-dom harness.
  const originalKits = walletKitRegistry.getAll();

  function installKit(adapter: Partial<WalletKitAdapter> & { namespace: "eip155" | "solana" }): WalletKitAdapter {
    const kit: WalletKitAdapter = {
      namespace: adapter.namespace,
      validateAddress: () => true,
      validatePrivateKey: () => true,
      validateMnemonic: () => true,
      createWalletFromPrivateKey: async () => ({}) as never,
      createWalletFromMnemonic: async () => ({}) as never,
      generateMnemonic: () => "",
      getSignerForWallet: async () => null,
      getNativeBalance: async () => 0n,
      sendNativeTransfer: async () => "",
      estimateMaxTransferable: async () => 0n,
      formatNativeAmount: () => "",
      parseNativeAmount: () => 0n,
      truncateAddress: () => "",
      ...adapter,
    };
    walletKitRegistry.register(kit);
    return kit;
  }

  it("registry resolves a kit by namespace (the only thing getActiveWalletKit does)", () => {
    walletKitRegistry.clear();
    const evm = installKit({ namespace: "eip155" });
    const sol = installKit({ namespace: "solana" });

    assert.equal(walletKitRegistry.get("eip155"), evm);
    assert.equal(walletKitRegistry.get("solana"), sol);
    assert.equal(walletKitRegistry.get("eip155").namespace, "eip155");
    assert.equal(walletKitRegistry.get("solana").namespace, "solana");
  });

  it("a wallet with `namespace: 'solana'` resolves to the solana kit", () => {
    walletKitRegistry.clear();
    installKit({ namespace: "eip155" });
    const sol = installKit({ namespace: "solana" });
    const walletLike = { namespace: "solana" } as { namespace: "solana" };
    assert.equal(walletKitRegistry.get(walletLike.namespace), sol);
  });

  it("registry throws when the namespace is unknown (boot-order safety)", () => {
    walletKitRegistry.clear();
    assert.throws(
      () => walletKitRegistry.get("eip155"),
      /WalletKit not registered/,
    );
  });

  // Restore original boot state so other tests in the suite aren't
  // affected by ordering.
  it.after(() => {
    walletKitRegistry.clear();
    for (const k of originalKits) walletKitRegistry.register(k);
  });
});
