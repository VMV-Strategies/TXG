import { useEffect, type ReactNode } from 'react';
import { GROUP_ICON, GROUPS, ROUTES, go, useRoute } from './routes';
import { Icon } from '../components/icons';
import { OverlayHost, Segmented } from '../components/ui';
import { activeScenario, redo, setActive, setUi, undo, useStore } from '../state/store';
import { cls, relTime } from '../utils/format';
import { OverviewPage } from '../features/dashboard/OverviewPage';
import { EntityMapPage } from '../features/entities/EntityMapPage';
import { DealLabPage } from '../features/deal-lab/DealLabPage';
import { WhatIfPage } from '../features/deal-lab/WhatIfPage';
import { MoneyFlowPage } from '../features/money-flow/MoneyFlowPage';
import { FollowDollarPage } from '../features/money-flow/FollowDollarPage';
import { TaxPage } from '../features/tax/TaxPage';
import { EventsPage } from '../features/events/EventsPage';
import { RevenuePage } from '../features/sponsorship/RevenuePage';
import { ComparePage } from '../features/recommendations/ComparePage';
import { RecommendationsPage } from '../features/recommendations/RecommendationsPage';
import { FibaPage } from '../features/fiba/FibaPage';
import { OperationsPage } from '../features/fiba/OperationsPage';
import { FoundationPage } from '../features/entities/FoundationPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const PAGES: Record<string, () => ReactNode> = {
  overview: () => <OverviewPage />,
  entities: () => <EntityMapPage />,
  'deal-lab': () => <DealLabPage />,
  'what-if': () => <WhatIfPage />,
  'money-flow': () => <MoneyFlowPage />,
  'follow-the-dollar': () => <FollowDollarPage />,
  tax: () => <TaxPage />,
  events: () => <EventsPage />,
  revenue: () => <RevenuePage />,
  compare: () => <ComparePage />,
  recommendations: () => <RecommendationsPage />,
  fiba: () => <FibaPage />,
  operations: () => <OperationsPage />,
  foundation: () => <FoundationPage />,
  documents: () => <DocumentsPage />,
  reports: () => <ReportsPage />,
  settings: () => <SettingsPage />,
};

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f5f5f7'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  useTheme();
  const ready = useStore((s) => s.ready);
  const { route } = useRoute();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);
  if (!ready)
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <div className="muted text-sm">Opening your local workspace…</div>
      </div>
    );
  const page = route.startsWith('group-') ? <GroupPage group={route.slice(6) as (typeof GROUPS)[number]} /> : (PAGES[route] ?? PAGES.overview)();
  return (
    <div className="min-h-dvh md:pl-[248px]">
      <Sidebar active={route} />
      <TopBar route={route} />
      <main id="main" key={route}>
        {page}
      </main>
      <BottomNav route={route} />
      <OverlayHost />
      <Toast />
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <nav aria-label="Primary" className="glass no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r px-3 pb-4 pt-5 md:flex hairline">
      <a href="#/overview" className="mb-5 flex items-center gap-2.5 px-2">
        <img src="icons/icon.svg" alt="" width={30} height={30} className="rounded-[8px]" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-wide">THREE X</div>
          <div className="muted text-[11px]">Venture Intelligence</div>
        </div>
      </a>
      <div className="flex-1 space-y-4 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g}>
            {g !== 'Overview' ? <div className="label px-2 pb-1">{g}</div> : null}
            {ROUTES.filter((r) => r.group === g).map((r) => (
              <a key={r.id} href={`#/${r.id}`} aria-current={active === r.id ? 'page' : undefined} className={cls('flex items-center gap-2.5 rounded-[10px] px-2 py-[7px] text-[14px] transition-colors', active === r.id ? 'font-semibold' : 'ink2 hover:bg-[var(--accent-soft)]')} style={active === r.id ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}>
                <Icon name={r.icon} size={18} />
                {r.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <SavedIndicator />
    </nav>
  );
}

function SavedIndicator() {
  const { lastSaved, saving, saveError } = useStore((s) => ({ lastSaved: s.lastSaved, saving: s.saving, saveError: s.saveError }));
  return (
    <div className="mt-3 flex items-center gap-1.5 px-2 text-[12px] muted" data-testid="saved-indicator" aria-live="polite">
      {saveError ? (
        <span style={{ color: 'var(--bad)' }}>Not saved: {saveError}</span>
      ) : saving ? (
        <span>Saving…</span>
      ) : (
        <>
          <Icon name="check" size={13} />
          <span>{lastSaved ? `Saved locally ${relTime(lastSaved)}` : 'Stored on this device'}</span>
        </>
      )}
    </div>
  );
}

function TopBar({ route }: { route: string }) {
  const { scenarios, activeId, mode, currency, canUndo, canRedo } = useStore((s) => ({ scenarios: s.scenarios, activeId: s.activeId, mode: s.mode, currency: s.currency, canUndo: (s.past[s.activeId] ?? []).length > 0, canRedo: (s.future[s.activeId] ?? []).length > 0 }));
  const scn = useStore((s) => activeScenario(s));
  const label = ROUTES.find((r) => r.id === route)?.label ?? 'THREE X';
  return (
    <div className="glass no-print sticky top-0 z-20 border-b hairline safe-top">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 md:px-8">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="hidden text-[13px] font-semibold sm:inline md:hidden">{label}</span>
          <label className="sr-only" htmlFor="scenario-select">
            Active scenario
          </label>
          <select id="scenario-select" data-testid="scenario-select" className="input h-8 min-h-0 min-w-0 max-w-[200px] flex-1 py-0 text-[13px] md:max-w-[300px]" value={activeId} onChange={(e: { target: HTMLSelectElement }) => setActive(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {scn?.baseline === 'synthetic' ? (
            <span className="badge hidden sm:inline-flex" style={{ background: 'rgba(118,118,128,.14)', color: 'var(--ink-2)' }}>
              Synthetic demo data
            </span>
          ) : scn?.baseline === 'workbook' ? (
            <span className="badge hidden sm:inline-flex" style={{ background: 'rgba(175,82,222,.12)', color: 'var(--chart-4)' }}>
              Workbook baseline
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-ghost h-8 min-h-0 px-2" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="btn btn-ghost h-8 min-h-0 px-2" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
            <Icon name="redo" size={16} />
          </button>
          <div className="hidden sm:block">
            <Segmented label="Explanation mode" value={mode} onChange={(v) => setUi({ mode: v })} options={[{ value: 'simple', label: 'Simple' }, { value: 'business', label: 'Business' }, { value: 'expert', label: 'Expert' }]} />
          </div>
          <label className="sr-only" htmlFor="mode-select">
            Explanation mode
          </label>
          <select id="mode-select" className="input h-8 min-h-0 w-auto py-0 text-[13px] sm:hidden" value={mode} onChange={(e: { target: HTMLSelectElement }) => setUi({ mode: e.target.value as typeof mode })}>
            <option value="simple">Simple</option>
            <option value="business">Business</option>
            <option value="expert">Expert</option>
          </select>
          <Segmented label="Display currency" value={currency} onChange={(v) => setUi({ currency: v })} options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]} />
        </div>
      </div>
    </div>
  );
}

function BottomNav({ route }: { route: string }) {
  const groupOf = route.startsWith('group-') ? route.slice(6) : ROUTES.find((r) => r.id === route)?.group;
  return (
    <nav aria-label="Primary" className="glass no-print fixed inset-x-0 bottom-0 z-30 border-t hairline md:hidden safe-bottom">
      <div className="grid grid-cols-5">
        {GROUPS.map((g) => (
          <button key={g} type="button" onClick={() => (g === 'Overview' ? go('overview') : go(`group-${g}`))} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium" style={{ color: groupOf === g ? 'var(--accent)' : 'var(--ink-3)' }} aria-current={groupOf === g ? 'page' : undefined}>
            <Icon name={GROUP_ICON[g]} size={22} />
            {g === 'Output' ? 'More' : g}
          </button>
        ))}
      </div>
    </nav>
  );
}

function GroupPage({ group }: { group: (typeof GROUPS)[number] }) {
  const items = ROUTES.filter((r) => r.group === group);
  const descriptions: Record<string, string> = {
    entities: 'Drag entities and connect them with financial relationships.',
    'deal-lab': 'Compare financing structures and Canadian-control tests.',
    'what-if': 'Move sliders and see before → after instantly.',
    'money-flow': 'Trace every dollar between entities.',
    'follow-the-dollar': 'A guided walk-through of an investment.',
    tax: 'Canadian and U.S. tax with citations.',
    events: 'Men’s and women’s event P&L, tickets and break-even.',
    revenue: 'Sponsorship pipeline and ticketing.',
    compare: 'Rank structures by your priorities.',
    recommendations: 'What makes the most sense — and why.',
    fiba: 'Competition requirements and agreement checklist.',
    operations: 'Tasks, deadlines and launch readiness.',
    foundation: 'How the Foundation can participate legitimately.',
    documents: 'Private local library and offline legal search.',
    reports: 'Presentation-ready exports.',
    settings: 'Backup, restore, storage, data deletion.',
  };
  return (
    <div className="fade-in mx-auto max-w-xl px-4 pb-28 pt-4">
      <h1 className="h1 mb-4">{group === 'Output' ? 'More' : group}</h1>
      <div className="card divide-y overflow-hidden" style={{ borderColor: 'var(--line)' }}>
        {items.map((r) => (
          <a key={r.id} href={`#/${r.id}`} className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Icon name={r.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{r.label}</span>
              <span className="muted block truncate text-[12px]">{descriptions[r.id] ?? ''}</span>
            </span>
            <Icon name="next" size={16} className="muted" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Toast() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6" role="status" aria-live="polite">
      <div className="card fade-in max-w-md px-4 py-3 text-[14px]">{t}</div>
    </div>
  );
}
