import { db } from "@/db";
import { sql } from "drizzle-orm";
import { REQUIRED_VALIDATION_FIELDS } from "@/lib/scientific-validation";
import { fitLogistic, type RegressaoResult } from "@/lib/logistic-regression";
import { computeChiSquare, computeOR } from "@/lib/stat-utils";

type QueryRow = Record<string, unknown>;

function numberValue(row: QueryRow, key: string): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export interface ScientificValidationSnapshot {
  generatedAt: string;
  database: {
    records2024: number;
    uniqueNotifications2024: number;
    minNotificationDate: string | null;
    maxNotificationDate: string | null;
    latestLoadAt: string | null;
    latestLoadSource: string | null;
    sourceManifest: {
      fileName: string;
      publishedAt: string | null;
      sha256: string;
      normalizationVersion: string;
    } | null;
    requiredFieldsPresent: string[];
    requiredFieldsMissing: string[];
  };
  influenza: Record<string, number>;
  pediatric: Record<string, number>;
  vaccination: {
    cohort: number;
    deaths: number;
    survivors: number;
    fatality: number;
    mode: "exact" | "pcr_only";
  };
  inferential: {
    vaccinationIcuMortality: {
      n: number;
      icuDeaths: number;
      icuSurvivors: number;
      noIcuDeaths: number;
      noIcuSurvivors: number;
      oddsRatio: number;
      ci95Low: number;
      ci95High: number;
      chiSquare: number;
      pValue: number;
      recodedAsPublished: boolean;
    };
    pediatricMortalityRegression: {
      n: number;
      eligibleN: number;
      excludedN: number;
      events: number;
      converged: boolean;
      iterations: number;
      missingTreatment: "presence-versus-not-recorded";
      diagnostics: ModelDiagnostics;
      coefficients: Record<string, {
        adjustedOddsRatio: number;
        ci95Low: number;
        ci95High: number;
        pValue: number;
      }>;
      sensitivity: {
        policy: "clinical-unknown-category";
        diagnostics: ModelDiagnostics;
        coefficients: Record<string, {
          adjustedOddsRatio: number;
          ci95Low: number;
          ci95High: number;
          pValue: number;
        }>;
      };
    };
    vaccinationMortalityRegression: {
      n: number;
      events: number;
      diagnostics: ModelDiagnostics;
      doseDefinition: string;
      coefficients: Record<string, CoefficientSummary>;
    };
    influenzaIptw: {
      status: "approximate-protocol";
      n: number;
      events: number;
      exposed: number;
      weightedN: number;
      truncatedWeights: number;
      maxSmdBefore: number;
      maxSmdAfter: number;
      balancedAfterWeighting: number;
      totalBalanceCovariates: number;
      booster: CoefficientSummary;
      eValue: number;
      diagnostics: ModelDiagnostics;
      caveat: string;
    };
  };
}

interface CoefficientSummary {
  adjustedOddsRatio: number;
  ci95Low: number;
  ci95High: number;
  pValue: number;
}

interface ModelDiagnostics {
  interceptOdds: number;
  deviance: number;
  devianceNull: number;
  aic: number;
  omnibusChi2: number;
  omnibusDf: number;
  omnibusPValue: number;
  auc: number;
  hosmerLemeshowChi2: number;
  hosmerLemeshowDf: number;
  hosmerLemeshowPValue: number;
  converged: boolean;
  iterations: number;
}

const PEDIATRIC_REGRESSION_PREDICTORS = [
  ["pcr_para4", "Parainfluenza 4 por RT-PCR"],
  ["renal", "Doença renal crônica"],
  ["imunodepre", "Imunodeficiência"],
  ["sind_down", "Síndrome de Down"],
  ["cardiopati", "Cardiopatia crônica"],
  ["neurologic", "Doença neurológica"],
  ["saturacao", "Saturação de O₂ < 95%"],
  ["pcr_sars2", "SARS-CoV-2 por RT-PCR"],
  ["desc_resp", "Desconforto respiratório"],
  ["pcr_vsr", "VSR por RT-PCR"],
  ["tosse", "Tosse"],
] as const;

const PEDIATRIC_CLINICAL_FIELDS = [
  "renal", "imunodepre", "sind_down", "cardiopati",
  "neurologic", "saturacao", "desc_resp", "tosse",
] as const;

const VACCINATION_MODEL_PREDICTORS = [
  ["age", "Idade (por ano)"],
  ["male", "Sexo masculino"],
  ["education_elementary", "Escolaridade: fundamental"],
  ["education_middle", "Escolaridade: médio"],
  ["education_unknown", "Escolaridade: desconhecida"],
  ["icu", "Admissão em UTI"],
  ["invasive_ventilation", "Ventilação invasiva"],
  ["doses_1_2", "1–2 doses"],
  ["doses_3", "3 doses"],
  ["doses_4", "4 doses"],
  ["doses_5_6", "5–6 doses"],
] as const;

const INFLUENZA_BALANCE_FIELDS = [
  "age", "male", "fever", "cough", "sore_throat", "dyspnea",
  "respiratory_distress", "low_saturation", "diarrhea", "vomiting",
  "liver_disease", "asthma", "diabetes", "neurological_disease",
  "immunosuppression", "obesity",
] as const;

const INFLUENZA_OUTCOME_FIELDS = [
  ...INFLUENZA_BALANCE_FIELDS,
  "influenza_vaccine", "oseltamivir", "booster",
] as const;

function coefficientSummary(regression: RegressaoResult, index: number): CoefficientSummary {
  const coefficient = regression.coeficientes[index];
  return {
    adjustedOddsRatio: coefficient.aOR,
    ci95Low: coefficient.ci95Low,
    ci95High: coefficient.ci95High,
    pValue: coefficient.pValue,
  };
}

function modelDiagnostics(regression: RegressaoResult): ModelDiagnostics {
  return {
    interceptOdds: regression.coeficientes[0]?.aOR ?? NaN,
    deviance: regression.deviance,
    devianceNull: regression.devianceNull,
    aic: regression.aic,
    omnibusChi2: regression.omnibusChi2,
    omnibusDf: regression.omnibusDf,
    omnibusPValue: regression.omnibusPValue,
    auc: regression.auc,
    hosmerLemeshowChi2: regression.hosmerLemeshowChi2,
    hosmerLemeshowDf: regression.hosmerLemeshowDf,
    hosmerLemeshowPValue: regression.hosmerLemeshowPValue,
    converged: regression.converged,
    iterations: regression.iteracoes,
  };
}

function logisticProbability(x: number[], coefficients: number[]): number {
  const linear = x.reduce((sum, value, index) => sum + value * coefficients[index], 0);
  if (linear > 20) return 1 - 1e-9;
  if (linear < -20) return 1e-9;
  return 1 / (1 + Math.exp(-linear));
}

function eValueFromOddsRatio(oddsRatio: number): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 0) return NaN;
  const riskScale = oddsRatio < 1 ? 1 / oddsRatio : oddsRatio;
  return riskScale + Math.sqrt(riskScale * (riskScale - 1));
}

function standardizedMeanDifference(
  rows: QueryRow[],
  field: string,
  weight: (row: QueryRow) => number,
): number {
  const moments = (exposure: number) => {
    let totalWeight = 0;
    let weightedSum = 0;
    let weightedSquareSum = 0;
    for (const row of rows) {
      if (numberValue(row, "booster") !== exposure) continue;
      const observationWeight = numberValue(row, "n") * weight(row);
      const value = numberValue(row, field);
      totalWeight += observationWeight;
      weightedSum += observationWeight * value;
      weightedSquareSum += observationWeight * value * value;
    }
    const mean = totalWeight ? weightedSum / totalWeight : 0;
    const variance = totalWeight ? Math.max(0, weightedSquareSum / totalWeight - mean * mean) : 0;
    return { mean, variance };
  };
  const treated = moments(1);
  const control = moments(0);
  const pooledSd = Math.sqrt((treated.variance + control.variance) / 2);
  return pooledSd > 0 ? (treated.mean - control.mean) / pooledSd : 0;
}

export async function getScientificValidationSnapshot(): Promise<ScientificValidationSnapshot> {
  const columnRows = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fato_caso_srag'
  `)) as unknown as QueryRow[];
  const presentColumns = new Set(columnRows.map((row) => String(row.column_name)));
  const requiredFieldsPresent = REQUIRED_VALIDATION_FIELDS.filter((field) => presentColumns.has(field));
  const requiredFieldsMissing = REQUIRED_VALIDATION_FIELDS.filter((field) => !presentColumns.has(field));

  const [row] = (await db.execute(sql`
    WITH enriched AS (
      SELECT *,
        (CASE WHEN pos_pcrflu = 1 AND tp_flu_pcr IN (1, 2) THEN 1 ELSE 0 END
        + CASE WHEN pcr_vsr = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_adeno = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_metap = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_rino = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_sars2 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_boca = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para1 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para2 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para3 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para4 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_outro = 1 THEN 1 ELSE 0 END) AS viral_detection_count
      FROM fato_caso_srag
      WHERE ano_epi = 2024
    )
    SELECT
      COUNT(*) AS records_2024,
      COUNT(DISTINCT nu_notific) AS unique_notifications_2024,
      MIN(dt_notific) AS min_notification_date,
      MAX(dt_notific) AS max_notification_date,

      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1) AS flu_pcr,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1, 2)) AS flu_cohort,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao = 2) AS flu_deaths,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao = 1) AS flu_survivors,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1, 2) AND tp_flu_pcr = 1) AS flu_a,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1, 2) AND tp_flu_pcr = 2) AS flu_b,

      COUNT(*) FILTER (WHERE tp_idade IN (1, 2)) AS infant_total,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND evolucao IN (1, 2)) AS infant_known_outcome,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin = 1) AS infant_influenza,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin = 2) AS infant_other_virus,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin = 3) AS infant_other_agent,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin = 4) AS infant_unspecified,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin = 5) AS infant_covid,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND classi_fin IS NULL) AS infant_blank,
      COUNT(*) FILTER (WHERE tp_idade IN (1, 2) AND sem_not = 17) AS infant_week_17,
      COUNT(*) FILTER (
        WHERE tp_idade IN (1, 2)
          AND (pos_pcrflu = 1 OR pcr_vsr = 1 OR pcr_adeno = 1 OR pcr_metap = 1
            OR pcr_rino = 1 OR pcr_sars2 = 1 OR pcr_boca = 1
            OR pcr_para1 = 1 OR pcr_para2 = 1 OR pcr_para3 = 1
            OR pcr_para4 = 1 OR pcr_outro = 1)
      ) AS infant_known_virus,
      COUNT(*) FILTER (
        WHERE tp_idade IN (1, 2) AND evolucao IN (1, 2)
          AND viral_detection_count > 0
      ) AS infant_virus_patients_known_outcome,
      COALESCE(SUM(viral_detection_count) FILTER (
        WHERE tp_idade IN (1, 2) AND evolucao IN (1, 2)
      ), 0) AS infant_virus_detections_known_outcome,
      COUNT(*) FILTER (
        WHERE tp_idade IN (1, 2) AND evolucao IN (1, 2)
          AND viral_detection_count > 1
      ) AS infant_coinfected_known_outcome,

      COUNT(*) FILTER (
        WHERE tp_idade = 3 AND nu_idade_n >= 60 AND imunodepre = 1
          AND hospital = 1 AND nosocomial = 2 AND dt_interna IS NOT NULL
          AND classi_fin = 5 AND pcr_sars2 = 1 AND evolucao IN (1, 2)
          AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
      ) AS vaccine_pcr_cohort,
      COUNT(*) FILTER (
        WHERE tp_idade = 3 AND nu_idade_n >= 60 AND imunodepre = 1
          AND hospital = 1 AND nosocomial = 2 AND dt_interna IS NOT NULL
          AND classi_fin = 5 AND pcr_sars2 = 1 AND evolucao = 2
          AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
      ) AS vaccine_pcr_deaths,
      COUNT(*) FILTER (
        WHERE tp_idade = 3 AND nu_idade_n >= 60 AND imunodepre = 1
          AND hospital = 1 AND nosocomial = 2 AND dt_interna IS NOT NULL
          AND classi_fin = 5 AND pcr_sars2 = 1 AND evolucao = 1
          AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
      ) AS vaccine_pcr_survivors
    FROM enriched
  `)) as unknown as QueryRow[];

  let vaccination: Omit<ScientificValidationSnapshot["vaccination"], "fatality"> = {
    cohort: numberValue(row, "vaccine_pcr_cohort"),
    deaths: numberValue(row, "vaccine_pcr_deaths"),
    survivors: numberValue(row, "vaccine_pcr_survivors"),
    mode: "pcr_only",
  };

  if (presentColumns.has("an_sars2")) {
    const [coverage] = (await db.execute(sql.raw(`
      SELECT COUNT(an_sars2) AS populated FROM fato_caso_srag WHERE ano_epi = 2024
    `))) as unknown as QueryRow[];
    if (numberValue(coverage, "populated") > 0) {
      const [exact] = (await db.execute(sql.raw(`
        SELECT
          COUNT(*) AS cohort,
          COUNT(*) FILTER (WHERE evolucao = 2) AS deaths,
          COUNT(*) FILTER (WHERE evolucao = 1) AS survivors
        FROM fato_caso_srag
        WHERE ano_epi = 2024
          AND tp_idade = 3 AND nu_idade_n >= 60 AND imunodepre = 1
          AND hospital = 1 AND nosocomial = 2 AND dt_interna IS NOT NULL
          AND classi_fin = 5 AND (pcr_sars2 = 1 OR an_sars2 = 1)
          AND evolucao IN (1, 2)
          AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
      `))) as unknown as QueryRow[];
      vaccination = {
        cohort: numberValue(exact, "cohort"),
        deaths: numberValue(exact, "deaths"),
        survivors: numberValue(exact, "survivors"),
        mode: "exact",
      };
    }
  }

  const [latestLoad] = (await db.execute(sql`
    SELECT fonte, concluido_em
    FROM controle_carga
    WHERE status = 'sucesso'
    ORDER BY concluido_em DESC NULLS LAST
    LIMIT 1
  `)) as unknown as QueryRow[];

  const [manifestTable] = (await db.execute(sql`
    SELECT to_regclass('public.manifesto_fonte')::text AS table_name
  `)) as unknown as QueryRow[];
  let sourceManifest: ScientificValidationSnapshot["database"]["sourceManifest"] = null;
  if (manifestTable?.table_name) {
    const [manifest] = (await db.execute(sql.raw(`
      SELECT arquivo_nome, publicado_em, sha256, normalizacao_versao
      FROM manifesto_fonte
      WHERE ano_epi = 2024
      ORDER BY carregado_em DESC
      LIMIT 1
    `))) as unknown as QueryRow[];
    if (manifest) {
      sourceManifest = {
        fileName: String(manifest.arquivo_nome),
        publishedAt: nullableString(manifest.publicado_em),
        sha256: String(manifest.sha256).trim(),
        normalizationVersion: String(manifest.normalizacao_versao),
      };
    }
  }

  // O script R dos autores recodifica UTI 9/NULL como "não", ventilação 3/9/NULL
  // como "não invasiva" e conta somente doses que possuem data registrada.
  const vaccinationRows = (await db.execute(sql`
    WITH cohort AS (
      SELECT
        nu_idade_n::double precision AS age,
        CASE WHEN cs_sexo = 'M' THEN 1 ELSE 0 END AS male,
        CASE
          WHEN cs_escol_n IN (0, 1) THEN 'elementary'
          WHEN cs_escol_n = 2 THEN 'middle'
          WHEN cs_escol_n IN (3, 4) THEN 'high'
          ELSE 'unknown'
        END AS education,
        CASE WHEN uti = 1 THEN 1 ELSE 0 END AS icu,
        CASE WHEN suport_ven = 1 THEN 1 ELSE 0 END AS invasive_ventilation,
        ((NULLIF(BTRIM(COALESCE(dose_1_cov, '')), '') IS NOT NULL)::int
          + (NULLIF(BTRIM(COALESCE(dose_2_cov, '')), '') IS NOT NULL)::int
          + (NULLIF(BTRIM(COALESCE(dose_adic, '')), '') IS NOT NULL)::int
          + (NULLIF(BTRIM(COALESCE(dose_ref, '')), '') IS NOT NULL)::int
          + (NULLIF(BTRIM(COALESCE(dose_2ref, '')), '') IS NOT NULL)::int
          + (NULLIF(BTRIM(COALESCE(dos_re_bi, '')), '') IS NOT NULL)::int) AS doses,
        evolucao
      FROM fato_caso_srag
      WHERE ano_epi = 2024
        AND tp_idade = 3 AND nu_idade_n >= 60 AND imunodepre = 1
        AND hospital = 1 AND nosocomial = 2 AND dt_interna IS NOT NULL
        AND classi_fin = 5 AND (pcr_sars2 = 1 OR an_sars2 = 1)
        AND evolucao IN (1, 2) AND cs_sexo IN ('M', 'F')
        AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
    )
    SELECT age, male, education, icu, invasive_ventilation,
      CASE WHEN doses = 0 THEN '0' WHEN doses <= 2 THEN '1-2'
        WHEN doses = 3 THEN '3' WHEN doses = 4 THEN '4' ELSE '5-6' END AS dose_group,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE evolucao = 2)::int AS events
    FROM cohort
    GROUP BY 1, 2, 3, 4, 5, 6
  `)) as unknown as QueryRow[];

  const vaccinationCell = (icu: number, event: boolean) => vaccinationRows.reduce((sum, item) => {
    if (numberValue(item, "icu") !== icu) return sum;
    const events = numberValue(item, "events");
    return sum + (event ? events : numberValue(item, "n") - events);
  }, 0);
  const icuDeaths = vaccinationCell(1, true);
  const icuSurvivors = vaccinationCell(1, false);
  const noIcuDeaths = vaccinationCell(0, true);
  const noIcuSurvivors = vaccinationCell(0, false);
  const associationOR = computeOR(icuDeaths, icuSurvivors, noIcuDeaths, noIcuSurvivors);
  const associationChiSquare = computeChiSquare([
    [icuDeaths, icuSurvivors],
    [noIcuDeaths, noIcuSurvivors],
  ]);

  const regressionRows = (await db.execute(sql`
    SELECT
      CASE WHEN pcr_para4 = 1 THEN 1 ELSE 0 END AS pcr_para4,
      CASE WHEN renal = 1 THEN 1 WHEN renal = 2 THEN 2 ELSE 9 END AS renal,
      CASE WHEN imunodepre = 1 THEN 1 WHEN imunodepre = 2 THEN 2 ELSE 9 END AS imunodepre,
      CASE WHEN sind_down = 1 THEN 1 WHEN sind_down = 2 THEN 2 ELSE 9 END AS sind_down,
      CASE WHEN cardiopati = 1 THEN 1 WHEN cardiopati = 2 THEN 2 ELSE 9 END AS cardiopati,
      CASE WHEN neurologic = 1 THEN 1 WHEN neurologic = 2 THEN 2 ELSE 9 END AS neurologic,
      CASE WHEN saturacao = 1 THEN 1 WHEN saturacao = 2 THEN 2 ELSE 9 END AS saturacao,
      CASE WHEN pcr_sars2 = 1 THEN 1 ELSE 0 END AS pcr_sars2,
      CASE WHEN desc_resp = 1 THEN 1 WHEN desc_resp = 2 THEN 2 ELSE 9 END AS desc_resp,
      CASE WHEN pcr_vsr = 1 THEN 1 ELSE 0 END AS pcr_vsr,
      CASE WHEN tosse = 1 THEN 1 WHEN tosse = 2 THEN 2 ELSE 9 END AS tosse,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE evolucao = 2)::int AS events
    FROM fato_caso_srag
    WHERE ano_epi = 2024
      AND tp_idade IN (1, 2)
      AND evolucao IN (1, 2)
      AND pcr_resul = 1
      AND (pos_pcrflu = 1 OR pcr_vsr = 1 OR pcr_adeno = 1 OR pcr_metap = 1
        OR pcr_rino = 1 OR pcr_sars2 = 1 OR pcr_boca = 1
        OR pcr_para1 = 1 OR pcr_para2 = 1 OR pcr_para3 = 1
        OR pcr_para4 = 1 OR pcr_outro = 1)
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
  `)) as unknown as QueryRow[];

  const regressionEligibleN = regressionRows.reduce((sum, pattern) => sum + numberValue(pattern, "n"), 0);
  const regression = fitLogistic(
    regressionRows.map((pattern) => [
      1,
      ...PEDIATRIC_REGRESSION_PREDICTORS.map(([field]) => Number(pattern[field]) === 1 ? 1 : 0),
    ]),
    regressionRows.map((pattern) => numberValue(pattern, "events")),
    regressionRows.map((pattern) => numberValue(pattern, "n")),
    ["(Intercepto)", ...PEDIATRIC_REGRESSION_PREDICTORS.map(([, label]) => label)],
  );
  const regressionCoefficients = Object.fromEntries(
    PEDIATRIC_REGRESSION_PREDICTORS.map(([field], index) => {
      const coefficient = regression.coeficientes[index + 1];
      return [field, {
        adjustedOddsRatio: coefficient.aOR,
        ci95Low: coefficient.ci95Low,
        ci95High: coefficient.ci95High,
        pValue: coefficient.pValue,
      }];
    }),
  );

  const sensitivityNames = [
    "(Intercepto)",
    ...PEDIATRIC_REGRESSION_PREDICTORS.map(([, label]) => label),
    ...PEDIATRIC_CLINICAL_FIELDS.map((field) => `${field}: ignorado/ausente`),
  ];
  const sensitivityRegression = fitLogistic(
    regressionRows.map((pattern) => [
      1,
      ...PEDIATRIC_REGRESSION_PREDICTORS.map(([field]) => Number(pattern[field]) === 1 ? 1 : 0),
      ...PEDIATRIC_CLINICAL_FIELDS.map((field) => Number(pattern[field]) === 9 ? 1 : 0),
    ]),
    regressionRows.map((pattern) => numberValue(pattern, "events")),
    regressionRows.map((pattern) => numberValue(pattern, "n")),
    sensitivityNames,
  );
  const sensitivityCoefficients = Object.fromEntries(
    PEDIATRIC_REGRESSION_PREDICTORS.map(([field], index) => [
      field,
      coefficientSummary(sensitivityRegression, index + 1),
    ]),
  );

  const vaccinationX = vaccinationRows.map((pattern) => [
    1,
    numberValue(pattern, "age"),
    numberValue(pattern, "male"),
    String(pattern.education) === "elementary" ? 1 : 0,
    String(pattern.education) === "middle" ? 1 : 0,
    String(pattern.education) === "unknown" ? 1 : 0,
    numberValue(pattern, "icu"),
    numberValue(pattern, "invasive_ventilation"),
    String(pattern.dose_group) === "1-2" ? 1 : 0,
    String(pattern.dose_group) === "3" ? 1 : 0,
    String(pattern.dose_group) === "4" ? 1 : 0,
    String(pattern.dose_group) === "5-6" ? 1 : 0,
  ]);
  const vaccinationRegression = fitLogistic(
    vaccinationX,
    vaccinationRows.map((pattern) => numberValue(pattern, "events")),
    vaccinationRows.map((pattern) => numberValue(pattern, "n")),
    ["(Intercepto)", ...VACCINATION_MODEL_PREDICTORS.map(([, label]) => label)],
  );
  const vaccinationCoefficients = Object.fromEntries(
    VACCINATION_MODEL_PREDICTORS.map(([field], index) => [field, coefficientSummary(vaccinationRegression, index + 1)]),
  );

  const influenzaIptwRows = (await db.execute(sql`
    SELECT
      CASE WHEN tp_idade = 1 THEN nu_idade_n::double precision / 365.25
        WHEN tp_idade = 2 THEN nu_idade_n::double precision / 12.0
        ELSE nu_idade_n::double precision END AS age,
      CASE WHEN cs_sexo = 'M' THEN 1 ELSE 0 END AS male,
      CASE WHEN febre = 1 THEN 1 ELSE 0 END AS fever,
      CASE WHEN tosse = 1 THEN 1 ELSE 0 END AS cough,
      CASE WHEN garganta = 1 THEN 1 ELSE 0 END AS sore_throat,
      CASE WHEN dispneia = 1 THEN 1 ELSE 0 END AS dyspnea,
      CASE WHEN desc_resp = 1 THEN 1 ELSE 0 END AS respiratory_distress,
      CASE WHEN saturacao = 1 THEN 1 ELSE 0 END AS low_saturation,
      CASE WHEN diarreia = 1 THEN 1 ELSE 0 END AS diarrhea,
      CASE WHEN vomito = 1 THEN 1 ELSE 0 END AS vomiting,
      CASE WHEN hepatica = 1 THEN 1 ELSE 0 END AS liver_disease,
      CASE WHEN asma = 1 THEN 1 ELSE 0 END AS asthma,
      CASE WHEN diabetes = 1 THEN 1 ELSE 0 END AS diabetes,
      CASE WHEN neurologic = 1 THEN 1 ELSE 0 END AS neurological_disease,
      CASE WHEN imunodepre = 1 THEN 1 ELSE 0 END AS immunosuppression,
      CASE WHEN obesidade = 1 THEN 1 ELSE 0 END AS obesity,
      CASE WHEN vacina = 1 THEN 1 ELSE 0 END AS influenza_vaccine,
      CASE WHEN antiviral = 1 AND tp_antivir = 1 THEN 1 ELSE 0 END AS oseltamivir,
      CASE WHEN NULLIF(BTRIM(COALESCE(dose_adic, '')), '') IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(dose_ref, '')), '') IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(dose_2ref, '')), '') IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(dos_re_bi, '')), '') IS NOT NULL THEN 1 ELSE 0 END AS booster,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE evolucao = 2)::int AS events
    FROM fato_caso_srag
    WHERE ano_epi = 2024 AND pcr_resul = 1 AND pos_pcrflu = 1
      AND evolucao IN (1, 2) AND cs_sexo IN ('M', 'F')
      AND nu_idade_n IS NOT NULL AND tp_idade IN (1, 2, 3)
      AND febre IN (1, 2) AND tosse IN (1, 2) AND garganta IN (1, 2)
      AND dispneia IN (1, 2) AND desc_resp IN (1, 2) AND saturacao IN (1, 2)
      AND diarreia IN (1, 2) AND vomito IN (1, 2)
      AND hepatica IN (1, 2) AND asma IN (1, 2) AND diabetes IN (1, 2)
      AND neurologic IN (1, 2) AND imunodepre IN (1, 2) AND obesidade IN (1, 2)
      AND vacina IN (1, 2) AND antiviral IN (1, 2)
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
  `)) as unknown as QueryRow[];

  const propensityX = influenzaIptwRows.map((pattern) => [
    1, ...INFLUENZA_BALANCE_FIELDS.map((field) => numberValue(pattern, field)),
  ]);
  const propensityRegression = fitLogistic(
    propensityX,
    influenzaIptwRows.map((pattern) => numberValue(pattern, "booster") * numberValue(pattern, "n")),
    influenzaIptwRows.map((pattern) => numberValue(pattern, "n")),
    ["(Intercepto)", ...INFLUENZA_BALANCE_FIELDS],
  );
  const propensityCoefficients = propensityRegression.coeficientes.map((coefficient) => coefficient.beta);
  const iptwWeights = influenzaIptwRows.map((pattern, index) => {
    const probability = logisticProbability(propensityX[index], propensityCoefficients);
    const rawWeight = numberValue(pattern, "booster") === 1 ? 1 / probability : 1 / (1 - probability);
    return Math.min(10, rawWeight);
  });
  const weightedRows = influenzaIptwRows.map((pattern, index) => ({ ...pattern, iptw: iptwWeights[index] }));
  const smdBefore = INFLUENZA_BALANCE_FIELDS.map((field) => Math.abs(standardizedMeanDifference(weightedRows, field, () => 1)));
  const smdAfter = INFLUENZA_BALANCE_FIELDS.map((field) => Math.abs(standardizedMeanDifference(weightedRows, field, (item) => numberValue(item, "iptw"))));
  const influenzaOutcomeX = weightedRows.map((pattern) => [
    1, ...INFLUENZA_OUTCOME_FIELDS.map((field) => numberValue(pattern, field)),
  ]);
  const influenzaOutcomeRegression = fitLogistic(
    influenzaOutcomeX,
    weightedRows.map((pattern) => numberValue(pattern, "events") * numberValue(pattern, "iptw")),
    weightedRows.map((pattern) => numberValue(pattern, "n") * numberValue(pattern, "iptw")),
    ["(Intercepto)", ...INFLUENZA_OUTCOME_FIELDS],
  );
  const boosterIndex = INFLUENZA_OUTCOME_FIELDS.indexOf("booster") + 1;
  const influenzaBooster = coefficientSummary(influenzaOutcomeRegression, boosterIndex);

  const fluCohort = numberValue(row, "flu_cohort");
  const fluDeaths = numberValue(row, "flu_deaths");
  const vaccinationCohort = vaccination.cohort;

  return {
    generatedAt: new Date().toISOString(),
    database: {
      records2024: numberValue(row, "records_2024"),
      uniqueNotifications2024: numberValue(row, "unique_notifications_2024"),
      minNotificationDate: nullableString(row.min_notification_date),
      maxNotificationDate: nullableString(row.max_notification_date),
      latestLoadAt: nullableString(latestLoad?.concluido_em),
      latestLoadSource: nullableString(latestLoad?.fonte),
      sourceManifest,
      requiredFieldsPresent: [...requiredFieldsPresent],
      requiredFieldsMissing: [...requiredFieldsMissing],
    },
    influenza: {
      allRecords: numberValue(row, "records_2024"),
      pcrPositive: numberValue(row, "flu_pcr"),
      cohort: fluCohort,
      deaths: fluDeaths,
      survivors: numberValue(row, "flu_survivors"),
      influenzaA: numberValue(row, "flu_a"),
      influenzaB: numberValue(row, "flu_b"),
      fatality: fluCohort ? (fluDeaths / fluCohort) * 100 : 0,
    },
    pediatric: {
      total: numberValue(row, "infant_total"),
      influenza: numberValue(row, "infant_influenza"),
      otherVirus: numberValue(row, "infant_other_virus"),
      otherAgent: numberValue(row, "infant_other_agent"),
      unspecified: numberValue(row, "infant_unspecified"),
      covid: numberValue(row, "infant_covid"),
      blank: numberValue(row, "infant_blank"),
      week17: numberValue(row, "infant_week_17"),
      knownVirus: numberValue(row, "infant_known_virus"),
      uniqueVirusPatientsKnownOutcome: numberValue(row, "infant_virus_patients_known_outcome"),
      viralDetectionsKnownOutcome: numberValue(row, "infant_virus_detections_known_outcome"),
      coinfectedPatientsKnownOutcome: numberValue(row, "infant_coinfected_known_outcome"),
    },
    vaccination: {
      ...vaccination,
      fatality: vaccinationCohort ? (vaccination.deaths / vaccinationCohort) * 100 : 0,
    },
    inferential: {
      vaccinationIcuMortality: {
        n: icuDeaths + icuSurvivors + noIcuDeaths + noIcuSurvivors,
        icuDeaths,
        icuSurvivors,
        noIcuDeaths,
        noIcuSurvivors,
        oddsRatio: associationOR.or,
        ci95Low: associationOR.ci95Low,
        ci95High: associationOR.ci95High,
        chiSquare: associationChiSquare.chi2,
        pValue: associationChiSquare.pValue,
        recodedAsPublished: true,
      },
      pediatricMortalityRegression: {
        n: regression.n,
        eligibleN: regressionEligibleN,
        excludedN: Math.max(0, regressionEligibleN - regression.n),
        events: regression.events,
        converged: regression.converged,
        iterations: regression.iteracoes,
        missingTreatment: "presence-versus-not-recorded",
        diagnostics: modelDiagnostics(regression),
        coefficients: regressionCoefficients,
        sensitivity: {
          policy: "clinical-unknown-category",
          diagnostics: modelDiagnostics(sensitivityRegression),
          coefficients: sensitivityCoefficients,
        },
      },
      vaccinationMortalityRegression: {
        n: vaccinationRegression.n,
        events: vaccinationRegression.events,
        diagnostics: modelDiagnostics(vaccinationRegression),
        doseDefinition: "Número de datas preenchidas em DOSE_1_COV, DOSE_2_COV, DOSE_ADIC, DOSE_REF, DOSE_2REF e DOS_RE_BI; categorias 0, 1–2, 3, 4 e 5–6.",
        coefficients: vaccinationCoefficients,
      },
      influenzaIptw: {
        status: "approximate-protocol",
        n: influenzaIptwRows.reduce((sum, item) => sum + numberValue(item, "n"), 0),
        events: influenzaIptwRows.reduce((sum, item) => sum + numberValue(item, "events"), 0),
        exposed: influenzaIptwRows.reduce((sum, item) => sum + numberValue(item, "booster") * numberValue(item, "n"), 0),
        weightedN: influenzaOutcomeRegression.n,
        truncatedWeights: iptwWeights.filter((weight) => weight >= 10 - 1e-12).length,
        maxSmdBefore: Math.max(...smdBefore),
        maxSmdAfter: Math.max(...smdAfter),
        balancedAfterWeighting: smdAfter.filter((value) => value < 0.1).length,
        totalBalanceCovariates: smdAfter.length,
        booster: influenzaBooster,
        eValue: eValueFromOddsRatio(influenzaBooster.adjustedOddsRatio),
        diagnostics: modelDiagnostics(influenzaOutcomeRegression),
        caveat: "O artigo não enumera no texto principal todas as covariáveis do propensity score nem formaliza operacionalmente a dose de reforço. Esta implementação usa as variáveis publicadas na Tabela 2, casos completos, reforço definido por qualquer data de dose adicional/reforço e IPTW não estabilizado truncado em 10.",
      },
    },
  };
}
