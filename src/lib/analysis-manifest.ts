import type { FiltrosSRAG } from "@/lib/filter-utils";

export type AnalysisType =
  | "descriptive-numeric"
  | "descriptive-categorical"
  | "bivariate-association"
  | "logistic-regression";

export interface SourceFileIdentity {
  year: number;
  fileName: string;
  fileUrl: string | null;
  publishedAt: string | null;
  loadedAt: string;
  sha256: string;
  sizeBytes: number;
  normalizationVersion: string;
}

export interface AnalysisSourceIdentity {
  dataset: "SIVEP-Gripe / OpenDataSUS";
  table: "fato_caso_srag";
  unitOfAnalysis: "notificação de SRAG";
  latestNotificationDate: string | null;
  latestSuccessfulLoadAt: string | null;
  latestLoadSource: string | null;
  files: SourceFileIdentity[];
  provenance: { status: "complete" | "partial"; warnings: string[] };
}

export interface AnalysisManifestBase {
  schemaVersion: "siveplens-analysis-spec/v2";
  analysisId: string;
  analysisType: AnalysisType;
  analysisVersion: string;
  generatedAt: string;
  source: AnalysisSourceIdentity;
  filters: FiltrosSRAG;
  cohort: {
    populationN: number | null;
    effectiveN: number | null;
    excludedN: number | null;
    events?: number | null;
  };
  configuration: Record<string, unknown>;
  disclosureControl: {
    rule: string;
    minimumPopulationN: number | null;
    suppressed: boolean;
    warnings: string[];
  };
  metrics: readonly string[];
}
