import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { fatoCasosSemanaMun, fatoCasoSrag, controleCarga, dimMunicipio } from "@/db/schema";
import { eq, and, or, inArray, isNotNull, gte, sql, desc, type SQL } from "drizzle-orm";
import { buildFilterConditions } from "./filter-builder";
import { FiltrosSRAG } from "@/lib/filter-utils";
import { FAIXA_CASE } from "@/lib/faixa-etaria";

// ─── CACHE KEY HELPER ────────────────────────────────────────────────────────

/**
 * Produz uma string JSON compacta e estável a partir de FiltrosSRAG.
 * Arrays são ordenados para garantir que ["SP","RJ"] e ["RJ","SP"] gerem a
 * mesma chave — evitando cache miss desnecessário.
 */
function normalizeFiltros(f: FiltrosSRAG): string {
  return JSON.stringify({
    ano_epi:      f.ano_epi      ?? null,
    anos_epi:     f.anos_epi     ? [...f.anos_epi].sort((a, b) => a - b) : null,
    semana_epi:   f.semana_epi   ?? null,
    sg_uf:        f.sg_uf        ? [...f.sg_uf].sort()        : null,
    co_mun_res:   f.co_mun_res   ? [...f.co_mun_res].sort()   : null,
    cs_sexo:      f.cs_sexo      ?? null,
    faixa_etaria: f.faixa_etaria ?? null,
    idade_min:    f.idade_min    ?? null,
    idade_max:    f.idade_max    ?? null,
    classi_fin:   f.classi_fin   ? [...f.classi_fin].sort((a, b) => a - b) : null,
    evolucao:     f.evolucao     ? [...f.evolucao].sort((a, b) => a - b)   : null,
    etiologia:    f.etiologia    ? [...f.etiologia].sort()    : null,
    data_ini:     f.data_ini     ?? null,
    data_fim:     f.data_fim     ?? null,
    criterios:    f.criterios
      ? [...f.criterios]
          .map((item) => ({ campo: item.campo, valores: [...item.valores].sort((a, b) => a - b) }))
          .sort((a, b) => a.campo.localeCompare(b.campo))
      : null,
    coorte_validacao: f.coorte_validacao ?? null,
  });
}

// ─── QUERIES ────────────────────────────────────────────────────────────────

/**
 * Série temporal semanal para uma UF — lê da tabela pré-agregada.
 * Usado pelo dashboard para renderizar curvas epidemiológicas.
 */
export async function getSerieTemporalUF(uf: string, anoEpi?: number) {
  const conditions = [eq(fatoCasosSemanaMun.sg_uf, uf)];
  if (anoEpi) conditions.push(eq(fatoCasosSemanaMun.ano_epi, anoEpi));

  return db
    .select({
      ano_epi:           fatoCasosSemanaMun.ano_epi,
      sem_not:           fatoCasosSemanaMun.sem_not,
      classi_fin:        fatoCasosSemanaMun.classi_fin,
      total_casos:       sql<number>`SUM(${fatoCasosSemanaMun.total_casos})`.as("total_casos"),
      total_obitos:      sql<number>`SUM(${fatoCasosSemanaMun.total_obitos})`.as("total_obitos"),
      total_uti:         sql<number>`SUM(${fatoCasosSemanaMun.total_uti})`.as("total_uti"),
      total_internacoes: sql<number>`SUM(${fatoCasosSemanaMun.total_internacoes})`.as("total_internacoes"),
    })
    .from(fatoCasosSemanaMun)
    .where(and(...conditions))
    .groupBy(
      fatoCasosSemanaMun.ano_epi,
      fatoCasosSemanaMun.sem_not,
      fatoCasosSemanaMun.classi_fin,
    )
    .orderBy(fatoCasosSemanaMun.ano_epi, fatoCasosSemanaMun.sem_not);
}

/**
 * Distribuição por município para um estado e período — lê da tabela pré-agregada.
 * Usado para colorir o mapa (choropleth).
 */
export async function getCasosByMunicipio(
  uf: string,
  anoEpi: number,
  semNot?: number,
) {
  const conditions = [
    eq(fatoCasosSemanaMun.sg_uf, uf),
    eq(fatoCasosSemanaMun.ano_epi, anoEpi),
  ];
  if (semNot) conditions.push(eq(fatoCasosSemanaMun.sem_not, semNot));

  return db
    .select({
      co_mun_res:        fatoCasosSemanaMun.co_mun_res,
      total_casos:       sql<number>`SUM(${fatoCasosSemanaMun.total_casos})`.as("total_casos"),
      total_obitos:      sql<number>`SUM(${fatoCasosSemanaMun.total_obitos})`.as("total_obitos"),
    })
    .from(fatoCasosSemanaMun)
    .where(and(...conditions))
    .groupBy(fatoCasosSemanaMun.co_mun_res);
}

/**
 * Panorama geral para o dashboard principal.
 * Consulta fato_caso_srag diretamente — funciona mesmo quando as tabelas
 * pré-agregadas ainda não foram populadas pelo ETL.
 * sem_not está 100% preenchido; usa-o para a série temporal.
 */
const _getPanoramaGeralCached = unstable_cache(
  async (filtrosKey: string) => {
    const filtros: FiltrosSRAG = JSON.parse(filtrosKey);
    const baseConditions = buildFilterConditions(filtros);

    // KPIs totais
    const [kpiRow] = await db
      .select({
        total_casos:       sql<number>`COUNT(*)`,
        total_obitos:      sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2)`,
        total_uti:         sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.uti} = 1)`,
        total_internacoes: sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.hospital} = 1)`,
        sem_mais_recente:  sql<number>`MAX(${fatoCasoSrag.sem_not})`,
        ano_mais_recente:  sql<number>`MAX(${fatoCasoSrag.ano_epi})`,
      })
      .from(fatoCasoSrag)
      .where(baseConditions.length ? and(...baseConditions) : undefined);

    // Série temporal por semana (sem_not está sempre preenchido)
    const serieConditions = [
      isNotNull(fatoCasoSrag.sem_not),
      ...baseConditions
    ];

    const serie = await db
      .select({
        sem_not:           fatoCasoSrag.sem_not,
        total_casos:       sql<number>`COUNT(*)`,
        total_obitos:      sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2)`,
        total_uti:         sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.uti} = 1)`,
        total_internacoes: sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.hospital} = 1)`,
      })
      .from(fatoCasoSrag)
      .where(and(...serieConditions))
      .groupBy(fatoCasoSrag.sem_not)
      .orderBy(fatoCasoSrag.sem_not);

    const totalCasos  = Number(kpiRow?.total_casos  ?? 0);
    const totalObitos = Number(kpiRow?.total_obitos ?? 0);

    return {
      kpis: {
        total_casos:       totalCasos,
        total_obitos:      totalObitos,
        taxa_letalidade:   totalCasos > 0 ? (totalObitos / totalCasos) * 100 : 0,
        total_uti:         Number(kpiRow?.total_uti         ?? 0),
        total_internacoes: Number(kpiRow?.total_internacoes ?? 0),
      },
      serie: serie.map((s) => ({
        sem_not:           s.sem_not,
        total_casos:       Number(s.total_casos),
        total_obitos:      Number(s.total_obitos),
        total_uti:         Number(s.total_uti),
        total_internacoes: Number(s.total_internacoes),
      })),
      meta: {
        ano: Number(kpiRow?.ano_mais_recente ?? new Date().getFullYear()),
        sem_mais_recente: kpiRow?.sem_mais_recente ?? null,
      },
    };
  },
  ["panorama-geral"],
  { revalidate: 300 },
);

export function getPanoramaGeral(filtros: FiltrosSRAG = {}) {
  return _getPanoramaGeralCached(normalizeFiltros(filtros));
}

export type PanoramaGeral = Awaited<ReturnType<typeof getPanoramaGeral>>;

/** Anos disponíveis no banco — usado pelo seletor de ano no dashboard. */
export const getAnosDisponiveis = unstable_cache(
  async () => {
    const rows = await db
      .selectDistinct({ ano_epi: fatoCasoSrag.ano_epi })
      .from(fatoCasoSrag)
      .where(isNotNull(fatoCasoSrag.ano_epi))
      .orderBy(fatoCasoSrag.ano_epi);
    return rows.map((r) => Number(r.ano_epi));
  },
  ["anos-disponiveis"],
  { revalidate: 3600 },
);

/**
 * Série temporal por semana com breakdown por agente etiológico.
 * Agrupa por (ano_epi, sem_not) para evitar sobreposição de anos.
 */
const _getCurvaEtiologicaCached = unstable_cache(
  async (filtrosKey: string) => {
    const filtros: FiltrosSRAG = JSON.parse(filtrosKey);
    const conditions: SQL<unknown>[] = [isNotNull(fatoCasoSrag.sem_not)];
    conditions.push(...buildFilterConditions(filtros));

    const rows = await db
      .select({
        ano_epi: fatoCasoSrag.ano_epi,
        sem_not: fatoCasoSrag.sem_not,
        total:   sql<number>`COUNT(*)`,
        flu_a:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 1)`,
        flu_b:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 2)`,
        sars2:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_sars2} = 1)`,
        vsr:     sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_vsr} = 1)`,
        rino:    sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_rino} = 1)`,
        metap:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_metap} = 1)`,
        obitos:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2)`,
        // Casos sem identificação laboratorial de nenhum dos vírus rastreados
        nao_id:  sql<number>`COUNT(*) FILTER (WHERE
          COALESCE(${fatoCasoSrag.pos_pcrflu}, 0) != 1 AND
          COALESCE(${fatoCasoSrag.pcr_sars2},  0) != 1 AND
          COALESCE(${fatoCasoSrag.pcr_vsr},    0) != 1 AND
          COALESCE(${fatoCasoSrag.pcr_rino},   0) != 1 AND
          COALESCE(${fatoCasoSrag.pcr_metap},  0) != 1
        )`,
      })
      .from(fatoCasoSrag)
      .where(and(...conditions))
      .groupBy(fatoCasoSrag.ano_epi, fatoCasoSrag.sem_not)
      .orderBy(fatoCasoSrag.ano_epi, fatoCasoSrag.sem_not);

    return rows.map((r) => ({
      ano_epi: r.ano_epi,
      sem_not: r.sem_not,
      total:   Number(r.total),
      flu_a:   Number(r.flu_a),
      flu_b:   Number(r.flu_b),
      sars2:   Number(r.sars2),
      vsr:     Number(r.vsr),
      rino:    Number(r.rino),
      metap:   Number(r.metap),
      obitos:  Number(r.obitos),
      nao_id:  Number(r.nao_id),
    }));
  },
  ["curva-etiologica"],
  { revalidate: 300 },
);

export function getCurvaEtiologica(filtros: FiltrosSRAG = {}) {
  return _getCurvaEtiologicaCached(normalizeFiltros(filtros));
}

export type PontoCurva = Awaited<ReturnType<typeof getCurvaEtiologica>>[number];

/**
 * Prevalência por agente etiológico nas últimas N semanas.
 * Considera apenas casos com PCR positivo (pcr_resul = 1).
 * Replica o bloco "Prevalência de casos e óbitos" do InfoGripe.
 */
const _getPrevalenciaRecenteCached = unstable_cache(
  async (nSemanas: number, filtrosKey: string) => {
    const filtros: FiltrosSRAG = JSON.parse(filtrosKey);
    const baseConditions = buildFilterConditions(filtros);

    // MAX(sem_not) must respect the same year filter to avoid cross-year contamination
    // (e.g. 2024 has SE 52 but 2026 only has SE 1–20, causing 0 results if unfiltered)
    const [maxRow] = await db
      .select({ max_sem: sql<number>`MAX(${fatoCasoSrag.sem_not})` })
      .from(fatoCasoSrag)
      .where(baseConditions.length ? and(...baseConditions) : undefined);

    const maxSem = Number(maxRow?.max_sem ?? 11);
    const minSem = maxSem - nSemanas + 1;

    const conditions: SQL<unknown>[] = [
      isNotNull(fatoCasoSrag.sem_not),
      gte(fatoCasoSrag.sem_not, minSem),
      ...baseConditions,
    ];

    const [row] = await db
      .select({
        total_casos:  sql<number>`COUNT(*)`,
        total_pos:    sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_resul} = 1)`,
        flu_a:        sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 1)`,
        flu_b:        sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 2)`,
        sars2:        sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_sars2} = 1)`,
        vsr:          sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_vsr} = 1)`,
        rino:         sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_rino} = 1)`,
        metap:        sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_metap} = 1)`,
        adeno:        sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_adeno} = 1)`,
        // óbitos por agente
        obitos_flu_a: sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2 AND ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 1)`,
        obitos_sars2: sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2 AND ${fatoCasoSrag.pcr_sars2} = 1)`,
        obitos_rino:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2 AND ${fatoCasoSrag.pcr_rino} = 1)`,
        obitos_vsr:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2 AND ${fatoCasoSrag.pcr_vsr} = 1)`,
      })
      .from(fatoCasoSrag)
      .where(and(...conditions));

    return {
      semanas: { min: minSem, max: maxSem },
      total_casos:  Number(row?.total_casos  ?? 0),
      total_pos:    Number(row?.total_pos    ?? 0),
      flu_a:        Number(row?.flu_a        ?? 0),
      flu_b:        Number(row?.flu_b        ?? 0),
      sars2:        Number(row?.sars2        ?? 0),
      vsr:          Number(row?.vsr          ?? 0),
      rino:         Number(row?.rino         ?? 0),
      metap:        Number(row?.metap        ?? 0),
      adeno:        Number(row?.adeno        ?? 0),
      obitos_flu_a: Number(row?.obitos_flu_a ?? 0),
      obitos_sars2: Number(row?.obitos_sars2 ?? 0),
      obitos_rino:  Number(row?.obitos_rino  ?? 0),
      obitos_vsr:   Number(row?.obitos_vsr   ?? 0),
    };
  },
  ["prevalencia-recente"],
  { revalidate: 300 },
);

export function getPrevalenciaRecente(nSemanas = 4, filtros: FiltrosSRAG = {}) {
  return _getPrevalenciaRecenteCached(nSemanas, normalizeFiltros(filtros));
}

export type PrevalenciaRecente = Awaited<ReturnType<typeof getPrevalenciaRecente>>;

/** Casos por UF e semana com breakdown por patógeno — usado pelo mapa coroplético. */
const _getCasosByUFEtioCached = unstable_cache(
  async (anosKey: string, etioKey: string) => {
    const anos     = anosKey ? anosKey.split(",").map(Number) : undefined;
    const etiologia = etioKey ? etioKey.split(",") : undefined;

    const etioClauses: ReturnType<typeof eq>[] = [];
    if (etiologia?.length) {
      if (etiologia.includes("flu_a")) etioClauses.push(and(eq(fatoCasoSrag.pos_pcrflu, 1), eq(fatoCasoSrag.tp_flu_pcr, 1)) as ReturnType<typeof eq>);
      if (etiologia.includes("flu_b")) etioClauses.push(and(eq(fatoCasoSrag.pos_pcrflu, 1), eq(fatoCasoSrag.tp_flu_pcr, 2)) as ReturnType<typeof eq>);
      if (etiologia.includes("sars2")) etioClauses.push(eq(fatoCasoSrag.pcr_sars2, 1));
      if (etiologia.includes("vsr"))   etioClauses.push(eq(fatoCasoSrag.pcr_vsr, 1));
      if (etiologia.includes("rino"))  etioClauses.push(eq(fatoCasoSrag.pcr_rino, 1));
      if (etiologia.includes("metap")) etioClauses.push(eq(fatoCasoSrag.pcr_metap, 1));
    }

    const conditions = [
      isNotNull(fatoCasoSrag.sg_uf),
      isNotNull(fatoCasoSrag.sem_not),
      ...(anos?.length ? [inArray(fatoCasoSrag.ano_epi, anos)] : []),
      ...(etioClauses.length ? [or(...etioClauses)!] : []),
    ];
    const rows = await db
      .select({
        sg_uf:   fatoCasoSrag.sg_uf,
        sem_not: fatoCasoSrag.sem_not,
        flu_a:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 1)`,
        flu_b:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pos_pcrflu} = 1 AND ${fatoCasoSrag.tp_flu_pcr} = 2)`,
        sars2:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_sars2} = 1)`,
        vsr:    sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_vsr}   = 1)`,
        rino:   sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_rino}  = 1)`,
        metap:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_metap} = 1)`,
      })
      .from(fatoCasoSrag)
      .where(and(...conditions))
      .groupBy(fatoCasoSrag.sg_uf, fatoCasoSrag.sem_not)
      .orderBy(fatoCasoSrag.sg_uf, fatoCasoSrag.sem_not);

    return rows.map((r) => ({
      sg_uf:   r.sg_uf!,
      sem_not: r.sem_not!,
      flu_a:  Number(r.flu_a),
      flu_b:  Number(r.flu_b),
      sars2:  Number(r.sars2),
      vsr:    Number(r.vsr),
      rino:   Number(r.rino),
      metap:  Number(r.metap),
    }));
  },
  ["casos-uf-etio"],
  { revalidate: 1800 },
);

export function getCasosByUFEtio(anos?: number[], etiologia?: string[]) {
  const anosKey = anos?.length ? [...anos].sort((a, b) => a - b).join(",") : "";
  const etioKey = etiologia?.length ? [...etiologia].sort().join(",") : "";
  return _getCasosByUFEtioCached(anosKey, etioKey);
}

export type DadoUFEtio = Awaited<ReturnType<typeof getCasosByUFEtio>>[number];

/** Última carga ETL bem-sucedida — usada pelo footer do dashboard. */
export const getUltimaCarga = unstable_cache(
  async () => {
    const [row] = await db
      .select()
      .from(controleCarga)
      .where(eq(controleCarga.status, "sucesso"))
      .orderBy(desc(controleCarga.concluido_em))
      .limit(1);
    return row ?? null;
  },
  ["ultima-carga"],
  { revalidate: 3600 },
);

export type UltimaCarga = Awaited<ReturnType<typeof getUltimaCarga>>;

/** Nome e UF de um município pelo código IBGE (6 dígitos). */
export async function getNomeMunicipio(co_ibge: string) {
  const [row] = await db
    .select({ no_municipio: dimMunicipio.no_municipio, sg_uf: dimMunicipio.sg_uf })
    .from(dimMunicipio)
    .where(eq(dimMunicipio.co_ibge, co_ibge))
    .limit(1);
  return row ?? null;
}

// ─── PIRÂMIDE ETÁRIA ─────────────────────────────────────────────────────────

// Re-exporta para compatibilidade com importações existentes
export { FAIXA_CASE };

/**
 * Contagem de casos por faixa etária e sexo.
 * Usado pela pirâmide etária do Laboratório Estatístico.
 */
const _getPiramideEtariaCached = unstable_cache(
  async (filtrosKey: string) => {
    const filtros: FiltrosSRAG = JSON.parse(filtrosKey);
    const conditions = buildFilterConditions(filtros);
    const whereSQL   = conditions.length ? and(...conditions) : sql`TRUE`;

    const rows = await db.execute(sql`
      SELECT faixa, sexo, n
      FROM (
        SELECT
          (${sql.raw(FAIXA_CASE)}) AS faixa,
          cs_sexo                  AS sexo,
          COUNT(*)::int            AS n
        FROM fato_caso_srag
        WHERE ${whereSQL}
          AND tp_idade    IS NOT NULL
          AND nu_idade_n  IS NOT NULL
          AND cs_sexo     IN ('M', 'F')
        GROUP BY faixa, sexo
      ) sub
      WHERE faixa IS NOT NULL
      ORDER BY faixa, sexo
    `) as unknown as { faixa: string; sexo: string; n: number }[];

    return rows;
  },
  ["piramide-etaria"],
  { revalidate: 600 },
);

export function getPiramideEtaria(filtros: FiltrosSRAG) {
  return _getPiramideEtariaCached(normalizeFiltros(filtros));
}

export type PiramideDado = Awaited<ReturnType<typeof getPiramideEtaria>>[number];

// ─── PERFIL SINTOMATOLÓGICO ───────────────────────────────────────────────────

export const SINTOMAS_PERFIL = [
  { campo: "febre",     label: "Febre"                     },
  { campo: "tosse",     label: "Tosse"                     },
  { campo: "dispneia",  label: "Dispneia"                   },
  { campo: "desc_resp", label: "Desconforto respiratório"  },
  { campo: "saturacao", label: "Saturação O₂ < 95%"        },
  { campo: "garganta",  label: "Dor de garganta"           },
  { campo: "fadiga",    label: "Fadiga"                    },
  { campo: "diarreia",  label: "Diarreia"                  },
  { campo: "vomito",    label: "Vômito"                    },
  { campo: "perd_olft", label: "Perda de olfato",  nota: "Específico de COVID-19" },
  { campo: "perd_pala", label: "Perda de paladar", nota: "Específico de COVID-19" },
] as const;

export interface PerfilSintoma {
  campo:  string;
  label:  string;
  nota?:  string;
  nSim:   number;   // casos com sintoma (total)
  nCura:  number;   // casos com sintoma E evolucao=1
  nObito: number;   // casos com sintoma E evolucao=2
}

export interface PerfilResult {
  sintomas:   PerfilSintoma[];
  totalN:     number;
  totalCura:  number;
  totalObito: number;
}

/**
 * Prevalência de cada sintoma na amostra filtrada, com breakdown por desfecho.
 * Usa uma única query de agregação — rápido mesmo em 300k+ linhas.
 */
const _getPerfilSintomatologicoCached = unstable_cache(
  async (filtrosKey: string): Promise<PerfilResult> => {
    const filtros: FiltrosSRAG = JSON.parse(filtrosKey);
    const conditions = buildFilterConditions(filtros);
    const whereSQL   = conditions.length ? and(...conditions) : sql`TRUE`;

    // Gera dinamicamente os SUM(CASE WHEN ...) para cada sintoma × grupo
    const selectCols = SINTOMAS_PERFIL.flatMap(({ campo }) => [
      `SUM(CASE WHEN ${campo} = 1 THEN 1 ELSE 0 END)::int                          AS ${campo}_sim`,
      `SUM(CASE WHEN ${campo} = 1 AND evolucao = 1 THEN 1 ELSE 0 END)::int          AS ${campo}_cura`,
      `SUM(CASE WHEN ${campo} = 1 AND evolucao = 2 THEN 1 ELSE 0 END)::int          AS ${campo}_obito`,
    ]).join(",\n    ");

    const [row] = await db.execute(sql`
      SELECT
        ${sql.raw(selectCols)},
        COUNT(*)::int                                                       AS n_total,
        SUM(CASE WHEN evolucao = 1 THEN 1 ELSE 0 END)::int                  AS n_cura,
        SUM(CASE WHEN evolucao = 2 THEN 1 ELSE 0 END)::int                  AS n_obito
      FROM fato_caso_srag
      WHERE ${whereSQL}
    `) as unknown as Record<string, number>[];

    const r = row ?? {};

    const sintomas: PerfilSintoma[] = SINTOMAS_PERFIL.map(({ campo, label, ...rest }) => ({
      campo,
      label,
      ...("nota" in rest ? { nota: (rest as { nota: string }).nota } : {}),
      nSim:   r[`${campo}_sim`]   ?? 0,
      nCura:  r[`${campo}_cura`]  ?? 0,
      nObito: r[`${campo}_obito`] ?? 0,
    }));

    return {
      sintomas,
      totalN:     r.n_total ?? 0,
      totalCura:  r.n_cura  ?? 0,
      totalObito: r.n_obito ?? 0,
    };
  },
  ["perfil-sintomatologico"],
  { revalidate: 600 },
);

export function getPerfilSintomatologico(filtros: FiltrosSRAG): Promise<PerfilResult> {
  return _getPerfilSintomatologicoCached(normalizeFiltros(filtros));
}

// ─── TIPOS ──────────────────────────────────────────────────────────────────

export type NovoCasoSrag = typeof fatoCasoSrag.$inferInsert;
