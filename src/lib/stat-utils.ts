// Utilitários estatísticos para o Laboratório de Análise.
// Sem dependências externas — implementações diretas das fórmulas.

// ─── Função Gamma (Lanczos) ───────────────────────────────────────────────────

function gammaln(x: number): number {
  const COEFS = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += COEFS[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Gamma incompleta inferior regularizada P(a, x) — série de Taylor
function gammainc_series(a: number, x: number): number {
  if (x === 0) return 0;
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 300; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

// Gamma incompleta superior Q(a, x) — fração continuada de Lentz
function gammainc_cf(a: number, x: number): number {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / (Math.abs(b) < FPMIN ? FPMIN : b);
  let h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
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

// ─── P-valor do χ² ────────────────────────────────────────────────────────────

/** P(χ²(df) > chi2_val) — cauda superior */
export function chiSquarePValue(chi2: number, df: number): number {
  if (chi2 <= 0) return 1;
  if (df <= 0) return 1;
  const a = df / 2;
  const x = chi2 / 2;
  if (x < a + 1) return 1 - gammainc_series(a, x);
  return gammainc_cf(a, x);
}

// ─── Qui-quadrado de Pearson ─────────────────────────────────────────────────

export interface ChiSquareResult {
  chi2:               number;
  df:                 number;
  pValue:             number;
  expectedCounts:     number[][];
  lowExpectedWarning: boolean; // alguma célula esperada < 5
  n:                  number;
}

/**
 * matrix[i][j] = frequência observada
 * rows = categorias de X, cols = categorias de Y
 */
export function computeChiSquare(matrix: number[][]): ChiSquareResult {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rowTotals = matrix.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: cols }, (_, j) =>
    matrix.reduce((s, r) => s + r[j], 0),
  );
  const n = rowTotals.reduce((s, v) => s + v, 0);

  const expected: number[][] = matrix.map((r, i) =>
    r.map((_, j) => (rowTotals[i] * colTotals[j]) / n),
  );

  let chi2 = 0;
  let lowExpected = false;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (expected[i][j] < 5) lowExpected = true;
      if (expected[i][j] > 0) {
        chi2 += Math.pow(matrix[i][j] - expected[i][j], 2) / expected[i][j];
      }
    }
  }

  return {
    chi2,
    df: (rows - 1) * (cols - 1),
    pValue: chiSquarePValue(chi2, (rows - 1) * (cols - 1)),
    expectedCounts: expected,
    lowExpectedWarning: lowExpected,
    n,
  };
}

// ─── Odds Ratio (Woolf) para tabelas 2×2 ─────────────────────────────────────

export interface OddsRatioResult {
  or:          number;
  ci95Low:     number;
  ci95High:    number;
  continuity:  boolean; // correção de continuidade aplicada (+0,5)
}

/**
 * Tabela:
 *        | Y=caso | Y=ref |
 * X=caso |   a    |   b   |
 * X=ref  |   c    |   d   |
 *
 * OR = (a×d) / (b×c)
 */
export function computeOR(a: number, b: number, c: number, d: number): OddsRatioResult {
  const needsContinuity = a === 0 || b === 0 || c === 0 || d === 0;
  let aa = a, bb = b, cc = c, dd = d;
  if (needsContinuity) { aa += 0.5; bb += 0.5; cc += 0.5; dd += 0.5; }
  const or = (aa * dd) / (bb * cc);
  const se = Math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd);
  const lnOR = Math.log(or);
  return {
    or,
    ci95Low:    Math.exp(lnOR - 1.96 * se),
    ci95High:   Math.exp(lnOR + 1.96 * se),
    continuity: needsContinuity,
  };
}

// ─── Risco Relativo (Wald) para tabelas 2×2 ──────────────────────────────────

export interface RiscoRelativoResult {
  rr:         number;
  ci95Low:    number;
  ci95High:   number;
  continuity: boolean;
}

/**
 * RR = (a/(a+b)) / (c/(c+d))
 * SE(ln RR) = sqrt( b/(a(a+b)) + d/(c(c+d)) )
 * Correção de continuidade aplicada apenas quando a=0 ou c=0 (p1 ou p2 zerada).
 */
export function computeRR(a: number, b: number, c: number, d: number): RiscoRelativoResult {
  const needsContinuity = a === 0 || c === 0;
  let aa = a, bb = b, cc = c, dd = d;
  if (needsContinuity) { aa += 0.5; bb += 0.5; cc += 0.5; dd += 0.5; }
  const p1  = aa / (aa + bb);
  const p2  = cc / (cc + dd);
  const rr  = p1 / p2;
  const se  = Math.sqrt(bb / (aa * (aa + bb)) + dd / (cc * (cc + dd)));
  const lnRR = Math.log(rr);
  return {
    rr,
    ci95Low:    Math.exp(lnRR - 1.96 * se),
    ci95High:   Math.exp(lnRR + 1.96 * se),
    continuity: needsContinuity,
  };
}

// ─── Teste Exato de Fisher ────────────────────────────────────────────────────

export interface FisherResult {
  pValue: number;
}

/** log C(n, k) via gammaln — retorna -Infinity para k inválido */
function logComb(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1);
}

/** log P(X=x) da distribuição hipergeométrica */
function hypergeomLogP(x: number, row1: number, col1: number, n: number): number {
  return logComb(row1, x) + logComb(n - row1, col1 - x) - logComb(n, col1);
}

/**
 * P-valor bilateral do teste exato de Fisher para tabela 2×2.
 * Soma todas as configurações com probabilidade ≤ à observada.
 */
export function computeFisher(a: number, b: number, c: number, d: number): FisherResult {
  const n    = a + b + c + d;
  const row1 = a + b;   // soma da 1ª linha
  const col1 = a + c;   // soma da 1ª coluna
  const minX = Math.max(0, row1 + col1 - n);
  const maxX = Math.min(row1, col1);

  const logPObs = hypergeomLogP(a, row1, col1, n);

  let pValue = 0;
  for (let x = minX; x <= maxX; x++) {
    const logP = hypergeomLogP(x, row1, col1, n);
    if (logP <= logPObs + 1e-10) pValue += Math.exp(logP);
  }
  return { pValue: Math.min(1, pValue) };
}

// ─── V de Cramér ─────────────────────────────────────────────────────────────

export function computeCramersV(chi2: number, n: number, rows: number, cols: number): number {
  if (n === 0 || rows <= 1 || cols <= 1) return 0;
  return Math.sqrt(chi2 / (n * Math.min(rows - 1, cols - 1)));
}

export function interpretCramersV(v: number): string {
  if (v < 0.1) return "muito fraca";
  if (v < 0.3) return "fraca";
  if (v < 0.5) return "moderada";
  return "forte";
}

// ─── Formatação ───────────────────────────────────────────────────────────────

export function formatPValue(p: number): string {
  if (p < 0.001) return "< 0,001";
  if (p < 0.01)  return p.toFixed(3).replace(".", ",");
  if (p < 0.1)   return p.toFixed(3).replace(".", ",");
  return p.toFixed(3).replace(".", ",");
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
