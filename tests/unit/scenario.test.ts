import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScenario, neutralize } from '../../src/engines/scenarios/compute';
import { defaultScenarios, makeScenario } from '../../src/data/synthetic/defaultScenario';
import { analyzeControl } from '../../src/engines/corporate/control';
import { computeTickets, sponsorValue, employerPayroll, ontarioEht } from '../../src/engines/events/events';
import { applyPreset, evaluateStructures, recommend, PRESETS } from '../../src/engines/optimization/optimize';
import { applyKnobs, defaultKnobs } from '../../src/engines/scenarios/knobs';
import { buildMetrics } from '../../src/engines/explain/metrics';
import type { Scenario } from '../../src/types/domain';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('every default arrangement reconciles (sources = uses, flows balance, eliminations)', () => {
  for (const s of defaultScenarios()) {
    const r = computeScenario(s);
    for (const c of r.reconciliation.checks) assert.ok(c.ok, `${s.name}: ${c.label} diff ${c.diff}`);
  }
});

test('intercompany transfers are eliminated and not counted as profit', () => {
  const s = makeScenario('full-loan');
  const r = computeScenario(s);
  const internalInterest = sum(r.flows.filter((f) => f.kind === 'interest' && f.internal).map((f) => f.gross));
  assert.ok(internalInterest > 0);
  // Group pre-tax equals external revenue − external costs (+ external grants), independent of internal interest
  const extGrants = sum(r.flows.filter((f) => ['grant', 'donation', 'restricted-funding'].includes(f.kind) && !f.internal && s.entities.find((e) => e.id === f.to)?.inGroup).map((f) => f.gross));
  assert.ok(Math.abs(r.group.groupPreTax - (r.group.externalRevenue - r.group.externalCosts + extGrants)) < 1);
});

test('loan structure: no Canadian withholding on related interest under the treaty; withholding when treaty not claimed', () => {
  const s = makeScenario('full-loan');
  const r = computeScenario(s);
  assert.equal(sum(r.flows.filter((f) => f.kind === 'interest' && f.to === 'txg').map((f) => f.withholding)), 0);
  const s2: Scenario = { ...s, taxSettings: { ...s.taxSettings, treatyClaimed: false } };
  const r2 = computeScenario(s2);
  assert.equal(sum(r2.flows.filter((f) => f.kind === 'interest' && f.to === 'txg').map((f) => f.withholding)), 3 * 140000 * 0.25);
});

test('equity structure: dividends withheld at 15% for a pass-through LLC owned by individuals', () => {
  const r = computeScenario(makeScenario('minority-equity'));
  const divs = r.flows.filter((f) => f.kind === 'dividend' && f.to === 'txg');
  assert.ok(divs.length > 0, 'expected dividends to Three X Global');
  for (const d of divs) assert.ok(Math.abs(d.withholding - d.gross * 0.15) < 0.01);
});

test('thin capitalization applies when the lender is also a ≥25% shareholder with little equity', () => {
  const s = makeScenario('hybrid');
  // Make TXG a 40% holder with tiny equity and a large loan
  const eq = s.relationships.find((r) => r.id === 'r-equity')!;
  eq.amount = 10_000;
  eq.equity!.shares = 67;
  const loan = s.relationships.find((r) => r.id === 'r-loan')!;
  loan.amount = 3_000_000;
  const r = computeScenario(s);
  assert.ok(r.entityYears.op.some((y) => y.nonDeductibleInterest > 0));
  assert.ok(r.issues.some((i) => i.id.startsWith('thincap-')));
});

test('CCPC: 51% Canadian ownership with a non-resident majority board fails de facto control', () => {
  const s = makeScenario('minority-equity');
  const eq = s.relationships.find((r) => r.id === 'r-equity')!;
  eq.equity!.shares = 96; // ~49%
  eq.rights = { boardSeats: 3, boardSize: 5 };
  const c = analyzeControl(s);
  assert.equal(c.tests.find((t) => t.id === 'para-a')!.result, 'pass');
  assert.equal(c.tests.find((t) => t.id === 'de-facto')!.result, 'fail');
  assert.equal(c.status, 'likely-not-ccpc');
});

test('CCPC: options count as exercised (s. 251(5)(b))', () => {
  const s = makeScenario('minority-equity');
  const eq = s.relationships.find((r) => r.id === 'r-equity')!;
  eq.rights = { optionShares: 200, optionVotesPerShare: 1 };
  const c = analyzeControl(s);
  assert.equal(c.tests.find((t) => t.id === 'para-a')!.result, 'fail');
});

test('CCPC headroom is computed from votes', () => {
  const s = makeScenario('full-loan');
  const c = analyzeControl(s);
  assert.ok(c.headroomPct > 0.49 && c.headroomPct <= 0.5);
});

test('ticketing reconciles products to paid admissions and HST is excluded from revenue', () => {
  const t = computeTickets({ capacityPerSession: 1000, sessions: 2, sellThrough: 0.5, compsPct: 0, refundsPct: 0, commissionPct: 0.1, pricesIncludeHst: true, products: [{ id: 'a', name: 'GA', price: 113, mix: 1, admissionsPerProduct: 1 }] }, 0.13);
  assert.equal(t.paidAdmissions, 1000);
  assert.ok(Math.abs(t.netRevenue - 100_000) < 1e-6);
  assert.ok(Math.abs(t.hst - 13_000) < 1e-6);
  assert.ok(Math.abs(t.commission - 11_300) < 1e-6);
});

test('sponsorship bases', () => {
  const d = { id: 's', name: 'x', tier: 'presenting' as const, proposed: 100, confirmed: 0, cash: true, status: 'proposal' as const, probability: 0.4, paymentMonth: 5, exclusivity: true, termYears: 1, fibaRightsConflict: 'unknown' as const };
  assert.equal(sponsorValue(d, 'confirmed'), 0);
  assert.equal(sponsorValue(d, 'expected'), 40);
  assert.equal(sponsorValue(d, 'proposed'), 100);
  assert.equal(sponsorValue({ ...d, status: 'signed', confirmed: 90 }, 'confirmed'), 90);
});

test('employer payroll contributions and EHT exemption', () => {
  const p = employerPayroll(100_000, 1, 2026);
  assert.ok(Math.abs(p.cpp - (74_600 - 3_500) * 0.0595) < 1e-6);
  assert.ok(Math.abs(p.cpp2 - (85_000 - 74_600) * 0.04) < 1e-6);
  assert.ok(Math.abs(p.ei - 68_900 * 0.0228) < 1e-6);
  assert.equal(ontarioEht(900_000, true), 0);
  assert.ok(Math.abs(ontarioEht(1_500_000, true) - 500_000 * 0.0195) < 1e-6);
});

test('neutral comparison shows whether a structure shifts tax', () => {
  const s = makeScenario('hybrid');
  const n = neutralize(s);
  assert.ok(n.relationships.every((r) => !(r.from === 'txg' && r.to === 'op' && r.type === 'intercompany-loan')));
  const r = computeScenario(s);
  assert.ok(r.comparison);
  assert.ok(Number.isFinite(r.comparison!.delta));
});

test('every preset computes and reconciles', () => {
  const base = makeScenario('hybrid');
  for (const p of PRESETS) {
    const r = computeScenario(applyPreset(base, p.id), { skipComparison: true });
    assert.ok(r.reconciliation.ok, `${p.name}: ${r.reconciliation.checks.filter((c) => !c.ok).map((c) => c.label)}`);
  }
});

test('scenario comparison ranking is deterministic and explains the winner', () => {
  const base = makeScenario('hybrid');
  const w = { minTax: 3, investorReturn: 3, canadianRetained: 2, txgReturn: 2, flexibility: 1, lowFinancingRisk: 2, canadianControl: 3, community: 1 };
  const a = evaluateStructures(base, w).map((e) => [e.id, e.score.toFixed(6)]);
  const b = evaluateStructures(base, w).map((e) => [e.id, e.score.toFixed(6)]);
  assert.deepEqual(a, b);
  const rec = recommend(evaluateStructures(base, w), w);
  assert.ok(rec.headline.length > 10);
  assert.ok(rec.why.length > 0);
  assert.ok(rec.professional.length > 0);
});

test('What-If knobs: sponsorship down reduces revenue; attribution per knob is consistent', () => {
  const s = makeScenario('hybrid');
  const k = { ...defaultKnobs(s), sponsorshipMult: 0.5 };
  const before = computeScenario(s, { skipComparison: true });
  const after = computeScenario(applyKnobs(s, k), { skipComparison: true });
  assert.ok(sum(after.events.map((e) => e.revenueTotal)) < sum(before.events.map((e) => e.revenueTotal)));
  const only = computeScenario(applyKnobs(s, k, 'sponsorshipMult'), { skipComparison: true });
  assert.equal(sum(only.events.map((e) => e.revenueTotal)), sum(after.events.map((e) => e.revenueTotal)));
});

test('What-If cancellation removes the event year revenue but keeps sunk costs', () => {
  const s = makeScenario('hybrid');
  const k = { ...defaultKnobs(s), cancel: 'ev-men:2028' };
  const r = computeScenario(applyKnobs(s, k), { skipComparison: true });
  const cx = r.events.find((e) => e.name.includes('cancelled') && e.year === 2028)!;
  assert.ok(cx);
  assert.ok(cx.revenueTotal < 1);
  assert.ok(cx.costTotal > 0);
  assert.ok(r.reconciliation.ok);
});

test('explanation modes never change values', () => {
  const s = makeScenario('hybrid');
  const r = computeScenario(s);
  const m = buildMetrics(r, s);
  for (const metric of Object.values(m)) {
    const v = metric.value;
    for (const mode of ['simple', 'business', 'expert'] as const) {
      const e = metric.explain(mode);
      assert.ok(e.what.length > 0, metric.id);
    }
    assert.equal(metric.value, v);
  }
});
