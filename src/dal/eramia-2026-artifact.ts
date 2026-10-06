import { getScientificValidationSnapshot } from "@/dal/scientific-validation.repo";
import {
  ERAMIA_ARTICLE_METRICS,
  ERAMIA_ARTICLE_ROUTE,
  ERAMIA_ARTIFACT_VERSION,
  ERAMIA_FROZEN_PROVENANCE,
  type ArticleMetricDefinition,
  type ArticleMetricId,
} from "@/lib/eramia-2026";
import { PEDIATRIC_REGRESSION_BENCHMARKS } from "@/lib/scientific-validation";

function intervalsOverlap(aLow: number, aHigh: number, bLow: number, bHigh: number) {
  return Math.max(aLow, bLow) <= Math.min(aHigh, bHigh);
}

function formatCount(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatRatio(value: number, digits = 3) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function liveValue(id: ArticleMetricId, snapshot: Awaited<ReturnType<typeof getScientificValidationSnapshot>>) {
  if (id === "influenza-pcr") {
    const value = snapshot.influenza.pcrPositive;
    return { raw: value, display: formatCount(value), context: `${formatCount(snapshot.database.records2024)} notificações de 2024.` };
  }
  if (id === "influenza-fatality") {
    const value = snapshot.influenza.fatality;
    return { raw: value, display: formatPercent(value), context: `${formatCount(snapshot.influenza.deaths)} óbitos / ${formatCount(snapshot.influenza.cohort)} casos com evolução conhecida.` };
  }
  if (id === "infant-total") {
    const value = snapshot.pediatric.total;
    return { raw: value, display: formatCount(value), context: "Contagem corrente de idades registradas em dias ou meses." };
  }
  if (id === "pediatric-regression") {
    const compatible = PEDIATRIC_REGRESSION_BENCHMARKS.filter((published) => {
      const current = snapshot.inferential.pediatricMortalityRegression.coefficients[published.key];
      return intervalsOverlap(published.ci95Low, published.ci95High, current.ci95Low, current.ci95High);
    }).length;
    return { raw: compatible, display: `${compatible}/11`, context: `${formatCount(snapshot.inferential.pediatricMortalityRegression.n)} registros no modelo corrente.` };
  }
  if (id === "vaccination-icu-or") {
    const result = snapshot.inferential.vaccinationIcuMortality;
    return { raw: result.oddsRatio, display: formatRatio(result.oddsRatio), context: `IC 95% ${formatRatio(result.ci95Low)}–${formatRatio(result.ci95High)}; N=${formatCount(result.n)}.` };
  }
  if (id === "vaccination-regression") {
    const coefficients = snapshot.inferential.vaccinationMortalityRegression.coefficients;
    const raw = ["doses_1_2", "doses_3", "doses_4", "doses_5_6"].map((key) => coefficients[key].adjustedOddsRatio);
    return { raw, display: raw.map((value) => formatRatio(value)).join("; "), context: `N=${formatCount(snapshot.inferential.vaccinationMortalityRegression.n)}; ${formatCount(snapshot.inferential.vaccinationMortalityRegression.events)} óbitos.` };
  }
  throw new Error(`Indicador do artigo não implementado: ${id}`);
}

function driftStatus(definition: ArticleMetricDefinition, currentRaw: number | number[]) {
  const frozen = definition.frozenRaw;
  if (Array.isArray(frozen) && Array.isArray(currentRaw)) {
    const relative = frozen.map((value, index) => ((currentRaw[index] - value) / value) * 100);
    return {
      status: relative.every((value) => Math.abs(value) <= 1) ? "stable" : "changed",
      driftDisplay: relative.map((value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`).join("; "),
    } as const;
  }
  if (!Array.isArray(frozen) && !Array.isArray(currentRaw)) {
    const relative = frozen === 0 ? currentRaw - frozen : ((currentRaw - frozen) / frozen) * 100;
    return {
      status: Math.abs(relative) <= 1 ? "stable" : "changed",
      driftDisplay: `${relative > 0 ? "+" : ""}${relative.toFixed(2)}%`,
    } as const;
  }
  return { status: "changed", driftDisplay: "formato incompatível" } as const;
}

export async function getEramia2026ArticleArtifact() {
  const snapshot = await getScientificValidationSnapshot();
  const metrics = ERAMIA_ARTICLE_METRICS.map((definition) => {
    const current = liveValue(definition.id, snapshot);
    return { ...definition, current, ...driftStatus(definition, current.raw) };
  });

  return {
    schemaVersion: "1.2.0",
    artifactVersion: ERAMIA_ARTIFACT_VERSION,
    route: ERAMIA_ARTICLE_ROUTE,
    generatedAt: new Date().toISOString(),
    frozenAt: ERAMIA_FROZEN_PROVENANCE.frozenAt,
    frozenProvenance: ERAMIA_FROZEN_PROVENANCE,
    currentProvenance: {
      generatedAt: snapshot.generatedAt,
      records2024: snapshot.database.records2024,
      uniqueNotifications2024: snapshot.database.uniqueNotifications2024,
      minNotificationDate: snapshot.database.minNotificationDate,
      maxNotificationDate: snapshot.database.maxNotificationDate,
      latestLoadAt: snapshot.database.latestLoadAt,
      latestLoadSource: snapshot.database.latestLoadSource,
      sourceManifest: snapshot.database.sourceManifest,
    },
    metrics,
    interpretation: {
      frozen: "Valores efetivamente usados na Tabela 1 do rascunho da ERAMIA-RS 2026, preservados no artefato correspondente.",
      current: "Valores recalculados pelo SivepLens no snapshot implantado no momento da abertura desta página.",
      boundary: "O teste controlado avalia o núcleo estatístico sobre o arquivo externo; o recálculo corrente avalia a carga implantada. Nenhum deles valida causalidade, eficácia clínica ou a qualidade intrínseca do SIVEP-Gripe.",
    },
  };
}

export type Eramia2026ArticleArtifact = Awaited<ReturnType<typeof getEramia2026ArticleArtifact>>;
