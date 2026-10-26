import { useMemo } from 'react';
import type { Scenario } from '../types/domain';
import { computeScenario, type ScenarioResult } from '../engines/scenarios/compute';
import { buildMetrics, type Metric } from '../engines/explain/metrics';
import { activeScenario, useStore } from '../state/store';

const cache = new WeakMap<Scenario, ScenarioResult>();

/** Memoised computation keyed by scenario object identity (scenarios are immutable snapshots). */
export function resultFor(s: Scenario): ScenarioResult {
  let r = cache.get(s);
  if (!r) {
    r = computeScenario(s);
    cache.set(s, r);
  }
  return r;
}

export function useActive(): { scn: Scenario; result: ScenarioResult; metrics: Record<string, Metric> } {
  const scn = useStore((s) => activeScenario(s));
  const result = useMemo(() => resultFor(scn), [scn]);
  const metrics = useMemo(() => buildMetrics(result, scn), [result, scn]);
  return { scn, result, metrics };
}
