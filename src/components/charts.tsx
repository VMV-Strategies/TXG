// Lightweight SVG charts (no external chart library): bar, line, waterfall, Sankey.
import { useMemo, useState, type ReactNode } from 'react';
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from 'd3-sankey';
import { money } from '../utils/format';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const fmtAxis = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;
  return s.replace('-', '−');
};

function niceScale(min: number, max: number) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const m = [1, 2, 2.5, 5, 10].find((k) => span / (k * step) <= 6) ?? 10;
  const st = m * step;
  return { lo: Math.floor(lo / st) * st, hi: Math.ceil(hi / st) * st, step: st };
}

export interface Series {
  name: string;
  values: number[];
  color?: string;
}

export function BarChart({ categories, series, height = 220, format = fmtAxis, stacked = false, ariaLabel }: { categories: string[]; series: Series[]; height?: number; format?: (n: number) => string; stacked?: boolean; ariaLabel: string }) {
  const [hover, setHover] = useState<{ i: number; s: number } | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const all = stacked ? categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0)).concat(categories.map((_, i) => series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0))) : series.flatMap((s) => s.values);
  const { lo, hi, step } = niceScale(Math.min(...all, 0), Math.max(...all, 0));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / Math.max(1, categories.length);
  const inner = stacked ? bw * 0.56 : (bw * 0.7) / Math.max(1, series.length);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? '' : '2 4'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {format(t)}
            </text>
          </g>
        ))}
        {categories.map((c, i) => {
          let posAcc = 0;
          let negAcc = 0;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                let x: number;
                let y0: number;
                let y1: number;
                if (stacked) {
                  x = pad.l + i * bw + (bw - inner) / 2;
                  const base = v >= 0 ? posAcc : negAcc;
                  y0 = y(base);
                  y1 = y(base + v);
                  if (v >= 0) posAcc += v;
                  else negAcc += v;
                } else {
                  x = pad.l + i * bw + bw * 0.15 + si * inner;
                  y0 = y(0);
                  y1 = y(v);
                }
                const top = Math.min(y0, y1);
                const h = Math.max(1, Math.abs(y1 - y0));
                return <rect key={s.name} x={x} y={top} width={Math.max(2, inner - 3)} height={h} rx={3} fill={s.color ?? COLORS[si % COLORS.length]} opacity={hover && (hover.i !== i || hover.s !== si) ? 0.55 : 1} onMouseEnter={() => setHover({ i, s: si })} onMouseLeave={() => setHover(null)} onClick={() => setHover({ i, s: si })} />;
              })}
              <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                {c}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-[12px] muted">
        {series.map((s, si) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color ?? COLORS[si % COLORS.length] }} />
            {s.name}
          </span>
        ))}
        {hover ? (
          <span className="ml-auto font-medium" style={{ color: 'var(--ink)' }}>
            {series[hover.s].name} · {categories[hover.i]}: {money(series[hover.s].values[hover.i])}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export function LineChart({ labels, series, height = 200, ariaLabel, format = fmtAxis, zeroLine = true }: { labels: string[]; series: Series[]; height?: number; ariaLabel: string; format?: (n: number) => string; zeroLine?: boolean }) {
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values);
  const { lo, hi, step } = niceScale(Math.min(...all), Math.max(...all));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 && zeroLine ? '' : '2 4'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
            {l}
          </text>
        ))}
        {series.map((s, si) => (
          <g key={s.name}>
            <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" stroke={s.color ?? COLORS[si % COLORS.length]} strokeWidth={2.5} strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color ?? COLORS[si % COLORS.length]}>
                <title>{`${s.name} ${labels[i]}: ${money(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-[12px] muted">
        {series.map((s, si) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color ?? COLORS[si % COLORS.length] }} />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Waterfall({ steps, ariaLabel, height = 240 }: { steps: { label: string; value: number; total?: boolean }[]; ariaLabel: string; height?: number }) {
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 54 };
  let acc = 0;
  const bars = steps.map((s) => {
    const start = s.total ? 0 : acc;
    const end = s.total ? s.value : acc + s.value;
    if (!s.total) acc = end;
    else acc = s.value;
    return { ...s, start, end };
  });
  const vals = bars.flatMap((b) => [b.start, b.end]);
  const { lo, hi, step } = niceScale(Math.min(...vals), Math.max(...vals));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / Math.max(1, bars.length);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? '' : '2 4'} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
            {fmtAxis(t)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const top = Math.min(y(b.start), y(b.end));
        const h = Math.max(1, Math.abs(y(b.start) - y(b.end)));
        const color = b.total ? 'var(--chart-1)' : b.value >= 0 ? 'var(--chart-5)' : 'var(--chart-6)';
        return (
          <g key={b.label + i}>
            <rect x={pad.l + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={h} rx={3} fill={color}>
              <title>{`${b.label}: ${money(b.value)}`}</title>
            </rect>
            <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 14} textAnchor="end" fontSize="10" fill="var(--ink-3)" transform={`rotate(-30 ${pad.l + i * bw + bw / 2} ${H - pad.b + 14})`}>
              {b.label.length > 22 ? b.label.slice(0, 21) + '…' : b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface SankeyNodeIn {
  id: string;
  name: string;
  color?: string;
}
export interface SankeyLinkIn {
  source: string;
  target: string;
  value: number;
  label?: string;
  color?: string;
  onClick?: () => void;
  internal?: boolean;
}

export function Sankey({ nodes, links, height = 420, ariaLabel, animate = true }: { nodes: SankeyNodeIn[]; links: SankeyLinkIn[]; height?: number; ariaLabel: string; animate?: boolean }) {
  const W = 900;
  const H = height;
  const graph = useMemo(() => {
    const used = new Set(links.filter((l) => l.value > 0).flatMap((l) => [l.source, l.target]));
    const ns = nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n }));
    const ls = links.filter((l) => l.value > 0 && l.source !== l.target).map((l) => ({ ...l }));
    if (!ns.length || !ls.length) return null;
    try {
      const gen = sankey<SankeyNodeIn & { x0?: number }, SankeyLinkIn>()
        .nodeId((d) => d.id)
        .nodeWidth(12)
        .nodePadding(18)
        .extent([
          [8, 8],
          [W - 8, H - 8],
        ]);
      return gen({ nodes: ns, links: ls } as unknown as SankeyGraph<SankeyNodeIn, SankeyLinkIn>);
    } catch {
      return null; // cycles cannot be drawn as a Sankey
    }
  }, [nodes, links, H]);
  if (!graph) return <p className="muted text-sm">Not enough non-circular flows to draw.</p>;
  const path = sankeyLinkHorizontal();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      <g>
        {graph.links.map((l, i) => {
          const L = l as unknown as SankeyLinkIn & { width: number };
          return (
            <g key={i} onClick={L.onClick} style={{ cursor: L.onClick ? 'pointer' : undefined }}>
              <path d={path(l as never) ?? ''} fill="none" stroke={L.color ?? 'var(--chart-1)'} strokeOpacity={L.internal ? 0.22 : 0.32} strokeWidth={Math.max(1, L.width)}>
                <title>{`${L.label ?? ''} ${money(L.value)}`}</title>
              </path>
              {animate ? <path d={path(l as never) ?? ''} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1.2} className="flow-dash" pointerEvents="none" /> : null}
            </g>
          );
        })}
      </g>
      <g>
        {graph.nodes.map((n) => {
          const N = n as unknown as SankeyNodeIn & { x0: number; x1: number; y0: number; y1: number; value: number };
          const left = N.x0 < W / 2;
          return (
            <g key={N.id}>
              <rect x={N.x0} y={N.y0} width={N.x1 - N.x0} height={Math.max(1, N.y1 - N.y0)} rx={2} fill={N.color ?? 'var(--ink-2)'} />
              <text x={left ? N.x1 + 6 : N.x0 - 6} y={(N.y0 + N.y1) / 2} dy="0.35em" textAnchor={left ? 'start' : 'end'} fontSize="12" fill="var(--ink)">
                {N.name}
                <tspan fill="var(--ink-3)"> {money(N.value, 'CAD', { compact: true })}</tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="muted">{k}</dt>
          <dd className="num font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
