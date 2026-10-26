import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataStatus, EntityKind, EntityNode, Relationship, RelType, Tri, UsClassification } from '../../types/domain';
import { Button, Callout, Card, NumberField, Page, Pill, SelectField, StatusBadge, TextField, Toggle, Term } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useActive } from '../../hooks/useResult';
import { toast, updateScenario, useStore } from '../../state/store';
import { cls, money, pct } from '../../utils/format';

export const REL_TYPES: { value: RelType; label: string; cat: 'equity' | 'debt' | 'commercial' | 'funding' | 'flow' }[] = [
  { value: 'common-shares', label: 'Common shares', cat: 'equity' },
  { value: 'preferred-shares', label: 'Preferred shares', cat: 'equity' },
  { value: 'convertible', label: 'Convertible financing', cat: 'debt' },
  { value: 'intercompany-loan', label: 'Intercompany loan', cat: 'debt' },
  { value: 'third-party-loan', label: 'Third-party loan', cat: 'debt' },
  { value: 'capital-contribution', label: 'Capital contribution', cat: 'equity' },
  { value: 'management-agreement', label: 'Management agreement', cat: 'commercial' },
  { value: 'license', label: 'Licensing agreement', cat: 'commercial' },
  { value: 'jv', label: 'Contractual joint venture', cat: 'commercial' },
  { value: 'hosting', label: 'Event hosting agreement', cat: 'commercial' },
  { value: 'sponsorship', label: 'Sponsorship agreement', cat: 'funding' },
  { value: 'grant', label: 'Grant', cat: 'funding' },
  { value: 'donation', label: 'Donation', cat: 'funding' },
  { value: 'vendor', label: 'Vendor contract', cat: 'commercial' },
  { value: 'service-agreement', label: 'Services agreement (FMV)', cat: 'commercial' },
  { value: 'revenue-share', label: 'Revenue share', cat: 'commercial' },
  { value: 'guarantee', label: 'Guarantee', cat: 'debt' },
  { value: 'restricted-funding', label: 'Restricted program funding', cat: 'funding' },
  { value: 'dividend', label: 'Dividends (computed from shares)', cat: 'flow' },
  { value: 'interest', label: 'Interest payments (computed from loans)', cat: 'flow' },
  { value: 'principal', label: 'Principal repayments (computed from loans)', cat: 'flow' },
];
const CAT_COLOR = { equity: 'var(--chart-1)', debt: 'var(--chart-2)', commercial: 'var(--chart-4)', funding: 'var(--chart-5)', flow: 'var(--ink-3)' };
const KIND_OPTIONS: { value: EntityKind; label: string }[] = [
  { value: 'investor', label: 'Investor' },
  { value: 'us-llc', label: 'U.S. LLC' },
  { value: 'ca-corp', label: 'Canadian corporation' },
  { value: 'ca-nfp', label: 'Canadian not-for-profit' },
  { value: 'individual', label: 'Individual' },
  { value: 'fiba', label: 'Governing body' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'government', label: 'Government' },
  { value: 'venue', label: 'Venue' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'staff', label: 'Staff' },
  { value: 'fans', label: 'Customers' },
  { value: 'custom', label: 'Other' },
];
const TRI: { value: Tri; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const EVIDENCE: { value: DataStatus; label: string }[] = [
  { value: 'confirmed-contract', label: 'Confirmed by contract' },
  { value: 'corporate-record', label: 'Corporate record' },
  { value: 'assumption', label: 'Assumption' },
  { value: 'pending', label: 'Pending' },
  { value: 'synthetic', label: 'Synthetic' },
];

const NODE_W = 196;
const NODE_H = 62;

export function EntityMapPage() {
  const { scn, result } = useActive();
  const cur = useStore((s) => s.currency);
  const [sel, setSel] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [pan, setPan] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(0.64);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setAspect(r.height / r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const VH = 1000 * aspect;

  const nodes = scn.entities;
  const pos = (id: string) => {
    const n = nodes.find((e) => e.id === id);
    if (drag && drag.id === id) return { x: drag.x, y: drag.y };
    return { x: n?.x ?? 0, y: n?.y ?? 0 };
  };
  const toSvg = (cx: number, cy: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width;
    const sy = (cy - rect.top) / rect.height;
    const W = 1000 / view.k;
    const H = VH / view.k;
    return { x: view.x + sx * W, y: view.y + sy * H };
  };

  const onNodeDown = (e: PointerEvent & { currentTarget: Element }, n: EntityNode) => {
    e.stopPropagation();
    if (connecting) {
      if (!connectFrom) {
        setConnectFrom(n.id);
        toast(`Now tap the entity that receives from ${n.name}.`);
      } else if (connectFrom !== n.id) {
        const id = `rel-${Date.now().toString(36)}`;
        updateScenario((s) => {
          s.relationships.push(defaultRel(id, connectFrom, n.id, s.years[0]));
        });
        setSel({ kind: 'edge', id });
        setConnecting(false);
        setConnectFrom(null);
      }
      return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y, x: n.x, y: n.y });
    setSel({ kind: 'node', id: n.id });
  };
  const onMove = (e: PointerEvent) => {
    if (drag) {
      const p = toSvg(e.clientX, e.clientY);
      setDrag({ ...drag, x: Math.round(p.x - drag.dx), y: Math.round(p.y - drag.dy) });
    } else if (pan) {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - pan.sx) / rect.width) * (1000 / view.k);
      const dy = ((e.clientY - pan.sy) / rect.height) * (VH / view.k);
      setView({ ...view, x: pan.vx - dx, y: pan.vy - dy });
    }
  };
  const onUp = () => {
    if (drag) {
      const n = nodes.find((x) => x.id === drag.id);
      if (n && (n.x !== drag.x || n.y !== drag.y)) {
        updateScenario((s) => {
          const t = s.entities.find((x) => x.id === drag.id)!;
          t.x = drag.x;
          t.y = drag.y;
        });
      }
      setDrag(null);
    }
    setPan(null);
  };
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * f)) }));
  const fit = () => {
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const w = Math.max(...xs) + NODE_W + 40 - minX;
    const h = Math.max(...ys) + NODE_H + 40 - minY;
    const k = Math.min(1000 / w, VH / h, 1.6);
    // centre the content in the visible area
    const cx = minX - (1000 / k - w) / 2;
    const cy = minY - (VH / k - h) / 2;
    setView({ x: cx, y: cy, k });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scn.id, aspect]);
  const selNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.kind === 'edge' ? scn.relationships.find((r) => r.id === sel.id) : undefined;
  const ctrl = result.control;
  const edges = useMemo(() => scn.relationships.filter((r) => nodes.some((n) => n.id === r.from) && nodes.some((n) => n.id === r.to)), [scn.relationships, nodes]);

  return (
    <Page
      title="Entity Map"
      subtitle="Drag entities to arrange them. Tap a connection to edit its terms — every change recalculates the whole model. Arrows point from the investor/provider to the recipient/client."
      actions={
        <>
          <Button icon="plus" onClick={() => addEntity()} data-testid="add-entity">
            Add entity
          </Button>
          <Button icon="link" variant={connecting ? 'primary' : 'secondary'} onClick={() => (setConnecting(!connecting), setConnectFrom(null))} data-testid="connect-mode">
            {connecting ? (connectFrom ? 'Pick recipient…' : 'Pick source…') : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_360px]">
        <Card pad={false} className="overflow-hidden">
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${1000 / view.k} ${VH / view.k}`}
              className="block h-[56dvh] min-h-[380px] w-full touch-none select-none md:h-[62dvh]"
              style={{ background: 'radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0) 0 0/22px 22px' }}
              onPointerMove={onMove as never}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              onPointerDown={(e: PointerEvent) => {
                setSel(null);
                setPan({ sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
              }}
              role="application"
              aria-label="Entity relationship canvas"
              data-testid="entity-canvas"
            >
              <defs>
                {Object.entries(CAT_COLOR).map(([k, c]) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={c} />
                  </marker>
                ))}
              </defs>
              {edges.map((r, idx) => {
                const a = pos(r.from);
                const b = pos(r.to);
                const cat = REL_TYPES.find((t) => t.value === r.type)?.cat ?? 'flow';
                const siblings = edges.filter((x) => (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from));
                const offset = (siblings.indexOf(r) - (siblings.length - 1) / 2) * 34;
                const ax = a.x + NODE_W / 2;
                const ay = a.y + NODE_H / 2;
                const bx = b.x + NODE_W / 2;
                const by = b.y + NODE_H / 2;
                const mx = (ax + bx) / 2;
                const my = (ay + by) / 2;
                const len = Math.hypot(bx - ax, by - ay) || 1;
                const nx = -(by - ay) / len;
                const ny = (bx - ax) / len;
                const cx = mx + nx * (offset + 18);
                const cy = my + ny * (offset + 18);
                // clip to node boxes
                const clip = (px: number, py: number, qx: number, qy: number) => {
                  const dx = qx - px;
                  const dy = qy - py;
                  const t = Math.min(NODE_W / 2 / Math.abs(dx || 1e-6), NODE_H / 2 / Math.abs(dy || 1e-6));
                  return { x: px + dx * Math.min(1, t + 0.04), y: py + dy * Math.min(1, t + 0.04) };
                };
                const s = clip(ax, ay, cx, cy);
                const e2 = clip(bx, by, cx, cy);
                const selected = sel?.kind === 'edge' && sel.id === r.id;
                const amt = r.annual ? Object.values(r.annual).reduce((x, y) => x + y, 0) : r.amount;
                const label = `${REL_TYPES.find((t) => t.value === r.type)?.label ?? r.type}${amt ? ` · ${money(amt, r.currency, { compact: true })}` : r.revenueShare ? ` · ${pct(r.revenueShare.pct, 0)}` : r.fee?.pct ? ` · ${pct(r.fee.pct, 0)}` : ''}`;
                return (
                  <g key={r.id} onPointerDown={(e: PointerEvent) => (e.stopPropagation(), setSel({ kind: 'edge', id: r.id }))} style={{ cursor: 'pointer' }} data-testid={`edge-${r.id}`}>
                    <path d={`M${s.x},${s.y} Q${cx},${cy} ${e2.x},${e2.y}`} fill="none" stroke="transparent" strokeWidth={16} />
                    <path d={`M${s.x},${s.y} Q${cx},${cy} ${e2.x},${e2.y}`} fill="none" stroke={CAT_COLOR[cat]} strokeWidth={selected ? 3.5 : 2} markerEnd={`url(#arrow-${cat})`} strokeDasharray={r.evidence === 'synthetic' || r.evidence === 'assumption' || r.evidence === 'pending' ? '6 4' : undefined} />
                    <g transform={`translate(${(s.x + 2 * cx + e2.x) / 4},${(s.y + 2 * cy + e2.y) / 4})`}>
                      <rect x={-label.length * 3.1 - 6} y={-10} width={label.length * 6.2 + 12} height={20} rx={10} fill="var(--card)" stroke={selected ? CAT_COLOR[cat] : 'var(--line)'} />
                      <text textAnchor="middle" dy="0.35em" fontSize="10.5" fill="var(--ink-2)">
                        {label}
                      </text>
                    </g>
                    <title>{`${idx + 1}. ${label}`}</title>
                  </g>
                );
              })}
              {nodes.map((n) => {
                const p = pos(n.id);
                const selected = sel?.kind === 'node' && sel.id === n.id;
                const isFrom = connectFrom === n.id;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} onPointerDown={(e: PointerEvent & { currentTarget: Element }) => onNodeDown(e, n)} style={{ cursor: connecting ? 'crosshair' : 'grab' }} data-testid={`node-${n.id}`} role="button" aria-label={n.name} tabIndex={0} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && setSel({ kind: 'node', id: n.id })}>
                    <rect width={NODE_W} height={NODE_H} rx={14} fill="var(--card)" stroke={isFrom ? 'var(--good)' : selected ? 'var(--accent)' : n.inGroup ? 'var(--line-2)' : 'var(--line)'} strokeWidth={selected || isFrom ? 2.5 : 1} filter="drop-shadow(0 2px 6px rgba(0,0,0,.08))" />
                    <rect x={10} y={12} width={6} height={NODE_H - 24} rx={3} fill={n.jurisdiction === 'US' ? 'var(--chart-1)' : n.jurisdiction === 'CA' ? 'var(--chart-6)' : 'var(--chart-3)'} />
                    <text x={24} y={27} fontSize="13.5" fontWeight={600} fill="var(--ink)">
                      {n.name.length > 23 ? n.name.slice(0, 22) + '…' : n.name}
                    </text>
                    <text x={24} y={46} fontSize="11.5" fill="var(--ink-3)">
                      {KIND_OPTIONS.find((k) => k.value === n.kind)?.label} · {n.jurisdiction}
                      {n.inGroup ? ' · group' : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="no-print absolute bottom-3 right-3 flex gap-1.5">
              <button type="button" className="btn btn-secondary h-9 w-9 px-0" onClick={() => zoom(1.2)} aria-label="Zoom in">
                +
              </button>
              <button type="button" className="btn btn-secondary h-9 w-9 px-0" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="btn btn-secondary h-9 px-3" onClick={fit}>
                Fit
              </button>
            </div>
            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(CAT_COLOR).slice(0, 4).map(([k, c]) => (
                <span key={k} className="glass inline-flex items-center gap-1 rounded-full px-2 py-0.5">
                  <span className="inline-block h-1.5 w-3 rounded" style={{ background: c }} />
                  {k}
                </span>
              ))}
              <span className="glass rounded-full px-2 py-0.5">dashed = assumption</span>
            </div>
          </div>
        </Card>
        <div className="space-y-5">
          {selEdge ? <EdgeInspector rel={selEdge} names={nodes} onDelete={() => setSel(null)} /> : selNode ? <NodeInspector node={selNode} onDelete={() => setSel(null)} /> : (
            <Card title="Inspector" subtitle="Select an entity or a connection to edit it.">
              <p className="muted text-[14px]">Tip: use Connect, then tap the investor/provider and then the recipient to create a relationship.</p>
            </Card>
          )}
          <Card title={<>Canadian control (<Term t="CCPC" />)</>} subtitle="Updates as you edit shares, options and rights.">
            <div className="mb-2 flex items-center gap-2">
              <Pill tone={ctrl.status === 'likely-ccpc' ? 'good' : ctrl.status === 'uncertain' ? 'warn' : 'bad'}>{ctrl.status === 'likely-ccpc' ? 'Appears to qualify' : ctrl.status === 'uncertain' ? 'Uncertain' : 'Appears not to qualify'}</Pill>
            </div>
            <p className="text-[13px] leading-relaxed">{ctrl.statusPlain}</p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {ctrl.tests.map((t) => (
                <li key={t.id} className="flex items-start gap-2">
                  <span style={{ color: t.result === 'pass' ? 'var(--good)' : t.result === 'fail' ? 'var(--bad)' : 'var(--warn)' }}>{t.result === 'pass' ? '✓' : t.result === 'fail' ? '✕' : '?'}</span>
                  <span>{t.label}</span>
                </li>
              ))}
            </ul>
            <p className="muted mt-2 text-[12px]">{ctrl.headroomPlain}</p>
            <a className="btn btn-ghost mt-2 px-0" href="#/deal-lab">
              Open control analysis →
            </a>
          </Card>
        </div>
      </div>
      <Card title="Relationships" subtitle={`${edges.length} connections · amounts in source currency (display currency: ${cur})`} pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table">
            <thead>
              <tr>
                <th>From (provider / investor)</th>
                <th>To (recipient / client)</th>
                <th>Type</th>
                <th className="num">Amount</th>
                <th>Start</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((r) => (
                <tr key={r.id} className={cls('cursor-pointer', sel?.id === r.id && 'font-semibold')} onClick={() => setSel({ kind: 'edge', id: r.id })}>
                  <td>{nodes.find((n) => n.id === r.from)?.name}</td>
                  <td>{nodes.find((n) => n.id === r.to)?.name}</td>
                  <td>{REL_TYPES.find((t) => t.value === r.type)?.label}</td>
                  <td className="num">{r.annual ? `${money(Object.values(r.annual).reduce((a, b) => a + b, 0), r.currency, { compact: true })} total` : money(r.amount, r.currency, { compact: true })}</td>
                  <td>{r.startYear}</td>
                  <td>
                    <StatusBadge status={r.evidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

function addEntity() {
  const id = `ent-${Date.now().toString(36)}`;
  updateScenario((s) => {
    s.entities.push({ id, name: 'New entity', kind: 'custom', jurisdiction: 'CA', x: 440, y: 560, inGroup: false, currency: 'CAD', evidence: 'assumption', tax: { residence: 'CA' } });
  });
  toast('Entity added — drag it into place and edit it in the inspector.');
}

export function defaultRel(id: string, from: string, to: string, year: number): Relationship {
  return { id, type: 'intercompany-loan', from, to, currency: 'CAD', amount: 500000, startYear: year, loan: { rate: 0.07, termYears: 3, repayment: 'maturity', cashInterest: true }, evidence: 'assumption' };
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function NodeInspector({ node, onDelete }: { node: EntityNode; onDelete: () => void }) {
  const set = (f: (n: EntityNode) => void) =>
    updateScenario((s) => {
      f(s.entities.find((e) => e.id === node.id)!);
    });
  const years = useStore((s) => s.scenarios.find((x) => x.id === s.activeId)?.years ?? []);
  const roles = useStore((s) => s.scenarios.find((x) => x.id === s.activeId)?.roles);
  const isRole = roles && Object.values(roles).includes(node.id);
  return (
    <Card title="Entity" subtitle={<StatusBadge status={node.evidence} />} actions={!isRole ? <Button variant="danger" icon="trash" onClick={() => (updateScenario((s) => ({ ...s, entities: s.entities.filter((e) => e.id !== node.id), relationships: s.relationships.filter((r) => r.from !== node.id && r.to !== node.id) })), onDelete())}>Delete</Button> : undefined}>
      <div className="space-y-3" data-testid="node-inspector">
        <TextField label="Name" value={node.name} onChange={(v) => set((n) => (n.name = v))} testId="node-name" />
        <Row>
          <SelectField label="Type" value={node.kind} options={KIND_OPTIONS} onChange={(v) => set((n) => (n.kind = v))} />
          <SelectField label="Jurisdiction" value={node.jurisdiction} options={[{ value: 'CA', label: 'Canada' }, { value: 'US', label: 'United States' }, { value: 'INTL', label: 'Other' }]} onChange={(v) => set((n) => ((n.jurisdiction = v), (n.tax.residence = v), (n.currency = v === 'US' ? 'USD' : 'CAD')))} />
        </Row>
        <Toggle label="Part of the group" hint="Group entities are combined (with internal transfers eliminated)." checked={node.inGroup} onChange={(v) => set((n) => (n.inGroup = v))} />
        <SelectField label="Evidence" value={node.evidence} options={EVIDENCE} onChange={(v) => set((n) => (n.evidence = v))} />
        {node.kind === 'us-llc' ? (
          <>
            <SelectField<UsClassification> label="U.S. tax classification" value={node.tax.usClassification ?? 'unknown'} options={[{ value: 'unknown', label: 'Unknown — must be confirmed' }, { value: 'disregarded', label: 'Disregarded (single member)' }, { value: 'partnership', label: 'Partnership (multi-member)' }, { value: 'corporation', label: 'Corporation (Form 8832 election)' }]} onChange={(v) => set((n) => (n.tax.usClassification = v))} hint={<><Term t="Check-the-box">Check-the-box rules</Term> decide this; do not assume.</>} />
            <Row>
              <NumberField label="U.S.-resident members" percent value={node.tax.memberUsResidentShare ?? 1} onChange={(v) => set((n) => (n.tax.memberUsResidentShare = v))} />
              <NumberField label="Corporate members" percent value={node.tax.memberCorporateShare ?? 0} onChange={(v) => set((n) => (n.tax.memberCorporateShare = v))} />
            </Row>
            <Row>
              <NumberField label="Members’ marginal rate (assumption)" percent value={node.tax.memberMarginalRate ?? 0.408} onChange={(v) => set((n) => (n.tax.memberMarginalRate = v))} />
              <NumberField label="NY apportionment (assumption)" percent value={node.tax.nyApportionment ?? 0} onChange={(v) => set((n) => (n.tax.nyApportionment = v))} />
            </Row>
            <Row>
              <SelectField<Tri> label="Treaty LOB qualified?" value={node.tax.lobQualifying ?? 'unknown'} options={TRI} onChange={(v) => set((n) => (n.tax.lobQualifying = v))} />
              <SelectField<Tri> label="Arm’s length with operator?" value={node.tax.armsLengthWithOperator ?? 'unknown'} options={TRI} onChange={(v) => set((n) => (n.tax.armsLengthWithOperator = v))} />
            </Row>
          </>
        ) : null}
        {node.kind === 'ca-corp' ? (
          <Row>
            <NumberField label="Associated taxable capital (CAD)" value={node.tax.associatedTaxableCapital ?? 0} onChange={(v) => set((n) => (n.tax.associatedTaxableCapital = v))} />
            <NumberField label="Share of business limit" percent value={node.tax.businessLimitShare ?? 1} onChange={(v) => set((n) => (n.tax.businessLimitShare = v))} />
          </Row>
        ) : null}
        {node.kind === 'ca-nfp' ? (
          <Row>
            <SelectField<Tri> label="Registered charity?" value={node.tax.registeredCharity ?? 'unknown'} options={TRI} onChange={(v) => set((n) => (n.tax.registeredCharity = v))} />
            <SelectField<Tri> label="Soliciting corporation?" value={node.tax.solicitingCorporation ?? 'unknown'} options={TRI} onChange={(v) => set((n) => (n.tax.solicitingCorporation = v))} />
          </Row>
        ) : null}
        {node.kind === 'investor' || node.kind === 'individual' || node.kind === 'custom' ? <SelectField<Tri> label="Arm’s length with operator?" value={node.tax.armsLengthWithOperator ?? 'unknown'} options={TRI} onChange={(v) => set((n) => (n.tax.armsLengthWithOperator = v))} /> : null}
        {node.inGroup ? (
          <div>
            <div className="label mb-1">Annual overhead ({node.currency})</div>
            <div className="grid grid-cols-3 gap-2">
              {years.map((y) => (
                <NumberField key={y} label={String(y)} value={node.overhead?.[y] ?? 0} onChange={(v) => set((n) => (n.overhead = { ...(n.overhead ?? {}), [y]: v }))} />
              ))}
            </div>
          </div>
        ) : null}
        <TextField label="Notes" value={node.notes ?? ''} onChange={(v) => set((n) => (n.notes = v))} />
      </div>
    </Card>
  );
}

function EdgeInspector({ rel, names, onDelete }: { rel: Relationship; names: EntityNode[]; onDelete: () => void }) {
  const set = (f: (r: Relationship) => void) =>
    updateScenario((s) => {
      f(s.relationships.find((x) => x.id === rel.id)!);
    });
  const years = useStore((s) => s.scenarios.find((x) => x.id === s.activeId)?.years ?? []);
  const t = rel.type;
  const changeType = (v: RelType) =>
    set((r) => {
      r.type = v;
      if ((v === 'intercompany-loan' || v === 'third-party-loan') && !r.loan) r.loan = { rate: 0.07, termYears: 3, repayment: 'maturity', cashInterest: true };
      if ((v === 'common-shares' || v === 'preferred-shares') && !r.equity) r.equity = { shares: 50, votesPerShare: v === 'preferred-shares' ? 0 : 1, classLabel: v === 'preferred-shares' ? 'Preferred' : 'Common', prefRate: v === 'preferred-shares' ? 0.08 : undefined, prefCumulative: true, payoutRatio: 0.3 };
      if (v === 'convertible' && !r.convertible) r.convertible = { rate: 0.06, termYears: 3, conversionPct: 0.2, convertAtMaturity: true, votesPerShare: 1 };
      if ((v === 'management-agreement' || v === 'license' || v === 'service-agreement') && !r.fee) r.fee = { basis: 'pct-revenue', pct: 0.05, servicesInCanadaPct: 0.2, documentedFmv: false, ipType: v === 'license' ? 'trademark' : undefined };
      if ((v === 'revenue-share' || v === 'jv') && !r.revenueShare) r.revenueShare = { pct: 0.25, base: 'event-ebitda', characterization: 'participating-payment' };
      if ((v === 'grant' || v === 'restricted-funding') && !r.grant) r.grant = { restricted: v === 'restricted-funding', purpose: '', eligibilityVerified: false };
    });
  const computedOnly = t === 'dividend' || t === 'interest' || t === 'principal';
  return (
    <Card title="Connection" subtitle={`${names.find((n) => n.id === rel.from)?.name} → ${names.find((n) => n.id === rel.to)?.name}`} actions={<Button variant="danger" icon="trash" onClick={() => (updateScenario((s) => ({ ...s, relationships: s.relationships.filter((r) => r.id !== rel.id) })), onDelete())}>Delete</Button>}>
      <div className="space-y-3" data-testid="edge-inspector">
        <SelectField<RelType> label="Type" value={t} options={REL_TYPES} onChange={changeType} testId="edge-type" />
        {computedOnly ? <Callout tone="info">Dividends, interest and principal are computed automatically from share and loan terms. Edit the underlying shares or loan instead.</Callout> : null}
        <Row>
          <SelectField label="From" value={rel.from} options={names.map((n) => ({ value: n.id, label: n.name }))} onChange={(v) => set((r) => (r.from = v))} />
          <SelectField label="To" value={rel.to} options={names.map((n) => ({ value: n.id, label: n.name }))} onChange={(v) => set((r) => (r.to = v))} />
        </Row>
        {!['management-agreement', 'license', 'revenue-share', 'jv', 'service-agreement', 'hosting', 'vendor', 'sponsorship'].includes(t) && !rel.annual ? (
          <Row>
            <NumberField label={t === 'guarantee' ? 'Guaranteed amount' : 'Amount'} value={rel.amount} onChange={(v) => set((r) => (r.amount = v))} testId="edge-amount" />
            <SelectField label="Currency" value={rel.currency} options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]} onChange={(v) => set((r) => (r.currency = v))} />
          </Row>
        ) : (
          <SelectField label="Currency" value={rel.currency} options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]} onChange={(v) => set((r) => (r.currency = v))} />
        )}
        <Row>
          <NumberField label="Start year" value={rel.startYear} onChange={(v) => set((r) => (r.startYear = Math.round(v)))} />
          <NumberField label="FX at transaction (CAD per USD)" value={rel.fxAtTransaction} onChange={(v) => set((r) => (r.fxAtTransaction = v || undefined))} hint="Used when FX mode is ‘transaction’." />
        </Row>
        {(t === 'intercompany-loan' || t === 'third-party-loan') && rel.loan ? (
          <>
            <Row>
              <NumberField label="Interest rate" percent value={rel.loan.rate} onChange={(v) => set((r) => (r.loan!.rate = v))} testId="edge-rate" />
              <NumberField label="Term (years)" value={rel.loan.termYears} min={1} onChange={(v) => set((r) => (r.loan!.termYears = Math.max(1, Math.round(v))))} />
            </Row>
            <SelectField label="Repayment" value={rel.loan.repayment} options={[{ value: 'annual', label: 'Annually (equal principal)' }, { value: 'maturity', label: 'At maturity (bullet)' }, { value: 'custom', label: 'Custom schedule' }]} onChange={(v) => set((r) => (r.loan!.repayment = v))} />
            {rel.loan.repayment === 'custom' ? (
              <div className="grid grid-cols-3 gap-2">
                {years.map((y) => (
                  <NumberField key={y} label={`Principal ${y}`} value={rel.loan!.customSchedule?.[y] ?? 0} onChange={(v) => set((r) => (r.loan!.customSchedule = { ...(r.loan!.customSchedule ?? {}), [y]: v }))} />
                ))}
              </div>
            ) : null}
            <Toggle label="Interest paid in cash" hint="Off = interest accrues and is paid at maturity." checked={rel.loan.cashInterest} onChange={(v) => set((r) => (r.loan!.cashInterest = v))} />
            <Toggle label="Participating (profit-linked) interest" hint="Treaty Art. XI(6)(b): Canada may tax at up to 15%." checked={!!rel.loan.participating} onChange={(v) => set((r) => (r.loan!.participating = v))} />
            <NumberField label="Documented arm’s-length rate (optional)" percent value={rel.loan.benchmarkRate} onChange={(v) => set((r) => (r.loan!.benchmarkRate = v))} hint="Leave empty if no benchmark study exists." />
          </>
        ) : null}
        {(t === 'common-shares' || t === 'preferred-shares') && rel.equity ? (
          <>
            <Row>
              <NumberField label="Shares" value={rel.equity.shares} onChange={(v) => set((r) => (r.equity!.shares = Math.max(0, v)))} testId="edge-shares" />
              <NumberField label="Votes per share" value={rel.equity.votesPerShare} onChange={(v) => set((r) => (r.equity!.votesPerShare = Math.max(0, v)))} testId="edge-votes" />
            </Row>
            <TextField label="Share class" value={rel.equity.classLabel} onChange={(v) => set((r) => (r.equity!.classLabel = v))} />
            {t === 'preferred-shares' ? (
              <Row>
                <NumberField label="Preferred dividend rate" percent value={rel.equity.prefRate ?? 0} onChange={(v) => set((r) => (r.equity!.prefRate = v))} />
                <Toggle label="Cumulative" checked={!!rel.equity.prefCumulative} onChange={(v) => set((r) => (r.equity!.prefCumulative = v))} />
              </Row>
            ) : (
              <NumberField label="Dividend payout (% of net income)" percent value={rel.equity.payoutRatio ?? 0} onChange={(v) => set((r) => (r.equity!.payoutRatio = v))} />
            )}
          </>
        ) : null}
        {t === 'convertible' && rel.convertible ? (
          <>
            <Row>
              <NumberField label="Interest rate" percent value={rel.convertible.rate} onChange={(v) => set((r) => (r.convertible!.rate = v))} />
              <NumberField label="Term (years)" value={rel.convertible.termYears} onChange={(v) => set((r) => (r.convertible!.termYears = Math.max(1, Math.round(v))))} />
            </Row>
            <Row>
              <NumberField label="Ownership on conversion" percent value={rel.convertible.conversionPct} onChange={(v) => set((r) => (r.convertible!.conversionPct = v))} />
              <NumberField label="Votes per share" value={rel.convertible.votesPerShare} onChange={(v) => set((r) => (r.convertible!.votesPerShare = v))} />
            </Row>
            <Toggle label="Convert at maturity (no repayment)" checked={rel.convertible.convertAtMaturity} onChange={(v) => set((r) => (r.convertible!.convertAtMaturity = v))} />
          </>
        ) : null}
        {(t === 'management-agreement' || t === 'license' || t === 'service-agreement') && rel.fee ? (
          <>
            <SelectField label="Fee basis" value={rel.fee.basis} options={[{ value: 'pct-revenue', label: '% of event revenue' }, { value: 'pct-ebitda', label: '% of event EBITDA' }, { value: 'fixed', label: 'Fixed amount per year' }]} onChange={(v) => set((r) => (r.fee!.basis = v))} />
            {rel.fee.basis === 'fixed' ? (
              <div className="grid grid-cols-3 gap-2">
                {years.map((y) => (
                  <NumberField key={y} label={String(y)} value={(rel.annual ?? rel.fee?.amountPerYear)?.[y] ?? 0} onChange={(v) => set((r) => (r.annual = { ...(r.annual ?? {}), [y]: v }))} />
                ))}
              </div>
            ) : (
              <NumberField label="Rate" percent value={rel.fee.pct ?? 0} onChange={(v) => set((r) => (r.fee!.pct = v))} />
            )}
            <NumberField label="Share of services performed in Canada" percent value={rel.fee.servicesInCanadaPct} onChange={(v) => set((r) => (r.fee!.servicesInCanadaPct = v))} hint="Drives Reg. 105 withholding and permanent-establishment risk." />
            {t === 'license' ? <SelectField label="IP type" value={rel.fee.ipType ?? 'other'} options={[{ value: 'trademark', label: 'Trademark / brand' }, { value: 'event-rights', label: 'Event format / rights' }, { value: 'software', label: 'Software' }, { value: 'know-how', label: 'Know-how' }, { value: 'copyright', label: 'Copyright' }, { value: 'other', label: 'Other' }]} onChange={(v) => set((r) => (r.fee!.ipType = v))} /> : null}
            <Toggle label="Written agreement with fair-market-value support" hint="Without it, deductions and treaty relief are at risk." checked={rel.fee.documentedFmv} onChange={(v) => set((r) => (r.fee!.documentedFmv = v))} />
          </>
        ) : null}
        {(t === 'revenue-share' || t === 'jv') && rel.revenueShare ? (
          <>
            <Row>
              <NumberField label="Share" percent value={rel.revenueShare.pct} onChange={(v) => set((r) => (r.revenueShare!.pct = v))} />
              <SelectField label="Of" value={rel.revenueShare.base} options={[{ value: 'event-revenue', label: 'Event revenue' }, { value: 'event-ebitda', label: 'Event EBITDA' }]} onChange={(v) => set((r) => (r.revenueShare!.base = v))} />
            </Row>
            <SelectField label="Tax characterisation (unresolved)" value={rel.revenueShare.characterization} options={[{ value: 'participating-payment', label: 'Participating payment (25% withholding)' }, { value: 'contractual-no-pe', label: 'Contract, no Canadian PE' }, { value: 'partnership-pe', label: 'Partnership / Canadian PE' }]} onChange={(v) => set((r) => (r.revenueShare!.characterization = v))} hint="Choose the case to model; a legal opinion is required." />
          </>
        ) : null}
        {(t === 'grant' || t === 'donation' || t === 'restricted-funding' || t === 'sponsorship' || t === 'hosting' || t === 'vendor') ? (
          <>
            <div className="label">Annual amounts (optional; overrides one-off amount)</div>
            <div className="grid grid-cols-3 gap-2">
              {years.map((y) => (
                <NumberField key={y} label={String(y)} value={rel.annual?.[y] ?? 0} onChange={(v) => set((r) => (r.annual = { ...(r.annual ?? {}), [y]: v }))} />
              ))}
            </div>
            {['hosting', 'vendor', 'sponsorship'].includes(t) ? <p className="muted text-[12px]">Operating contracts are normally carried in the event budgets; amounts entered here are added on top.</p> : null}
            {rel.grant ? (
              <>
                <TextField label="Purpose" value={rel.grant.purpose} onChange={(v) => set((r) => (r.grant!.purpose = v))} />
                <Toggle label="Restricted to a purpose" checked={rel.grant.restricted} onChange={(v) => set((r) => (r.grant!.restricted = v))} />
                <Toggle label="Eligibility verified with the funder" checked={rel.grant.eligibilityVerified} onChange={(v) => set((r) => (r.grant!.eligibilityVerified = v))} />
              </>
            ) : null}
          </>
        ) : null}
        {t === 'guarantee' ? <NumberField label="Guarantee fee (% per year)" percent value={rel.guaranteeFeePct ?? 0} onChange={(v) => set((r) => (r.guaranteeFeePct = v))} /> : null}
        <details className="rounded-xl p-3" style={{ background: 'var(--card-2)' }}>
          <summary className="cursor-pointer text-[14px] font-semibold">Control and governance rights</summary>
          <div className="mt-3 space-y-3">
            <Row>
              <NumberField label="Board seats appointed" value={rel.rights?.boardSeats ?? 0} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), boardSeats: v }))} testId="edge-board" />
              <NumberField label="Total board size" value={rel.rights?.boardSize ?? 0} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), boardSize: v }))} />
            </Row>
            <TextField label="Veto rights (comma-separated)" value={(rel.rights?.vetoRights ?? []).join(', ')} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), vetoRights: v.split(',').map((x) => x.trim()).filter(Boolean) }))} />
            <Row>
              <NumberField label="Option / warrant shares" value={rel.rights?.optionShares ?? 0} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), optionShares: v }))} />
              <NumberField label="Votes per option share" value={rel.rights?.optionVotesPerShare ?? 1} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), optionVotesPerShare: v }))} />
            </Row>
            <Toggle label="Unanimous shareholder agreement" checked={!!rel.rights?.usa} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), usa: v }))} />
            <Toggle label="Economic dependence (sole funder / key licence)" checked={!!rel.rights?.economicDependence} onChange={(v) => set((r) => (r.rights = { ...(r.rights ?? {}), economicDependence: v }))} />
          </div>
        </details>
        <SelectField label="Evidence" value={rel.evidence} options={EVIDENCE} onChange={(v) => set((r) => (r.evidence = v))} />
        <TextField label="Notes / contract reference" value={rel.notes ?? ''} onChange={(v) => set((r) => (r.notes = v))} />
        <p className="muted flex items-center gap-1 text-[12px]">
          <Icon name="info" size={13} /> Changes recalculate every page immediately.
        </p>
      </div>
    </Card>
  );
}
