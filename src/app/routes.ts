import { useSyncExternalStore } from 'react';

export interface RouteDef {
  id: string;
  label: string;
  icon: string;
  group: 'Overview' | 'Structure' | 'Analysis' | 'Operations' | 'Output';
}

export const ROUTES: RouteDef[] = [
  { id: 'overview', label: 'Overview', icon: 'overview', group: 'Overview' },
  { id: 'entities', label: 'Entity Map', icon: 'entities', group: 'Structure' },
  { id: 'deal-lab', label: 'Deal Lab', icon: 'deal', group: 'Structure' },
  { id: 'what-if', label: 'What If?', icon: 'whatif', group: 'Structure' },
  { id: 'money-flow', label: 'Money Flow', icon: 'flow', group: 'Structure' },
  { id: 'follow-the-dollar', label: 'Follow the Dollar', icon: 'dollar', group: 'Structure' },
  { id: 'tax', label: 'Tax Intelligence', icon: 'tax', group: 'Analysis' },
  { id: 'events', label: 'Event Financials', icon: 'events', group: 'Analysis' },
  { id: 'revenue', label: 'Revenue & Sponsorship', icon: 'revenue', group: 'Analysis' },
  { id: 'compare', label: 'Scenario Comparison', icon: 'compare', group: 'Analysis' },
  { id: 'recommendations', label: 'Recommendations', icon: 'recommend', group: 'Analysis' },
  { id: 'fiba', label: 'FIBA Operations', icon: 'fiba', group: 'Operations' },
  { id: 'operations', label: 'Project Operations', icon: 'ops', group: 'Operations' },
  { id: 'foundation', label: 'Foundation', icon: 'structure', group: 'Operations' },
  { id: 'documents', label: 'Document Library', icon: 'documents', group: 'Operations' },
  { id: 'reports', label: 'Reports', icon: 'reports', group: 'Output' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Output' },
];

export const GROUPS: RouteDef['group'][] = ['Overview', 'Structure', 'Analysis', 'Operations', 'Output'];
export const GROUP_ICON: Record<RouteDef['group'], string> = { Overview: 'overview', Structure: 'structure', Analysis: 'analysis', Operations: 'ops', Output: 'more' };

export function parseHash(h = location.hash): { route: string; params: URLSearchParams } {
  const raw = h.replace(/^#\/?/, '');
  const [path, q] = raw.split('?');
  const route = ROUTES.some((r) => r.id === path) || path.startsWith('group-') ? path : 'overview';
  return { route, params: new URLSearchParams(q ?? '') };
}

export function useRoute() {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => location.hash,
    () => '',
  );
  return parseHash(hash);
}

export function go(route: string, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  location.hash = `#/${route}${q}`;
}
