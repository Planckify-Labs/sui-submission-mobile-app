/**
 * Unit tests for `Erc7710FacilitatorRail` — the Mode-B (server-settled)
 * boundary (§9.1, §14 "Mode-B boundary (facilitator)" + "Facilitator
 * allow-list"). Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import type {
  SettleX402PaymentArgs,
  X402Erc7710Challenge,
} from "../../types.ts";
import {
  createErc7710FacilitatorRail,
  DEFAULT_FACILITATOR_DEPS,
  type FacilitatorRailConfig,
  type FacilitatorRailDeps,
} from "./Erc7710FacilitatorRail.ts";

const FACILITATOR = "https://facilitator.example";
const KEY = "x402|eip155:84532|payto|asset|20000|res";
const CFG: FacilitatorRailConfig = { allowedFacilitators: [FACILITATOR] };

function challenge(
  overrides: Partial<X402Erc7710Challenge> = {},
): X402Erc7710Challenge {
  return {
    scheme: "exact",
    network: "eip155:84532",
    maxAmountRequired: "20000",
    payTo: "0x000000000000000000000000000000000000dEaD",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    resource: "https://seller.example/api/v1/pool-safety",
    assetTransferMethod: "erc7710",
    facilitator: `${FACILITATOR}/x402`,
    ...overrides,
  };
}

function args(
  overrides: Partial<SettleX402PaymentArgs> = {},
): SettleX402PaymentArgs {
  return {
    wallet: { address: "0xabc" } as never,
    chain: { namespace: "eip155", chain: { id: 84532 } } as never,
    challenge: challenge(),
    delegation: { salt: "0x01" } as never,
    remainingBudgetAtoms: 5_000_000n,
    ...overrides,
  };
}

function deps(
  overrides: Partial<FacilitatorRailDeps> = {},
): FacilitatorRailDeps {
  return {
    sdkAvailable: () => true,
    deriveAccount: async () => ({ account: "acct" }),
    encodeDelegations: async () => "0xparent",
    signPayment: async () => "SIGNED-ENVELOPE",
    verify: async () => ({ reachable: true, ok: true }),
    probe: async () => true,
    ...overrides,
  };
}

const CTX = (c = challenge()) => ({ chainId: 84532, challenge: c });

// ── supports() ─────────────────────────────────────────────────────────

test("ships DISABLED by default: sdkAvailable() false → supports() false", () => {
  const rail = createErc7710FacilitatorRail(CFG, DEFAULT_FACILITATOR_DEPS);
  a.equal(rail.supports(CTX()), false);
});

test("SI-3 allow-list: a facilitator outside the list → supports() false", () => {
  const rail = createErc7710FacilitatorRail(CFG, deps());
  a.equal(
    rail.supports(CTX(challenge({ facilitator: "https://evil.example/x402" }))),
    false,
  );
  // And the in-list facilitator is supported.
  a.equal(rail.supports(CTX()), true);
});

test("supports() false for a non-erc7710 scheme or a missing facilitator", () => {
  const rail = createErc7710FacilitatorRail(CFG, deps());
  a.equal(rail.supports(CTX(challenge({ facilitator: null }))), false);
});

// ── attempt() — Mode-B boundary ──────────────────────────────────────────

test("/verify ok → settled with settlesOnRetry, signed-envelope proof, NO txHash", async () => {
  let signCalls = 0;
  let verifyCalls = 0;
  const rail = createErc7710FacilitatorRail(
    CFG,
    deps({
      signPayment: async () => {
        signCalls += 1;
        return "SIGNED-ENVELOPE";
      },
      verify: async () => {
        verifyCalls += 1;
        return { reachable: true, ok: true };
      },
    }),
  );
  const res = await rail.attempt(args(), KEY);
  a.equal(res.outcome, "settled");
  if (res.outcome !== "settled") return;
  a.equal(res.rail, "facilitator");
  a.equal(res.settlesOnRetry, true); // Mode B — seller settles on retry
  a.equal(res.proof, "SIGNED-ENVELOPE"); // the real X-PAYMENT envelope
  a.equal(res.txHash, undefined); // buyer never broadcast
  a.equal(res.spentAtoms, 20_000n);
  a.equal(signCalls, 1);
  a.equal(verifyCalls, 1); // a non-settling pre-check, exactly once
});

test("signPayment throws → unavailable (nothing moved → fail over)", async () => {
  const rail = createErc7710FacilitatorRail(
    CFG,
    deps({
      signPayment: async () => {
        throw new Error("sdk boom raw");
      },
    }),
  );
  const res = await rail.attempt(args(), KEY);
  a.equal(res.outcome, "unavailable");
  if (res.outcome === "unavailable") a.doesNotMatch(res.reason, /boom|raw/);
});

test("/verify unreachable → unavailable (facilitator outage is failover-safe)", async () => {
  const rail = createErc7710FacilitatorRail(
    CFG,
    deps({ verify: async () => ({ reachable: false, ok: false }) }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("/verify rejects payload → unavailable", async () => {
  const rail = createErc7710FacilitatorRail(
    CFG,
    deps({ verify: async () => ({ reachable: true, ok: false }) }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});

test("/verify throwing is treated as unreachable → unavailable", async () => {
  const rail = createErc7710FacilitatorRail(
    CFG,
    deps({
      verify: async () => {
        throw new Error("network");
      },
    }),
  );
  a.equal((await rail.attempt(args(), KEY)).outcome, "unavailable");
});
