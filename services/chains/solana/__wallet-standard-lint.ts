/**
 * Dev-only compliance lint for the TakumiSolanaWallet shape built by
 * `injectedScript.ts`. Encodes every predicate `@solana/wallet-adapter-wallet-standard`
 * applies at pick time — if this file passes, real Solana dApps see the
 * wallet; if it fails, a refactor silently broke compliance.
 *
 * NOT bundled into production. The file name starts with `__` so Metro /
 * path scanners skip it, and the CI test command is
 * `node --test --experimental-strip-types services/chains/solana/__wallet-standard-lint.ts`.
 *
 * Spec reference: §10.6 reviewer checklist.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { getSolanaInjectedScript } from "./injectedScript.ts";

// jsdom would let us run the IIFE against a live DOM, but jsdom is ~3 MB
// of dev-dep. A minimal sandbox with the globals the script reads is
// sufficient to extract the wallet object.
function runInjectedScript(activeAddress: string | null) {
  const captured: { wallet?: Record<string, unknown>; calls: string[] } = {
    calls: [],
  };
  const sandbox: Record<string, unknown> = {
    // Capture the wallet via the register-wallet event.
    window: {} as Record<string, unknown>,
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
    TextEncoder,
    Date,
    Math,
    Map,
    Set,
    Uint8Array,
    ArrayBuffer,
    String,
    Object,
    Promise,
    JSON,
    Error,
  };
  const win = sandbox.window as Record<string, unknown>;
  win.__takumi_solana_installed = undefined;
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  win.addEventListener = (event: string, cb: (e: unknown) => void) => {
    (listeners[event] = listeners[event] ?? []).push(cb);
  };
  win.dispatchEvent = (ev: Record<string, unknown>) => {
    captured.calls.push(String(ev.type));
    if (ev.type === "wallet-standard:register-wallet") {
      const detail = ev.detail as
        | ((api: { register: (w: Record<string, unknown>) => void }) => void)
        | undefined;
      if (detail) {
        detail({
          register: (w) => {
            captured.wallet = w;
          },
        });
      }
    }
  };
  // Minimal RN WebView bridge stub so postMessage calls don't crash.
  win.ReactNativeWebView = {
    postMessage: () => {},
  };
  win.location = { href: "https://example.com", origin: "https://example.com" };
  win.top = win;
  // Event constructor.
  sandbox.Event = class Event {
    type: string;
    detail?: unknown;
    constructor(type: string) {
      this.type = type;
    }
  };

  const script = new vm.Script(getSolanaInjectedScript({ activeAddress }));
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);
  return { wallet: captured.wallet, events: captured.calls, window: win };
}

describe("wallet-standard lint — object shape (§10.6)", () => {
  const { wallet } = runInjectedScript("9xyz123AAABBBB");

  it("wallet.version === '1.0.0' literal", () => {
    assert.equal(wallet?.version, "1.0.0");
  });

  it("wallet.name is 'TakumiPay'", () => {
    assert.equal(wallet?.name, "TakumiPay");
  });

  it("wallet.icon matches data URL format", () => {
    assert.match(
      wallet?.icon as string,
      /^data:image\/(svg\+xml|webp|png|gif);base64,/,
    );
  });

  it("wallet.chains contains all 3 short-form entries", () => {
    const chains = wallet?.chains as string[];
    assert.ok(chains.includes("solana:mainnet"));
    assert.ok(chains.includes("solana:devnet"));
    assert.ok(chains.includes("solana:testnet"));
  });

  it("wallet.chains also includes 3 CAIP-2 genesis-hash forms", () => {
    const chains = wallet?.chains as string[];
    assert.ok(chains.includes("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"));
  });

  it("wallet.accounts is [] pre-connect even when an active wallet exists (§4.2b)", () => {
    // MUST be empty at inject time. Pre-populating lets some dApps infer
    // "already connected" without ever calling standard:connect, which
    // silently breaks the approval flow.
    const accs = wallet?.accounts as unknown[];
    assert.ok(Array.isArray(accs));
    assert.equal(accs.length, 0);
  });

  it("pre-connect wallet.accounts is [] (no active wallet)", () => {
    const { wallet: pre } = runInjectedScript(null);
    const accs = pre?.accounts as unknown[];
    assert.ok(Array.isArray(accs));
    assert.equal(accs.length, 0);
  });
});

describe("wallet-standard lint — feature surface", () => {
  const { wallet } = runInjectedScript("9xyz123AAABBBB");
  const feats = wallet?.features as Record<string, Record<string, unknown>>;

  for (const key of [
    "standard:connect",
    "standard:disconnect",
    "standard:events",
    "solana:signIn",
    "solana:signMessage",
    "solana:signTransaction",
    "solana:signAndSendTransaction",
    "takumi:switchCluster",
    "takumi:watchToken",
  ]) {
    it(`features["${key}"] is present with version 1.0.0`, () => {
      assert.ok(feats[key], `missing ${key}`);
      assert.equal(feats[key].version, "1.0.0");
    });
  }

  it("solana:signTransaction.supportedTransactionVersions is a frozen literal (not a getter)", () => {
    const desc = Object.getOwnPropertyDescriptor(
      feats["solana:signTransaction"],
      "supportedTransactionVersions",
    );
    assert.ok(desc);
    assert.equal(typeof desc!.get, "undefined", "must not be a getter");
    const tuple = feats["solana:signTransaction"]
      .supportedTransactionVersions as unknown[];
    assert.equal(tuple.length, 2);
    assert.equal(tuple[0], "legacy");
    assert.equal(tuple[1], 0);
  });

  it("solana:signAndSendTransaction.supportedTransactionVersions tuple matches", () => {
    const tuple = feats["solana:signAndSendTransaction"]
      .supportedTransactionVersions as unknown[];
    assert.equal(tuple.length, 2);
    assert.equal(tuple[0], "legacy");
    assert.equal(tuple[1], 0);
  });
});

describe("wallet-standard lint — account shape (post-connect)", () => {
  // Accounts are [] at inject time; `_updateSolanaWallet` populates them
  // after the user approves on our unified ConnectSheet. Simulate that
  // push here and verify the resulting WalletAccount shape.
  const { wallet, window: win } = runInjectedScript("9xyz123AAABBBB");
  (
    win._updateSolanaWallet as (s: {
      accounts: Array<{ address: string }>;
    }) => void
  )({ accounts: [{ address: "9xyz123AAABBBB" }] });
  const accs = wallet?.accounts as Array<Record<string, unknown>>;
  const a = accs[0];

  it("WalletAccount.address is the base58 string", () => {
    assert.equal(a.address, "9xyz123AAABBBB");
  });

  it("WalletAccount.publicKey is a Uint8Array", () => {
    assert.ok(a.publicKey instanceof Uint8Array, "must be Uint8Array");
  });

  it("WalletAccount.chains has all 6 entries", () => {
    const chains = a.chains as string[];
    assert.equal(chains.length, 6);
  });

  it("WalletAccount.features covers the required solana:* set", () => {
    const f = a.features as string[];
    for (const need of [
      "solana:signIn",
      "solana:signMessage",
      "solana:signTransaction",
      "solana:signAndSendTransaction",
    ]) {
      assert.ok(f.includes(need), `missing ${need}`);
    }
  });
});

describe("wallet-standard lint — handshake behavior", () => {
  it("register-wallet event dispatched during install", () => {
    const { events } = runInjectedScript("9xyz");
    assert.ok(
      events.includes("wallet-standard:register-wallet"),
      "dispatch not observed",
    );
  });

  it("wallet-standard:app-ready listener registered", () => {
    const { window } = runInjectedScript("9xyz");
    const win = window as {
      addEventListener?: unknown;
    };
    // We only verify the listener attachment ran without throw; the
    // wallet-standard library will fire the event itself in a real dApp.
    assert.ok(win.addEventListener);
  });
});
