/**
 * Unit tests for `BridgeEventBus`. Covers ring buffer behavior and
 * fire-and-forget sink semantics.
 *
 * Run from mobile-app root:
 *   node --test --experimental-strip-types services/bridge/events.test.ts
 */

// @ts-expect-error — RN runtime global, not defined in Node test runner.
globalThis.__DEV__ = false;

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BridgeEventBus,
  type BridgeEvent,
  type BridgeEventSink,
} from "./events.ts";

function navigateEvent(i: number): BridgeEvent {
  return { kind: "navigate", at: i, url: `https://x.test/${i}` };
}

describe("BridgeEventBus — ring buffer", () => {
  it("recent() returns all events up to the cap", () => {
    const bus = new BridgeEventBus(5);
    for (let i = 0; i < 3; i++) bus.emit(navigateEvent(i));
    const r = bus.recent();
    assert.equal(r.length, 3);
  });

  it("discards the oldest events past capacity", () => {
    const bus = new BridgeEventBus(5);
    for (let i = 0; i < 10; i++) bus.emit(navigateEvent(i));
    const r = bus.recent();
    assert.equal(r.length, 5);
    // Oldest should be index 5, newest index 9.
    assert.equal((r[0] as { at: number }).at, 5);
    assert.equal((r[4] as { at: number }).at, 9);
  });

  it("recent(n) returns the last n events", () => {
    const bus = new BridgeEventBus(10);
    for (let i = 0; i < 10; i++) bus.emit(navigateEvent(i));
    const r = bus.recent(3);
    assert.equal(r.length, 3);
    assert.equal((r[0] as { at: number }).at, 7);
    assert.equal((r[2] as { at: number }).at, 9);
  });

  it("clear empties the buffer", () => {
    const bus = new BridgeEventBus();
    bus.emit(navigateEvent(0));
    bus.clear();
    assert.equal(bus.recent().length, 0);
  });
});

describe("BridgeEventBus — sinks", () => {
  it("subscribe returns an unsubscribe function", () => {
    const bus = new BridgeEventBus();
    const seen: BridgeEvent[] = [];
    const sink: BridgeEventSink = { emit: (e) => seen.push(e) };
    const off = bus.subscribe(sink);
    bus.emit(navigateEvent(1));
    off();
    bus.emit(navigateEvent(2));
    assert.equal(seen.length, 1);
    assert.equal((seen[0] as { at: number }).at, 1);
  });

  it("a throwing sink does not break other sinks or the bus", () => {
    const bus = new BridgeEventBus();
    const calls: number[] = [];
    bus.subscribe({
      emit: () => {
        throw new Error("bad sink");
      },
    });
    bus.subscribe({ emit: () => calls.push(1) });

    // Must not throw and must still deliver to the non-broken sink.
    bus.emit(navigateEvent(0));
    assert.deepEqual(calls, [1]);
  });

  it("multiple sinks each receive the same event", () => {
    const bus = new BridgeEventBus();
    const a: BridgeEvent[] = [];
    const b: BridgeEvent[] = [];
    bus.subscribe({ emit: (e) => a.push(e) });
    bus.subscribe({ emit: (e) => b.push(e) });
    bus.emit(navigateEvent(0));
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(a[0], b[0]);
  });
});
