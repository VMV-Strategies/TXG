// A small, faithful Excel formula engine for the subset of functions used by the
// imported financial model (IF, SUM, IFERROR, ABS, SUMPRODUCT, COUNTIF, MAX, MIN,
// ROUND and a few common extras). Unsupported syntax is reported, never silently
// replaced with a different formula.

export type CellValue = number | string | boolean | null | XlError;
export class XlError {
  constructor(public code: string) {}
  toString() {
    return this.code;
  }
}
export const isErr = (v: unknown): v is XlError => v instanceof XlError;

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: string }
  | { t: 'ref'; sheet?: string; r: number; c: number; ar: boolean; ac: boolean }
  | { t: 'range'; sheet?: string; r1: number; c1: number; r2: number; c2: number; a: [boolean, boolean, boolean, boolean] }
  | { t: 'fn'; name: string; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'pct'; a: Node };

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function parseA1(a1: string): { r: number; c: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(a1);
  if (!m) throw new Error(`Bad cell ref ${a1}`);
  return { c: colToNum(m[1]), r: Number(m[2]) };
}
export const a1 = (r: number, c: number) => `${numToCol(c)}${r}`;

type Tok = { k: 'num' | 'str' | 'ref' | 'name' | 'op' | 'lp' | 'rp' | 'comma' | 'bool' | 'err'; v: string };

const REF_RE = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.startsWith('=') ? src.slice(1) : src;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let str = '';
      while (j < s.length) {
        if (s[j] === '"' && s[j + 1] === '"') {
          str += '"';
          j += 2;
        } else if (s[j] === '"') break;
        else str += s[j++];
      }
      out.push({ k: 'str', v: str });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const m = /^#(DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!|NULL!)/.exec(s.slice(i));
      if (m) {
        out.push({ k: 'err', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    const rest = s.slice(i);
    const rm = REF_RE.exec(rest);
    if (rm && (rm[1] || rm[2] || !/^[A-Za-z]+\(/.test(rest))) {
      // avoid treating function names like LOG10( as refs
      const after = rest.slice(rm[0].length);
      if (!after.startsWith('(')) {
        out.push({ k: 'ref', v: rm[0] });
        i += rm[0].length;
        continue;
      }
    }
    const nm = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest);
    if (nm) {
      out.push({ k: 'num', v: nm[0] });
      i += nm[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (name) {
      const up = name[0].toUpperCase();
      if ((up === 'TRUE' || up === 'FALSE') && rest[name[0].length] !== '(') out.push({ k: 'bool', v: up });
      else out.push({ k: 'name', v: up });
      i += name[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      out.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      out.push({ k: 'lp', v: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ k: 'rp', v: ch });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      out.push({ k: 'comma', v: ',' });
      i++;
      continue;
    }
    throw new Error(`Unsupported character "${ch}" in formula`);
  }
  return out;
}

function refNode(text: string): Node {
  const m = REF_RE.exec(text)!;
  const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2];
  const p1 = m[3];
  const abs = (x: string) => {
    const mm = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(x)!;
    return { ac: mm[1] === '$', c: colToNum(mm[2]), ar: mm[3] === '$', r: Number(mm[4]) };
  };
  const a = abs(p1);
  if (m[4]) {
    const b = abs(m[4]);
    return { t: 'range', sheet, r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c), a: [a.ar, a.ac, b.ar, b.ac] };
  }
  return { t: 'ref', sheet, r: a.r, c: a.c, ar: a.ar, ac: a.ac };
}

const PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  function primary(): Node {
    const t = next();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.k === 'num') return postfix({ t: 'num', v: Number(t.v) });
    if (t.k === 'str') return postfix({ t: 'str', v: t.v });
    if (t.k === 'bool') return postfix({ t: 'bool', v: t.v === 'TRUE' });
    if (t.k === 'err') return postfix({ t: 'err', v: t.v });
    if (t.k === 'ref') return postfix(refNode(t.v));
    if (t.k === 'op' && (t.v === '-' || t.v === '+')) return { t: 'un', op: t.v, a: unaryOperand() };
    if (t.k === 'lp') {
      const e = expr(0);
      if (next()?.k !== 'rp') throw new Error('Missing )');
      return postfix(e);
    }
    if (t.k === 'name') {
      if (peek()?.k !== 'lp') throw new Error(`Unsupported name "${t.v}" (named ranges are not supported)`);
      next();
      const args: Node[] = [];
      if (peek()?.k !== 'rp') {
        for (;;) {
          if (peek()?.k === 'comma') args.push({ t: 'str', v: '' });
          else args.push(expr(0));
          if (peek()?.k === 'comma') {
            next();
            continue;
          }
          break;
        }
      }
      if (next()?.k !== 'rp') throw new Error(`Missing ) after ${t.v}`);
      return postfix({ t: 'fn', name: t.v, args });
    }
    throw new Error(`Unexpected token ${t.v}`);
  }
  function unaryOperand(): Node {
    // unary binds tighter than ^ in Excel: -2^2 = 4
    return primary();
  }
  function postfix(n: Node): Node {
    while (peek()?.k === 'op' && peek()!.v === '%') {
      next();
      n = { t: 'pct', a: n };
    }
    return n;
  }
  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.k !== 'op' || PREC[t.v] === undefined) break;
      const prec = PREC[t.v];
      if (prec < minPrec) break;
      next();
      const right = expr(prec + 1); // Excel evaluates all binary operators left-to-right, including ^
      left = { t: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }
  const n = expr(0);
  if (p !== toks.length) throw new Error(`Unexpected token "${toks[p].v}"`);
  return n;
}

/** Shift relative references of a formula by (dr, dc) — used to expand Excel shared formulas. */
export function shiftFormula(src: string, dr: number, dc: number): string {
  // Operates on tokens outside string literals.
  let out = '';
  let i = 0;
  const s = src;
  while (i < s.length) {
    if (s[i] === '"') {
      const j = s.indexOf('"', i + 1);
      const end = j < 0 ? s.length : j + 1;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    const rest = s.slice(i);
    const prev = out.slice(-1);
    const m = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?/.exec(rest);
    if (m && !/[A-Za-z0-9_.]/.test(prev) && !rest.slice(m[0].length).startsWith('(')) {
      out += m[0].replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?=$|:)/g, (_all, ac, col, ar, row) => {
        const c = ac ? col : numToCol(colToNum(col) + dc);
        const r = ar ? row : String(Number(row) + dr);
        return `${ac}${c}${ar}${r}`;
      });
      i += m[0].length;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

export interface EvalContext {
  sheet: string;
  get: (sheet: string, r: number, c: number) => CellValue;
}

type V = CellValue | CellValue[][];

const num = (v: CellValue): number | XlError => {
  if (isErr(v)) return v;
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? n : new XlError('#VALUE!');
};
const scalar = (v: V): CellValue => (Array.isArray(v) ? (v[0]?.[0] ?? null) : v);
const flat = (v: V): CellValue[] => (Array.isArray(v) ? v.flat() : [v]);

function cmp(a: CellValue, b: CellValue, op: string): boolean | XlError {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  const na = a === null ? (typeof b === 'string' ? '' : 0) : a;
  const nb = b === null ? (typeof a === 'string' ? '' : 0) : b;
  let r: number;
  if (typeof na === 'string' && typeof nb === 'string') r = na.toLowerCase() < nb.toLowerCase() ? -1 : na.toLowerCase() > nb.toLowerCase() ? 1 : 0;
  else if (typeof na === 'number' && typeof nb === 'number') r = na < nb ? -1 : na > nb ? 1 : 0;
  else if (typeof na === 'boolean' && typeof nb === 'boolean') r = Number(na) - Number(nb);
  else {
    // Excel ordering: numbers < text < booleans
    const rank = (x: unknown) => (typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2);
    r = rank(na) - rank(nb);
  }
  switch (op) {
    case '=':
      return r === 0;
    case '<>':
      return r !== 0;
    case '<':
      return r < 0;
    case '>':
      return r > 0;
    case '<=':
      return r <= 0;
    default:
      return r >= 0;
  }
}

function criteriaMatch(v: CellValue, crit: CellValue): boolean {
  if (typeof crit === 'string') {
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(crit)!;
    const op = m[1] ?? '=';
    const rhsRaw = m[2];
    const rhsNum = Number(rhsRaw);
    const rhs: CellValue = rhsRaw !== '' && Number.isFinite(rhsNum) ? rhsNum : rhsRaw;
    if (typeof rhs === 'string' && typeof v !== 'string' && op === '=') return false;
    const res = cmp(v === null ? (typeof rhs === 'number' ? 0 : '') : v, rhs, op);
    return res === true;
  }
  return cmp(v, crit, '=') === true;
}

export const SUPPORTED_FUNCTIONS = ['IF', 'SUM', 'IFERROR', 'ABS', 'SUMPRODUCT', 'COUNTIF', 'MAX', 'MIN', 'ROUND', 'AND', 'OR', 'NOT', 'AVERAGE', 'COUNT', 'ROUNDUP', 'ROUNDDOWN', 'ISBLANK', 'ISNUMBER'];

export function evaluate(n: Node, ctx: EvalContext): V {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'str':
      return n.v;
    case 'bool':
      return n.v;
    case 'err':
      return new XlError(n.v);
    case 'ref':
      return ctx.get(n.sheet ?? ctx.sheet, n.r, n.c);
    case 'range': {
      const rows: CellValue[][] = [];
      for (let r = n.r1; r <= n.r2; r++) {
        const row: CellValue[] = [];
        for (let c = n.c1; c <= n.c2; c++) row.push(ctx.get(n.sheet ?? ctx.sheet, r, c));
        rows.push(row);
      }
      return rows;
    }
    case 'pct': {
      const a = num(scalar(evaluate(n.a, ctx)));
      return isErr(a) ? a : a / 100;
    }
    case 'un': {
      const a = num(scalar(evaluate(n.a, ctx)));
      if (isErr(a)) return a;
      return n.op === '-' ? -a : a;
    }
    case 'bin': {
      const av = scalar(evaluate(n.a, ctx));
      const bv = scalar(evaluate(n.b, ctx));
      if (n.op === '&') {
        if (isErr(av)) return av;
        if (isErr(bv)) return bv;
        return `${av ?? ''}${bv ?? ''}`;
      }
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return cmp(av, bv, n.op);
      const a = num(av);
      const b = num(bv);
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? new XlError('#DIV/0!') : a / b;
        case '^':
          return Math.pow(a, b);
      }
      return new XlError('#VALUE!');
    }
    case 'fn':
      return callFn(n.name, n.args, ctx);
  }
}

function callFn(name: string, args: Node[], ctx: EvalContext): V {
  const ev = (i: number) => evaluate(args[i], ctx);
  const numbersIn = (vals: V[], includeScalars = true) => {
    const out: number[] = [];
    for (const v of vals) {
      if (Array.isArray(v)) {
        for (const x of v.flat()) {
          if (isErr(x)) throw x;
          if (typeof x === 'number') out.push(x);
        }
      } else if (includeScalars) {
        const nn = num(v);
        if (isErr(nn)) throw nn;
        out.push(nn);
      }
    }
    return out;
  };
  try {
    switch (name) {
      case 'IF': {
        const c = scalar(ev(0));
        if (isErr(c)) return c;
        const cond = typeof c === 'string' ? (c.toUpperCase() === 'TRUE' ? true : c.toUpperCase() === 'FALSE' ? false : null) : Boolean(c);
        if (cond === null) return new XlError('#VALUE!');
        if (cond) return args.length > 1 ? ev(1) : true;
        return args.length > 2 ? ev(2) : false;
      }
      case 'IFERROR': {
        const v = ev(0);
        const s = scalar(v);
        return isErr(s) ? ev(1) : v;
      }
      case 'SUM':
        return numbersIn(args.map((_, i) => ev(i))).reduce((a, b) => a + b, 0);
      case 'AVERAGE': {
        const xs = numbersIn(args.map((_, i) => ev(i)));
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : new XlError('#DIV/0!');
      }
      case 'COUNT':
        return args.map((_, i) => flat(ev(i))).flat().filter((x) => typeof x === 'number').length;
      case 'MAX': {
        const xs = numbersIn(args.map((_, i) => ev(i)));
        return xs.length ? Math.max(...xs) : 0;
      }
      case 'MIN': {
        const xs = numbersIn(args.map((_, i) => ev(i)));
        return xs.length ? Math.min(...xs) : 0;
      }
      case 'ABS': {
        const a = num(scalar(ev(0)));
        return isErr(a) ? a : Math.abs(a);
      }
      case 'ROUND':
      case 'ROUNDUP':
      case 'ROUNDDOWN': {
        const a = num(scalar(ev(0)));
        const d = num(scalar(args[1] ? ev(1) : 0));
        if (isErr(a)) return a;
        if (isErr(d)) return d;
        const f = Math.pow(10, d);
        const x = a * f;
        const r = name === 'ROUND' ? Math.sign(x) * Math.round(Math.abs(x) + 1e-9) : name === 'ROUNDUP' ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9) : Math.sign(x) * Math.floor(Math.abs(x) + 1e-9);
        return r / f;
      }
      case 'SUMPRODUCT': {
        const arrs = args.map((_, i) => ev(i)).map((v) => flat(v));
        const len = arrs[0]?.length ?? 0;
        if (arrs.some((a) => a.length !== len)) return new XlError('#VALUE!');
        let tot = 0;
        for (let k = 0; k < len; k++) {
          let p = 1;
          for (const a of arrs) {
            const x = a[k];
            if (isErr(x)) return x;
            p *= typeof x === 'number' ? x : 0;
          }
          tot += p;
        }
        return tot;
      }
      case 'COUNTIF': {
        const range = flat(ev(0));
        const crit = scalar(ev(1));
        return range.filter((v) => criteriaMatch(v, crit)).length;
      }
      case 'AND':
      case 'OR': {
        const xs = args.map((_, i) => flat(ev(i))).flat().filter((x) => x !== null && x !== '');
        for (const x of xs) if (isErr(x)) return x;
        const bs = xs.map((x) => Boolean(typeof x === 'string' ? x.toUpperCase() === 'TRUE' : x));
        return name === 'AND' ? bs.every(Boolean) : bs.some(Boolean);
      }
      case 'NOT': {
        const a = scalar(ev(0));
        return isErr(a) ? a : !a;
      }
      case 'ISBLANK':
        return scalar(ev(0)) === null;
      case 'ISNUMBER':
        return typeof scalar(ev(0)) === 'number';
      default:
        return new XlError('#NAME?');
    }
  } catch (e) {
    if (e instanceof XlError) return e;
    throw e;
  }
}

/** Collect functions referenced by a formula AST. */
export function functionsUsed(n: Node, acc = new Set<string>()): Set<string> {
  if (n.t === 'fn') {
    acc.add(n.name);
    n.args.forEach((a) => functionsUsed(a, acc));
  } else if (n.t === 'bin') {
    functionsUsed(n.a, acc);
    functionsUsed(n.b, acc);
  } else if (n.t === 'un' || n.t === 'pct') functionsUsed(n.a, acc);
  return acc;
}

/** Sheet-qualified cell/range references (precedents) used by a formula. */
export function precedents(n: Node, sheet: string, acc: { sheet: string; r1: number; c1: number; r2: number; c2: number }[] = []) {
  if (n.t === 'ref') acc.push({ sheet: n.sheet ?? sheet, r1: n.r, c1: n.c, r2: n.r, c2: n.c });
  else if (n.t === 'range') acc.push({ sheet: n.sheet ?? sheet, r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2 });
  else if (n.t === 'fn') n.args.forEach((a) => precedents(a, sheet, acc));
  else if (n.t === 'bin') {
    precedents(n.a, sheet, acc);
    precedents(n.b, sheet, acc);
  } else if (n.t === 'un' || n.t === 'pct') precedents(n.a, sheet, acc);
  return acc;
}
