import type { FiltrosSRAG } from "@/lib/filter-utils";
import type { AnalysisManifestBase } from "@/lib/analysis-manifest";

export const DESCRIPTIVE_VARIABLES = {
  idade_anos: {
    label: "Idade em anos",
    definition:
      "TP_IDADE=1 convertido de dias por 365,25; TP_IDADE=2 convertido de meses por 12; TP_IDADE=3 mantido em anos.",
  },
} as const;

export type DescriptiveVariable = keyof typeof DESCRIPTIVE_VARIABLES;

export const CATEGORICAL_VARIABLES = {
  cs_sexo: {
    label: "Sexo",
    definition: "Sexo informado na notificação: feminino, masculino ou ignorado.",
    labels: { F: "Feminino", M: "Masculino", I: "Ignorado" },
    order: ["F", "M", "I"],
  },
  faixa_etaria: {
    label: "Faixa etária",
    definition: "Faixas derivadas de TP_IDADE e NU_IDADE_N; dias e meses integram 0–4 anos.",
    labels: {
      "0-4": "0–4 anos", "5-11": "5–11 anos", "12-17": "12–17 anos",
      "18-29": "18–29 anos", "30-39": "30–39 anos", "40-49": "40–49 anos",
      "50-59": "50–59 anos", "60-69": "60–69 anos", "70-79": "70–79 anos",
      "80+": "80 anos ou mais",
    },
    order: ["0-4", "5-11", "12-17", "18-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"],
  },
  classi_fin: {
    label: "Classificação final",
    definition: "Classificação final do caso registrada no SIVEP-Gripe.",
    labels: { "1": "Influenza", "2": "Outro vírus", "3": "Outro agente", "4": "SRAG não especificada", "5": "COVID-19" },
    order: ["1", "2", "3", "4", "5"],
  },
  evolucao: {
    label: "Evolução",
    definition: "Desfecho registrado: cura, óbito por SRAG, óbito por outras causas ou ignorado.",
    labels: { "1": "Cura", "2": "Óbito por SRAG", "3": "Óbito por outras causas", "9": "Ignorado" },
    order: ["1", "2", "3", "9"],
  },
  sg_uf: {
    label: "Unidade federativa",
    definition: "UF de residência informada na notificação.",
    labels: {},
    order: [],
  },
  hospital: {
    label: "Hospitalização",
    definition: "Indicador de hospitalização: 1=sim, 2=não e 9=ignorado.",
    labels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    order: ["1", "2", "9"],
  },
  uti: {
    label: "Internação em UTI",
    definition: "Indicador de internação em UTI: 1=sim, 2=não e 9=ignorado.",
    labels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    order: ["1", "2", "9"],
  },
  diabetes: {
    label: "Diabetes",
    definition: "Comorbidade informada: 1=sim, 2=não e 9=ignorado.",
    labels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    order: ["1", "2", "9"],
  },
} as const;

export type CategoricalVariable = keyof typeof CATEGORICAL_VARIABLES;

export interface NumericSummary {
  suppressed: boolean;
  minimumPopulationN: number;
  populationN: number | null;
  validN: number | null;
  missingN: number | null;
  missingPct: number | null;
  mean: number | null;
  stdDev: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
}

export interface HistogramBin {
  lower: number;
  upper: number;
  label: string;
  count: number;
  pctValid: number;
}

export interface CategoryFrequency {
  value: string;
  label: string;
  count: number;
  pctValid: number;
  pctPopulation: number;
}

export interface CategoricalSummary {
  suppressed: boolean;
  minimumPopulationN: number;
  populationN: number | null;
  validN: number | null;
  missingN: number | null;
  missingPct: number | null;
  categories: CategoryFrequency[];
}

export interface AnalysisManifest extends AnalysisManifestBase {
  analysisType: "descriptive-numeric";
  variable: {
    id: DescriptiveVariable;
    label: string;
    definition: string;
  };
  filters: FiltrosSRAG;
  missingData: {
    strategy: "available-case";
    populationN: number | null;
    validN: number | null;
    missingN: number | null;
  };
  disclosureControl: {
    minimumPopulationN: number;
    suppressed: boolean;
    rule: "suppress-small-cohorts";
    warnings: string[];
  };
}

export interface DescriptiveResult {
  summary: NumericSummary;
  histogram: HistogramBin[];
  manifest: AnalysisManifest;
}

export interface CategoricalAnalysisManifest extends AnalysisManifestBase {
  analysisType: "descriptive-categorical";
  variable: {
    id: CategoricalVariable;
    label: string;
    definition: string;
  };
  filters: FiltrosSRAG;
  missingData: AnalysisManifest["missingData"];
  disclosureControl: AnalysisManifest["disclosureControl"];
}

export interface CategoricalResult {
  summary: CategoricalSummary;
  manifest: CategoricalAnalysisManifest;
}
