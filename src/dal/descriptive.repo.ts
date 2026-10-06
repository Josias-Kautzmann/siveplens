import { and, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { buildFilterConditions } from "@/dal/filter-builder";
import { buildAnalysisManifest, normalizeAnalysisFilters } from "@/dal/analysis-manifest";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import { FAIXA_CASE } from "@/lib/faixa-etaria";
import {
  CATEGORICAL_VARIABLES,
  DESCRIPTIVE_VARIABLES,
  type AnalysisManifest,
  type CategoricalAnalysisManifest,
  type CategoricalResult,
  type CategoricalSummary,
  type CategoricalVariable,
  type CategoryFrequency,
  type DescriptiveResult,
  type DescriptiveVariable,
  type HistogramBin,
  type NumericSummary,
} from "@/lib/descriptive-catalog";

export {
  CATEGORICAL_VARIABLES,
  DESCRIPTIVE_VARIABLES,
} from "@/lib/descriptive-catalog";
export type {
  AnalysisManifest,
  CategoricalAnalysisManifest,
  CategoricalResult,
  CategoricalSummary,
  CategoricalVariable,
  CategoryFrequency,
  DescriptiveResult,
  DescriptiveVariable,
  HistogramBin,
  NumericSummary,
} from "@/lib/descriptive-catalog";

export const DESCRIPTIVE_ANALYSIS_VERSION = "1.3.0";
export const DEFAULT_MIN_DESCRIPTIVE_COHORT_SIZE = 10;

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function minimumCohortSize(): number {
  const configured = Number(process.env.MIN_DESCRIPTIVE_COHORT_SIZE);
  return Number.isInteger(configured) && configured >= 2
    ? configured
    : DEFAULT_MIN_DESCRIPTIVE_COHORT_SIZE;
}

function categoricalValueExpression(variable: CategoricalVariable): SQL<unknown> {
  switch (variable) {
    case "cs_sexo": return sql`NULLIF(BTRIM(cs_sexo), '')`;
    case "faixa_etaria": return sql.raw(`(${FAIXA_CASE})`);
    case "classi_fin": return sql`classi_fin::text`;
    case "evolucao": return sql`evolucao::text`;
    case "sg_uf": return sql`NULLIF(BTRIM(sg_uf), '')`;
    case "hospital": return sql`hospital::text`;
    case "uti": return sql`uti::text`;
    case "diabetes": return sql`diabetes::text`;
  }
}

/**
 * Resume uma variável numérica com denominadores e proveniência explícitos.
 * A primeira versão oferece idade; novas variáveis devem ser adicionadas à
 * allowlist DESCRIPTIVE_VARIABLES e receber uma expressão SQL revisada.
 */
export async function getNumericSummary(
  variable: DescriptiveVariable,
  filters: FiltrosSRAG = {},
): Promise<DescriptiveResult> {
  if (!(variable in DESCRIPTIVE_VARIABLES)) {
    throw new Error(`Variável descritiva não suportada: ${variable}`);
  }

  const normalized = normalizeAnalysisFilters(filters);
  const conditions = buildFilterConditions(normalized);
  const whereSql = conditions.length ? and(...conditions) : sql`TRUE`;

  // Idades informadas em dias/meses são mantidas como fração de ano. Valores
  // impossíveis ficam ausentes para que o denominador permaneça auditável.
  const [row] = await db.execute(sql`
    WITH filtered_population AS (
      SELECT
        dt_notific,
        CASE
          WHEN tp_idade = 1 AND nu_idade_n BETWEEN 0 AND 366
            THEN nu_idade_n::double precision / 365.25
          WHEN tp_idade = 2 AND nu_idade_n BETWEEN 0 AND 11
            THEN nu_idade_n::double precision / 12.0
          WHEN tp_idade = 3 AND nu_idade_n BETWEEN 0 AND 130
            THEN nu_idade_n::double precision
          ELSE NULL
        END AS value
      FROM fato_caso_srag
      WHERE ${whereSql}
    )
    SELECT
      COUNT(*)::int AS population_n,
      COUNT(value)::int AS valid_n,
      (COUNT(*) - COUNT(value))::int AS missing_n,
      AVG(value)::double precision AS mean,
      STDDEV_SAMP(value)::double precision AS std_dev,
      (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value))::double precision AS median,
      (PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value))::double precision AS q1,
      (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value))::double precision AS q3,
      MIN(value)::double precision AS min,
      MAX(value)::double precision AS max,
      MAX(dt_notific)::text AS latest_notification_date
    FROM filtered_population
  `) as unknown as Array<Record<string, unknown>>;

  const populationN = Number(row?.population_n ?? 0);
  const validN = Number(row?.valid_n ?? 0);
  const missingN = Number(row?.missing_n ?? 0);
  const minimumPopulationN = minimumCohortSize();
  const suppressed = populationN > 0 && populationN < minimumPopulationN;
  const summary: NumericSummary = {
    suppressed,
    minimumPopulationN,
    populationN: suppressed ? null : populationN,
    validN: suppressed ? null : validN,
    missingN: suppressed ? null : missingN,
    missingPct: suppressed ? null : populationN > 0 ? (missingN / populationN) * 100 : 0,
    mean: suppressed ? null : asNullableNumber(row?.mean),
    stdDev: suppressed ? null : asNullableNumber(row?.std_dev),
    median: suppressed ? null : asNullableNumber(row?.median),
    q1: suppressed ? null : asNullableNumber(row?.q1),
    q3: suppressed ? null : asNullableNumber(row?.q3),
    min: suppressed ? null : asNullableNumber(row?.min),
    max: suppressed ? null : asNullableNumber(row?.max),
  };

  const histogramRows = suppressed || validN === 0
    ? []
    : await db.execute(sql`
        WITH filtered_population AS (
          SELECT
            CASE
              WHEN tp_idade = 1 AND nu_idade_n BETWEEN 0 AND 366
                THEN nu_idade_n::double precision / 365.25
              WHEN tp_idade = 2 AND nu_idade_n BETWEEN 0 AND 11
                THEN nu_idade_n::double precision / 12.0
              WHEN tp_idade = 3 AND nu_idade_n BETWEEN 0 AND 130
                THEN nu_idade_n::double precision
              ELSE NULL
            END AS value
          FROM fato_caso_srag
          WHERE ${whereSql}
        )
        SELECT
          LEAST(FLOOR(value / 10.0) * 10, 120)::int AS lower_bound,
          COUNT(*)::int AS n
        FROM filtered_population
        WHERE value IS NOT NULL
        GROUP BY lower_bound
        ORDER BY lower_bound
      `) as unknown as Array<Record<string, unknown>>;

  const histogram: HistogramBin[] = histogramRows.map((bin) => {
    const lower = Number(bin.lower_bound);
    const count = Number(bin.n);
    const upper = lower === 120 ? 130 : lower + 9;
    return {
      lower,
      upper,
      label: `${lower}–${upper}`,
      count,
      pctValid: validN > 0 ? (count / validN) * 100 : 0,
    };
  });

  const variableInfo = DESCRIPTIVE_VARIABLES[variable];
  const manifest = await buildAnalysisManifest({
    analysisType: "descriptive-numeric",
    analysisVersion: DESCRIPTIVE_ANALYSIS_VERSION,
    filters: normalized,
    latestNotificationDate: (row?.latest_notification_date as string | null) ?? null,
    cohort: {
      populationN: suppressed ? null : populationN,
      effectiveN: suppressed ? null : validN,
      excludedN: suppressed ? null : missingN,
    },
    disclosureControl: {
      minimumPopulationN,
      suppressed,
      rule: "suppress-small-cohorts",
      warnings: [],
    },
    configuration: { variable },
    metrics: ["mean", "std_dev", "median", "q1", "q3", "min", "max"],
    extra: {
      variable: { id: variable, ...variableInfo },
      missingData: {
        strategy: "available-case" as const,
        populationN: suppressed ? null : populationN,
        validN: suppressed ? null : validN,
        missingN: suppressed ? null : missingN,
      },
    },
  }) as AnalysisManifest;

  return { summary, histogram, manifest };
}

/**
 * Produz frequências categóricas com denominadores explícitos. A variável é
 * escolhida por allowlist e nunca interpolada a partir de SQL recebido pela API.
 */
export async function getCategoricalSummary(
  variable: CategoricalVariable,
  filters: FiltrosSRAG = {},
): Promise<CategoricalResult> {
  if (!(variable in CATEGORICAL_VARIABLES)) {
    throw new Error(`Variável categórica não suportada: ${variable}`);
  }

  const normalized = normalizeAnalysisFilters(filters);
  const conditions = buildFilterConditions(normalized);
  const whereSql = conditions.length ? and(...conditions) : sql`TRUE`;
  const valueExpression = categoricalValueExpression(variable);

  const [totalsRow] = await db.execute(sql`
    SELECT
      COUNT(*)::int AS population_n,
      COUNT(${valueExpression})::int AS valid_n,
      (COUNT(*) - COUNT(${valueExpression}))::int AS missing_n,
      MAX(dt_notific)::text AS latest_notification_date
    FROM fato_caso_srag
    WHERE ${whereSql}
  `) as unknown as Array<Record<string, unknown>>;

  const populationN = Number(totalsRow?.population_n ?? 0);
  const validN = Number(totalsRow?.valid_n ?? 0);
  const missingN = Number(totalsRow?.missing_n ?? 0);
  const minimumPopulationN = minimumCohortSize();
  const suppressed = populationN > 0 && populationN < minimumPopulationN;

  const frequencyRows = suppressed || validN === 0
    ? []
    : await db.execute(sql`
        SELECT
          (${valueExpression})::text AS value,
          COUNT(*)::int AS n
        FROM fato_caso_srag
        WHERE ${whereSql} AND ${valueExpression} IS NOT NULL
        GROUP BY ${valueExpression}
        ORDER BY n DESC
      `) as unknown as Array<Record<string, unknown>>;

  const info = CATEGORICAL_VARIABLES[variable];
  const labels = info.labels as Readonly<Record<string, string>>;
  const order = info.order as readonly string[];
  const categories: CategoryFrequency[] = frequencyRows
    .map((row) => {
      const value = String(row.value);
      const count = Number(row.n);
      return {
        value,
        label: labels[value] ?? (variable === "sg_uf" ? value : `Código ${value}`),
        count,
        pctValid: validN > 0 ? (count / validN) * 100 : 0,
        pctPopulation: populationN > 0 ? (count / populationN) * 100 : 0,
      };
    })
    .sort((a, b) => {
      if (order.length === 0) return b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
      const aIndex = order.indexOf(a.value);
      const bIndex = order.indexOf(b.value);
      return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
    });

  const summary: CategoricalSummary = {
    suppressed,
    minimumPopulationN,
    populationN: suppressed ? null : populationN,
    validN: suppressed ? null : validN,
    missingN: suppressed ? null : missingN,
    missingPct: suppressed ? null : populationN > 0 ? (missingN / populationN) * 100 : 0,
    categories: suppressed ? [] : categories,
  };

  const manifest = await buildAnalysisManifest({
    analysisType: "descriptive-categorical",
    analysisVersion: DESCRIPTIVE_ANALYSIS_VERSION,
    filters: normalized,
    latestNotificationDate: (totalsRow?.latest_notification_date as string | null) ?? null,
    cohort: {
      populationN: suppressed ? null : populationN,
      effectiveN: suppressed ? null : validN,
      excludedN: suppressed ? null : missingN,
    },
    disclosureControl: {
      minimumPopulationN,
      suppressed,
      rule: "suppress-small-cohorts",
      warnings: [],
    },
    configuration: { variable },
    metrics: ["count", "pct_valid", "pct_population"],
    extra: {
      variable: { id: variable, label: info.label, definition: info.definition },
      missingData: {
        strategy: "available-case" as const,
        populationN: suppressed ? null : populationN,
        validN: suppressed ? null : validN,
        missingN: suppressed ? null : missingN,
      },
    },
  }) as CategoricalAnalysisManifest;

  return { summary, manifest };
}
