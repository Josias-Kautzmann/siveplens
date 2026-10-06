import {
  pgTable,
  char,
  text,
  smallint,
  integer,
  bigint,
  real,
  date,
  timestamp,
  jsonb,
  index,
  serial,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

// ─── DIMENSÃO GEOGRÁFICA ─────────────────────────────────────────────────────
// Fonte: ccmec25a64.csv — estática, ~5.571 municípios
export const dimMunicipio = pgTable("dim_municipio", {
  co_ibge:          char("co_ibge",          { length: 6 }).primaryKey(),
  no_municipio:     text("no_municipio").notNull(),
  co_uf:            smallint("co_uf"),
  sg_uf:            char("sg_uf",            { length: 2 }).notNull(),
  no_uf:            text("no_uf").notNull(),
  co_regiao_saude:  integer("co_regiao_saude"),
  no_regiao_saude:  text("no_regiao_saude"),
  co_macro:         integer("co_macro"),
  no_macro:         text("no_macro"),
  co_regiao_brasil: smallint("co_regiao_brasil"),
  no_regiao_brasil: text("no_regiao_brasil"),
  sg_regiao_brasil: char("sg_regiao_brasil", { length: 2 }),
});

// ─── FATO: CASOS INDIVIDUAIS SRAG ────────────────────────────────────────────
// Fonte: INFLUD (SIVEP-Gripe) — 1 linha por notificação
// Codificação SINAN: 1=Sim  2=Não  9=Ignorado  (preservado como SMALLINT)
// ~335k linhas por arquivo anual
export const fatoCasoSrag = pgTable(
  "fato_caso_srag",
  {
    // ── Identificação ─────────────────────────────────────────────────────
    nu_notific:  bigint("nu_notific",  { mode: "number" }).primaryKey(),
    dt_notific:  date("dt_notific"),
    sem_not:     smallint("sem_not"),
    ano_epi:     smallint("ano_epi"),            // derivado de dt_notific no ETL
    dt_sin_pri:  date("dt_sin_pri"),
    sem_pri:     smallint("sem_pri"),
    dt_digita:   date("dt_digita"),              // inclusão inicial; não é histórico de correções
    dt_encerra:  date("dt_encerra"),

    // ── Localização ───────────────────────────────────────────────────────
    sg_uf:       char("sg_uf",       { length: 2 }),
    co_mun_not:  char("co_mun_not",  { length: 6 }),
    co_mun_res:  char("co_mun_res",  { length: 6 })
                   .references(() => dimMunicipio.co_ibge),

    // ── Demográfico ───────────────────────────────────────────────────────
    cs_sexo:     char("cs_sexo",     { length: 1 }), // F | M | I
    nu_idade_n:  smallint("nu_idade_n"),
    tp_idade:    smallint("tp_idade"),               // 1=dia 2=mês 3=ano
    cs_raca:     smallint("cs_raca"),                // 1=Branca 2=Preta 3=Amarela 4=Parda 5=Indígena
    cs_gestant:  smallint("cs_gestant"),             // 1-3=trimestre 5=NP 6=NI 9=Ign
    cs_escol_n:  smallint("cs_escol_n"),

    // ── Sintomas ──────────────────────────────────────────────────────────
    febre:       smallint("febre"),
    tosse:       smallint("tosse"),
    dispneia:    smallint("dispneia"),
    desc_resp:   smallint("desc_resp"),
    saturacao:   smallint("saturacao"),
    garganta:    smallint("garganta"),
    diarreia:    smallint("diarreia"),
    vomito:      smallint("vomito"),
    fadiga:      smallint("fadiga"),
    perd_olft:   smallint("perd_olft"),
    perd_pala:   smallint("perd_pala"),
    dor_abd:     smallint("dor_abd"),

    // ── Comorbidades ──────────────────────────────────────────────────────
    cardiopati:  smallint("cardiopati"),
    diabetes:    smallint("diabetes"),
    obesidade:   smallint("obesidade"),
    imunodepre:  smallint("imunodepre"),
    renal:       smallint("renal"),
    asma:        smallint("asma"),
    neurologic:  smallint("neurologic"),
    pneumopati:  smallint("pneumopati"),
    hematologi:  smallint("hematologi"),
    sind_down:   smallint("sind_down"),
    hepatica:    smallint("hepatica"),
    puerpera:    smallint("puerpera"),

    // ── Hospitalização ────────────────────────────────────────────────────
    hospital:    smallint("hospital"),
    nosocomial:  smallint("nosocomial"),
    dt_interna:  date("dt_interna"),
    sg_uf_inte:  char("sg_uf_inte",  { length: 2 }),
    co_mu_inte:  char("co_mu_inte",  { length: 6 }),
    uti:         smallint("uti"),
    dt_entuti:   date("dt_entuti"),
    dt_saiduti:  date("dt_saiduti"),
    suport_ven:  smallint("suport_ven"),              // 1=invasivo 2=não-invasivo 3=nenhum

    // ── Vacinação ─────────────────────────────────────────────────────────
    vacina:      smallint("vacina"),                  // influenza
    vacina_cov:  smallint("vacina_cov"),              // COVID-19
    dose_1_cov:  text("dose_1_cov"),
    dose_2_cov:  text("dose_2_cov"),
    dose_ref:    text("dose_ref"),
    dose_2ref:   text("dose_2ref"),
    dose_adic:   text("dose_adic"),
    dos_re_bi:   text("dos_re_bi"),
    fab_cov_1:   text("fab_cov_1"),
    fab_cov_2:   text("fab_cov_2"),
    fab_adic:    text("fab_adic"),
    fab_covref:  text("fab_covref"),
    fab_covrf2:  text("fab_covrf2"),
    fab_re_bi:   text("fab_re_bi"),
    dt_ut_dose:  date("dt_ut_dose"),

    // ── Laboratório / PCR ─────────────────────────────────────────────────
    amostra:     smallint("amostra"),
    dt_coleta:   date("dt_coleta"),
    pcr_resul:   smallint("pcr_resul"),
    pos_pcrflu:  smallint("pos_pcrflu"),
    tp_flu_pcr:  smallint("tp_flu_pcr"),              // 1=A 2=B
    pcr_vsr:     smallint("pcr_vsr"),
    pcr_adeno:   smallint("pcr_adeno"),
    pcr_metap:   smallint("pcr_metap"),
    pcr_rino:    smallint("pcr_rino"),
    pcr_sars2:   smallint("pcr_sars2"),
    pcr_boca:    smallint("pcr_boca"),
    pcr_para1:   smallint("pcr_para1"),
    pcr_para2:   smallint("pcr_para2"),
    pcr_para3:   smallint("pcr_para3"),
    pcr_para4:   smallint("pcr_para4"),
    pcr_outro:   smallint("pcr_outro"),
    an_sars2:    smallint("an_sars2"),
    antiviral:   smallint("antiviral"),
    tp_antivir:  smallint("tp_antivir"),
    trat_cov:    smallint("trat_cov"),
    tipo_trat:   smallint("tipo_trat"),

    // ── Desfecho ──────────────────────────────────────────────────────────
    classi_fin:  smallint("classi_fin"),              // 1=Flu 2=outro vírus 3=outro ag 4=SRAG NE 5=COVID
    criterio:    smallint("criterio"),
    evolucao:    smallint("evolucao"),                // 1=cura 2=óbito 3=óbito outras causas 9=ignorado
    dt_evoluca:  date("dt_evoluca"),
    reinf:       smallint("reinf"),
  },
  (t) => [
    index("idx_caso_mun_res").on(t.co_mun_res),
    index("idx_caso_periodo").on(t.sg_uf, t.ano_epi, t.sem_not),
    index("idx_caso_classi_fin").on(t.classi_fin),
    index("idx_caso_evolucao").on(t.evolucao),
    index("idx_caso_dt_notific").on(t.dt_notific),
  ],
);

// ─── FATO: CASOS AGREGADOS POR SEMANA/MUNICÍPIO ──────────────────────────────
// Lido pelo dashboard para evitar aggregate queries em 335k+ linhas
// Populado/atualizado pelo ETL após cada carga do INFLUD
export const fatoCasosSemanaMun = pgTable(
  "fato_casos_semana_mun",
  {
    id:                serial("id").primaryKey(),
    ano_epi:           smallint("ano_epi").notNull(),
    sem_not:           smallint("sem_not").notNull(),
    co_mun_res:        char("co_mun_res", { length: 6 })
                         .references(() => dimMunicipio.co_ibge),
    sg_uf:             char("sg_uf", { length: 2 }).notNull(),
    classi_fin:        smallint("classi_fin"),        // null = todos os tipos
    total_casos:       integer("total_casos").notNull().default(0),
    total_obitos:      integer("total_obitos").notNull().default(0),
    total_uti:         integer("total_uti").notNull().default(0),
    total_internacoes: integer("total_internacoes").notNull().default(0),
  },
  (t) => [
    unique("uq_semana_mun_classi").on(t.ano_epi, t.sem_not, t.co_mun_res, t.classi_fin),
    index("idx_semana_uf_periodo").on(t.sg_uf, t.ano_epi, t.sem_not),
  ],
);

// ─── FATO: CASOS AGREGADOS POR SEMANA/UF ─────────────────────────────────────
// Pré-computado pelo ETL — permite consultas nacionais e por estado sem agregar
// os 335k registros brutos. ~27 estados × 53 semanas × 6 classificações ≈ 8.500 linhas/ano.
export const fatoCasosSemanauF = pgTable(
  "fato_casos_semana_uf",
  {
    id:                serial("id").primaryKey(),
    ano_epi:           smallint("ano_epi").notNull(),
    sem_not:           smallint("sem_not").notNull(),
    sg_uf:             char("sg_uf", { length: 2 }).notNull(),
    classi_fin:        smallint("classi_fin"),
    total_casos:       integer("total_casos").notNull().default(0),
    total_obitos:      integer("total_obitos").notNull().default(0),
    total_uti:         integer("total_uti").notNull().default(0),
    total_internacoes: integer("total_internacoes").notNull().default(0),
  },
  (t) => [
    unique("uq_semana_uf_classi").on(t.ano_epi, t.sem_not, t.sg_uf, t.classi_fin),
    index("idx_semana_uf_uf").on(t.sg_uf, t.ano_epi, t.sem_not),
  ],
);

// ─── ALERTAS DE ANOMALIA ─────────────────────────────────────────────────────
export const alertas = pgTable("alertas", {
  id:          serial("id").primaryKey(),
  sg_uf:       char("sg_uf",      { length: 2 }).notNull(),
  co_mun_res:  char("co_mun_res", { length: 6 }).references(() => dimMunicipio.co_ibge),
  sem_not:     smallint("sem_not").notNull(),
  ano_epi:     smallint("ano_epi").notNull(),
  tipo:        varchar("tipo", { length: 20 }).notNull(), // anomalia | surto | tendencia
  severidade:  real("severidade").notNull(),               // 0.0 – 1.0
  explicacao:  text("explicacao"),
  criado_em:   timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
});

// ─── CONTROLE DE CARGA ETL ────────────────────────────────────────────────────
export const controleCarga = pgTable("controle_carga", {
  id:                serial("id").primaryKey(),
  iniciado_em:       timestamp("iniciado_em",   { withTimezone: true }).defaultNow().notNull(),
  concluido_em:      timestamp("concluido_em",  { withTimezone: true }),
  fonte:             varchar("fonte",   { length: 50 }).notNull(),  // 'elasticsearch' | 'csv'
  status:            varchar("status",  { length: 20 }).notNull().default("rodando"),
  ano_epi:           smallint("ano_epi"),
  dt_inicio_busca:   date("dt_inicio_busca"),
  dt_fim_busca:      date("dt_fim_busca"),
  total_buscados:    integer("total_buscados").default(0),
  total_inseridos:   integer("total_inseridos").default(0),
  total_atualizados: integer("total_atualizados").default(0),
  erro_mensagem:     text("erro_mensagem"),
});

// ─── MANIFESTO DOS ARQUIVOS-FONTE ───────────────────────────────────────────
// Uma carga pode conter vários INFLUD anuais. O manifesto mantém a identidade
// de cada snapshot (nome, URL e SHA-256) para que resultados científicos sejam
// reproduzíveis mesmo após correções retrospectivas do SIVEP-Gripe.
export const manifestoFonte = pgTable(
  "manifesto_fonte",
  {
    id:                    serial("id").primaryKey(),
    controle_carga_id:     integer("controle_carga_id").references(() => controleCarga.id),
    ano_epi:               smallint("ano_epi").notNull(),
    arquivo_nome:          text("arquivo_nome").notNull(),
    arquivo_url:           text("arquivo_url"),
    publicado_em:          date("publicado_em"),
    sha256:                char("sha256", { length: 64 }).notNull(),
    tamanho_bytes:         bigint("tamanho_bytes", { mode: "number" }).notNull(),
    total_linhas:          integer("total_linhas"),
    min_dt_notific:        date("min_dt_notific"),
    max_dt_notific:        date("max_dt_notific"),
    normalizacao_versao:   varchar("normalizacao_versao", { length: 80 }).notNull(),
    metadados:             jsonb("metadados"),
    carregado_em:          timestamp("carregado_em", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_manifesto_fonte_sha256").on(t.ano_epi, t.sha256),
    index("idx_manifesto_fonte_carga").on(t.controle_carga_id),
  ],
);

// ─── FONTES DE NOTÍCIAS ───────────────────────────────────────────────────────
export const fontesNoticias = pgTable("fontes_noticias", {
  id:               serial("id").primaryKey(),
  titulo:           text("titulo").notNull(),
  url:              text("url").notNull(),
  fonte:            text("fonte"),
  sg_uf:            char("sg_uf", { length: 2 }),
  data_publicacao:  date("data_publicacao"),
  score_correlacao: real("score_correlacao"),
  alerta_id:        integer("alerta_id").references(() => alertas.id),
});
