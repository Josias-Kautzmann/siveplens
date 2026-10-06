export const SCIENTIFIC_VALIDATION_VERSION = "published-benchmarks/2.0.0";
export const ETL_NORMALIZATION_VERSION = "sivep-normalization/1.0.0";

export const VALIDATION_COHORTS = {
  "influenza-pcr": {
    label: "Influenza confirmada por RT-PCR",
    definition: "PCR_RESUL=1 e POS_PCRFLU=1.",
  },
  "influenza-known-outcome": {
    label: "Influenza com desfecho conhecido",
    definition: "Influenza confirmada por RT-PCR e EVOLUCAO em {1,2}.",
  },
  "infant-under-one": {
    label: "SRAG em menores de 1 ano",
    definition: "TP_IDADE em {1,2}, correspondente a idade registrada em dias ou meses.",
  },
  "infant-under-one-week17": {
    label: "SRAG em menores de 1 ano na semana 17",
    definition: "Menores de 1 ano e SEM_NOT=17.",
  },
  "infant-classification-missing": {
    label: "SRAG em menores de 1 ano sem classificação final",
    definition: "Menores de 1 ano e CLASSI_FIN ausente.",
  },
  "infant-virus-positive": {
    label: "SRAG viral em menores de 1 ano",
    definition: "Menores de 1 ano com pelo menos um agente viral positivo no painel RT-PCR.",
  },
  "infant-virus-positive-known-outcome": {
    label: "SRAG viral em menores de 1 ano com desfecho conhecido",
    definition: "Menores de 1 ano, PCR_RESUL=1, ao menos um agente viral positivo e EVOLUCAO em {1,2}.",
  },
  "vaccination-eligible": {
    label: "Coorte vacinal elegível",
    definition: "Pessoas imunocomprometidas com 60 anos ou mais, hospitalizadas por COVID-19 e com desfecho conhecido, conforme o artigo.",
  },
} as const;

export type ValidationCohortId = keyof typeof VALIDATION_COHORTS;

export function isValidationCohortId(value: string): value is ValidationCohortId {
  return value in VALIDATION_COHORTS;
}

export type ComparisonStatus = "reproduzido" | "compativel" | "divergente" | "parcial" | "bloqueado";

export interface PublishedStudy {
  id: "influenza" | "pediatrico" | "vacinacao";
  shortTitle: string;
  title: string;
  authors: string;
  journal: string;
  publishedYear: number;
  doi: string;
  sourceUrl: string;
  dataAccess: string;
  design: string;
  population: string;
  reproduction: "complete" | "partial" | "blocked";
}

export interface MetricComparison {
  key: string;
  label: string;
  published: number;
  reproduced: number | null;
  unit?: "count" | "percent" | "years" | "ratio";
  status: ComparisonStatus;
  absoluteDifference: number | null;
  percentDifference: number | null;
  note?: string;
  analysisHref?: string;
  analysisLabel?: string;
  secondaryAnalysisHref?: string;
  secondaryAnalysisLabel?: string;
  statusLabel?: string;
}

export const PEDIATRIC_REGRESSION_BENCHMARKS = [
  { key: "pcr_para4", label: "Parainfluenza 4 por RT-PCR", adjustedOddsRatio: 6.806, ci95Low: 2.052, ci95High: 22.572 },
  { key: "renal", label: "Doença renal crônica", adjustedOddsRatio: 3.82, ci95Low: 1.334, ci95High: 10.936 },
  { key: "imunodepre", label: "Imunodeficiência", adjustedOddsRatio: 3.68, ci95Low: 1.849, ci95High: 7.322 },
  { key: "sind_down", label: "Síndrome de Down", adjustedOddsRatio: 3.59, ci95Low: 2.167, ci95High: 5.95 },
  { key: "cardiopati", label: "Cardiopatia crônica", adjustedOddsRatio: 3.129, ci95Low: 2.069, ci95High: 4.731 },
  { key: "neurologic", label: "Doença neurológica", adjustedOddsRatio: 2.25, ci95Low: 1.275, ci95High: 3.969 },
  { key: "saturacao", label: "Saturação de O₂ < 95%", adjustedOddsRatio: 1.758, ci95Low: 1.401, ci95High: 2.205 },
  { key: "pcr_sars2", label: "SARS-CoV-2 por RT-PCR", adjustedOddsRatio: 1.569, ci95Low: 1.144, ci95High: 2.152 },
  { key: "desc_resp", label: "Desconforto respiratório", adjustedOddsRatio: 1.39, ci95Low: 1.041, ci95High: 1.856 },
  { key: "pcr_vsr", label: "VSR por RT-PCR", adjustedOddsRatio: 0.736, ci95Low: 0.595, ci95High: 0.909 },
  { key: "tosse", label: "Tosse", adjustedOddsRatio: 0.477, ci95Low: 0.377, ci95High: 0.604 },
] as const;

export const VACCINATION_REGRESSION_BENCHMARKS = [
  { key: "age", label: "Idade (por ano)", adjustedOddsRatio: 1.01, ci95Low: 0.99, ci95High: 1.03 },
  { key: "male", label: "Sexo masculino", adjustedOddsRatio: 1.07, ci95Low: 0.70, ci95High: 1.65 },
  { key: "education_elementary", label: "Escolaridade: fundamental", adjustedOddsRatio: 2.94, ci95Low: 1.39, ci95High: 6.44 },
  { key: "education_middle", label: "Escolaridade: médio", adjustedOddsRatio: 2.89, ci95Low: 1.12, ci95High: 7.50 },
  { key: "education_unknown", label: "Escolaridade: desconhecida", adjustedOddsRatio: 1.76, ci95Low: 0.92, ci95High: 3.51 },
  { key: "icu", label: "Admissão em UTI", adjustedOddsRatio: 1.44, ci95Low: 0.87, ci95High: 2.37 },
  { key: "invasive_ventilation", label: "Ventilação invasiva", adjustedOddsRatio: 12.55, ci95Low: 6.39, ci95High: 26.33 },
  { key: "doses_1_2", label: "1–2 doses", adjustedOddsRatio: 0.67, ci95Low: 0.32, ci95High: 1.39 },
  { key: "doses_3", label: "3 doses", adjustedOddsRatio: 0.67, ci95Low: 0.31, ci95High: 1.42 },
  { key: "doses_4", label: "4 doses", adjustedOddsRatio: 0.54, ci95Low: 0.26, ci95High: 1.15 },
  { key: "doses_5_6", label: "5–6 doses", adjustedOddsRatio: 0.56, ci95Low: 0.26, ci95High: 1.17 },
] as const;

export const REQUIRED_VALIDATION_FIELDS = [
  "dt_sin_pri", "sem_pri", "dt_digita", "dt_encerra", "an_sars2",
  "pcr_para1", "pcr_para2", "pcr_para3", "pcr_para4", "pcr_outro",
  "dose_adic", "dos_re_bi", "fab_cov_1", "fab_cov_2", "fab_adic",
  "fab_covref", "fab_covrf2", "fab_re_bi", "trat_cov", "tipo_trat",
] as const;

export const STUDIES: PublishedStudy[] = [
  {
    id: "influenza",
    shortTitle: "Influenza hospitalar",
    title: "Association between COVID-19 booster vaccination and influenza mortality: a nationwide retrospective cohort study using the SIVEP-Gripe database in Brazil",
    authors: "Sardinha et al.",
    journal: "Immunologic Research",
    publishedYear: 2026,
    doi: "10.1007/s12026-026-09792-0",
    sourceUrl: "https://doi.org/10.1007/s12026-026-09792-0",
    dataAccess: "Snapshot de 2024 informado pelo artigo",
    design: "Coorte retrospectiva nacional",
    population: "Hospitalizações por influenza confirmada por RT-PCR, com desfecho conhecido, em 2024",
    reproduction: "complete",
  },
  {
    id: "pediatrico",
    shortTitle: "SRAG em menores de 1 ano",
    title: "Risk of Incidence and Lethality by Etiology of Severe Acute Respiratory Syndrome in Hospitalized Children Under 1 Year of Age in Brazil in 2024",
    authors: "Soares et al.",
    journal: "Tropical Medicine and Infectious Disease",
    publishedYear: 2025,
    doi: "10.3390/tropicalmed10060168",
    sourceUrl: "https://doi.org/10.3390/tropicalmed10060168",
    dataAccess: "15 de fevereiro de 2025",
    design: "Estudo transversal nacional",
    population: "Notificações de SRAG em menores de 1 ano nas semanas epidemiológicas 1–52 de 2024",
    reproduction: "complete",
  },
  {
    id: "vacinacao",
    shortTitle: "Vacinação e mortalidade",
    title: "COVID-19 vaccine effectiveness against in-hospital mortality in immunocompromised older adults: a Brazilian hospital surveillance study, 2024",
    authors: "Rezende et al.",
    journal: "Revista Brasileira de Epidemiologia",
    publishedYear: 2026,
    doi: "10.1590/1980-549720260041",
    sourceUrl: "https://doi.org/10.1590/1980-549720260041",
    dataAccess: "29 de março de 2025",
    design: "Vigilância hospitalar retrospectiva",
    population: "Pessoas imunocomprometidas com 60 anos ou mais, hospitalizadas por COVID-19 em 2024",
    reproduction: "complete",
  },
];

export function compareMetric(
  input: Omit<MetricComparison, "status" | "absoluteDifference" | "percentDifference"> & {
    comparable?: boolean;
    partial?: boolean;
  },
): MetricComparison {
  const { comparable = true, partial = false, ...metric } = input;
  if (metric.reproduced === null) {
    return { ...metric, reproduced: null, status: "bloqueado", absoluteDifference: null, percentDifference: null };
  }

  const absoluteDifference = metric.reproduced - metric.published;
  const percentDifference = metric.published === 0
    ? null
    : (absoluteDifference / metric.published) * 100;
  const deviation = Math.abs(percentDifference ?? absoluteDifference);
  const status: ComparisonStatus = !comparable
    ? "bloqueado"
    : partial
      ? "parcial"
      : deviation <= 1
        ? "reproduzido"
        : deviation <= 3
          ? "compativel"
          : "divergente";

  return { ...metric, status, absoluteDifference, percentDifference };
}
