import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { DataStatus, Issue, Severity, SourceRef } from '../types/domain';
import type { Explanation, Metric, Mode } from '../engines/explain/metrics';
import { Icon } from './icons';
import { closeOverlay, hasBack, openOverlay, useOverlay } from './overlay';
import { useStore } from '../state/store';
import { cls, money, multiple, pct, toDisplay } from '../utils/format';
import { findProvision, findSource, HIERARCHY_LABEL, provisionHierarchy } from '../data/sources';
import { findTerm } from '../data/glossary';
import type { ScenarioResult } from '../engines/scenarios/compute';

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="fade-in mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8 print-page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h1">{title}</h1>
          {subtitle ? <p className="muted mt-1 max-w-3xl text-[15px] leading-relaxed">{subtitle}</p> : null}
        </div>
        {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function Card({ title, subtitle, children, actions, className = '', pad = true, id }: { title?: ReactNode; subtitle?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={cls('card', pad && 'card-pad', className)} id={id}>
      {title || actions ? (
        <div className={cls('mb-3 flex flex-wrap items-start justify-between gap-2', !pad && 'px-5 pt-5')}>
          <div className="min-w-0">
            {title ? <h2 className="h3">{title}</h2> : null}
            {subtitle ? <p className="muted mt-0.5 text-[13px] leading-snug">{subtitle}</p> : null}
          </div>
          {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Button({ children, onClick, variant = 'secondary', icon, disabled, title, type = 'button', className = '', ...rest }: { children?: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string; 'data-testid'?: string; 'aria-label'?: string }) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} onClick={onClick} disabled={disabled} title={title} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<string, [string, string]> = {
  'confirmed-contract': ['var(--good-soft)', 'var(--good)'],
  legislation: ['var(--accent-soft)', 'var(--accent)'],
  'official-rule': ['var(--accent-soft)', 'var(--accent)'],
  'corporate-record': ['var(--accent-soft)', 'var(--accent)'],
  workbook: ['rgba(175,82,222,.12)', 'var(--chart-4)'],
  historical: ['rgba(118,118,128,.14)', 'var(--ink-3)'],
  assumption: ['var(--warn-soft)', 'var(--warn)'],
  pending: ['var(--warn-soft)', 'var(--warn)'],
  synthetic: ['rgba(118,118,128,.14)', 'var(--ink-2)'],
  'not-applicable': ['rgba(118,118,128,.1)', 'var(--ink-3)'],
  computed: ['var(--accent-soft)', 'var(--accent)'],
  conditional: ['var(--warn-soft)', 'var(--warn)'],
};
const STATUS_LABEL: Record<string, string> = {
  'confirmed-contract': 'Contract',
  legislation: 'Legislation',
  'official-rule': 'Official rule',
  'corporate-record': 'Corporate record',
  workbook: 'Workbook',
  historical: 'Historical',
  assumption: 'Assumption',
  pending: 'Pending',
  synthetic: 'Synthetic',
  'not-applicable': 'N/A',
  computed: 'Computed',
  conditional: 'Conditional',
};

export function StatusBadge({ status, label }: { status: DataStatus | 'computed' | 'conditional' | string; label?: string }) {
  const [bg, fg] = STATUS_STYLE[status] ?? ['rgba(118,118,128,.12)', 'var(--ink-2)'];
  return (
    <span className="badge" style={{ background: bg, color: fg }} title={`Data status: ${STATUS_LABEL[status] ?? status}`}>
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function SeverityBadge({ s }: { s: Severity }) {
  const map: Record<Severity, [string, string, string]> = { info: ['rgba(118,118,128,.12)', 'var(--ink-2)', 'Info'], watch: ['var(--accent-soft)', 'var(--accent)', 'Watch'], warning: ['var(--warn-soft)', 'var(--warn)', 'Warning'], critical: ['var(--bad-soft)', 'var(--bad)', 'Critical'] };
  const [bg, fg, l] = map[s];
  return (
    <span className="badge" style={{ background: bg, color: fg }}>
      {l}
    </span>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const m = { neutral: ['rgba(118,118,128,.12)', 'var(--ink-2)'], good: ['var(--good-soft)', 'var(--good)'], warn: ['var(--warn-soft)', 'var(--warn)'], bad: ['var(--bad-soft)', 'var(--bad)'], accent: ['var(--accent-soft)', 'var(--accent)'] }[tone];
  return (
    <span className="badge" style={{ background: m[0], color: m[1] }}>
      {children}
    </span>
  );
}

/** A key number with value, currency, year, data status and an explanation button. */
export function Stat({ metric, result, big = false, label }: { metric?: Metric; result: Pick<ScenarioResult, 'fx' | 'years'>; big?: boolean; label?: string }) {
  const cur = useStore((s) => s.currency);
  if (!metric) return null;
  const v = metric.value;
  let display: string;
  if (metric.unit === 'money') display = money(v === null ? null : toDisplay(v, cur, result, metric.year), cur, { compact: !big });
  else if (metric.unit === 'pct') display = pct(v);
  else if (metric.unit === 'multiple') display = multiple(v);
  else if (metric.unit === 'text') display = metric.text ?? '—';
  else display = v === null ? '—' : String(Math.round(v));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="label truncate">{label ?? metric.label}</span>
        <ExplainButton metric={metric} />
      </div>
      <div className={cls('font-semibold tracking-tight tabular-nums', big ? 'text-[28px] leading-tight' : 'text-[22px] leading-tight')} data-testid={`metric-${metric.id}`}>
        {display}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] muted">
        {metric.unit === 'money' ? <span>{cur}</span> : null}
        <span>{metric.year === 'all' ? `${result.years[0]}–${result.years[result.years.length - 1]}` : metric.year}</span>
        <StatusBadge status={metric.status} />
      </div>
    </div>
  );
}

export function ExplainButton({ metric, label }: { metric: Metric; label?: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded-full text-[var(--accent)] hover:opacity-80" aria-label={`Explain ${metric.label}`} onClick={() => openOverlay({ kind: 'metric', metric })}>
      <Icon name="info" size={15} />
      {label ? <span className="text-[13px]">{label}</span> : null}
    </button>
  );
}

export function Term({ t, children }: { t: string; children?: ReactNode }) {
  return (
    <button type="button" className="term" onClick={() => openOverlay({ kind: 'term', term: t })}>
      {children ?? t}
    </button>
  );
}

export function SourceLinks({ refs }: { refs: SourceRef[] }) {
  if (!refs?.length) return null;
  const uniq = refs.filter((r, i) => refs.findIndex((x) => x.id === r.id) === i);
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {uniq.map((r) => (
        <button key={r.id} type="button" className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} onClick={() => openOverlay({ kind: 'source', ref: r })}>
          <Icon name="link" size={11} />
          {r.label}
        </button>
      ))}
    </span>
  );
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; title?: ReactNode; children?: ReactNode }) {
  const m = { info: ['var(--accent-soft)', 'var(--accent)', 'info'], warn: ['var(--warn-soft)', 'var(--warn)', 'warn'], bad: ['var(--bad-soft)', 'var(--bad)', 'warn'], good: ['var(--good-soft)', 'var(--good)', 'check'] }[tone];
  return (
    <div className="flex gap-3 rounded-2xl p-4" style={{ background: m[0] }} role={tone === 'bad' ? 'alert' : undefined}>
      <span style={{ color: m[1] }} className="mt-0.5 shrink-0">
        <Icon name={m[2]} size={18} />
      </span>
      <div className="min-w-0 text-[14px] leading-relaxed">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function IssueList({ issues, limit }: { issues: Issue[]; limit?: number }) {
  const mode = useStore((s) => s.mode);
  const order: Record<Severity, number> = { critical: 0, warning: 1, watch: 2, info: 3 };
  const list = [...issues].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, limit ?? issues.length);
  if (!list.length) return <p className="muted text-sm">No issues flagged.</p>;
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
      {list.map((i) => (
        <li key={i.id} className="py-3">
          <details>
            <summary className="flex cursor-pointer list-none items-start gap-2">
              <SeverityBadge s={i.severity} />
              <span className="flex-1 text-[14px] font-medium leading-snug">{i.title}</span>
              {i.professional ? <Pill tone="neutral">Professional review</Pill> : null}
            </summary>
            <div className="mt-2 space-y-2 pl-1 text-[14px] leading-relaxed ink2">
              <p>{i.plain}</p>
              {mode !== 'simple' && i.expert ? <p className="muted">{i.expert}</p> : null}
              <p>
                <span className="font-semibold">What to do: </span>
                {i.resolution}
              </p>
              <SourceLinks refs={i.sources} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, suffix, prefix, hint, testId, percent = false, disabled }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; prefix?: string; hint?: ReactNode; testId?: string; percent?: boolean; disabled?: boolean }) {
  const id = useId();
  const shown = value === undefined || value === null ? '' : percent ? +(value * 100).toFixed(4) : value;
  const [text, setText] = useState(String(shown));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(shown));
  }, [shown]);
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="label">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        {prefix ? <span className="muted text-sm">{prefix}</span> : null}
        <input
          id={id}
          className="input num"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          data-testid={testId}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            setText(String(shown));
          }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/[,\s$%]/g, ''));
            if (e.target.value.trim() !== '' && Number.isFinite(n)) {
              let v = percent ? n / 100 : n;
              if (min !== undefined) v = Math.max(min, v);
              if (max !== undefined) v = Math.min(max, v);
              onChange(v);
            }
          }}
          step={step}
        />
        {suffix || percent ? <span className="muted text-sm">{percent ? '%' : suffix}</span> : null}
      </div>
      {hint ? <span className="muted mt-1 block text-[12px] leading-snug">{hint}</span> : null}
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, testId }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testId?: string }) {
  const id = useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="label">{label}</span>
      <input id={id} className="input mt-1" value={value} placeholder={placeholder} data-testid={testId} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, testId, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="label">{label}</span>
      <select id={id} className="input mt-1" value={value} data-testid={testId} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="muted mt-1 block text-[12px] leading-snug">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-[14px]">
        {label}
        {hint ? <span className="muted block text-[12px] leading-snug">{hint}</span> : null}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors" style={{ background: checked ? 'var(--good)' : 'rgba(118,118,128,.28)' }}>
        <span className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all" style={{ left: checked ? 22 : 2 }} />
      </button>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="h3">{title}</div>
      <div className="muted max-w-md text-[14px]">{children}</div>
      {action}
    </div>
  );
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={cls('grid gap-4', cols === 4 ? c : `grid-cols-1 ${c}`)}>{children}</div>;
}

// ---------- Overlay host ----------
export function OverlayHost() {
  const o = useOverlay();
  const mode = useStore((s) => s.mode);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!o) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeOverlay();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [o]);
  if (!o) return null;
  let title = '';
  let body: ReactNode = null;
  if (o.kind === 'metric') {
    title = o.metric.label;
    body = <MetricExplain metric={o.metric} mode={mode} />;
  } else if (o.kind === 'source') {
    title = o.ref.label;
    body = <SourceView refx={o.ref} />;
  } else if (o.kind === 'term') {
    const g = findTerm(o.term);
    title = g?.term ?? o.term;
    body = g ? (
      <div className="space-y-3 text-[15px] leading-relaxed">
        <p>{g.plain}</p>
        {mode !== 'simple' && g.expert ? <p className="muted">{g.expert}</p> : null}
        {g.sources ? <SourceLinks refs={g.sources.map((id) => ({ id, label: findProvision(id)?.citation ?? findSource(id)?.title ?? id }))} /> : null}
      </div>
    ) : (
      <p>No glossary entry.</p>
    );
  } else if (o.kind === 'flow') {
    title = `${o.flow.kind.replace(/-/g, ' ')} · ${o.flow.year}`;
    body = <FlowView flowId={o.flow.id} flow={o.flow} />;
  } else if (o.kind === 'custom') {
    title = o.title;
    body = o.body() as ReactNode;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={closeOverlay} />
      <div ref={ref} tabIndex={-1} className="card fade-in relative max-h-[88dvh] w-full overflow-y-auto rounded-b-none p-5 outline-none md:max-w-2xl md:rounded-b-[18px] safe-bottom">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {hasBack() ? (
              <button type="button" className="btn btn-ghost px-2" onClick={closeOverlay} aria-label="Back">
                <Icon name="prev" size={16} />
              </button>
            ) : null}
            <h2 className="h2">{title}</h2>
          </div>
          <button type="button" className="btn btn-ghost px-2" onClick={closeOverlay} aria-label="Close" data-testid="overlay-close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

const SECTIONS: [keyof Explanation, string][] = [
  ['what', 'What is this?'],
  ['why', 'Why does it matter?'],
  ['from', 'Where does the money come from?'],
  ['to', 'Where does the money go?'],
  ['benefits', 'Who benefits?'],
  ['pays', 'Who pays?'],
  ['taxes', 'What happens to taxes?'],
  ['watch', 'What should I watch out for?'],
];

function MetricExplain({ metric, mode }: { metric: Metric; mode: Mode }) {
  const e = metric.explain(mode);
  const cur = useStore((s) => s.currency);
  return (
    <div className="space-y-4" data-testid="explain-sheet">
      <div className="flex flex-wrap items-center gap-2 text-[12px] muted">
        <StatusBadge status={metric.status} />
        <span>Mode: {mode}</span>
        <span>· Same calculation in every mode</span>
      </div>
      <dl className="space-y-3">
        {SECTIONS.map(([k, label]) =>
          e[k] ? (
            <div key={k}>
              <dt className="label">{label}</dt>
              <dd className="mt-0.5 text-[15px] leading-relaxed">{e[k]}</dd>
            </div>
          ) : null,
        )}
        <div>
          <dt className="label">Where did this information come from?</dt>
          <dd className="mt-1">
            <SourceLinks refs={metric.sources} />
            {!metric.sources.length ? <span className="muted text-[14px]">Calculated from your scenario inputs (see below).</span> : null}
          </dd>
        </div>
      </dl>
      <details className="rounded-xl p-3" style={{ background: 'var(--card-2)' }} open={mode === 'expert'}>
        <summary className="cursor-pointer text-[14px] font-semibold text-[var(--accent)]">View legal rules and calculation</summary>
        <div className="mt-3 space-y-3 text-[13px]">
          <div>
            <div className="label">Formula</div>
            <code className="mt-1 block whitespace-pre-wrap rounded-lg p-2 font-mono text-[12px]" style={{ background: 'var(--card)' }}>
              {metric.formula}
            </code>
          </div>
          {metric.inputs.length ? (
            <div>
              <div className="label">Inputs</div>
              <table className="table mt-1">
                <tbody>
                  {metric.inputs.slice(0, 40).map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.label}</td>
                      <td className="num">{typeof i.value === 'number' ? money(i.value, 'CAD') : i.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cur === 'USD' ? <p className="muted mt-1">Inputs are shown in CAD (the computation currency).</p> : null}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function SourceView({ refx }: { refx: SourceRef }) {
  const p = findProvision(refx.id);
  const s = findSource(refx.id);
  if (p)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Pill tone="accent">{HIERARCHY_LABEL[provisionHierarchy(p)]}</Pill>
          <Pill>{p.authority}</Pill>
          <Pill>{p.jurisdiction}</Pill>
        </div>
        <div className="text-[13px] muted">
          {p.citation} · {p.sourceFile} lines {p.lineStart}–{p.lineEnd} · reviewed 2026-10-25
        </div>
        <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap rounded-xl p-3 font-sans text-[13px] leading-relaxed" style={{ background: 'var(--card-2)' }} data-testid="provision-text">
          {p.text}
        </pre>
        <p className="muted text-[12px]">Verbatim excerpt from the consolidated text supplied with the project. Treat as a research aid; it is not legal advice.</p>
      </div>
    );
  if (s)
    return (
      <div className="space-y-3 text-[14px]">
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Pill tone="accent">{HIERARCHY_LABEL[s.hierarchy]}</Pill>
          <Pill tone={s.status === 'current' ? 'good' : 'warn'}>{s.status}</Pill>
          {s.private ? <Pill tone="warn">Private — stored only on your device</Pill> : null}
        </div>
        <p>{s.title}</p>
        <p className="muted">{s.authority}</p>
        <p className="muted">{s.currency}</p>
        {s.notes ? <p>{s.notes}</p> : null}
        {s.url ? (
          <p className="muted text-[12px] break-all">
            Source URL (consulted during development; not fetched by the app): {s.url}
          </p>
        ) : null}
        {s.private ? (
          <a className="btn btn-secondary" href={`#/documents?q=${encodeURIComponent(s.title.split('—')[0])}`} onClick={() => closeOverlay()}>
            Open in Document Library
          </a>
        ) : null}
      </div>
    );
  return <p className="muted">This source is not in the bundled library. ({refx.id})</p>;
}

function FlowView({ flow }: { flowId: string; flow: import('../engines/scenarios/compute').Flow }) {
  const cur = useStore((s) => s.currency);
  const names = useStore((s) => s.scenarios.find((x) => x.id === s.activeId)?.entities ?? []);
  const nm = (id: string) => names.find((e) => e.id === id)?.name ?? id.replace(/^ext-|^gov-/, '').replace('-', ' ');
  const rate = cur === 'USD' ? 1 : 1;
  void rate;
  const rows: [string, ReactNode][] = [
    ['Amount (gross)', money(flow.gross, 'CAD')],
    ['Tax withheld', money(flow.withholding, 'CAD')],
    ['Received', money(flow.net, 'CAD')],
    ['Sender', nm(flow.from)],
    ['Recipient', nm(flow.to)],
    ['Legal basis', flow.legalBasis],
    ['Accounting treatment', flow.accounting],
    ['Potential tax treatment', flow.taxTreatment],
    ['Internal to group?', flow.internal ? 'Yes — eliminated in group economics (not new profit)' : 'No'],
    ['Data status', <StatusBadge key="s" status={flow.status} />],
  ];
  return (
    <div className="space-y-3 text-[14px]" data-testid="flow-inspector">
      <p className="text-[15px] leading-relaxed">{flow.explanation}</p>
      <table className="table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="muted w-40">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {flow.withholdingDetail && flow.withholdingDetail.applies ? (
        <Callout tone={flow.withholdingDetail.permanence === 'unsupported' ? 'warn' : 'info'} title="Withholding analysis">
          <p>{flow.withholdingDetail.basis}</p>
          <ul className="mt-1 list-disc pl-5">
            {flow.withholdingDetail.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="mt-1 text-[12px]">
            Domestic rate {pct(flow.withholdingDetail.domesticRate)} · treaty rate {flow.withholdingDetail.treatyRate === null ? 'n/a' : pct(flow.withholdingDetail.treatyRate)} · applied {flow.withholdingDetail.appliedRate === null ? 'not computed' : pct(flow.withholdingDetail.appliedRate)} · {flow.withholdingDetail.permanence === 'refundable' ? 'temporary (recoverable)' : flow.withholdingDetail.permanence} · confidence {flow.withholdingDetail.confidence}
          </p>
        </Callout>
      ) : null}
      <SourceLinks refs={flow.sources} />
    </div>
  );
}
