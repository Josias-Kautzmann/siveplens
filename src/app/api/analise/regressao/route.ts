import { NextRequest, NextResponse } from "next/server";
import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildFilterConditions } from "@/dal/filter-builder";
import { buildAnalysisManifest, normalizeAnalysisFilters } from "@/dal/analysis-manifest";
import { FAIXA_CASE } from "@/lib/faixa-etaria";
import { fitLogistic } from "@/lib/logistic-regression";
import { sexPredictorConflict } from "@/lib/regression-config";
import type { CoefResult } from "@/lib/logistic-regression";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import type { AnalysisManifestBase } from "@/lib/analysis-manifest";

const REGRESSION_ANALYSIS_VERSION = "2.0.1";

// ── Faixas etárias ────────────────────────────────────────────────────────────

const FAIXA_LEVELS = [
  "0-4", "5-11", "12-17", "18-29", "30-39",
  "40-49", "50-59", "60-69", "70-79", "80+",
] as const;
type FaixaLevel = (typeof FAIXA_LEVELS)[number];
export { FAIXA_LEVELS };
export type { FaixaLevel };

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ColunaDef {
  nome:   string;
  encode: (row: Record<string, unknown>) => number;
}

interface PreditorDef {
  campo:          string;
  labelCurto:     string;
  categoria:      string;
  sqlSelectExpr:  string;   // expressão para o SELECT da CTE base
  sqlWhereExpr:   string;   // condição WHERE para excluir ignorado/null
  sqlGroupByExpr: string;   // alias/coluna para GROUP BY e SELECT externo
  refLabel:       string;   // rótulo da categoria de referência
  colunas:        ColunaDef[];
}

interface OutcomeDef {
  campo:            string;
  label:            string;
  eventLabel:       string;
  nonEventLabel:    string;
  sqlOutcomeColumn: string;  // coluna incluída na CTE base
  sqlWhereExpr:     string;  // restringe ao subconjunto binário
  sqlEventsExpr:    string;  // SUM(...) → conta eventos
}

// ── Catálogo de outcomes ──────────────────────────────────────────────────────

const OUTCOMES: Record<string, OutcomeDef> = {
  evolucao_bin: {
    campo:            "evolucao_bin",
    label:            "Óbito por SRAG (vs Cura)",
    eventLabel:       "Óbito SRAG",
    nonEventLabel:    "Cura",
    sqlOutcomeColumn: "evolucao",
    sqlWhereExpr:     "evolucao IN (1, 2)",
    sqlEventsExpr:    "CASE WHEN evolucao = 2 THEN 1 ELSE 0 END",
  },
  uti: {
    campo:            "uti",
    label:            "Internação em UTI",
    eventLabel:       "UTI",
    nonEventLabel:    "Sem UTI",
    sqlOutcomeColumn: "uti",
    sqlWhereExpr:     "uti IN (1, 2)",
    sqlEventsExpr:    "CASE WHEN uti = 1 THEN 1 ELSE 0 END",
  },
  suport_ven_bin: {
    campo:            "suport_ven_bin",
    label:            "Ventilação invasiva (vs não invasiva)",
    eventLabel:       "Invasivo",
    nonEventLabel:    "Não invasivo",
    sqlOutcomeColumn: "suport_ven",
    sqlWhereExpr:     "suport_ven IN (1, 2)",
    sqlEventsExpr:    "CASE WHEN suport_ven = 1 THEN 1 ELSE 0 END",
  },
  hospital: {
    campo:            "hospital",
    label:            "Hospitalização",
    eventLabel:       "Hospitalizado",
    nonEventLabel:    "Não hospitalizado",
    sqlOutcomeColumn: "hospital",
    sqlWhereExpr:     "hospital IN (1, 2)",
    sqlEventsExpr:    "CASE WHEN hospital = 1 THEN 1 ELSE 0 END",
  },
};

// ── Catálogo de preditores ────────────────────────────────────────────────────

function binarySinan(
  campo: string,
  labelCurto: string,
  categoria: string,
  nomeSim: string,
): PreditorDef {
  return {
    campo,
    labelCurto,
    categoria,
    sqlSelectExpr:  campo,
    sqlWhereExpr:   `${campo} IN (1, 2)`,
    sqlGroupByExpr: campo,
    refLabel:       `Não ${labelCurto.toLowerCase()} (ref.)`,
    colunas: [{
      nome:   nomeSim,
      encode: (row) => (row[campo] === 1 || row[campo] === "1") ? 1 : 0,
    }],
  };
}

const PREDITORES: Record<string, PreditorDef> = {
  cs_sexo: {
    campo:          "cs_sexo",
    labelCurto:     "Sexo",
    categoria:      "Demográfico",
    sqlSelectExpr:  "cs_sexo",
    sqlWhereExpr:   "cs_sexo IN ('M', 'F')",
    sqlGroupByExpr: "cs_sexo",
    refLabel:       "Feminino (ref.)",
    colunas: [{
      nome:   "Sexo masculino",
      encode: (row) => (row.cs_sexo === "M") ? 1 : 0,
    }],
  },

  faixa_etaria: {
    campo:          "faixa_etaria",
    labelCurto:     "Faixa etária",
    categoria:      "Demográfico",
    sqlSelectExpr:  `(${FAIXA_CASE}) AS faixa_etaria`,
    sqlWhereExpr:   "tp_idade IS NOT NULL AND nu_idade_n IS NOT NULL",
    sqlGroupByExpr: "faixa_etaria",
    refLabel:       "0–4 anos (ref.)",
    colunas: FAIXA_LEVELS
      .filter((l) => l !== "0-4")
      .map((level) => ({
        nome:   `${level} anos`,
        encode: (row) => (row.faixa_etaria === level) ? 1 : 0,
      })),
  },

  // ── Comorbidades ──────────────────────────────────────────────────────────
  diabetes:   binarySinan("diabetes",   "Diabetes",       "Comorbidades", "Diabetes mellitus"),
  obesidade:  binarySinan("obesidade",  "Obesidade",      "Comorbidades", "Obesidade"),
  cardiopati: binarySinan("cardiopati", "Cardiopatia",    "Comorbidades", "Cardiopatia crônica"),
  imunodepre: binarySinan("imunodepre", "Imunodepressão", "Comorbidades", "Imunodepressão"),
  renal:      binarySinan("renal",      "Doença renal",   "Comorbidades", "Doença renal crônica"),
  asma:       binarySinan("asma",       "Asma",           "Comorbidades", "Asma"),
  pneumopati: binarySinan("pneumopati", "Pneumopatia",    "Comorbidades", "Pneumopatia crônica"),
  neurologic: binarySinan("neurologic", "Neurológica",    "Comorbidades", "Doença neurológica"),
  sind_down:  binarySinan("sind_down",  "S. Down",        "Comorbidades", "Síndrome de Down"),
  hematologi: binarySinan("hematologi", "Hematopatia",    "Comorbidades", "Hematopatia"),
  hepatica:   binarySinan("hepatica",   "Hepatopatia",    "Comorbidades", "Hepatopatia"),
  puerpera:   binarySinan("puerpera",   "Puérpera",       "Comorbidades", "Puerpério"),

  // ── Vacinação ─────────────────────────────────────────────────────────────
  vacina_cov: binarySinan("vacina_cov", "Vacina COVID",      "Vacinação", "Vacinado COVID-19"),
  vacina:     binarySinan("vacina",     "Vacina Influenza",  "Vacinação", "Vacinado Influenza"),

  // ── Etiologia laboratorial ───────────────────────────────────────────────
  pcr_para4: binarySinan("pcr_para4", "Parainfluenza 4", "Etiologia", "Parainfluenza 4 por RT-PCR"),
  pcr_sars2: binarySinan("pcr_sars2", "SARS-CoV-2",      "Etiologia", "SARS-CoV-2 por RT-PCR"),
  pcr_vsr:   binarySinan("pcr_vsr",   "VSR",             "Etiologia", "VSR por RT-PCR"),

  // ── Sintomas ──────────────────────────────────────────────────────────────
  dispneia:  binarySinan("dispneia",  "Dispneia",          "Sintomas", "Dispneia"),
  saturacao: binarySinan("saturacao", "Saturação < 95%",   "Sintomas", "Saturação O₂ < 95%"),
  febre:     binarySinan("febre",     "Febre",             "Sintomas", "Febre"),
  tosse:     binarySinan("tosse",     "Tosse",             "Sintomas", "Tosse"),
  desc_resp: binarySinan("desc_resp", "Desc. respiratório","Sintomas", "Desconforto respiratório"),
  garganta:  binarySinan("garganta",  "Dor de garganta",   "Sintomas", "Dor de garganta"),
  fadiga:    binarySinan("fadiga",    "Fadiga",            "Sintomas", "Fadiga"),
  diarreia:  binarySinan("diarreia",  "Diarreia",          "Sintomas", "Diarreia"),
};

// ── Tipos de resposta ─────────────────────────────────────────────────────────

export interface LinhaResultado extends CoefResult {
  isReferencia?: boolean;
}

export interface RegressaoResponse {
  coeficientes: LinhaResultado[];
  meta: {
    n:            number;   // casos efetivos no modelo (após exclusão por ausência)
    nRaw:         number;   // casos elegíveis (outcome + filtros, sem restrição de preditores)
    nExcluded:    number;   // nRaw - n (atrito por dados ausentes)
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

// ── Builders para referência dinâmica ────────────────────────────────────────

function buildFaixaDef(ref: FaixaLevel): PreditorDef {
  return {
    ...PREDITORES.faixa_etaria,
    refLabel: `${ref} anos (ref.)`,
    colunas: FAIXA_LEVELS
      .filter((l) => l !== ref)
      .map((level) => ({
        nome:   `${level} anos`,
        encode: (row) => (row.faixa_etaria === level) ? 1 : 0,
      })),
  };
}

function buildSexoDef(ref: "M" | "F"): PreditorDef {
  const nonRef      = ref === "F" ? "M" : "F";
  const nonRefLabel = ref === "F" ? "Sexo masculino" : "Sexo feminino";
  return {
    ...PREDITORES.cs_sexo,
    refLabel: `${ref === "F" ? "Feminino" : "Masculino"} (ref.)`,
    colunas: [{
      nome:   nonRefLabel,
      encode: (row) => (row.cs_sexo === nonRef) ? 1 : 0,
    }],
  };
}

// ── Modo "Ignorado como categoria" ───────────────────────────────────────────
//
// Quando incluirIgnorado=true, cada variável binária SINAN (código 1/2/9) ganha
// duas dummies em vez de uma:
//   - [campo]_sim      → 1 se código=1, 0 caso contrário
//   - [campo]_ignorado → 1 se código=9 ou NULL, 0 caso contrário
//
// Referência implícita: código=2 (Não).  O WHERE da CTE remove a restrição
// IN(1,2) para permitir que registros com código 9 ou NULL entrem no modelo.
// Epidemiologicamente isso revela se "Ignorado" tem um risco distinto de "Não",
// o que no SIVEP-Gripe geralmente é Missing Not At Random (MNAR).

function applyIgnoradoMode(pred: PreditorDef): PreditorDef {
  // Variáveis com lógica própria: não transformar
  if (pred.campo === "cs_sexo" || pred.campo === "faixa_etaria") return pred;

  const campo     = pred.campo;
  const nomeBase  = pred.colunas[0].nome;

  return {
    ...pred,
    // CASE mapeia NULL/9/outros → 9, preservando 1 e 2
    sqlSelectExpr: `CASE WHEN ${campo} = 1 THEN 1 WHEN ${campo} = 2 THEN 2 ELSE 9 END AS ${campo}`,
    sqlWhereExpr:  "TRUE",   // sem restrição — todos os registros passam
    refLabel:      `Não ${pred.labelCurto.toLowerCase()} (ref.)`,
    colunas: [
      {
        nome:   nomeBase,
        encode: (row) => (row[campo] === 1 || row[campo] === "1") ? 1 : 0,
      },
      {
        nome:   `${nomeBase} — Ignorado/ausente`,
        encode: (row) => (row[campo] === 9 || row[campo] === "9") ? 1 : 0,
      },
    ],
  };
}

// Reprodução de artigos que dicotomizam cada fator como presença (1) versus
// ausência (0), sem publicar uma categoria separada para desconhecido. Nesse
// modo, apenas o código 1 é presença; 2, 9, NULL e demais códigos viram ausência.
// A suposição é deliberadamente opt-in porque pode introduzir erro de classificação.
function applyAusenciaMode(pred: PreditorDef): PreditorDef {
  if (pred.campo === "cs_sexo" || pred.campo === "faixa_etaria") return pred;

  const campo = pred.campo;
  return {
    ...pred,
    sqlSelectExpr: `CASE WHEN ${campo} = 1 THEN 1 ELSE 2 END AS ${campo}`,
    sqlWhereExpr: "TRUE",
    sqlGroupByExpr: campo,
  };
}

// ── Handler POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    outcome?:         string;
    preditores?:      string[];
    filtros?:         Partial<FiltrosSRAG>;
    incluirIgnorado?: boolean;
    ausenteComoAusencia?: boolean;
    refFaixa?:        string;
    refSexo?:         string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const {
    outcome: outcomeKey,
    preditores: predKeys = [],
    filtros: rawFiltros  = {},
    incluirIgnorado      = false,
    ausenteComoAusencia   = false,
    refFaixa: refFaixaRaw,
    refSexo:  refSexoRaw,
  } = body;

  const refFaixa: FaixaLevel =
    (FAIXA_LEVELS as readonly string[]).includes(refFaixaRaw ?? "")
      ? (refFaixaRaw as FaixaLevel)
      : "0-4";
  const refSexo: "M" | "F" =
    refSexoRaw === "M" || refSexoRaw === "F" ? refSexoRaw : "F";

  // ── Validação ─────────────────────────────────────────────────────────────
  if (!outcomeKey || !OUTCOMES[outcomeKey]) {
    return NextResponse.json({ error: "Outcome inválido" }, { status: 400 });
  }
  if (predKeys.length < 1) {
    return NextResponse.json({ error: "Selecione pelo menos 1 preditor" }, { status: 400 });
  }
  const invalidPreds = predKeys.filter((k) => !PREDITORES[k]);
  if (invalidPreds.length) {
    return NextResponse.json(
      { error: `Preditores não reconhecidos: ${invalidPreds.join(", ")}` },
      { status: 400 },
    );
  }

  const filtros  = normalizeAnalysisFilters(rawFiltros as FiltrosSRAG);
  const conflict = sexPredictorConflict(predKeys, filtros);
  if (conflict) return NextResponse.json({ error: conflict }, { status: 422 });
  const outcome  = OUTCOMES[outcomeKey];
  // Aplica referência dinâmica e um único modo de tratamento de ausências.
  const preds = predKeys.map((k) => {
    let pred = PREDITORES[k];
    if (k === "faixa_etaria") pred = buildFaixaDef(refFaixa);
    if (k === "cs_sexo")      pred = buildSexoDef(refSexo);
    if (ausenteComoAusencia) return applyAusenciaMode(pred);
    return incluirIgnorado ? applyIgnoradoMode(pred) : pred;
  });
  const hasFaixa = predKeys.includes("faixa_etaria");

  // ── Construção dinâmica do SQL ────────────────────────────────────────────

  const filterConds = buildFilterConditions(filtros);

  // ── Pré-contagem: N elegível (outcome + filtros globais, sem restrição de preditores)
  // Serve para calcular o atrito amostral causado por dados ausentes/ignorados.
  const preCountConds = [sql.raw(outcome.sqlWhereExpr), ...filterConds];
  const preCountWhere = preCountConds.length > 1
    ? and(...preCountConds)
    : preCountConds[0];

  let nRaw = 0;
  let latestNotificationDate: string | null = null;
  try {
    const [pcRow] = (await db.execute(
      sql`SELECT COUNT(*)::int AS n, MAX(dt_notific)::text AS latest_notification_date FROM fato_caso_srag WHERE ${preCountWhere}`,
    )) as unknown as { n: number; latest_notification_date: string | null }[];
    nRaw = Number(pcRow?.n ?? 0);
    latestNotificationDate = pcRow?.latest_notification_date ?? null;
  } catch {
    // Não crítico — apenas o atrito não será reportado
  }

  // SELECT da CTE base: preditores + coluna de outcome
  const baseSelectCols = [
    ...preds.map((p) => p.sqlSelectExpr),
    outcome.sqlOutcomeColumn,
  ].join(",\n    ");

  // WHERE da CTE base
  const baseWhereConds = [
    sql.raw(outcome.sqlWhereExpr),
    ...preds.map((p) => sql.raw(p.sqlWhereExpr)),
    ...filterConds,
  ];
  const baseWhere = baseWhereConds.length > 1
    ? and(...baseWhereConds)
    : baseWhereConds[0];

  // GROUP BY / SELECT externo
  const outerCols = preds.map((p) => p.sqlGroupByExpr).join(", ");

  // WHERE externo (apenas faixa_etaria IS NOT NULL quando aplicável)
  const outerWhereParts: ReturnType<typeof sql.raw>[] = [];
  if (hasFaixa) outerWhereParts.push(sql.raw("faixa_etaria IS NOT NULL"));

  const outerWhereSQL =
    outerWhereParts.length > 0
      ? sql`WHERE ${and(...outerWhereParts)}`
      : sql``;

  const query = sql`
    WITH base AS (
      SELECT
        ${sql.raw(baseSelectCols)}
      FROM fato_caso_srag
      WHERE ${baseWhere}
    )
    SELECT
      ${sql.raw(outerCols)},
      COUNT(*)::int                              AS n,
      SUM(${sql.raw(outcome.sqlEventsExpr)})::int AS events
    FROM base
    ${outerWhereSQL}
    GROUP BY ${sql.raw(outerCols)}
    ORDER BY ${sql.raw(outerCols)}
  `;

  let rows: Record<string, unknown>[];
  try {
    rows = (await db.execute(query)) as unknown as Record<string, unknown>[];
  } catch (err) {
    console.error("[regressao] SQL error", err);
    return NextResponse.json({ error: "Erro ao consultar banco de dados" }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nenhum dado para os filtros selecionados. Verifique os filtros e tente novamente." },
      { status: 422 },
    );
  }

  // ── Construção da matriz de design ───────────────────────────────────────

  const X: number[][] = [];
  const y: number[]   = [];
  const w: number[]   = [];

  for (const row of rows) {
    const n      = Number(row.n      ?? 0);
    const events = Number(row.events ?? 0);
    if (n === 0) continue;

    const xRow: number[] = [1]; // intercepto
    let valid = true;

    for (const pred of preds) {
      for (const col of pred.colunas) {
        const v = col.encode(row);
        if (isNaN(v)) { valid = false; break; }
        xRow.push(v);
      }
      if (!valid) break;
    }

    if (valid) {
      X.push(xRow);
      y.push(events);
      w.push(n);
    }
  }

  if (X.length < 2) {
    return NextResponse.json(
      { error: "Padrões de covariáveis insuficientes. Tente remover preditores raros." },
      { status: 422 },
    );
  }

  // Nomes das colunas da matriz
  const nomes = [
    "(Intercepto)",
    ...preds.flatMap((p) => p.colunas.map((c) => c.nome)),
  ];

  // ── Ajuste do modelo ──────────────────────────────────────────────────────

  const avisos: string[] = [];
  let resultado;
  try {
    resultado = fitLogistic(X, y, w, nomes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro no ajuste do modelo" },
      { status: 422 },
    );
  }

  if (!resultado.converged) {
    avisos.push("Modelo não convergiu completamente. Resultados podem ser instáveis.");
  }
  if (ausenteComoAusencia) {
    avisos.push("Reprodução publicada: somente código 1 conta como presença; ausente/ignorado é tratado como ausência. Essa suposição pode introduzir erro de classificação.");
  }
  if (resultado.n < 200) {
    avisos.push(`N = ${resultado.n} — amostra pequena. Interprete com cautela.`);
  }
  resultado.coeficientes.forEach((c) => {
    if (!c.isIntercept && (Math.abs(c.beta) > 8 || c.se > 3)) {
      avisos.push(`"${c.nome}": possível separação completa — estimativa instável.`);
    }
  });

  const parameterCount = resultado.coeficientes.filter((coefficient) => !coefficient.isIntercept).length;
  const eventsPerParameter = parameterCount > 0 ? resultado.events / parameterCount : resultado.events;
  if (eventsPerParameter < 10) {
    avisos.push(`Apenas ${eventsPerParameter.toFixed(1)} eventos por parâmetro; estimativas e intervalos podem ser instáveis.`);
  }

  // ── Monta lista de linhas para exibição (com categorias de referência) ─────

  const linhas: LinhaResultado[] = [];
  let idx = 1; // pula intercepto

  const refRow: Omit<LinhaResultado, "nome"> = {
    beta: 0, se: 0, aOR: 1, ci95Low: 1, ci95High: 1,
    z: NaN, pValue: NaN, isIntercept: false, isReferencia: true,
  };

  for (const pred of preds) {
    if (pred.colunas.length > 1) {
      // Variável categórica (faixa_etaria) — referência primeiro, depois dummies
      linhas.push({ ...refRow, nome: pred.refLabel });
      for (let i = 0; i < pred.colunas.length; i++) {
        linhas.push(resultado.coeficientes[idx++]);
      }
    } else {
      // Variável binária — coeficiente e depois referência
      linhas.push(resultado.coeficientes[idx++]);
      linhas.push({ ...refRow, nome: pred.refLabel });
    }
  }

  const manifest = await buildAnalysisManifest({
    analysisType: "logistic-regression",
    analysisVersion: REGRESSION_ANALYSIS_VERSION,
    filters: filtros,
    latestNotificationDate,
    cohort: {
      populationN: nRaw,
      effectiveN: resultado.n,
      excludedN: Math.max(0, nRaw - resultado.n),
      events: resultado.events,
    },
    configuration: {
      outcome: outcomeKey,
      predictors: predKeys,
      incluirIgnorado,
      ausenteComoAusencia,
      refFaixa,
      refSexo,
      estimator: "binomial-logit-irls-maximum-likelihood",
      confidenceInterval: "wald-95-percent",
    },
    disclosureControl: {
      rule: "warn-small-or-unstable-models",
      minimumPopulationN: 10,
      suppressed: false,
      warnings: avisos,
    },
    metrics: ["adjusted_odds_ratio", "wald_ci95", "aic", "deviance", "mcfadden_r2", "omnibus", "auc", "hosmer_lemeshow"],
    extra: {},
  });

  return NextResponse.json({
    coeficientes: linhas,
    meta: {
      n:            resultado.n,
      nRaw,
      nExcluded:    Math.max(0, nRaw - resultado.n),
      events:       resultado.events,
      taxaEventos:  resultado.taxaEventos,
      aic:          resultado.aic,
      devianceNull: resultado.devianceNull,
      deviance:     resultado.deviance,
      r2McFadden:   resultado.r2McFadden,
      omnibusChi2:  resultado.omnibusChi2,
      omnibusDf:    resultado.omnibusDf,
      omnibusPValue: resultado.omnibusPValue,
      auc:           resultado.auc,
      hosmerLemeshowChi2: resultado.hosmerLemeshowChi2,
      hosmerLemeshowDf: resultado.hosmerLemeshowDf,
      hosmerLemeshowPValue: resultado.hosmerLemeshowPValue,
      converged:    resultado.converged,
      iteracoes:    resultado.iteracoes,
    },
    outcome: {
      campo:      outcome.campo,
      label:      outcome.label,
      eventLabel: outcome.eventLabel,
    },
    incluirIgnorado: incluirIgnorado && !ausenteComoAusencia,
    ausenteComoAusencia,
    refFaixa,
    refSexo,
    avisos,
    manifest,
  } satisfies RegressaoResponse);
}

// Catálogo exportado para o client
export { PREDITORES, OUTCOMES };
export type { PreditorDef, OutcomeDef };
