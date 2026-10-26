import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBaseReserve, distributionLogic } from "../service_functionality/distributionMath";

//seeded rng (mulberry32) — same seed, same sequence, every run
function seededRng(seed: number): () => number {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const amounts = (r: ReturnType<typeof distributionLogic>) => r.allocations.map(a => a.transferAmount);

const BASE = 10_044_440n;           //≈ 0.01 SOL reserve per slave
const AWKWARD_TOTAL = 1_000_000_007n; //≈ 1 SOL, deliberately not divisible

test("computeBaseReserve matches hand-calculated reserve", () => {
    const reserve = computeBaseReserve(890_880n, 2_039_280n, {
        txHeadroom: 5, baseFeePerTx: 5_000n, priorityFeePerTx: 10_000n, tipPerTx: 1_000_000n,
    });
    assert.equal(reserve, 10_044_440n);
});

test("even: sums exactly, every wallet within 1 lamport", () => {
    const r = distributionLogic({ grandTotal: AWKWARD_TOTAL, walletCount: 25, baseReserve: BASE, splitMode: "even" });
    const a = amounts(r);
    assert.equal(a.length, 25);
    assert.equal(sum(a), AWKWARD_TOTAL);
    const min = a.reduce((x, y) => (y < x ? y : x));
    const max = a.reduce((x, y) => (y > x ? y : x));
    assert.ok(max - min <= 1n, `spread ${max - min} lamports`);
});

test("random: sums exactly, every wallet >= base + floor", () => {
    const r = distributionLogic({ grandTotal: AWKWARD_TOTAL, walletCount: 25, baseReserve: BASE, splitMode: "random", rng: seededRng(42) });
    const a = amounts(r);
    assert.equal(sum(a), AWKWARD_TOTAL);
    const adjusted = AWKWARD_TOTAL - BASE * 25n;
    const floorPerWallet = (adjusted / 3n) / 25n;
    for (const amt of a) assert.ok(amt >= BASE + floorPerWallet, `wallet got ${amt}`);
});

test("random: same seed gives identical output, different seed differs", () => {
    const run = (seed: number) => amounts(distributionLogic({
        grandTotal: AWKWARD_TOTAL, walletCount: 25, baseReserve: BASE, splitMode: "random", rng: seededRng(seed),
    }));
    assert.deepEqual(run(7), run(7));
    assert.notDeepEqual(run(7), run(8));
});

test("positions are 0..n-1 in order", () => {
    const r = distributionLogic({ grandTotal: AWKWARD_TOTAL, walletCount: 25, baseReserve: BASE, splitMode: "even" });
    r.allocations.forEach((a, i) => assert.equal(a.position, i));
});

test("single wallet gets the entire grand total, both modes", () => {
    for (const splitMode of ["even", "random"] as const) {
        const r = distributionLogic({ grandTotal: AWKWARD_TOTAL, walletCount: 1, baseReserve: BASE, splitMode, rng: seededRng(1) });
        assert.equal(amounts(r)[0], AWKWARD_TOTAL);
    }
});

test("throws when grand total only covers reserves", () => {
    assert.throws(() => distributionLogic({ grandTotal: BASE * 25n, walletCount: 25, baseReserve: BASE, splitMode: "even" }));
});

test("throws when grand total is below reserves", () => {
    assert.throws(() => distributionLogic({ grandTotal: BASE * 24n, walletCount: 25, baseReserve: BASE, splitMode: "random", rng: seededRng(1) }));
});