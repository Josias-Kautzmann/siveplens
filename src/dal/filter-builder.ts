import { eq, inArray, and, or, lte, gte, isNotNull, isNull, SQL, sql } from "drizzle-orm";
import { fatoCasoSrag } from "@/db/schema";
import {
  CAMPOS_CRITERIO,
  type CampoCriterio,
  FiltrosSRAG,
  faixaEtariaToRange,
} from "@/lib/filter-utils";
import type { ValidationCohortId } from "@/lib/scientific-validation";

const COLUNAS_CRITERIO = Object.fromEntries(
  CAMPOS_CRITERIO.map((campo) => [campo, fatoCasoSrag[campo]]),
) as Record<CampoCriterio, (typeof fatoCasoSrag)[CampoCriterio]>;

function validationCohortCondition(cohort: ValidationCohortId): SQL<unknown> {
  const influenzaPcr = and(eq(fatoCasoSrag.pcr_resul, 1), eq(fatoCasoSrag.pos_pcrflu, 1))!;
  const infant = inArray(fatoCasoSrag.tp_idade, [1, 2]);

  switch (cohort) {
    case "influenza-pcr":
      return influenzaPcr;
    case "influenza-known-outcome":
      return and(influenzaPcr, inArray(fatoCasoSrag.evolucao, [1, 2]))!;
    case "infant-under-one":
      return infant;
    case "infant-under-one-week17":
      return and(infant, eq(fatoCasoSrag.sem_not, 17))!;
    case "infant-classification-missing":
      return and(infant, isNull(fatoCasoSrag.classi_fin))!;
    case "infant-virus-positive":
      return and(
        infant,
        or(
          eq(fatoCasoSrag.pos_pcrflu, 1),
          eq(fatoCasoSrag.pcr_vsr, 1),
          eq(fatoCasoSrag.pcr_adeno, 1),
          eq(fatoCasoSrag.pcr_metap, 1),
          eq(fatoCasoSrag.pcr_rino, 1),
          eq(fatoCasoSrag.pcr_sars2, 1),
          eq(fatoCasoSrag.pcr_boca, 1),
          eq(fatoCasoSrag.pcr_para1, 1),
          eq(fatoCasoSrag.pcr_para2, 1),
          eq(fatoCasoSrag.pcr_para3, 1),
          eq(fatoCasoSrag.pcr_para4, 1),
          eq(fatoCasoSrag.pcr_outro, 1),
        ),
      )!;
    case "infant-virus-positive-known-outcome":
      return and(
        infant,
        eq(fatoCasoSrag.pcr_resul, 1),
        inArray(fatoCasoSrag.evolucao, [1, 2]),
        or(
          eq(fatoCasoSrag.pos_pcrflu, 1),
          eq(fatoCasoSrag.pcr_vsr, 1),
          eq(fatoCasoSrag.pcr_adeno, 1),
          eq(fatoCasoSrag.pcr_metap, 1),
          eq(fatoCasoSrag.pcr_rino, 1),
          eq(fatoCasoSrag.pcr_sars2, 1),
          eq(fatoCasoSrag.pcr_boca, 1),
          eq(fatoCasoSrag.pcr_para1, 1),
          eq(fatoCasoSrag.pcr_para2, 1),
          eq(fatoCasoSrag.pcr_para3, 1),
          eq(fatoCasoSrag.pcr_para4, 1),
          eq(fatoCasoSrag.pcr_outro, 1),
        ),
      )!;
    case "vaccination-eligible":
      return and(
        eq(fatoCasoSrag.tp_idade, 3),
        gte(fatoCasoSrag.nu_idade_n, 60),
        eq(fatoCasoSrag.imunodepre, 1),
        eq(fatoCasoSrag.hospital, 1),
        eq(fatoCasoSrag.nosocomial, 2),
        isNotNull(fatoCasoSrag.dt_interna),
        eq(fatoCasoSrag.classi_fin, 5),
        or(eq(fatoCasoSrag.pcr_sars2, 1), eq(fatoCasoSrag.an_sars2, 1)),
        inArray(fatoCasoSrag.evolucao, [1, 2]),
        gte(fatoCasoSrag.dt_evoluca, "2023-12-31"),
        lte(fatoCasoSrag.dt_evoluca, "2024-12-28"),
      )!;
  }
}

/**
 * Constrói um array de condições Drizzle (SQL[]) a partir do objeto FiltrosSRAG.
 * Pode ser usado dentro de um `and(...)` nas queries da camada DAL.
 */
export function buildFilterConditions(filtros: FiltrosSRAG): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (filtros.coorte_validacao) {
    conditions.push(validationCohortCondition(filtros.coorte_validacao));
  }

  if (filtros.anos_epi?.length) {
    conditions.push(inArray(fatoCasoSrag.ano_epi, filtros.anos_epi));
  } else if (filtros.ano_epi) {
    conditions.push(eq(fatoCasoSrag.ano_epi, filtros.ano_epi));
  }

  if (filtros.semana_epi) {
    conditions.push(eq(fatoCasoSrag.sem_not, filtros.semana_epi));
  }

  if (filtros.sg_uf?.length) {
    conditions.push(inArray(fatoCasoSrag.sg_uf, filtros.sg_uf));
  }

  if (filtros.co_mun_res?.length) {
    conditions.push(inArray(fatoCasoSrag.co_mun_res, filtros.co_mun_res));
  }

  // ── Sexo ───────────────────────────────────────────────────────────────
  if (filtros.cs_sexo) {
    conditions.push(eq(fatoCasoSrag.cs_sexo, filtros.cs_sexo));
  }

  // ── Faixa Etária ───────────────────────────────────────────────────────
  // tp_idade: 1=Dia, 2=Mês, 3=Ano
  // Para converter corretamente:
  //   - tp_idade 1 ou 2 → idade < 1 ano → cai na faixa "0-4"
  //   - tp_idade 3 → nu_idade_n é a idade em anos diretamente
  if (filtros.faixa_etaria) {
    const range = faixaEtariaToRange(filtros.faixa_etaria);
    if (range) {
      if (range.min === 0) {
        // Faixa 0-4: inclui bebês (tp_idade 1 ou 2, qualquer nu_idade_n)
        // + crianças com tp_idade=3 e nu_idade_n entre 0 e max
        conditions.push(
          or(
            inArray(fatoCasoSrag.tp_idade, [1, 2]),
            and(
              eq(fatoCasoSrag.tp_idade, 3),
              lte(fatoCasoSrag.nu_idade_n, range.max)
            )
          )!
        );
      } else {
        // Faixas ≥ 5 anos: tp_idade obrigatoriamente 3 (anos)
        conditions.push(eq(fatoCasoSrag.tp_idade, 3));
        conditions.push(
          sql`${fatoCasoSrag.nu_idade_n} >= ${range.min} AND ${fatoCasoSrag.nu_idade_n} <= ${range.max}`
        );
      }
    }
  }

  // ── Idade customizada (range em anos) ─────────────────────────────────
  // Tem precedência sobre faixa_etaria se ambos estiverem presentes.
  // tp_idade: 1=Dia, 2=Mês → sempre < 1 ano → só incluídos se min=0
  //           3=Ano → nu_idade_n é a idade diretamente
  if (filtros.idade_min !== undefined || filtros.idade_max !== undefined) {
    const min = filtros.idade_min ?? 0;
    const max = filtros.idade_max ?? 999;
    if (min === 0) {
      conditions.push(
        or(
          inArray(fatoCasoSrag.tp_idade, [1, 2]),
          and(
            eq(fatoCasoSrag.tp_idade, 3),
            lte(fatoCasoSrag.nu_idade_n, max),
          ),
        )!,
      );
    } else {
      conditions.push(eq(fatoCasoSrag.tp_idade, 3));
      conditions.push(gte(fatoCasoSrag.nu_idade_n, min));
      if (max < 999) conditions.push(lte(fatoCasoSrag.nu_idade_n, max));
    }
  }

  // ── Classificação Final ────────────────────────────────────────────────
  if (filtros.classi_fin && filtros.classi_fin.length > 0) {
    conditions.push(inArray(fatoCasoSrag.classi_fin, filtros.classi_fin));
  }

  // ── Desfecho (Evolução) ────────────────────────────────────────────────
  if (filtros.evolucao && filtros.evolucao.length > 0) {
    conditions.push(inArray(fatoCasoSrag.evolucao, filtros.evolucao));
  }

  // ── Etiologia (PCR confirmado) ─────────────────────────────────────────
  // Filtra casos onde qualquer patógeno selecionado foi detectado (OR lógico)
  if (filtros.etiologia && filtros.etiologia.length > 0) {
    const clauses: SQL<unknown>[] = [];
    if (filtros.etiologia.includes("flu_a"))
      clauses.push(and(eq(fatoCasoSrag.pos_pcrflu, 1), eq(fatoCasoSrag.tp_flu_pcr, 1))!);
    if (filtros.etiologia.includes("flu_b"))
      clauses.push(and(eq(fatoCasoSrag.pos_pcrflu, 1), eq(fatoCasoSrag.tp_flu_pcr, 2))!);
    if (filtros.etiologia.includes("sars2"))
      clauses.push(eq(fatoCasoSrag.pcr_sars2, 1));
    if (filtros.etiologia.includes("vsr"))
      clauses.push(eq(fatoCasoSrag.pcr_vsr, 1));
    if (filtros.etiologia.includes("rino"))
      clauses.push(eq(fatoCasoSrag.pcr_rino, 1));
    if (filtros.etiologia.includes("metap"))
      clauses.push(eq(fatoCasoSrag.pcr_metap, 1));
    if (clauses.length) conditions.push(or(...clauses)!);
  }

  // ── Intervalo de datas (DD-MM dentro do ano activo) ───────────────────
  // Só se aplica quando exatamente um ano está selecionado
  const yearForDate = filtros.ano_epi ?? (filtros.anos_epi?.length === 1 ? filtros.anos_epi[0] : undefined);
  if ((filtros.data_ini || filtros.data_fim) && yearForDate) {
    const year = yearForDate;
    if (filtros.data_ini) {
      const [dd, mm] = filtros.data_ini.split("-").map(Number);
      if (dd && mm) {
        const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        conditions.push(gte(fatoCasoSrag.dt_notific, iso));
      }
    }
    if (filtros.data_fim) {
      const [dd, mm] = filtros.data_fim.split("-").map(Number);
      if (dd && mm) {
        const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        conditions.push(lte(fatoCasoSrag.dt_notific, iso));
      }
    }
  }

  // ── Critérios categóricos adicionais ─────────────────────────────────
  // Útil para definir coortes descritivas, por exemplo diabetes=1.
  // Campos e valores passam por allowlist; entradas inválidas são ignoradas.
  for (const criterio of filtros.criterios ?? []) {
    const coluna = COLUNAS_CRITERIO[criterio.campo];
    const valores = [...new Set(criterio.valores)]
      .filter((valor) => Number.isInteger(valor));
    if (!coluna || valores.length === 0) continue;
    conditions.push(inArray(coluna, valores));
  }

  return conditions;
}
