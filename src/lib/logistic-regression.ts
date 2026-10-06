/**
 * Regressão logística via IRLS (Iteratively Reweighted Least Squares).
 * Implementação pura em TypeScript — sem dependências externas.
 * Aceita dados pré-agregados por padrão de covariáveis (binomial grouped).
 */

// ── Normal CDF (Abramowitz & Stegun 26.2.17) ─────────────────────────────────

function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = Math.exp(-0.5 * x * x) * 0.3989422804;
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x >= 0 ? 1 - p : p;
}

export function zPValue(z: number): number {
  return 2 * normCDF(-Math.abs(z));
}

// ── Operações matriciais ──────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

/**
 * Inversão de matriz p×p via eliminação de Gauss-Jordan com pivô parcial.
 * Funciona bem para p ≤ ~30 (número típico de parâmetros numa regressão logística).
 */
function matInverse(A: number[][]): number[][] {
  const n = A.length;
  const aug = A.map((row, i) => [
    ...row.map((v) => v),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // Pivô parcial
    let pivRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivRow][col])) pivRow = row;
    }
    [aug[col], aug[pivRow]] = [aug[pivRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error("Matriz singular — preditores possivelmente colineares ou separação completa");
    }
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

function sigmoid(x: number): number {
  if (x > 20)  return 1 - 1e-9;
  if (x < -20) return 1e-9;
  return 1 / (1 + Math.exp(-x));
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CoefResult {
  nome:        string;
  beta:        number;
  se:          number;
  aOR:         number;
  ci95Low:     number;
  ci95High:    number;
  z:           number;
  pValue:      number;
  isIntercept: boolean;
}

export interface RegressaoResult {
  coeficientes:  CoefResult[];
  n:             number;   // total de casos (soma dos pesos)
  events:        number;   // total de eventos
  taxaEventos:   number;   // events / n
  devianceNull:  number;   // deviance do modelo nulo (só intercepto)
  deviance:      number;   // deviance do modelo ajustado
  r2McFadden:    number;   // 1 - deviance/devianceNull
  aic:           number;   // -2·logL + 2·p
  omnibusChi2:   number;   // redução da deviance em relação ao modelo nulo
  omnibusDf:     number;
  omnibusPValue: number;
  auc:           number;   // discriminação ponderada por frequências
  hosmerLemeshowChi2: number;
  hosmerLemeshowDf: number;
  hosmerLemeshowPValue: number;
  converged:     boolean;
  iteracoes:     number;
}

// Implementação local para evitar dependência circular com stat-utils.
function gammaln(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < c.length; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gammaSeries(a: number, x: number): number {
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

function gammaCf(a: number, x: number): number {
  const fpmin = 1e-300;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / (Math.abs(b) < fpmin ? fpmin : b);
  let h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

function chiSquarePValue(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0) return 1;
  const a = df / 2;
  const x = chi2 / 2;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaCf(a, x);
}

function weightedAuc(probabilities: number[], events: number[], totals: number[]): number {
  const rows = probabilities.map((probability, index) => ({
    probability,
    positive: events[index],
    negative: totals[index] - events[index],
  })).sort((a, b) => a.probability - b.probability);
  const totalPositive = rows.reduce((sum, row) => sum + row.positive, 0);
  const totalNegative = rows.reduce((sum, row) => sum + row.negative, 0);
  if (totalPositive <= 0 || totalNegative <= 0) return NaN;

  let concordant = 0;
  let negativesBelow = 0;
  for (let i = 0; i < rows.length;) {
    let j = i;
    let tiedPositive = 0;
    let tiedNegative = 0;
    while (j < rows.length && Math.abs(rows[j].probability - rows[i].probability) < 1e-12) {
      tiedPositive += rows[j].positive;
      tiedNegative += rows[j].negative;
      j++;
    }
    concordant += tiedPositive * (negativesBelow + 0.5 * tiedNegative);
    negativesBelow += tiedNegative;
    i = j;
  }
  return concordant / (totalPositive * totalNegative);
}

function hosmerLemeshow(
  probabilities: number[],
  events: number[],
  totals: number[],
  groups = 10,
): { chi2: number; df: number; pValue: number } {
  const rows = probabilities.map((probability, index) => ({
    probability,
    events: events[index],
    total: totals[index],
  })).sort((a, b) => a.probability - b.probability);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (total <= 0) return { chi2: NaN, df: 0, pValue: NaN };

  const bins = Array.from({ length: groups }, () => ({ observed: 0, expected: 0, total: 0 }));
  let cumulative = 0;
  for (const row of rows) {
    const midpoint = cumulative + row.total / 2;
    const index = Math.min(groups - 1, Math.floor((midpoint / total) * groups));
    bins[index].observed += row.events;
    bins[index].expected += row.probability * row.total;
    bins[index].total += row.total;
    cumulative += row.total;
  }

  const populated = bins.filter((bin) => bin.total > 0);
  const chi2 = populated.reduce((sum, bin) => {
    const variance = bin.expected * (1 - bin.expected / bin.total);
    return variance > 0 ? sum + Math.pow(bin.observed - bin.expected, 2) / variance : sum;
  }, 0);
  const df = Math.max(0, populated.length - 2);
  if (df === 0) return { chi2: NaN, df: 0, pValue: NaN };
  return { chi2, df, pValue: chiSquarePValue(chi2, df) };
}

// ── IRLS principal ────────────────────────────────────────────────────────────

/**
 * Ajusta modelo logístico via IRLS com dados agrupados (binomial grouped).
 *
 * @param X      Matriz de design n×p (1ª coluna = intercepto)
 * @param y      Número de eventos por padrão de covariáveis
 * @param w      Total de casos por padrão (pesos binomiais)
 * @param nomes  Nomes das colunas de X (incluindo "(Intercepto)")
 */
export function fitLogistic(
  X: number[][],
  y: number[],
  w: number[],
  nomes: string[],
): RegressaoResult {
  const nPat = X.length;
  const p    = X[0].length;

  // Grouped binomial rows contain repeated observations. A full-rank saturated
  // design (e.g. two groups for one binary predictor + intercept) is estimable.
  if (nPat < p) {
    throw new Error(
      `Padrões de covariáveis insuficientes (${nPat}) para estimar ${p} parâmetros. ` +
      `Reduza o número de preditores ou amplie os filtros.`,
    );
  }

  const totalN      = w.reduce((s, v) => s + v, 0);
  const totalEvents = y.reduce((s, v) => s + v, 0);
  const pBar        = totalEvents / totalN;

  // Deviance do modelo nulo (só intercepto)
  const logLNull =
    totalEvents * Math.log(Math.max(pBar, 1e-12)) +
    (totalN - totalEvents) * Math.log(Math.max(1 - pBar, 1e-12));
  const devianceNull = -2 * logLNull;

  // Inicializa beta = 0
  let beta      = new Array(p).fill(0);
  let converged = false;
  let iteracoes = 0;

  for (let iter = 0; iter < 150; iter++) {
    iteracoes = iter + 1;

    const eta = X.map((row) => dot(row, beta));
    const mu  = eta.map(sigmoid);

    // Pesos de trabalho W_i = n_i · μ_i · (1 − μ_i)
    const W = mu.map((m, i) => Math.max(w[i] * m * (1 - m), 1e-10));

    // Resposta de trabalho z_i = η_i + (y_i/n_i − μ_i) / (μ_i·(1−μ_i))
    const z = eta.map((e, i) => {
      const denom = Math.max(mu[i] * (1 - mu[i]), 1e-10);
      return e + (y[i] / w[i] - mu[i]) / denom;
    });

    // X'WX  e  X'Wz
    const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    const XtWz: number[]   = new Array(p).fill(0);
    for (let i = 0; i < nPat; i++) {
      for (let j = 0; j < p; j++) {
        XtWz[j] += W[i] * X[i][j] * z[i];
        for (let k = 0; k < p; k++) {
          XtWX[j][k] += W[i] * X[i][j] * X[i][k];
        }
      }
    }

    let betaNew: number[];
    try {
      const inv = matInverse(XtWX);
      betaNew = inv.map((row) => dot(row, XtWz));
    } catch {
      break; // Matriz singular — para iteração
    }

    const maxChange = betaNew.reduce((m, v, i) => Math.max(m, Math.abs(v - beta[i])), 0);
    beta = betaNew;
    if (maxChange < 1e-8) { converged = true; break; }
  }

  // ── Estatísticas finais ───────────────────────────────────────────────────
  const muFinal = X.map((row) => sigmoid(dot(row, beta)));

  const logL = muFinal.reduce((s, m, i) => {
    return (
      s +
      y[i]         * Math.log(Math.max(m,       1e-12)) +
      (w[i] - y[i]) * Math.log(Math.max(1 - m,  1e-12))
    );
  }, 0);

  const deviance    = -2 * logL;
  const r2McFadden  = devianceNull > 0 ? 1 - deviance / devianceNull : 0;
  const aic         = deviance + 2 * p;
  const omnibusChi2 = Math.max(0, devianceNull - deviance);
  const omnibusDf = Math.max(1, p - 1);
  const omnibusPValue = chiSquarePValue(omnibusChi2, omnibusDf);
  const auc = weightedAuc(muFinal, y, w);
  const hl = hosmerLemeshow(muFinal, y, w);

  // Matriz de variância-covariância = (X'WX)⁻¹
  const W_f: number[]       = muFinal.map((m, i) => Math.max(w[i] * m * (1 - m), 1e-10));
  const XtWX_f: number[][]  = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < nPat; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        XtWX_f[j][k] += W_f[i] * X[i][j] * X[i][k];
      }
    }
  }

  let se: number[];
  try {
    const V = matInverse(XtWX_f);
    se = V.map((_, i) => Math.sqrt(Math.max(V[i][i], 0)));
  } catch {
    se = new Array(p).fill(NaN);
  }

  const coeficientes: CoefResult[] = beta.map((b, i) => {
    const s   = se[i];
    const zSt = isNaN(s) || s < 1e-12 ? NaN : b / s;
    return {
      nome:        nomes[i],
      beta:        b,
      se:          s,
      aOR:         Math.exp(b),
      ci95Low:     Math.exp(b - 1.96 * s),
      ci95High:    Math.exp(b + 1.96 * s),
      z:           zSt,
      pValue:      isNaN(zSt) ? NaN : zPValue(zSt),
      isIntercept: i === 0,
    };
  });

  return {
    coeficientes,
    n:            totalN,
    events:       totalEvents,
    taxaEventos:  pBar,
    devianceNull,
    deviance,
    r2McFadden,
    aic,
    omnibusChi2,
    omnibusDf,
    omnibusPValue,
    auc,
    hosmerLemeshowChi2: hl.chi2,
    hosmerLemeshowDf: hl.df,
    hosmerLemeshowPValue: hl.pValue,
    converged,
    iteracoes,
  };
}
