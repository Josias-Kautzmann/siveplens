import { db } from "@/db";
import { fatoCasoSrag, controleCarga } from "@/db/schema";
import { sql, desc, isNotNull } from "drizzle-orm";

export async function getEtlHistory(limit = 8) {
  return db
    .select({
      id:              controleCarga.id,
      iniciado_em:     controleCarga.iniciado_em,
      concluido_em:    controleCarga.concluido_em,
      fonte:           controleCarga.fonte,
      status:          controleCarga.status,
      dt_fim_busca:    controleCarga.dt_fim_busca,
      total_inseridos: controleCarga.total_inseridos,
      erro_mensagem:   controleCarga.erro_mensagem,
    })
    .from(controleCarga)
    .orderBy(desc(controleCarga.iniciado_em))
    .limit(limit);
}

export async function getDbSummary() {
  const [totais] = await db
    .select({
      total:   sql<number>`COUNT(*)`,
      min_sem: sql<number>`MIN(${fatoCasoSrag.sem_not})`,
      max_sem: sql<number>`MAX(${fatoCasoSrag.sem_not})`,
    })
    .from(fatoCasoSrag);

  const porAno = await db
    .select({
      ano_epi: fatoCasoSrag.ano_epi,
      total:   sql<number>`COUNT(*)`,
      obitos:  sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.evolucao} = 2)`,
      com_pcr: sql<number>`COUNT(*) FILTER (WHERE ${fatoCasoSrag.pcr_resul} IS NOT NULL)`,
    })
    .from(fatoCasoSrag)
    .where(isNotNull(fatoCasoSrag.ano_epi))
    .groupBy(fatoCasoSrag.ano_epi)
    .orderBy(fatoCasoSrag.ano_epi);

  return { totais, porAno };
}

export async function getFieldCoverage() {
  const [row] = await db
    .select({
      total:      sql<number>`COUNT(*)`,
      // Localização
      sg_uf:      sql<number>`COUNT(${fatoCasoSrag.sg_uf})`,
      co_mun_res: sql<number>`COUNT(${fatoCasoSrag.co_mun_res})`,
      sem_not:    sql<number>`COUNT(${fatoCasoSrag.sem_not})`,
      // Demográfico
      cs_sexo:    sql<number>`COUNT(${fatoCasoSrag.cs_sexo})`,
      nu_idade_n: sql<number>`COUNT(${fatoCasoSrag.nu_idade_n})`,
      cs_raca:    sql<number>`COUNT(${fatoCasoSrag.cs_raca})`,
      cs_gestant: sql<number>`COUNT(${fatoCasoSrag.cs_gestant})`,
      cs_escol_n: sql<number>`COUNT(${fatoCasoSrag.cs_escol_n})`,
      // Sintomas
      febre:      sql<number>`COUNT(${fatoCasoSrag.febre})`,
      tosse:      sql<number>`COUNT(${fatoCasoSrag.tosse})`,
      dispneia:   sql<number>`COUNT(${fatoCasoSrag.dispneia})`,
      saturacao:  sql<number>`COUNT(${fatoCasoSrag.saturacao})`,
      // Comorbidades
      cardiopati: sql<number>`COUNT(${fatoCasoSrag.cardiopati})`,
      diabetes:   sql<number>`COUNT(${fatoCasoSrag.diabetes})`,
      obesidade:  sql<number>`COUNT(${fatoCasoSrag.obesidade})`,
      imunodepre: sql<number>`COUNT(${fatoCasoSrag.imunodepre})`,
      renal:      sql<number>`COUNT(${fatoCasoSrag.renal})`,
      asma:       sql<number>`COUNT(${fatoCasoSrag.asma})`,
      // Hospitalização
      hospital:   sql<number>`COUNT(${fatoCasoSrag.hospital})`,
      uti:        sql<number>`COUNT(${fatoCasoSrag.uti})`,
      suport_ven: sql<number>`COUNT(${fatoCasoSrag.suport_ven})`,
      // Vacinação
      vacina:     sql<number>`COUNT(${fatoCasoSrag.vacina})`,
      vacina_cov: sql<number>`COUNT(${fatoCasoSrag.vacina_cov})`,
      // Laboratório
      amostra:    sql<number>`COUNT(${fatoCasoSrag.amostra})`,
      pcr_resul:  sql<number>`COUNT(${fatoCasoSrag.pcr_resul})`,
      pos_pcrflu: sql<number>`COUNT(${fatoCasoSrag.pos_pcrflu})`,
      pcr_sars2:  sql<number>`COUNT(${fatoCasoSrag.pcr_sars2})`,
      pcr_vsr:    sql<number>`COUNT(${fatoCasoSrag.pcr_vsr})`,
      pcr_rino:   sql<number>`COUNT(${fatoCasoSrag.pcr_rino})`,
      pcr_metap:  sql<number>`COUNT(${fatoCasoSrag.pcr_metap})`,
      pcr_adeno:  sql<number>`COUNT(${fatoCasoSrag.pcr_adeno})`,
      antiviral:  sql<number>`COUNT(${fatoCasoSrag.antiviral})`,
      // Desfecho
      classi_fin: sql<number>`COUNT(${fatoCasoSrag.classi_fin})`,
      criterio:   sql<number>`COUNT(${fatoCasoSrag.criterio})`,
      evolucao:   sql<number>`COUNT(${fatoCasoSrag.evolucao})`,
    })
    .from(fatoCasoSrag);

  return row!;
}

export type EtlRun     = Awaited<ReturnType<typeof getEtlHistory>>[number];
export type DbSummary  = Awaited<ReturnType<typeof getDbSummary>>;
export type FieldCoverage = Awaited<ReturnType<typeof getFieldCoverage>>;
