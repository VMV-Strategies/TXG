// Workbook engine: recalculates an imported model with the in-app formula
// engine, reconciles against the workbook's cached results, inventories sheets,
// assumptions, hard-codes, formulas and dependencies, and maps the management
// model into the app's event inputs. Faithfulness first: anything that cannot be
// interpreted is flagged.
import { a1, evaluate, functionsUsed, isErr, parseFormula, precedents, SUPPORTED_FUNCTIONS, XlError, type CellValue, type Node } from './formula';
import type { RawWorkbook } from './xlsx';
import type { EventLineItems, Scenario } from '../../types/domain';
import { emptyLines } from '../events/events';

export interface WbCell {
  sheet: string;
  r: number;
  c: number;
  formula?: string;
  ast?: Node;
  parseError?: string;
  input: CellValue; // constant value (for non-formula cells)
  cached: CellValue;
  value?: CellValue;
}

export class Workbook {
  cells = new Map<string, WbCell>();
  sheets: string[] = [];
  private evaluating = new Set<string>();
  private computed = new Set<string>();
  circular: string[] = [];

  static fromRaw(raw: RawWorkbook): Workbook {
    const wb = new Workbook();
    wb.sheets = raw.sheetOrder;
    for (const s of raw.sheets) {
      for (const [, c] of s.cells) {
        const key = Workbook.key(s.name, c.r, c.c);
        const cell: WbCell = { sheet: s.name, r: c.r, c: c.c, formula: c.formula, input: c.formula ? null : c.cached, cached: c.cached };
        if (c.formula) {
          try {
            cell.ast = parseFormula(c.formula);
          } catch (e) {
            cell.parseError = (e as Error).message;
          }
        }
        wb.cells.set(key, cell);
      }
    }
    return wb;
  }

  static key(sheet: string, r: number, c: number) {
    return `${sheet}!${a1(r, c)}`;
  }

  get(sheet: string, r: number, c: number): CellValue {
    const k = Workbook.key(sheet, r, c);
    const cell = this.cells.get(k);
    if (!cell) return this.sheets.includes(sheet) ? null : new XlError('#REF!');
    if (!cell.formula) return cell.input;
    if (this.computed.has(k)) return cell.value ?? null;
    if (this.evaluating.has(k)) {
      this.circular.push(k);
      return new XlError('#CIRC!');
    }
    if (!cell.ast) {
      cell.value = new XlError('#PARSE!');
      this.computed.add(k);
      return cell.value;
    }
    this.evaluating.add(k);
    const v = evaluate(cell.ast, { sheet, get: (s, r, c) => this.get(s, r, c) });
    this.evaluating.delete(k);
    cell.value = Array.isArray(v) ? (v[0]?.[0] ?? null) : v;
    this.computed.add(k);
    return cell.value;
  }

  recalc() {
    this.computed.clear();
    this.circular = [];
    for (const c of this.cells.values()) if (c.formula) this.get(c.sheet, c.r, c.c);
  }

  setInput(sheet: string, ref: string, value: CellValue) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const key = `${sheet}!${ref}`;
    const cell = this.cells.get(key);
    if (cell && cell.formula) throw new Error(`${key} is a formula cell, not an input`);
    if (cell) cell.input = value;
    else this.cells.set(key, { sheet, r: Number(m[2]), c: 0, input: value, cached: null });
    this.recalc();
  }

  value(sheet: string, ref: string): CellValue {
    const cell = this.cells.get(`${sheet}!${ref}`);
    if (!cell) return null;
    return cell.formula ? (cell.value ?? this.get(cell.sheet, cell.r, cell.c)) : cell.input;
  }

  /** Find the row whose column-A label matches (case-insensitive, trimmed, startsWith allowed). */
  findRow(sheet: string, label: string, opts: { startRow?: number; exact?: boolean } = {}): number | null {
    const want = label.trim().toLowerCase();
    let best: number | null = null;
    for (const c of this.cells.values()) {
      if (c.sheet !== sheet || c.c !== 1 || (opts.startRow && c.r < opts.startRow)) continue;
      const v = String(c.input ?? c.cached ?? '').trim().toLowerCase();
      if (v === want || (!opts.exact && v.startsWith(want))) {
        if (best === null || c.r < best) best = c.r;
      }
    }
    return best;
  }
}

export interface Inventory {
  sheets: { name: string; formulas: number; hardcodes: number; textCells: number; dependsOn: string[]; usedBy: string[] }[];
  functions: Record<string, number>;
  unsupportedFunctions: string[];
  parseErrors: { cell: string; formula: string; error: string }[];
  totalFormulas: number;
  totalHardcodes: number;
  scenarios: string[];
  selectedScenario: string | null;
  assumptions: { cell: string; label: string; values: CellValue[] }[];
}

export function inventory(wb: Workbook): Inventory {
  const per: Record<string, { formulas: number; hardcodes: number; textCells: number; deps: Set<string> }> = {};
  const fnCount: Record<string, number> = {};
  const parseErrors: Inventory['parseErrors'] = [];
  for (const s of wb.sheets) per[s] = { formulas: 0, hardcodes: 0, textCells: 0, deps: new Set() };
  for (const c of wb.cells.values()) {
    const p = per[c.sheet] ?? (per[c.sheet] = { formulas: 0, hardcodes: 0, textCells: 0, deps: new Set() });
    if (c.formula) {
      p.formulas++;
      if (c.ast) {
        for (const f of functionsUsed(c.ast)) fnCount[f] = (fnCount[f] ?? 0) + 1;
        for (const pr of precedents(c.ast, c.sheet)) if (pr.sheet !== c.sheet) p.deps.add(pr.sheet);
      } else parseErrors.push({ cell: `${c.sheet}!${a1(c.r, c.c)}`, formula: c.formula, error: c.parseError ?? 'parse error' });
    } else if (typeof c.input === 'number') p.hardcodes++;
    else if (typeof c.input === 'string' && c.input) p.textCells++;
  }
  const usedBy: Record<string, string[]> = {};
  for (const [s, p] of Object.entries(per)) for (const d of p.deps) (usedBy[d] ??= []).push(s);
  // Scenario detection (management model convention: Scenario_Control!B4 selects Conservative/Base/Exceeds)
  const sel = wb.value('Scenario_Control', 'B4');
  const assumptions: Inventory['assumptions'] = [];
  if (wb.sheets.includes('Scenario_Control')) {
    for (const c of wb.cells.values()) {
      if (c.sheet !== 'Scenario_Control' || c.c !== 1 || typeof c.input !== 'string' || !c.input.trim()) continue;
      const vals = [3, 4, 5].map((col) => wb.cells.get(Workbook.key('Scenario_Control', c.r, col))?.input ?? null);
      if (vals.some((v) => typeof v === 'number')) assumptions.push({ cell: `Scenario_Control!A${c.r}`, label: c.input, values: vals });
    }
    assumptions.sort((a, b) => Number(a.cell.slice(18)) - Number(b.cell.slice(18)));
  }
  const unsupported = Object.keys(fnCount).filter((f) => !SUPPORTED_FUNCTIONS.includes(f));
  return {
    sheets: wb.sheets.map((s) => ({ name: s, formulas: per[s]?.formulas ?? 0, hardcodes: per[s]?.hardcodes ?? 0, textCells: per[s]?.textCells ?? 0, dependsOn: [...(per[s]?.deps ?? [])].sort(), usedBy: (usedBy[s] ?? []).sort() })),
    functions: fnCount,
    unsupportedFunctions: unsupported,
    parseErrors,
    totalFormulas: Object.values(per).reduce((a, p) => a + p.formulas, 0),
    totalHardcodes: Object.values(per).reduce((a, p) => a + p.hardcodes, 0),
    scenarios: typeof sel === 'string' ? ['Conservative', 'Base', 'Exceeds'] : [],
    selectedScenario: typeof sel === 'string' ? sel : null,
    assumptions,
  };
}

export interface Reconciliation {
  compared: number;
  matched: number;
  mismatched: { cell: string; formula: string; workbook: CellValue; app: CellValue; diff: number | null }[];
  uncached: number;
  errors: { cell: string; value: string }[];
  circular: string[];
  ok: boolean;
}

export function reconcile(wb: Workbook, tol = 1e-6): Reconciliation {
  wb.recalc();
  let compared = 0;
  let matched = 0;
  let uncached = 0;
  const mismatched: Reconciliation['mismatched'] = [];
  const errors: Reconciliation['errors'] = [];
  for (const c of wb.cells.values()) {
    if (!c.formula) continue;
    const app = c.value ?? null;
    if (isErr(app)) errors.push({ cell: `${c.sheet}!${a1(c.r, c.c)}`, value: app.code });
    if (c.cached === null || c.cached === undefined) {
      uncached++;
      continue;
    }
    compared++;
    let ok = false;
    let diff: number | null = null;
    if (typeof c.cached === 'number' && typeof app === 'number') {
      diff = app - c.cached;
      ok = Math.abs(diff) <= tol * Math.max(1, Math.abs(c.cached));
    } else if (isErr(c.cached) && isErr(app)) ok = c.cached.code === app.code;
    else if (typeof c.cached === 'boolean' && typeof app === 'boolean') ok = c.cached === app;
    else ok = String(c.cached ?? '') === String(app ?? '');
    if (ok) matched++;
    else mismatched.push({ cell: `${c.sheet}!${a1(c.r, c.c)}`, formula: c.formula, workbook: c.cached, app, diff });
  }
  return { compared, matched, mismatched, uncached, errors, circular: [...new Set(wb.circular)], ok: mismatched.length === 0 && wb.circular.length === 0 };
}

export interface ModelReview {
  id: string;
  severity: 'info' | 'watch' | 'warning';
  title: string;
  detail: string;
  cells: string[];
}

/** Structural review of a management model following the Three X Global V1.1 layout. */
export function reviewModel(wb: Workbook): ModelReview[] {
  const out: ModelReview[] = [];
  const pl = 'Consolidated_PL';
  const has = (s: string) => wb.sheets.includes(s);
  if (has(pl)) {
    const taxRow = wb.findRow(pl, 'Illustrative Cash Taxes');
    if (taxRow) {
      const f = wb.cells.get(Workbook.key(pl, taxRow, 2))?.formula ?? '';
      out.push({ id: 'flat-tax', severity: 'warning', title: 'Taxes use one illustrative flat rate with no loss carryforward', detail: `Cash taxes are ${f} — a single rate applied to positive EBIT each year, with no carryforward of earlier losses, no jurisdictional split (Canada / U.S. / Europe), and no withholding. The app replaces this with its source-linked tax engine for the Toronto structure; the workbook value is preserved for comparison.`, cells: [`${pl}!B${taxRow}`] });
    }
    const da = wb.findRow(pl, 'Depreciation');
    if (da) out.push({ id: 'da', severity: 'info', title: 'Depreciation is a 50% half-year proxy on platform capex', detail: 'D&A is derived from capex using a useful-life input; it is not a tax capital cost allowance calculation.', cells: [`${pl}!B${da}`] });
    const hc = wb.findRow(pl, 'Host-City Cash Contributions');
    if (hc) out.push({ id: 'hostcity', severity: 'watch', title: 'Host-city contributions are applied without growth (exponent ^0)', detail: 'Host-city cash is held flat across years by design; confirm that this matches the intended host agreements.', cells: [`${pl}!B${hc}`] });
  }
  if (has('Capital_Requirements')) {
    out.push({ id: 'capital-2027', severity: 'warning', title: 'Capital requirement is sized on 2027 monthly cash only', detail: 'The recommended raise uses the 2027 monthly cash low point plus a reserve. In scenarios where free cash flow stays negative in 2028–2029 (e.g., Conservative), later-year funding needs are not captured.', cells: ['Capital_Requirements!B8', 'Cash_Flow_2027!B22'] });
    out.push({ id: 'success-fee', severity: 'warning', title: 'A 10% capital facilitation / success-fee reserve is assumed', detail: 'Success fees paid to persons who are not registered dealers raise securities-law questions in both countries (e.g., U.S. Exchange Act § 15(a)). The model itself flags securities-counsel review.', cells: ['Capital_Requirements!B13'] });
  }
  if (has('Scenario_Control')) {
    const fx = wb.findRow('Scenario_Control', 'CAD per USD');
    if (fx) out.push({ id: 'fx', severity: 'info', title: 'FX is a constant management assumption', detail: `CAD per USD is held at ${wb.value('Scenario_Control', `D${fx}`)} in all years; the app lets you vary FX by year.`, cells: [`Scenario_Control!C${fx}:E${fx}`] });
  }
  if (has('Sheet2') || has('Analysis')) out.push({ id: 'stray-sheets', severity: 'watch', title: 'Unlinked sheets present (Sheet2 / Analysis)', detail: 'Sheet2 contains a pasted rollout summary with hard-coded text values and no formula links; it can go stale if Portfolio_Rollout changes.', cells: ['Sheet2!A1'] });
  out.push({ id: 'combined-event', severity: 'watch', title: 'Event archetypes combine men’s and women’s competition', detail: 'The NA and EU event models are combined five-day World Tour + Women’s Series archetypes. FIBA rights and costs for men’s and women’s events may differ; the app models them separately and requires an explicit allocation when importing.', cells: ['NA_Event_Model!A2'] });
  return out;
}

/** Cell-to-input mapping used when building a workbook-baseline scenario. */
export interface MapEntry {
  appField: string;
  sheet: string;
  label: string;
  cell?: string;
  value?: number;
  note?: string;
}

const NA_REV: [string, keyof EventLineItems | 'sponsorship' | 'tickets'][] = [
  ['Sponsorship & Partnerships', 'sponsorship'],
  ['Ticket Sales', 'tickets'],
  ['Food & Beverage Revenue Share', 'fnbShare'],
  ['Merchandise Revenue Share', 'merchandise'],
  ['Three X Global Exchange', 'other'],
  ['Media Production & Branded Content', 'media'],
  ['Digital / CRM / Data Products', 'digital'],
  ['Vendor / Concession License Fees', 'vendorFees'],
  ['Host-City Cash Contribution', 'hostCityContribution'],
];
const NA_COST: [string, keyof EventLineItems][] = [
  ['Sponsor activation & servicing', 'otherCosts'],
  ['Ticketing / merchant / access control', 'otherCosts'],
  ['Three X Global Exchange — variable delivery', 'otherCosts'],
  ['Media production delivery', 'production'],
  ['Digital / data product delivery', 'otherCosts'],
  ['Vendor / concession administration', 'otherCosts'],
  ['FIBA / Event Rights', 'fibaHostingFee'],
  ['Venue & Infrastructure', 'venue'],
  ['Production & Technology', 'production'],
  ['Branding & Marketing', 'marketing'],
  ['Brand Village & Activations', 'otherCosts'],
  ['Three X Global Exchange — Fixed Delivery', 'otherCosts'],
  ['F&B / Catering / Hospitality', 'otherCosts'],
  ['Merchandise / POS / Ancillary', 'otherCosts'],
  ['Basketball Operations', 'courtsEquipment'],
  ['Accommodation & Travel', 'athleteTravelAccommodation'],
  ['Security / Medical / Insurance', 'medicalSecurity'],
  ['Sustainability & Accessibility', 'otherCosts'],
  ['LOC / Project Delivery Team', 'staffingContractors'],
  ['Host-Market Development / Local Admin', 'otherCosts'],
  ['Contingency / General Bucket', 'otherCosts'],
];

/**
 * Build a scenario whose Toronto events use the workbook's Large North American
 * archetype (selected scenario column), split between the men's and women's
 * events by `menShare` (an explicit assumption), converted to CAD with the
 * workbook's FX and maturity factors.
 */
export function workbookBaseline(wb: Workbook, base: Scenario, scenarioName: 'Conservative' | 'Base' | 'Exceeds', menShare = 0.6): { scenario: Scenario; mapping: MapEntry[]; warnings: string[] } {
  wb.recalc();
  const col = scenarioName === 'Conservative' ? 3 : scenarioName === 'Base' ? 4 : 5;
  const colL = ['', 'A', 'B', 'C', 'D', 'E'][col];
  const mapping: MapEntry[] = [];
  const warnings: string[] = [];
  const sc = 'Scenario_Control';
  const getSc = (label: string): number | null => {
    const r = wb.findRow(sc, label);
    if (!r) {
      warnings.push(`Scenario_Control row "${label}" not found`);
      return null;
    }
    const v = wb.value(sc, `${colL}${r}`);
    mapping.push({ appField: `assumption: ${label}`, sheet: sc, label, cell: `${sc}!${colL}${r}`, value: typeof v === 'number' ? v : undefined });
    return typeof v === 'number' ? v : null;
  };
  const fx = getSc('CAD per USD') ?? 1.35;
  const growth = getSc('Annual revenue / pricing growth') ?? 0;
  const inflation = getSc('Annual event cost inflation') ?? 0;
  const revMat = [getSc('Year 1 revenue maturity factor') ?? 1, getSc('Year 2 revenue maturity factor') ?? 1, getSc('Year 3 revenue maturity factor') ?? 1];
  const costMat = [getSc('Year 1 cost maturity factor') ?? 1, getSc('Year 2 cost maturity factor') ?? 1, getSc('Year 3 cost maturity factor') ?? 1];

  const sheet = 'NA_Event_Model';
  const lineVal = (label: string): number => {
    const r = wb.findRow(sheet, label);
    if (!r) {
      warnings.push(`${sheet}: "${label}" not found`);
      return 0;
    }
    const v = wb.value(sheet, `${colL}${r}`);
    mapping.push({ appField: label, sheet, label, cell: `${sheet}!${colL}${r}`, value: typeof v === 'number' ? v : undefined, note: 'USD, steady-state 2027' });
    return typeof v === 'number' ? v : 0;
  };
  const rev: Record<string, number> = {};
  for (const [label, key] of NA_REV) rev[key] = (rev[key] ?? 0) + lineVal(label);
  const cost: Record<string, number> = {};
  for (const [label, key] of NA_COST) cost[key] = (cost[key] ?? 0) + lineVal(label);

  const scn: Scenario = JSON.parse(JSON.stringify(base));
  scn.id = `wb-${scenarioName.toLowerCase()}`;
  scn.name = `Workbook ${scenarioName} — Toronto (NA archetype)`;
  scn.baseline = 'workbook';
  scn.description = `Toronto events built from the imported workbook’s Large North American archetype (${scenarioName} column), converted at ${fx} CAD/USD with workbook growth, inflation and maturity factors. The combined archetype is split ${Math.round(menShare * 100)}% men’s / ${Math.round((1 - menShare) * 100)}% women’s — an explicit assumption.`;
  scn.fx = { mode: 'forecast', cadPerUsd: Object.fromEntries(scn.years.map((y) => [y, fx])) };
  // Sponsorship and tickets come straight from the workbook (no pipeline / ticket ladder in this baseline).
  scn.sponsors = [];
  scn.events = scn.events.map((ev) => {
    const share = ev.gender === 'women' ? 1 - menShare : menShare;
    const lines: Record<number, EventLineItems> = {};
    const ticketing: typeof ev.ticketing = {};
    scn.years.forEach((y, i) => {
      const rm = revMat[Math.min(i, 2)] * Math.pow(1 + growth, i);
      const cm = costMat[Math.min(i, 2)] * Math.pow(1 + inflation, i);
      const L = emptyLines();
      L.contingencyPct = 0; // contingency is an explicit workbook line
      for (const [k, v] of Object.entries(rev)) {
        const cad = v * fx * share * rm;
        if (k === 'sponsorship') L.sponsorshipOverride = cad;
        else if (k === 'tickets') L.other += 0; // tickets handled below
        else (L[k as keyof EventLineItems] as number) += cad;
      }
      for (const [k, v] of Object.entries(cost)) (L[k as keyof EventLineItems] as number) += v * fx * share * cm;
      lines[y] = L;
      // Represent workbook ticket revenue as a single product so the ticket engine reproduces it (no HST/commission adjustments: those are in workbook direct costs).
      const tix = (rev.tickets ?? 0) * fx * share * rm;
      ticketing[y] = { capacityPerSession: 1, sessions: 1, sellThrough: 1, compsPct: 0, refundsPct: 0, commissionPct: 0, pricesIncludeHst: false, products: [{ id: 'wb', name: 'Workbook ticket revenue', price: tix, mix: 1, admissionsPerProduct: 1 }] };
    });
    return { ...ev, lines, ticketing, evidence: 'workbook' as const, employeeHeadcount: 0, notes: `${ev.notes ?? ''} Values from workbook NA archetype × ${Math.round(share * 100)}%.` };
  });
  return { scenario: scn, mapping, warnings };
}
