ALTER TABLE fato_caso_srag
  ADD COLUMN IF NOT EXISTS dt_sin_pri date,
  ADD COLUMN IF NOT EXISTS sem_pri smallint,
  ADD COLUMN IF NOT EXISTS dt_digita date,
  ADD COLUMN IF NOT EXISTS dt_encerra date,
  ADD COLUMN IF NOT EXISTS dose_adic text,
  ADD COLUMN IF NOT EXISTS dos_re_bi text,
  ADD COLUMN IF NOT EXISTS fab_cov_1 text,
  ADD COLUMN IF NOT EXISTS fab_cov_2 text,
  ADD COLUMN IF NOT EXISTS fab_adic text,
  ADD COLUMN IF NOT EXISTS fab_covref text,
  ADD COLUMN IF NOT EXISTS fab_covrf2 text,
  ADD COLUMN IF NOT EXISTS fab_re_bi text,
  ADD COLUMN IF NOT EXISTS pcr_para1 smallint,
  ADD COLUMN IF NOT EXISTS pcr_para2 smallint,
  ADD COLUMN IF NOT EXISTS pcr_para3 smallint,
  ADD COLUMN IF NOT EXISTS pcr_para4 smallint,
  ADD COLUMN IF NOT EXISTS pcr_outro smallint,
  ADD COLUMN IF NOT EXISTS an_sars2 smallint,
  ADD COLUMN IF NOT EXISTS trat_cov smallint,
  ADD COLUMN IF NOT EXISTS tipo_trat smallint;

CREATE TABLE IF NOT EXISTS manifesto_fonte (
  id serial PRIMARY KEY,
  controle_carga_id integer REFERENCES controle_carga(id),
  ano_epi smallint NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_url text,
  publicado_em date,
  sha256 char(64) NOT NULL,
  tamanho_bytes bigint NOT NULL,
  total_linhas integer,
  min_dt_notific date,
  max_dt_notific date,
  normalizacao_versao varchar(80) NOT NULL,
  metadados jsonb,
  carregado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_manifesto_fonte_sha256 UNIQUE (ano_epi, sha256)
);

CREATE INDEX IF NOT EXISTS idx_manifesto_fonte_carga
  ON manifesto_fonte (controle_carga_id);

COMMENT ON COLUMN fato_caso_srag.dt_digita IS
  'Data de inclusão inicial da ficha; não representa o histórico de correções posteriores.';

COMMENT ON TABLE manifesto_fonte IS
  'Identidade e proveniência de cada snapshot anual do SIVEP-Gripe carregado pelo ETL.';
