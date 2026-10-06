import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { assessProvenance } from "@/lib/source-provenance";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import type {
  AnalysisManifestBase,
  AnalysisSourceIdentity,
  AnalysisType,
  SourceFileIdentity,
} from "@/lib/analysis-manifest";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function normalizeAnalysisFilters(filters: FiltrosSRAG): FiltrosSRAG {
  const normalized = canonicalize(filters) as FiltrosSRAG;
  if (normalized.criterios) {
    normalized.criterios = [...normalized.criterios]
      .map((criterion) => ({
        campo: criterion.campo,
        valores: [...new Set(criterion.valores)].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.campo.localeCompare(b.campo));
  }
  return normalized;
}

function requestedYears(filters: FiltrosSRAG): Set<number> {
  return new Set([
    ...(filters.ano_epi ? [filters.ano_epi] : []),
    ...(filters.anos_epi ?? []),
  ]);
}

export async function getAnalysisSourceIdentity(
  filters: FiltrosSRAG,
  latestNotificationDate: string | null,
): Promise<AnalysisSourceIdentity> {
  let latestSuccessfulLoadAt: string | null = null;
  let latestLoadSource: string | null = null;
  let files: SourceFileIdentity[] = [];
  let years = [...requestedYears(filters)];
  let lookupFailed = false;

  try {
    if (!years.length) {
      const rows = await db.execute(sql`SELECT DISTINCT ano_epi FROM fato_caso_srag WHERE ano_epi IS NOT NULL`);
      years = rows.map((row) => Number(row.ano_epi));
    }
    const [load] = (await db.execute(sql`
      SELECT fonte, concluido_em
      FROM controle_carga
      WHERE status = 'sucesso'
      ORDER BY concluido_em DESC NULLS LAST
      LIMIT 1
    `)) as unknown as Array<Record<string, unknown>>;
    latestSuccessfulLoadAt = load?.concluido_em ? new Date(String(load.concluido_em)).toISOString() : null;
    latestLoadSource = load?.fonte ? String(load.fonte) : null;

    const [manifestTable] = (await db.execute(sql`
      SELECT to_regclass('public.manifesto_fonte')::text AS table_name
    `)) as unknown as Array<Record<string, unknown>>;
    if (manifestTable?.table_name) {
      const rows = (await db.execute(sql`
        SELECT DISTINCT ON (ano_epi)
          ano_epi, arquivo_nome, arquivo_url, publicado_em, carregado_em,
          sha256, tamanho_bytes, normalizacao_versao
        FROM manifesto_fonte
        ORDER BY ano_epi, carregado_em DESC
      `)) as unknown as Array<Record<string, unknown>>;
      const years = requestedYears(filters);
      files = rows
        .filter((row) => years.size === 0 || years.has(Number(row.ano_epi)))
        .map((row) => ({
          year: Number(row.ano_epi),
          fileName: String(row.arquivo_nome),
          fileUrl: row.arquivo_url ? String(row.arquivo_url) : null,
          publishedAt: row.publicado_em ? String(row.publicado_em).slice(0, 10) : null,
          loadedAt: new Date(String(row.carregado_em)).toISOString(),
          sha256: String(row.sha256).trim(),
          sizeBytes: Number(row.tamanho_bytes),
          normalizationVersion: String(row.normalizacao_versao),
        }));
    }
  } catch (error) {
    lookupFailed = true;
    console.warn("[analysis-manifest] proveniência parcial", error);
  }

  return {
    dataset: "SIVEP-Gripe / OpenDataSUS",
    table: "fato_caso_srag",
    unitOfAnalysis: "notificação de SRAG",
    latestNotificationDate,
    latestSuccessfulLoadAt,
    latestLoadSource,
    files,
    provenance: assessProvenance(files, years, lookupFailed),
  };
}

interface BuildManifestOptions<T extends Record<string, unknown>> {
  analysisType: AnalysisType;
  analysisVersion: string;
  filters: FiltrosSRAG;
  latestNotificationDate: string | null;
  cohort: AnalysisManifestBase["cohort"];
  configuration: Record<string, unknown>;
  disclosureControl: AnalysisManifestBase["disclosureControl"];
  metrics: readonly string[];
  extra: T;
}

export async function buildAnalysisManifest<T extends Record<string, unknown>>(
  options: BuildManifestOptions<T>,
): Promise<AnalysisManifestBase & T> {
  const filters = normalizeAnalysisFilters(options.filters);
  const source = await getAnalysisSourceIdentity(filters, options.latestNotificationDate);
  const identity = {
    analysisType: options.analysisType,
    analysisVersion: options.analysisVersion,
    filters,
    sourceFiles: source.files.map(({ year, sha256, normalizationVersion }) => ({ year, sha256, normalizationVersion })),
    latestNotificationDate: source.latestNotificationDate,
    cohort: options.cohort,
    configuration: options.configuration,
  };
  const analysisId = createHash("sha256")
    .update(JSON.stringify(canonicalize(identity)))
    .digest("hex")
    .slice(0, 16);

  return {
    schemaVersion: "siveplens-analysis-spec/v2",
    analysisId,
    analysisType: options.analysisType,
    analysisVersion: options.analysisVersion,
    generatedAt: new Date().toISOString(),
    source,
    filters,
    cohort: options.cohort,
    configuration: options.configuration,
    disclosureControl: {
      ...options.disclosureControl,
      warnings: [...options.disclosureControl.warnings, ...source.provenance.warnings],
    },
    metrics: options.metrics,
    ...options.extra,
  };
}
