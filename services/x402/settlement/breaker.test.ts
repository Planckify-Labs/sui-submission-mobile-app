/**
 * Unit tests for `createSettlementBreaker` — the per-rail circuit breaker
 * (§10.2, §14 "Breaker"). Run under `node:test`.
 */

import { strict as a } from "node:assert";
import { test } from "node:test";
import { createSettlementBreaker } from "./breaker.ts";

test("3 consecutive failures → down; usable again only after cooldown", () => {
  let clock = 0;
  const breaker = createSettlementBreaker({
    failuresToDown: 3,
    cooldownMs: 60_000,
    now: () => clock,
  });

  a.equal(breaker.health("r"), "healthy");
  a.equal(breaker.isUsable("r"), true);

  breaker.recordFailure("r");
  a.equal(breaker.health("r"), "degraded");
  a.equal(breaker.isUsable("r"), true); // still usable below threshold

  breaker.recordFailure("r");
  breaker.recordFailure("r");
  a.equal(breaker.health("r"), "down");
  a.equal(breaker.isUsable("r"), false); // skipped while cooling

  clock = 59_999;
  a.equal(breaker.isUsable("r"), false);
  clock = 60_001;
  a.equal(breaker.isUsable("r"), true); // trial attempt after cooldown
});

test("recordSuccess restores healthy and resets the counter", () => {
  const breaker = createSettlementBreaker({
    failuresToDown: 3,
    cooldownMs: 60_000,
  });
  breaker.recordFailure("r");
  breaker.recordFailure("r");
  breaker.recordSuccess("r");
  a.equal(breaker.health("r"), "healthy");
  a.equal(breaker.isUsable("r"), true);

  // Counter reset: it takes a fresh 3 failures to go down again.
  breaker.recordFailure("r");
  breaker.recordFailure("r");
  a.equal(breaker.health("r"), "degraded");
});

test("SP-7: breaker state is per-rail — one down rail never blocks another", () => {
  const breaker = createSettlementBreaker({
    failuresToDown: 1,
    cooldownMs: 60_000,
  });
  breaker.recordFailure("a");
  a.equal(breaker.health("a"), "down");
  a.equal(breaker.isUsable("a"), false);
  a.equal(breaker.isUsable("b"), true); // independent
  a.equal(breaker.health("b"), "healthy");
});
