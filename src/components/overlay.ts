// Global overlay (sheet) state: metric explanations, source viewer, glossary terms, flow inspector.
import { useSyncExternalStore } from 'react';
import type { SourceRef } from '../types/domain';
import type { Metric } from '../engines/explain/metrics';
import type { Flow } from '../engines/scenarios/compute';

export type Overlay =
  | { kind: 'metric'; metric: Metric }
  | { kind: 'source'; ref: SourceRef }
  | { kind: 'term'; term: string }
  | { kind: 'flow'; flow: Flow }
  | { kind: 'custom'; title: string; body: () => unknown }
  | null;

let cur: Overlay = null;
let stack: Overlay[] = [];
const ls = new Set<() => void>();
export function openOverlay(o: Overlay) {
  if (cur) stack.push(cur);
  cur = o;
  ls.forEach((l) => l());
}
export function closeOverlay() {
  cur = stack.pop() ?? null;
  ls.forEach((l) => l());
}
export function closeAll() {
  stack = [];
  cur = null;
  ls.forEach((l) => l());
}
export function useOverlay(): Overlay {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => cur,
    () => cur,
  );
}
export const hasBack = () => stack.length > 0;
