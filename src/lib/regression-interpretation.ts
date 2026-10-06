import type { CoefResult } from "./logistic-regression";
import type { AnalysisManifestBase } from "./analysis-manifest";

export interface LinhaResultado extends CoefResult {
  isReferencia?: boolean;
}

export interface RegressaoResponse {
  coeficientes: LinhaResultado[];
  meta: {
    n:            number;   // casos no modelo (após exclusão por ausência)
    nRaw:         number;   // casos elegíveis antes da exclusão por preditores
    nExcluded:    number;   // nRaw - n
    events:       number;
    taxaEventos:  number;
    aic:          number;
    devianceNull: number;
    deviance:     number;
    r2McFadden:   number;
    omnibusChi2:  number;
    omnibusDf:    number;
    omnibusPValue: number;
    auc:           number;
    hosmerLemeshowChi2: number;
    hosmerLemeshowDf: number;
    hosmerLemeshowPValue: number;
    converged:    boolean;
    iteracoes:    number;
  };
  outcome:         { campo: string; label: string; eventLabel: string };
  incluirIgnorado: boolean;
  ausenteComoAusencia: boolean;
  refFaixa:        string;
  refSexo:         "M" | "F";
  avisos:          string[];
  manifest: AnalysisManifestBase;
}

function fmt2(n: number): string {
  if (!Number.isFinite(n) || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtP(p: number): string {
  if (!Number.isFinite(p) || isNaN(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return p.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function referenceSummary(rows: ReadonlyArray<{ nome: string; isReferencia?: boolean }>): string {
  const references = [...new Set(rows.filter((row) => row.isReferencia).map((row) => row.nome.replace(/\s*\(ref\.\)$/, "")))];
  return references.length ? `Categorias de referência: ${references.join("; ")}.` : "Categorias de referência não informadas neste resultado.";
}

export function buildInterpretacao(result: RegressaoResponse): { paragrafos: string[]; notaMetodos: string } {
  const { coeficientes, meta, outcome, incluirIgnorado, ausenteComoAusencia } = result;

  const references = referenceSummary(result.coeficientes);
  const invalid = result.coeficientes.some((c) => !c.isReferencia &&
    (![c.beta, c.se, c.aOR, c.ci95Low, c.ci95High, c.pValue].every(Number.isFinite) || Math.abs(c.beta) > 8 || c.se > 3));
  if (!meta.converged || invalid) {
    const reason = !meta.converged
      ? `O modelo não convergiu após ${meta.iteracoes} iterações.`
      : "O modelo contém estimativas instáveis ou indisponíveis.";
    return {
      paragrafos: [reason, "A interpretação automática das associações foi suspensa. Revise os avisos, a coorte e os preditores antes de interpretar os coeficientes.", references],
      notaMetodos: `Foi tentado um ajuste por regressão logística binária (IRLS) com ${meta.n.toLocaleString("pt-BR")} registros e ${meta.events.toLocaleString("pt-BR")} eventos. ${reason} Não foram extraídas conclusões de significância desse ajuste. ${references}`,
    };
  }
  const rows     = coeficientes.filter((l) => !l.isIntercept && !l.isReferencia);
  const sig      = rows.filter((l) => Number.isFinite(l.pValue) && l.pValue < 0.05);
  const risco    = sig.filter((l) => Number.isFinite(l.aOR) && l.aOR > 1).sort((a, b) => b.aOR - a.aOR);
  const protetor = sig.filter((l) => Number.isFinite(l.aOR) && l.aOR < 1).sort((a, b) => a.aOR - b.aOR);
  const naoSig   = rows.filter((l) => !Number.isFinite(l.pValue) || l.pValue >= 0.05);

  const pctEventos  = (meta.taxaEventos * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const r2Str       = fmt2(meta.r2McFadden);
  const aicStr      = meta.aic.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const nStr        = meta.n.toLocaleString("pt-BR");
  const evStr       = meta.events.toLocaleString("pt-BR");

  const fmtOR = (l: LinhaResultado) => {
    const p = fmtP(l.pValue);
    return `${l.nome} (aOR = ${fmt2(l.aOR)}, IC 95%: ${fmt2(l.ci95Low)}–${fmt2(l.ci95High)}, p ${p === "< 0,001" ? "< 0,001" : `= ${p}`})`;
  };

  const paragrafos: string[] = [];

  // § 1 — visão geral do modelo
  let p1 = `A regressão logística multivariada com desfecho "${outcome.label}" foi ajustada sobre ${nStr} casos (${evStr} eventos; taxa de ${pctEventos}%), convergindo em ${meta.iteracoes} iterações.`;
  p1 += ` O ajuste global foi R² de McFadden = ${r2Str} e AIC = ${aicStr}.`;
  if (meta.nExcluded > 0) {
    const pctExcl = ((meta.nExcluded / meta.nRaw) * 100).toFixed(1);
    p1 += ` Foram excluídos ${meta.nExcluded.toLocaleString("pt-BR")} registros (${pctExcl}%) por ausência de dados${incluirIgnorado || ausenteComoAusencia ? "" : " ou código Ignorado"}.`;
  }
  paragrafos.push(p1);

  // § 2 — fatores de risco
  if (risco.length > 0) {
    const lista = risco.map((l) => {
      const pct = Math.round((l.aOR - 1) * 100);
      return `${fmtOR(l)} — ${pct}% a mais nas odds do desfecho`;
    });
    paragrafos.push(
      `Preditores associados a maiores odds do desfecho, ajustados pelos demais preditores:\n• ${lista.join("\n• ")}.`
    );
  }

  // § 3 — fatores protetores
  if (protetor.length > 0) {
    const lista = protetor.map((l) => {
      const pct = Math.round((1 - l.aOR) * 100);
      return `${fmtOR(l)} — ${pct}% a menos nas odds do desfecho`;
    });
    paragrafos.push(
      `Preditores associados a menores odds do desfecho, ajustados pelos demais preditores:\n• ${lista.join("\n• ")}.`
    );
  }

  // § 4 — não significativos
  if (naoSig.length > 0 && sig.length > 0) {
    paragrafos.push(
      `Não apresentaram associação significativa (p ≥ 0,05): ${naoSig.map((l) => l.nome).join(", ")}.`
    );
  }

  if (sig.length === 0) {
    paragrafos.push("Nenhum preditor incluído apresentou associação estatisticamente significativa com o desfecho ao nível α = 0,05.");
  }

  paragrafos.push("Odds ratios descrevem associações; não são razões de probabilidades nem demonstram causalidade.");

  // Nota para seção de métodos
  const notaMetodos =
    `A associação entre os preditores e o desfecho "${outcome.label}" foi avaliada por regressão logística multivariada binária (algoritmo IRLS, máxima verossimilhança). ` +
    `Os resultados são expressos como Odds Ratios ajustados (aOR) com intervalos de confiança de 95% (método de Wald). ` +
    `A qualidade de ajuste foi avaliada pelo R² de McFadden (R² = ${r2Str}) e pelo Critério de Informação de Akaike (AIC = ${aicStr}). ` +
    (ausenteComoAusencia
      ? `Para reproduzir a dicotomização publicada, somente o código 1 foi tratado como presença; códigos 2, 9, NULL e demais valores foram tratados como ausência não registrada. `
      : incluirIgnorado
      ? `Registros com código 9 (Ignorado) foram incluídos como categoria separada (dummy 'Ignorado/ausente') nos preditores aplicáveis. `
      : `Registros com dados ausentes ou codificados como Ignorado (código 9) em qualquer preditor foram excluídos — Complete Case Analysis (N excluídos = ${meta.nExcluded.toLocaleString("pt-BR")}). `
    ) +
    `Análise realizada sobre dados SIVEP-Gripe / OpenDataSUS via SivepLens (N no modelo = ${nStr}; ${evStr} eventos). ${references}`;

  return { paragrafos, notaMetodos };
}
