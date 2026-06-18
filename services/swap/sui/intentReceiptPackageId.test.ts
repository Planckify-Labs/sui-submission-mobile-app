import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const search = vi.fn();

vi.mock("@/lib/storage/mmkv", () => ({
  storage: {
    getString: (k: string) => store.get(k),
    set: (k: string, v: string) => {
      store.set(k, v);
    },
  },
}));
vi.mock("@/api/endpoints/smart-contracts", () => ({
  smartContractApi: { searchSmartContracts: search },
}));

import { resolveIntentReceiptPackageId } from "./intentReceiptPackageId";

const SUI_TESTNET_ROW = {
  address: "0x0bea3f1e",
  blockchain: { isEVM: false, isTestnet: true },
};

beforeEach(() => {
  store.clear();
  search.mockReset();
});

describe("resolveIntentReceiptPackageId", () => {
  it("resolves the active network's Sui (non-EVM) package id from the API", async () => {
    search.mockResolvedValue([SUI_TESTNET_ROW]);
    const id = await resolveIntentReceiptPackageId("testnet");
    expect(id).toBe("0x0bea3f1e");
    // Does NOT send isBlockchainEVM — the backend mis-handles it (returns 0);
    // non-EVM is filtered client-side from the result instead.
    expect(search).toHaveBeenCalledWith({
      name: "intent_receipt",
      isActive: true,
    });
  });

  it("returns undefined when no row matches the active network", async () => {
    // A mainnet row only — must NOT be used on testnet.
    search.mockResolvedValue([
      { address: "0xMAIN", blockchain: { isEVM: false, isTestnet: false } },
    ]);
    expect(await resolveIntentReceiptPackageId("testnet")).toBeUndefined();
  });

  it("never returns an EVM contract", async () => {
    search.mockResolvedValue([
      { address: "0xEVM", blockchain: { isEVM: true, isTestnet: true } },
    ]);
    expect(await resolveIntentReceiptPackageId("testnet")).toBeUndefined();
  });

  it("serves the MMKV cache on the second call (one API hit)", async () => {
    search.mockResolvedValue([SUI_TESTNET_ROW]);
    await resolveIntentReceiptPackageId("testnet");
    const again = await resolveIntentReceiptPackageId("testnet");
    expect(again).toBe("0x0bea3f1e");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("falls back to undefined (not a throw) when the API errors with a cold cache", async () => {
    search.mockRejectedValue(new Error("network down"));
    expect(await resolveIntentReceiptPackageId("testnet")).toBeUndefined();
  });
});
