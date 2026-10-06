-- =============================================================================
-- SivepLens — Setup completo do banco no Neon PostgreSQL
-- =============================================================================

-- ─── 1. DIMENSÃO GEOGRÁFICA ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_municipio (
  co_ibge          CHAR(6)      PRIMARY KEY,
  no_municipio     TEXT         NOT NULL,
  co_uf            SMALLINT,
  sg_uf            CHAR(2)      NOT NULL,
  no_uf            TEXT         NOT NULL,
  co_regiao_saude  INTEGER,
  no_regiao_saude  TEXT,
  co_macro         INTEGER,
  no_macro         TEXT,
  co_regiao_brasil SMALLINT,
  no_regiao_brasil TEXT,
  sg_regiao_brasil CHAR(2)
);

-- ─── 2. FATO: CASOS INDIVIDUAIS SRAG ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fato_caso_srag (
  -- Identificação
  nu_notific   BIGINT      PRIMARY KEY,
  dt_notific   DATE,
  sem_not      SMALLINT,
  ano_epi      SMALLINT,

  -- Localização
  sg_uf        CHAR(2),
  co_mun_not   CHAR(6),
  co_mun_res   CHAR(6)     REFERENCES dim_municipio(co_ibge),

  -- Demográfico
  cs_sexo      CHAR(1),
  nu_idade_n   SMALLINT,
  tp_idade     SMALLINT,   -- 1=dia 2=mês 3=ano
  cs_raca      SMALLINT,   -- 1=Branca 2=Preta 3=Amarela 4=Parda 5=Indígena
  cs_gestant   SMALLINT,
  cs_escol_n   SMALLINT,

  -- Sintomas (1=Sim 2=Não 9=Ignorado)
  febre        SMALLINT,
  tosse        SMALLINT,
  dispneia     SMALLINT,
  desc_resp    SMALLINT,
  saturacao    SMALLINT,
  garganta     SMALLINT,
  diarreia     SMALLINT,
  vomito       SMALLINT,
  fadiga       SMALLINT,
  perd_olft    SMALLINT,
  perd_pala    SMALLINT,
  dor_abd      SMALLINT,

  -- Comorbidades (1=Sim 2=Não 9=Ignorado)
  cardiopati   SMALLINT,
  diabetes     SMALLINT,
  obesidade    SMALLINT,
  imunodepre   SMALLINT,
  renal        SMALLINT,
  asma         SMALLINT,
  neurologic   SMALLINT,
  pneumopati   SMALLINT,
  hematologi   SMALLINT,
  sind_down    SMALLINT,
  hepatica     SMALLINT,
  puerpera     SMALLINT,

  -- Hospitalização
  hospital     SMALLINT,
  nosocomial   SMALLINT,
  dt_interna   DATE,
  sg_uf_inte   CHAR(2),
  co_mu_inte   CHAR(6),
  uti          SMALLINT,   -- 1=Sim 2=Não 9=Ignorado
  dt_entuti    DATE,
  dt_saiduti   DATE,
  suport_ven   SMALLINT,   -- 1=invasivo 2=não-invasivo 3=nenhum

  -- Vacinação
  vacina       SMALLINT,   -- influenza
  vacina_cov   SMALLINT,   -- COVID-19
  dose_1_cov   TEXT,
  dose_2_cov   TEXT,
  dose_ref     TEXT,
  dose_2ref    TEXT,
  dt_ut_dose   DATE,

  -- Laboratório / PCR
  amostra      SMALLINT,
  dt_coleta    DATE,
  pcr_resul    SMALLINT,
  pos_pcrflu   SMALLINT,
  tp_flu_pcr   SMALLINT,   -- 1=A 2=B
  pcr_vsr      SMALLINT,
  pcr_adeno    SMALLINT,
  pcr_metap    SMALLINT,
  pcr_rino     SMALLINT,
  pcr_sars2    SMALLINT,
  pcr_boca     SMALLINT,
  antiviral    SMALLINT,
  tp_antivir   SMALLINT,

  -- Desfecho
  classi_fin   SMALLINT,   -- 1=Flu 2=outro vírus 3=outro ag 4=SRAG NE 5=COVID
  criterio     SMALLINT,
  evolucao     SMALLINT,   -- 1=cura 2=óbito 3=óbito outras causas 9=ignorado
  dt_evoluca   DATE,
  reinf        SMALLINT
);

-- ─── 3. FATO: CASOS AGREGADOS POR SEMANA/MUNICÍPIO ───────────────────────────
CREATE TABLE IF NOT EXISTS fato_casos_semana_mun (
  id                SERIAL      PRIMARY KEY,
  ano_epi           SMALLINT    NOT NULL,
  sem_not           SMALLINT    NOT NULL,
  co_mun_res        CHAR(6)     REFERENCES dim_municipio(co_ibge),
  sg_uf             CHAR(2)     NOT NULL,
  classi_fin        SMALLINT,
  total_casos       INTEGER     NOT NULL DEFAULT 0,
  total_obitos      INTEGER     NOT NULL DEFAULT 0,
  total_uti         INTEGER     NOT NULL DEFAULT 0,
  total_internacoes INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (ano_epi, sem_not, co_mun_res, classi_fin)
);

-- ─── 4. FATO: CASOS AGREGADOS POR SEMANA/UF ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fato_casos_semana_uf (
  id                SERIAL      PRIMARY KEY,
  ano_epi           SMALLINT    NOT NULL,
  sem_not           SMALLINT    NOT NULL,
  sg_uf             CHAR(2)     NOT NULL,
  classi_fin        SMALLINT,
  total_casos       INTEGER     NOT NULL DEFAULT 0,
  total_obitos      INTEGER     NOT NULL DEFAULT 0,
  total_uti         INTEGER     NOT NULL DEFAULT 0,
  total_internacoes INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (ano_epi, sem_not, sg_uf, classi_fin)
);

CREATE INDEX IF NOT EXISTS idx_semana_uf_uf ON fato_casos_semana_uf (sg_uf, ano_epi, sem_not);

-- ─── 5. ALERTAS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas (
  id          SERIAL       PRIMARY KEY,
  sg_uf       CHAR(2)      NOT NULL,
  co_mun_res  CHAR(6)      REFERENCES dim_municipio(co_ibge),
  sem_not     SMALLINT     NOT NULL,
  ano_epi     SMALLINT     NOT NULL,
  tipo        VARCHAR(20)  NOT NULL,  -- anomalia | surto | tendencia
  severidade  REAL         NOT NULL,  -- 0.0 – 1.0
  explicacao  TEXT,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 6. FONTES DE NOTÍCIAS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fontes_noticias (
  id               SERIAL  PRIMARY KEY,
  titulo           TEXT    NOT NULL,
  url              TEXT    NOT NULL,
  fonte            TEXT,
  sg_uf            CHAR(2),
  data_publicacao  DATE,
  score_correlacao REAL,
  alerta_id        INTEGER REFERENCES alertas(id)
);

-- =============================================================================
-- ÍNDICES — melhoram queries do dashboard e do motor de alertas
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_caso_mun_res    ON fato_caso_srag (co_mun_res);
CREATE INDEX IF NOT EXISTS idx_caso_periodo    ON fato_caso_srag (sg_uf, ano_epi, sem_not);
CREATE INDEX IF NOT EXISTS idx_caso_classi_fin ON fato_caso_srag (classi_fin);
CREATE INDEX IF NOT EXISTS idx_caso_evolucao   ON fato_caso_srag (evolucao);
CREATE INDEX IF NOT EXISTS idx_caso_dt_notific ON fato_caso_srag (dt_notific);

CREATE INDEX IF NOT EXISTS idx_semana_uf_periodo ON fato_casos_semana_mun (sg_uf, ano_epi, sem_not);

CREATE INDEX IF NOT EXISTS idx_alertas_uf_periodo ON alertas (sg_uf, ano_epi, sem_not);

-- =============================================================================
-- PROCEDURE: recalcula fatos agregado a partir do fato bruto
-- Chamar após cada carga do ETL:  CALL refresh_semana_mun();
-- =============================================================================

CREATE OR REPLACE PROCEDURE refresh_semana_mun()
LANGUAGE plpgsql AS $$
BEGIN
  -- Agrega por município (usado pelo mapa choropleth)
  TRUNCATE fato_casos_semana_mun;
  INSERT INTO fato_casos_semana_mun
    (ano_epi, sem_not, co_mun_res, sg_uf, classi_fin,
     total_casos, total_obitos, total_uti, total_internacoes)
  SELECT
    ano_epi, sem_not, co_mun_res, sg_uf, classi_fin,
    COUNT(*)                             AS total_casos,
    COUNT(*) FILTER (WHERE evolucao = 2) AS total_obitos,
    COUNT(*) FILTER (WHERE uti = 1)      AS total_uti,
    COUNT(*) FILTER (WHERE hospital = 1) AS total_internacoes
  FROM fato_caso_srag
  WHERE co_mun_res IS NOT NULL
    AND ano_epi    IS NOT NULL
    AND sem_not    IS NOT NULL
  GROUP BY ano_epi, sem_not, co_mun_res, sg_uf, classi_fin;

  -- Agrega por UF (usado pelo dashboard / curva epidêmica)
  TRUNCATE fato_casos_semana_uf;
  INSERT INTO fato_casos_semana_uf
    (ano_epi, sem_not, sg_uf, classi_fin,
     total_casos, total_obitos, total_uti, total_internacoes)
  SELECT
    ano_epi, sem_not, sg_uf, classi_fin,
    COUNT(*)                             AS total_casos,
    COUNT(*) FILTER (WHERE evolucao = 2) AS total_obitos,
    COUNT(*) FILTER (WHERE uti = 1)      AS total_uti,
    COUNT(*) FILTER (WHERE hospital = 1) AS total_internacoes
  FROM fato_caso_srag
  WHERE sg_uf   IS NOT NULL
    AND ano_epi IS NOT NULL
    AND sem_not IS NOT NULL
  GROUP BY ano_epi, sem_not, sg_uf, classi_fin;
END;
$$;

-- ─── 7. CONTROLE DE CARGA ETL ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS controle_carga (
  id                 SERIAL       PRIMARY KEY,
  iniciado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  concluido_em       TIMESTAMPTZ,
  fonte              VARCHAR(50)  NOT NULL,   -- 'elasticsearch' | 'csv'
  status             VARCHAR(20)  NOT NULL DEFAULT 'rodando',  -- 'rodando' | 'sucesso' | 'erro'
  ano_epi            SMALLINT,
  dt_inicio_busca    DATE,
  dt_fim_busca       DATE,
  total_buscados     INTEGER      DEFAULT 0,
  total_inseridos    INTEGER      DEFAULT 0,
  total_atualizados  INTEGER      DEFAULT 0,
  erro_mensagem      TEXT
);

CREATE INDEX IF NOT EXISTS idx_controle_carga_status ON controle_carga (status, concluido_em DESC);
