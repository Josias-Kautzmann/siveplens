/**
 * Serviço de Detecção de Anomalias Temporais
 *
 * Usa Z-Score sobre a média móvel para detectar desvios estatísticos
 * e gerar alertas com explicabilidade (XAI).
 */

interface DataPoint {
  semanaEpi: number;
  anoEpi: number;
  total: number;
}

interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  media: number;
  desvioPadrao: number;
  valorAtual: number;
  explicacao: string;
  severidade: number; // 0.0 a 1.0
}

const DEFAULT_WINDOW = 4;    // Janela de 4 semanas para média móvel
const Z_THRESHOLD   = 2.0;  // Alertas quando Z-score > 2.0

/** Calcula a média móvel dos últimos `window` valores */
function movingAverage(data: number[], window: number): number {
  const slice = data.slice(-window);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

/** Calcula o desvio padrão de um array */
function stdDev(data: number[]): number {
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
  return Math.sqrt(variance);
}

/**
 * Analisa uma série temporal e detecta se o último ponto é anômalo.
 *
 * @param serie - Dados ordenados por semana epidemiológica
 * @param window - Tamanho da janela da média móvel (default: 4 semanas)
 * @param threshold - Limiar de Z-Score para considerar anomalia (default: 2.0)
 */
export function detectAnomaly(
  serie: DataPoint[],
  window = DEFAULT_WINDOW,
  threshold = Z_THRESHOLD,
): AnomalyResult {
  if (serie.length < window + 1) {
    return {
      isAnomaly: false,
      zScore: 0,
      media: 0,
      desvioPadrao: 0,
      valorAtual: serie.at(-1)?.total ?? 0,
      explicacao: "Dados insuficientes para análise (mínimo: " + (window + 1) + " semanas).",
      severidade: 0,
    };
  }

  const valores = serie.map((d) => d.total);
  const historico = valores.slice(0, -1); // Tudo menos o último ponto
  const valorAtual = valores.at(-1)!;

  const media = movingAverage(historico, window);
  const dp = stdDev(historico);

  // Z-Score: quantos desvios padrão o valor atual está acima da média
  const zScore = dp > 0 ? (valorAtual - media) / dp : 0;
  const isAnomaly = zScore > threshold;

  // Severidade normalizada (0-1), clampada
  const severidade = Math.min(1, Math.max(0, (zScore - threshold) / (threshold * 2)));

  // XAI: explicação legível por humanos
  let explicacao: string;
  if (!isAnomaly) {
    explicacao = `Valor atual (${valorAtual}) está dentro da faixa esperada (média: ${media.toFixed(1)}, DP: ${dp.toFixed(1)}).`;
  } else {
    explicacao = [
      `⚠️ ANOMALIA DETECTADA: O valor atual (${valorAtual} casos) está`,
      `${zScore.toFixed(1)} desvios padrão ACIMA da média móvel`,
      `das últimas ${window} semanas (${media.toFixed(1)} casos).`,
      dp > 0
        ? `O desvio padrão histórico é ${dp.toFixed(1)}, indicando que este pico é estatisticamente significativo.`
        : "",
    ].filter(Boolean).join(" ");
  }

  return { isAnomaly, zScore, media, desvioPadrao: dp, valorAtual, explicacao, severidade };
}

// ─────────────────────────────────────────────────────────────────────────────
// Análise da série completa — usada pelo Explorador de Anomalias (/analise/anomalias)
// Varre toda a série temporal e avalia cada semana contra a média móvel das
// `window` semanas anteriores (detecção causal: só usa o passado de cada ponto).
// ─────────────────────────────────────────────────────────────────────────────

export interface SerieDataPoint {
  anoEpi:    number;
  semanaEpi: number;
  valor:     number;
}

export interface PontoAnalise {
  anoEpi:       number;
  semanaEpi:    number;
  label:        string;   // ex: "S05/25"
  valor:        number;
  esperado:     number;   // média móvel das semanas anteriores (NaN se sem histórico)
  desvioPadrao: number;   // DP do histórico (NaN se sem histórico)
  limiteSup:    number;   // esperado + threshold·DP (NaN se sem histórico)
  zScore:       number;   // 0 se sem histórico
  isAnomaly:    boolean;  // pico: zScore > threshold
  severidade:   number;   // 0..1
  temHistorico: boolean;
  explicacao:   string;
}

function rotuloSemana(anoEpi: number, semanaEpi: number): string {
  return `S${String(semanaEpi).padStart(2, "0")}/${String(anoEpi).slice(-2)}`;
}

/**
 * Avalia cada ponto da série contra a média móvel das `window` semanas anteriores.
 * Sinaliza picos atípicos (z-score acima do limiar). Quedas não são marcadas como
 * anomalia pois, em vigilância, costumam refletir atraso de notificação.
 *
 * @param serie     série ordenada cronologicamente (ano, semana)
 * @param window    janela da média móvel (default 4 semanas)
 * @param threshold limiar de z-score para considerar pico (default 2.0)
 */
export function analisarSerieTemporal(
  serie: SerieDataPoint[],
  window = DEFAULT_WINDOW,
  threshold = Z_THRESHOLD,
): PontoAnalise[] {
  return serie.map((ponto, i) => {
    const label = rotuloSemana(ponto.anoEpi, ponto.semanaEpi);

    if (i < window) {
      return {
        anoEpi: ponto.anoEpi, semanaEpi: ponto.semanaEpi, label,
        valor: ponto.valor,
        esperado: NaN, desvioPadrao: NaN, limiteSup: NaN,
        zScore: 0, isAnomaly: false, severidade: 0, temHistorico: false,
        explicacao: `Sem histórico suficiente — são necessárias ${window} semanas anteriores.`,
      };
    }

    const historico = serie.slice(i - window, i).map((p) => p.valor);
    const esperado  = historico.reduce((s, v) => s + v, 0) / historico.length;
    const dp        = stdDev(historico);
    const zScore    = dp > 0 ? (ponto.valor - esperado) / dp : 0;
    const isAnomaly = zScore > threshold;
    const limiteSup = esperado + threshold * dp;
    const severidade = Math.min(1, Math.max(0, (zScore - threshold) / (threshold * 2)));

    const explicacao = isAnomaly
      ? `Pico atípico: ${ponto.valor.toLocaleString("pt-BR")} casos — ${zScore.toFixed(1)} desvios-padrão acima da média das ${window} semanas anteriores (esperado ≈ ${Math.round(esperado).toLocaleString("pt-BR")}, DP ${dp.toFixed(1)}).`
      : `Dentro do esperado (≈ ${Math.round(esperado).toLocaleString("pt-BR")} casos; z = ${zScore.toFixed(1)}).`;

    return {
      anoEpi: ponto.anoEpi, semanaEpi: ponto.semanaEpi, label,
      valor: ponto.valor,
      esperado, desvioPadrao: dp, limiteSup,
      zScore, isAnomaly, severidade, temHistorico: true,
      explicacao,
    };
  });
}
