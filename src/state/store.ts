// Application state: a tiny external store (useSyncExternalStore) with
// automatic IndexedDB persistence, undo/redo history and a visible
// last-saved indicator.
import { useRef, useSyncExternalStore } from 'react';
import type { Scenario } from '../types/domain';
import type { Mode } from '../engines/explain/metrics';
import { defaultScenarios, makeScenario } from '../data/synthetic/defaultScenario';
import * as db from '../storage/db';
import { migrateScenario } from './migrate';

export interface DocMeta {
  id: string;
  name: string;
  title: string;
  kind: string;
  size: number;
  addedAt: string;
  pageCount: number;
  hierarchy: string;
  warnings: string[];
  confidential: boolean;
  tags: string[];
}

export interface Fact {
  id: string;
  entity: string;
  field: string;
  value: string;
  source: string;
  page?: string;
  status: 'verified' | 'user-provided' | 'inconsistent' | 'unverified';
  sensitive?: boolean;
  notes?: string;
}

export interface AppState {
  ready: boolean;
  scenarios: Scenario[];
  activeId: string;
  mode: Mode;
  currency: 'CAD' | 'USD';
  theme: 'system' | 'light' | 'dark';
  lastSaved: string | null;
  saving: boolean;
  saveError: string | null;
  docs: DocMeta[];
  facts: Fact[];
  past: Record<string, Scenario[]>;
  future: Record<string, Scenario[]>;
  compareIds: string[];
  toast: string | null;
  storageWarning: string | null;
}

let state: AppState = {
  ready: false,
  scenarios: [],
  activeId: '',
  mode: 'simple',
  currency: 'CAD',
  theme: 'system',
  lastSaved: null,
  saving: false,
  saveError: null,
  docs: [],
  facts: [],
  past: {},
  future: {},
  compareIds: [],
  toast: null,
  storageWarning: null,
};

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Subscribe to a slice of state. Object/array selections are compared shallowly so they do not re-render needlessly. */
export function useStore<T>(sel: (s: AppState) => T): T {
  const memo = useRef<{ st: AppState | null; v: T } | null>(null);
  const getSnapshot = () => {
    const m = memo.current;
    if (m && m.st === state) return m.v;
    const next = sel(state);
    if (m && shallowEqual(m.v, next)) {
      memo.current = { st: state, v: m.v };
      return m.v;
    }
    memo.current = { st: state, v: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function activeScenario(s = state): Scenario {
  return s.scenarios.find((x) => x.id === s.activeId) ?? s.scenarios[0];
}

// ---------- persistence ----------
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const dirty = new Set<string>();

function scheduleSave(id: string) {
  dirty.add(id);
  if (saveTimer) clearTimeout(saveTimer);
  setState({ saving: true });
  saveTimer = setTimeout(flush, 500);
}

export async function flush() {
  const ids = [...dirty];
  dirty.clear();
  try {
    for (const id of ids) {
      const s = state.scenarios.find((x) => x.id === id);
      if (s) await db.put('scenarios', s);
      else await db.del('scenarios', id);
    }
    await db.put('settings', { activeId: state.activeId, mode: state.mode, currency: state.currency, theme: state.theme, compareIds: state.compareIds }, 'ui');
    const now = new Date().toISOString();
    await db.put('meta', now, 'lastSaved');
    setState({ saving: false, lastSaved: now, saveError: null });
  } catch (e) {
    setState({ saving: false, saveError: (e as Error).message });
  }
}

export async function init() {
  try {
    const [saved, ui, docs, facts, last] = await Promise.all([db.getAll<Scenario>('scenarios'), db.get<Record<string, unknown>>('settings', 'ui'), db.getAll<DocMeta>('documents'), db.getAll<Fact>('facts'), db.get<string>('meta', 'lastSaved')]);
    let scenarios = saved.map((s) => migrateScenario(s));
    if (!scenarios.length) {
      scenarios = defaultScenarios();
      for (const s of scenarios) await db.put('scenarios', s);
    }
    const activeId = (ui?.activeId as string) && scenarios.some((s) => s.id === ui?.activeId) ? (ui!.activeId as string) : (scenarios.find((s) => s.id === 'scn-hybrid') ?? scenarios[0]).id;
    setState({
      ready: true,
      scenarios,
      activeId,
      mode: (ui?.mode as Mode) ?? 'simple',
      currency: (ui?.currency as 'CAD' | 'USD') ?? 'CAD',
      theme: (ui?.theme as AppState['theme']) ?? 'system',
      compareIds: (ui?.compareIds as string[]) ?? scenarios.slice(0, 4).map((s) => s.id),
      docs,
      facts,
      lastSaved: last ?? null,
    });
    const info = await db.storageInfo();
    setState({ storageWarning: info.warning });
  } catch (e) {
    // IndexedDB unavailable (e.g., private mode): run in memory and say so.
    const scenarios = defaultScenarios();
    setState({ ready: true, scenarios, activeId: 'scn-hybrid', saveError: `Local storage unavailable — changes will not persist (${(e as Error).message}).`, compareIds: scenarios.map((s) => s.id) });
  }
}

// ---------- scenario mutations ----------
const HISTORY = 50;

export function updateScenario(mut: (s: Scenario) => Scenario | void, opts: { history?: boolean } = { history: true }) {
  const cur = activeScenario();
  if (!cur) return;
  const draft: Scenario = structuredClone(cur);
  const res = mut(draft) ?? draft;
  res.updatedAt = new Date().toISOString();
  setState((s) => ({
    scenarios: s.scenarios.map((x) => (x.id === cur.id ? res : x)),
    past: opts.history ? { ...s.past, [cur.id]: [...(s.past[cur.id] ?? []).slice(-HISTORY + 1), cur] } : s.past,
    future: opts.history ? { ...s.future, [cur.id]: [] } : s.future,
  }));
  scheduleSave(cur.id);
}

export function undo() {
  const cur = activeScenario();
  const stack = state.past[cur.id] ?? [];
  if (!stack.length) return;
  const prev = stack[stack.length - 1];
  setState((s) => ({ scenarios: s.scenarios.map((x) => (x.id === cur.id ? prev : x)), past: { ...s.past, [cur.id]: stack.slice(0, -1) }, future: { ...s.future, [cur.id]: [cur, ...(s.future[cur.id] ?? [])] } }));
  scheduleSave(cur.id);
}

export function redo() {
  const cur = activeScenario();
  const stack = state.future[cur.id] ?? [];
  if (!stack.length) return;
  const next = stack[0];
  setState((s) => ({ scenarios: s.scenarios.map((x) => (x.id === cur.id ? next : x)), future: { ...s.future, [cur.id]: stack.slice(1) }, past: { ...s.past, [cur.id]: [...(s.past[cur.id] ?? []), cur] } }));
  scheduleSave(cur.id);
}

export function addScenario(s: Scenario, activate = true) {
  const id = uniqueId(s.id);
  const sc = { ...s, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setState((st) => ({ scenarios: [...st.scenarios, sc], activeId: activate ? id : st.activeId, compareIds: st.compareIds.length < 6 ? [...st.compareIds, id] : st.compareIds }));
  scheduleSave(id);
  return id;
}

export function duplicateScenario(id = state.activeId) {
  const s = state.scenarios.find((x) => x.id === id);
  if (!s) return;
  return addScenario({ ...structuredClone(s), id: `${s.id}-copy`, name: `${s.name} (copy)` });
}

export function deleteScenario(id: string) {
  if (state.scenarios.length <= 1) return;
  setState((s) => {
    const scenarios = s.scenarios.filter((x) => x.id !== id);
    return { scenarios, activeId: s.activeId === id ? scenarios[0].id : s.activeId, compareIds: s.compareIds.filter((x) => x !== id) };
  });
  scheduleSave(id);
}

export function resetScenario() {
  const cur = activeScenario();
  const fresh = cur.id.startsWith('scn-') ? makeScenario(cur.id.replace('scn-', '') as Parameters<typeof makeScenario>[0]) : null;
  if (!fresh) return toast('Only built-in demonstration scenarios can be reset.');
  updateScenario(() => ({ ...fresh, id: cur.id }));
}

export function setActive(id: string) {
  setState({ activeId: id });
  scheduleSave(id);
}

export function setUi(p: Partial<Pick<AppState, 'mode' | 'currency' | 'theme' | 'compareIds'>>) {
  setState(p);
  scheduleSave(state.activeId);
}

function uniqueId(base: string) {
  let id = base;
  let n = 2;
  while (state.scenarios.some((s) => s.id === id)) id = `${base}-${n++}`;
  return id;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string) {
  setState({ toast: msg });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 3200);
}

export async function saveFacts(facts: Fact[]) {
  await db.clearStore('facts');
  await db.putMany('facts', facts);
  setState({ facts });
}
