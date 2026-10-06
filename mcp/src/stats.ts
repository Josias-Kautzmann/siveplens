/**
 * stats.ts — cálculos estatísticos usados pelo MCP.
 *
 * Cópia isolada das funções de stat-utils.ts do projeto principal.
 * Sem dependências externas — math puro.
 */

// ── Gamma (Lanczos) ────────────────────────────────────────────────────────────

function gammaln(x: number): number {
  const C = [76.18009172947146,-86.50532032941677,24.01409824083091,
             -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += C[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gammainc_series(a: number, x: number): number {
  if (x === 0) return 0;
  let ap = a, del = 1 / a, sum = del;
  for (let n = 0; n < 300; n++) {
    ap++; del *= x / ap; sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

function gammainc_cf(a: number, x: number): number {
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / (Math.abs(b) < FPMIN ? FPMIN : b), h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2; d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

export function chiSquarePValue(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0) return 1;
  const a = df / 2, x = chi2 / 2;
  return x < a + 1 ? 1 - gammainc_series(a, x) : gammainc_cf(a, x);
}

// ── Qui-quadrado de Pearson ────────────────────────────────────────────────────

export interface ChiSquareResult {
  chi2:    number;
  df:      number;
  pValue:  number;
  n:       number;
  lowExpected: boolean;
}

export function computeChiSquare(matrix: number[][]): ChiSquareResult {
  const rows = matrix.length, cols = matrix[0].length;
  const rowTotals = matrix.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: cols }, (_, j) => matrix.reduce((s, r) => s + r[j], 0));
  const n = rowTotals.reduce((s, v) => s + v, 0);
  let chi2 = 0, lowExpected = false;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const e = (rowTotals[i] * colTotals[j]) / n;
      if (e < 5) lowExpected = true;
      if (e > 0) chi2 += Math.pow(matrix[i][j] - e, 2) / e;
    }
  }
  return { chi2, df: (rows - 1) * (cols - 1), pValue: chiSquarePValue(chi2, (rows - 1) * (cols - 1)), n, lowExpected };
}

// ── Odds Ratio ────────────────────────────────────────────────────────────────

export interface OddsRatioResult {
  or: number; ci95Low: number; ci95High: number; continuity: boolean;
}

export function computeOR(a: number, b: number, c: number, d: number): OddsRatioResult {
  const cont = a === 0 || b === 0 || c === 0 || d === 0;
  const [aa, bb, cc, dd] = cont ? [a+.5, b+.5, c+.5, d+.5] : [a, b, c, d];
  const or = (aa * dd) / (bb * cc);
  const se = Math.sqrt(1/aa + 1/bb + 1/cc + 1/dd);
  const ln = Math.log(or);
  return { or, ci95Low: Math.exp(ln - 1.96*se), ci95High: Math.exp(ln + 1.96*se), continuity: cont };
}

// ── Risco Relativo ────────────────────────────────────────────────────────────

export interface RRResult {
  rr: number; ci95Low: number; ci95High: number;
}

export function computeRR(a: number, b: number, c: number, d: number): RRResult {
  const cont = a === 0 || c === 0;
  const [aa, bb, cc, dd] = cont ? [a+.5, b+.5, c+.5, d+.5] : [a, b, c, d];
  const p1 = aa / (aa + bb), p2 = cc / (cc + dd);
  const rr = p1 / p2;
  const se = Math.sqrt(bb / (aa*(aa+bb)) + dd / (cc*(cc+dd)));
  const ln = Math.log(rr);
  return { rr, ci95Low: Math.exp(ln - 1.96*se), ci95High: Math.exp(ln + 1.96*se) };
}

// ── V de Cramér ───────────────────────────────────────────────────────────────

export function computeCramersV(chi2: number, n: number, rows: number, cols: number): number {
  if (n === 0 || rows <= 1 || cols <= 1) return 0;
  return Math.sqrt(chi2 / (n * Math.min(rows - 1, cols - 1)));
}

export function interpretCramersV(v: number): string {
  if (v < 0.1) return "muito fraco";
  if (v < 0.3) return "fraco";
  if (v < 0.5) return "moderado";
  return "forte";
}

// ── Formatação ────────────────────────────────────────────────────────────────

export function fmt(n: number, dec = 2): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  return n.toFixed(dec).replace(".", ",");
}

export function fmtP(p: number): string {
  if (!isFinite(p) || isNaN(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return p.toFixed(3).replace(".", ",");
}

export function sigStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01)  return "**";
  if (p < 0.05)  return "*";
  return "ns";
}
