import { NextRequest, NextResponse } from "next/server";
import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildFilterConditions } from "@/dal/filter-builder";
import { buildAnalysisManifest, normalizeAnalysisFilters } from "@/dal/analysis-manifest";
import { CAMPOS_PERMITIDOS, getVariableInfo } from "@/lib/variable-catalog";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import type { AnalysisManifestBase } from "@/lib/analysis-manifest";

const BIVARIATE_ANALYSIS_VERSION = "2.0.0";
const SMALL_CELL_THRESHOLD = 10;

export interface ContingenciaRequest {
  varX:            string;
  varY:            string;
  filtros:         Partial<FiltrosSRAG>;
  excluirIgnorado: boolean;
}

export interface ContingenciaCell {
  vx: string;
  vy: string;
  n:  number;
}

export interface ContingenciaResponse {
  cells:      ContingenciaCell[];
  totalN:     number;  // registros usados na análise
  excludedN:  number;  // registros excluídos (NULL + ignorado)
  manifest: AnalysisManifestBase & {
    variables: {
      exposure: { id: string; label: string };
      outcome: { id: string; label: string };
    };
  };
}

export async function POST(req: NextRequest) {
  let body: ContingenciaRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { varX, varY, filtros = {}, excluirIgnorado = true } = body;
  const normalizedFilters = normalizeAnalysisFilters(filtros as FiltrosSRAG);

  // ── Validação do whitelist — crítico para evitar SQL injection ─────────────
  if (!CAMPOS_PERMITIDOS.has(varX) || !CAMPOS_PERMITIDOS.has(varY)) {
    return NextResponse.json({ error: "Campo não permitido" }, { status: 400 });
  }
  if (varX === varY) {
    return NextResponse.json({ error: "varX e varY não podem ser iguais" }, { status: 400 });
  }

  const xInfo = getVariableInfo(varX)!;
  const yInfo = getVariableInfo(varY)!;

  // Coluna SQL real (pode diferir do campo quando há variáveis derivadas)
  const colX = xInfo.sqlColumn ?? varX;
  const colY = yInfo.sqlColumn ?? varY;

  // Reproduz o protocolo público de Rezende et al. dentro da coorte vacinal:
  // UTI 9/NULL vira "não" e ventilação 3/9/NULL vira "não invasiva".
  const publishedVaccinationExpr = (field: string, column: string) => {
    if ((filtros as FiltrosSRAG).coorte_validacao !== "vaccination-eligible") return column;
    if (field === "uti") return "CASE WHEN uti = 1 THEN 1 ELSE 2 END";
    if (field === "suport_ven_bin") return "CASE WHEN suport_ven = 1 THEN 1 ELSE 2 END";
    return column;
  };
  const colXExpr = publishedVaccinationExpr(varX, colX);
  const colYExpr = publishedVaccinationExpr(varY, colY);

  // ── Condições do filtro global ─────────────────────────────────────────────
  const filterConditions = buildFilterConditions(filtros as FiltrosSRAG);

  // ── Condições de ignorado para X e Y ──────────────────────────────────────
  const ignoradoFragments: ReturnType<typeof sql>[] = [];
  if (excluirIgnorado) {
    if (xInfo.ignoradoCodigos.length > 0) {
      const codes = xInfo.ignoradoCodigos;
      ignoradoFragments.push(
        sql.raw(`CAST((${colXExpr}) AS TEXT) NOT IN (${codes.map((c) => `'${c}'`).join(", ")})`),
      );
    }
    if (yInfo.ignoradoCodigos.length > 0) {
      const codes = yInfo.ignoradoCodigos;
      ignoradoFragments.push(
        sql.raw(`CAST((${colYExpr}) AS TEXT) NOT IN (${codes.map((c) => `'${c}'`).join(", ")})`),
      );
    }
  }

  // ── allowedValues — restrição de variáveis derivadas binárias ─────────────
  if (xInfo.allowedValues?.length) {
    const vals = xInfo.allowedValues;
    ignoradoFragments.push(
      sql.raw(`CAST((${colXExpr}) AS TEXT) IN (${vals.map((v) => `'${v}'`).join(", ")})`),
    );
  }
  if (yInfo.allowedValues?.length) {
    const vals = yInfo.allowedValues;
    ignoradoFragments.push(
      sql.raw(`CAST((${colYExpr}) AS TEXT) IN (${vals.map((v) => `'${v}'`).join(", ")})`),
    );
  }

  // ── Condições NOT NULL (sempre) ────────────────────────────────────────────
  const notNullFragments = [
    sql.raw(`(${colXExpr}) IS NOT NULL`),
    sql.raw(`(${colYExpr}) IS NOT NULL`),
  ];

  const allConditions = [
    ...filterConditions,
    ...notNullFragments,
    ...ignoradoFragments,
  ];
  const whereSQL = allConditions.length > 0 ? and(...allConditions) : sql`TRUE`;

  try {
    // ── Contagem total antes de filtrar por ignorado ────────────────────────
    const [totalRow] = await db.execute(
      sql`SELECT COUNT(*)::int AS n, MAX(dt_notific)::text AS latest_notification_date FROM fato_caso_srag WHERE ${
        filterConditions.length ? and(...filterConditions) : sql`TRUE`
      }`,
    ) as unknown as { n: number; latest_notification_date: string | null }[];

    // ── Tabela de contingência ─────────────────────────────────────────────
    const rows = await db.execute(
      sql`
        SELECT
          CAST((${sql.raw(colXExpr)}) AS TEXT) AS vx,
          CAST((${sql.raw(colYExpr)}) AS TEXT) AS vy,
          COUNT(*)::int                  AS n
        FROM fato_caso_srag
        WHERE ${whereSQL}
        GROUP BY vx, vy
        ORDER BY vx, vy
      `,
    ) as unknown as ContingenciaCell[];

    const totalN    = rows.reduce((s, r) => s + r.n, 0);
    const excludedN = (totalRow?.n ?? 0) - totalN;
    const smallCells = rows.filter((cell) => cell.n > 0 && cell.n < SMALL_CELL_THRESHOLD).length;
    const warnings = smallCells > 0
      ? [`${smallCells} célula(s) possuem menos de ${SMALL_CELL_THRESHOLD} registros; evite interpretações individualizantes.`]
      : [];
    const manifest = await buildAnalysisManifest({
      analysisType: "bivariate-association",
      analysisVersion: BIVARIATE_ANALYSIS_VERSION,
      filters: normalizedFilters,
      latestNotificationDate: totalRow?.latest_notification_date ?? null,
      cohort: {
        populationN: Number(totalRow?.n ?? 0),
        effectiveN: totalN,
        excludedN,
      },
      configuration: { varX, varY, excluirIgnorado },
      disclosureControl: {
        rule: "warn-small-cells",
        minimumPopulationN: SMALL_CELL_THRESHOLD,
        suppressed: false,
        warnings,
      },
      metrics: ["count", "chi_square", "cramers_v", "odds_ratio", "risk_ratio", "fisher_exact"],
      extra: {
        variables: {
          exposure: { id: varX, label: xInfo.label },
          outcome: { id: varY, label: yInfo.label },
        },
      },
    });

    return NextResponse.json({ cells: rows, totalN, excludedN, manifest } satisfies ContingenciaResponse);
  } catch (err) {
    console.error("[contingencia]", err);
    return NextResponse.json({ error: "Erro ao consultar banco" }, { status: 500 });
  }
}
