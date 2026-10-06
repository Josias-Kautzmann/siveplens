"""
load_influd.py  —  v2.0
────────────────────────
Carrega arquivo INFLUD (SIVEP-Gripe / OpenDataSUS) para fato_caso_srag.

Uso:
    python load_influd.py [caminho_do_csv]

    Exemplos:
    python load_influd.py "INFLUD19-31-12-2019.csv"
    python load_influd.py "INFLUD22-02-01-2023.csv"

Melhorias v2 (data cleaning baseada na literatura SRAG):
──────────────────────────────────────────────────────────
1. Desduplicação por NU_NOTIFIC (keep='last' após ordenar por datas de
   notificação, encerramento e digitação)
2. Validação lógica de datas: descarta registros onde
   DT_NASC > DT_SIN_PRI ou DT_SIN_PRI > DT_NOTIFIC (inconsistências de entrada)
3. Saneamento de idade: NU_IDADE_N > 130 com TP_IDADE=3 (anos) → NULL
   Valores negativos também → NULL
4. PCR_RESUL = 5 (Aguardando resultado) → NULL
   Não é resultado negativo; tratar como ausente é padrão na literatura
5. ON CONFLICT: atualiza TODOS os campos analíticos (não só dt_notific/ano_epi)
   Permite reprocessar o mesmo arquivo com correções sem deixar dados velhos
6. Relatório de qualidade mostrando registros filtrados por motivo
"""

import os
import sys
from pathlib import Path
from datetime import datetime, date as date_type

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
import normalization

# Garante UTF-8 no terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─── Configuração ─────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"].strip()

BASE     = Path(__file__).parent
CSV_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else (
    BASE / Path(os.environ.get("INFLUD_CSV", "../../ccmec25a64.csv/INFLUD25-23-03-2026 (1).csv"))
)
CSV_PATH = BASE / CSV_PATH if not CSV_PATH.is_absolute() else CSV_PATH

CHUNK_SIZE = 5_000   # linhas por batch para inserção

# ─── Colunas a importar e seus tipos ─────────────────────────────────────────

COLS_INT = [
    "NU_NOTIFIC",
    "SEM_PRI",
    # demográfico
    "NU_IDADE_N", "TP_IDADE", "CS_RACA", "CS_GESTANT", "CS_ESCOL_N",
    # sintomas
    "FEBRE", "TOSSE", "DISPNEIA", "DESC_RESP", "SATURACAO",
    "GARGANTA", "DIARREIA", "VOMITO", "FADIGA", "PERD_OLFT", "PERD_PALA", "DOR_ABD",
    # comorbidades
    "CARDIOPATI", "DIABETES", "OBESIDADE", "IMUNODEPRE", "RENAL",
    "ASMA", "NEUROLOGIC", "PNEUMOPATI", "HEMATOLOGI", "SIND_DOWN", "HEPATICA", "PUERPERA",
    # hospitalização
    "HOSPITAL", "NOSOCOMIAL", "UTI", "SUPORT_VEN",
    # vacinação
    "VACINA", "VACINA_COV",
    # laboratório
    "AMOSTRA", "PCR_RESUL", "POS_PCRFLU", "TP_FLU_PCR",
    "PCR_VSR", "PCR_ADENO", "PCR_METAP", "PCR_RINO", "PCR_SARS2", "PCR_BOCA",
    "PCR_PARA1", "PCR_PARA2", "PCR_PARA3", "PCR_PARA4", "PCR_OUTRO", "AN_SARS2",
    "ANTIVIRAL", "TP_ANTIVIR", "TRAT_COV", "TIPO_TRAT",
    # desfecho
    "CLASSI_FIN", "CRITERIO", "EVOLUCAO", "REINF",
]

COLS_STR = [
    "SG_UF", "SG_UF_INTE",
    "CS_SEXO",
    "DOSE_1_COV", "DOSE_2_COV", "DOSE_REF", "DOSE_2REF", "DOSE_ADIC", "DOS_RE_BI",
    "FAB_COV_1", "FAB_COV_2", "FAB_ADIC", "FAB_COVREF", "FAB_COVRF2", "FAB_RE_BI",
]

COLS_DATE = [
    "DT_NOTIFIC", "DT_SIN_PRI", "DT_DIGITA", "DT_ENCERRA",
    "DT_INTERNA", "DT_ENTUTI", "DT_SAIDUTI",
    "DT_COLETA",  "DT_EVOLUCA", "DT_UT_DOSE",
]

# Coluna usada apenas para validação (não inserida na tabela)
COLS_DATE_VALID = ["DT_NASC"]

COLS_IBGE = ["CO_MUN_NOT", "CO_MUN_RES", "CO_MU_INTE"]   # CHAR(6)

ALL_COLS_INSERT = (
    ["NU_NOTIFIC", "SEM_NOT"]
    + COLS_INT[1:]
    + COLS_STR
    + COLS_DATE
    + COLS_IBGE
)

ALL_COLS_READ = list(dict.fromkeys(ALL_COLS_INSERT + COLS_DATE_VALID))

# ─── Helpers ──────────────────────────────────────────────────────────────────

def to_int(val) -> int | None:
    return normalization.to_int(val)

def to_str(val, length: int | None = None) -> str | None:
    return normalization.to_str(val, length)

def to_date(val) -> date_type | None:
    return normalization.to_date(val)

def to_ibge6(val) -> str | None:
    return normalization.to_ibge6(val)

# ─── Limpeza por linha ────────────────────────────────────────────────────────

def clean_age(val_idade, val_tp) -> tuple[int | None, int | None]:
    """Retorna (nu_idade_n, tp_idade) saneados.

    Casos removidos:
      • valores negativos
      • tp_idade=3 (anos) com nu_idade_n > 130 (biologicamente impossível)
    """
    return normalization.clean_age(val_idade, val_tp)

def clean_pcr_resul(val) -> int | None:
    """PCR_RESUL = 5 significa 'Aguardando resultado' — não é negativo.
    Trata como NULL para não contaminar análises de positividade."""
    return normalization.clean_pcr_result(val)

# ─── Conversão de linha → tuple ───────────────────────────────────────────────

def row_to_tuple(r: dict) -> tuple | None:
    """Converte linha do CSV em tuple para INSERT.
    Retorna None se a linha deve ser descartada (falha de validação de data)."""

    core, _reason = normalization.normalize_core(r)
    if core is None:
        return None

    dt_notific = core.notification_date
    ano_epi = core.epidemiological_year
    nu_idade_n, tp_idade = core.age, core.age_unit

    return (
        to_int(r.get("NU_NOTIFIC")),
        dt_notific,
        to_int(r.get("SEM_NOT")),
        ano_epi,
        to_date(r.get("DT_SIN_PRI")),
        to_int(r.get("SEM_PRI")),
        to_date(r.get("DT_DIGITA")),
        to_date(r.get("DT_ENCERRA")),
        # localização
        to_str(r.get("SG_UF"),      2),
        to_ibge6(r.get("CO_MUN_NOT")),
        to_ibge6(r.get("CO_MUN_RES")),
        # demográfico
        to_str(r.get("CS_SEXO"),    1),
        nu_idade_n,
        tp_idade,
        to_int(r.get("CS_RACA")),
        to_int(r.get("CS_GESTANT")),
        to_int(r.get("CS_ESCOL_N")),
        # sintomas
        to_int(r.get("FEBRE")),      to_int(r.get("TOSSE")),
        to_int(r.get("DISPNEIA")),   to_int(r.get("DESC_RESP")),
        to_int(r.get("SATURACAO")),  to_int(r.get("GARGANTA")),
        to_int(r.get("DIARREIA")),   to_int(r.get("VOMITO")),
        to_int(r.get("FADIGA")),     to_int(r.get("PERD_OLFT")),
        to_int(r.get("PERD_PALA")),  to_int(r.get("DOR_ABD")),
        # comorbidades
        to_int(r.get("CARDIOPATI")), to_int(r.get("DIABETES")),
        to_int(r.get("OBESIDADE")),  to_int(r.get("IMUNODEPRE")),
        to_int(r.get("RENAL")),      to_int(r.get("ASMA")),
        to_int(r.get("NEUROLOGIC")), to_int(r.get("PNEUMOPATI")),
        to_int(r.get("HEMATOLOGI")), to_int(r.get("SIND_DOWN")),
        to_int(r.get("HEPATICA")),   to_int(r.get("PUERPERA")),
        # hospitalização
        to_int(r.get("HOSPITAL")),   to_int(r.get("NOSOCOMIAL")),
        to_date(r.get("DT_INTERNA")),
        to_str(r.get("SG_UF_INTE"), 2),
        to_ibge6(r.get("CO_MU_INTE")),
        to_int(r.get("UTI")),
        to_date(r.get("DT_ENTUTI")), to_date(r.get("DT_SAIDUTI")),
        to_int(r.get("SUPORT_VEN")),
        # vacinação
        to_int(r.get("VACINA")),     to_int(r.get("VACINA_COV")),
        to_str(r.get("DOSE_1_COV")), to_str(r.get("DOSE_2_COV")),
        to_str(r.get("DOSE_REF")),   to_str(r.get("DOSE_2REF")),
        to_str(r.get("DOSE_ADIC")),  to_str(r.get("DOS_RE_BI")),
        to_str(r.get("FAB_COV_1")),  to_str(r.get("FAB_COV_2")),
        to_str(r.get("FAB_ADIC")),   to_str(r.get("FAB_COVREF")),
        to_str(r.get("FAB_COVRF2")), to_str(r.get("FAB_RE_BI")),
        to_date(r.get("DT_UT_DOSE")),
        # laboratório
        to_int(r.get("AMOSTRA")),
        to_date(r.get("DT_COLETA")),
        core.pcr_result,
        to_int(r.get("POS_PCRFLU")), to_int(r.get("TP_FLU_PCR")),
        to_int(r.get("PCR_VSR")),    to_int(r.get("PCR_ADENO")),
        to_int(r.get("PCR_METAP")),  to_int(r.get("PCR_RINO")),
        to_int(r.get("PCR_SARS2")),  to_int(r.get("PCR_BOCA")),
        to_int(r.get("PCR_PARA1")),  to_int(r.get("PCR_PARA2")),
        to_int(r.get("PCR_PARA3")),  to_int(r.get("PCR_PARA4")),
        to_int(r.get("PCR_OUTRO")),  to_int(r.get("AN_SARS2")),
        to_int(r.get("ANTIVIRAL")),  to_int(r.get("TP_ANTIVIR")),
        to_int(r.get("TRAT_COV")),   to_int(r.get("TIPO_TRAT")),
        # desfecho
        to_int(r.get("CLASSI_FIN")), to_int(r.get("CRITERIO")),
        to_int(r.get("EVOLUCAO")),   to_date(r.get("DT_EVOLUCA")),
        to_int(r.get("REINF")),
    )

# ─── SQL de inserção ──────────────────────────────────────────────────────────
# ON CONFLICT atualiza todos os campos analíticos para que reprocessamentos
# ou arquivos "close-out" de fim de ano sobrescrevam dados antigos.

INSERT_COLUMNS = tuple(column.strip() for column in """
  nu_notific, dt_notific, sem_not, ano_epi, dt_sin_pri, sem_pri, dt_digita, dt_encerra,
  sg_uf, co_mun_not, co_mun_res,
  cs_sexo, nu_idade_n, tp_idade, cs_raca, cs_gestant, cs_escol_n,
  febre, tosse, dispneia, desc_resp, saturacao, garganta, diarreia, vomito,
  fadiga, perd_olft, perd_pala, dor_abd,
  cardiopati, diabetes, obesidade, imunodepre, renal, asma,
  neurologic, pneumopati, hematologi, sind_down, hepatica, puerpera,
  hospital, nosocomial, dt_interna, sg_uf_inte, co_mu_inte,
  uti, dt_entuti, dt_saiduti, suport_ven,
  vacina, vacina_cov, dose_1_cov, dose_2_cov, dose_ref, dose_2ref, dose_adic, dos_re_bi,
  fab_cov_1, fab_cov_2, fab_adic, fab_covref, fab_covrf2, fab_re_bi, dt_ut_dose,
  amostra, dt_coleta, pcr_resul, pos_pcrflu, tp_flu_pcr,
  pcr_vsr, pcr_adeno, pcr_metap, pcr_rino, pcr_sars2, pcr_boca,
  pcr_para1, pcr_para2, pcr_para3, pcr_para4, pcr_outro, an_sars2,
  antiviral, tp_antivir, trat_cov, tipo_trat,
  classi_fin, criterio, evolucao, dt_evoluca, reinf
""".replace("\n", " ").split(",") if column.strip())

_update_columns = [column for column in INSERT_COLUMNS if column != "nu_notific"]
INSERT_SQL = (
    f"INSERT INTO fato_caso_srag ({', '.join(INSERT_COLUMNS)}) VALUES %s "
    "ON CONFLICT (nu_notific) DO UPDATE SET "
    + ", ".join(f"{column} = EXCLUDED.{column}" for column in _update_columns)
)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"📂 CSV: {CSV_PATH}")
    if not CSV_PATH.exists():
        print(f"❌ Arquivo não encontrado: {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    print("🔌 Conectando ao banco...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # Carrega municípios válidos para sanitização de FK
    cur.execute("SELECT co_ibge FROM dim_municipio")
    valid_munis = {row[0] for row in cur.fetchall()}
    print(f"✅ {len(valid_munis):,} municípios válidos carregados")

    # Índices no tuple para sanitização de FK municipal
    MUNI_INDICES = {9, 10, 45}  # co_mun_not, co_mun_res, co_mu_inte

    def sanitize_munis(t: tuple) -> tuple:
        return tuple(
            v if i not in MUNI_INDICES or v is None or v in valid_munis else None
            for i, v in enumerate(t)
        )

    # ── Leitura completa para desduplicação ──────────────────────────────────
    print("📖 Lendo CSV completo para desduplicação...")
    t_read = datetime.now()

    header_df = pd.read_csv(CSV_PATH, encoding="latin1", sep=";", nrows=0)
    # CSVs históricos (2019-2022) têm dois problemas:
    #   1. BOM UTF-8 lido como latin-1: primeira coluna vira "\xef\xbb\xbfNU_NOTIFIC"
    #   2. Nomes em lowercase: "nu_notific" em vez de "NU_NOTIFIC"
    # lstrip('\xef\xbb\xbf') remove os 3 bytes do BOM; upper().strip() normaliza o resto.
    col_map = {c.lstrip('\xef\xbb\xbf').upper().strip(): c
               for c in header_df.columns}
    colunas_csv = set(col_map.keys())
    colunas_usar = [col_map[c] for c in ALL_COLS_READ if c in colunas_csv]

    df = pd.read_csv(
        CSV_PATH,
        encoding="latin1",
        sep=";",
        usecols=colunas_usar,   # nomes originais — pandas faz match exato
        dtype=str,
        keep_default_na=False,
    )
    # lstrip BOM antes de upper — garante que a primeira coluna não fique com
    # prefixo \xef\xbb\xbf mesmo após a normalização
    df.columns = df.columns.str.lstrip('\xef\xbb\xbf').str.upper().str.strip()

    n_bruto = len(df)
    print(f"   {n_bruto:,} linhas brutas lidas em {(datetime.now()-t_read).total_seconds():.1f}s")
    print(f"   {len(colunas_usar)} colunas de {len(colunas_csv)} disponíveis no CSV")

    # ── Desduplicação ────────────────────────────────────────────────────────
    # DT_DIGITA e DT_ENCERRA aproximam a versão mais recente do registro;
    # DT_NOTIFIC sozinho identifica o evento e costuma ser igual nas revisões.
    sort_columns = []
    for source_column in ("DT_NOTIFIC", "DT_ENCERRA", "DT_DIGITA"):
        if source_column in df.columns:
            helper_column = f"_sort_{source_column.lower()}"
            df[helper_column] = pd.to_datetime(df[source_column], dayfirst=True, errors="coerce")
            sort_columns.append(helper_column)
    if sort_columns:
        df.sort_values(sort_columns, na_position="first", inplace=True, kind="stable")
        df.drop(columns=sort_columns, inplace=True)

    n_antes_dedup = len(df)
    df.drop_duplicates(subset=["NU_NOTIFIC"], keep="last", inplace=True)
    n_dedup = n_antes_dedup - len(df)
    print(f"   Desduplicação: {n_dedup:,} duplicatas removidas → {len(df):,} únicos")

    # ── Inserção em chunks ───────────────────────────────────────────────────
    print(f"\n⏳ Inserindo em chunks de {CHUNK_SIZE:,} linhas...\n")

    records = df.to_dict("records")
    total = len(records)
    total_inserido  = 0
    total_atualizado = 0
    n_sem_notific   = 0
    n_data_invalida = 0

    for chunk_start in range(0, total, CHUNK_SIZE):
        chunk = records[chunk_start : chunk_start + CHUNK_SIZE]
        chunk_num = chunk_start // CHUNK_SIZE + 1
        t0 = datetime.now()

        print(f"  chunk {chunk_num:4d} | convertendo {len(chunk):,} linhas...", end="", flush=True)

        rows = []
        for r in chunk:
            if not r.get("NU_NOTIFIC", "").strip():
                n_sem_notific += 1
                continue
            t = row_to_tuple(r)
            if t is None:
                n_data_invalida += 1
                continue
            rows.append(sanitize_munis(t))

        print(f" inserindo {len(rows):,}...", end="", flush=True)
        psycopg2.extras.execute_values(cur, INSERT_SQL, rows, page_size=5_000)
        conn.commit()

        elapsed = (datetime.now() - t0).total_seconds()
        # statusmessage: "INSERT 0 N" para novos, "UPDATE N" para atualizados
        msg = cur.statusmessage or ""
        inserted = int(msg.split(" ")[-1]) if msg else len(rows)
        total_inserido += inserted

        pct = min((chunk_start + len(chunk)) / total * 100, 100)
        print(f" ✓ {inserted:,} ({elapsed:.1f}s) | {pct:.0f}%")

    # ── Recalcula tabela pré-agregada ────────────────────────────────────────
    print(f"\n🔄 Recalculando fato_casos_semana_mun...")
    cur.execute("CALL refresh_semana_mun();")
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM fato_casos_semana_mun;")
    total_semana = cur.fetchone()[0]

    # ── Relatório de qualidade ───────────────────────────────────────────────
    print(f"\n{'─'*64}")
    print(f"  Relatório de qualidade — {CSV_PATH.name}")
    print(f"{'─'*64}")
    print(f"  Linhas brutas no CSV:           {n_bruto:>10,}")
    print(f"  Removidas (NU_NOTIFIC dup):     {n_dedup:>10,}  ({n_dedup/n_bruto*100:.1f}%)")
    print(f"  Removidas (sem NU_NOTIFIC):     {n_sem_notific:>10,}")
    print(f"  Removidas (data inconsistente): {n_data_invalida:>10,}")
    print(f"  Registros enviados ao banco:    {total - n_sem_notific - n_data_invalida:>10,}")
    print(f"  Operações no banco (INSERT+UPD):{total_inserido:>10,}")
    print(f"{'─'*64}")
    print(f"  fato_casos_semana_mun:          {total_semana:>10,} linhas recalculadas")
    print(f"{'─'*64}")
    print()

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
