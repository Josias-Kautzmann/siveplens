"""
seed.py
───────
Carga completa de INFLUD para fato_caso_srag usando COPY FROM STDIN.
10-50x mais rápido que INSERT/UPDATE pois envia todos os dados em uma
única transferência sem overhead de query planner.

Uso:
    python seed.py INFLUD25.csv INFLUD26.csv
    python seed.py "C:\\caminho\\INFLUD25-23-03-2026 (1).csv" "C:\\caminho\\INFLUD26-23-03-2026 (1).csv"
"""

import os
import sys
from datetime import date
from io import StringIO
from pathlib import Path
from datetime import datetime

import pandas as pd
import psycopg2
from dotenv import load_dotenv
import normalization

# ─── Configuração ─────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent / ".env")
DATABASE_URL = os.environ["DATABASE_URL"].strip()

# ─── Colunas do CSV a importar ────────────────────────────────────────────────

COLS_INT = [
    "NU_NOTIFIC",
    "SEM_PRI",
    "NU_IDADE_N", "TP_IDADE", "CS_RACA", "CS_GESTANT", "CS_ESCOL_N",
    "FEBRE", "TOSSE", "DISPNEIA", "DESC_RESP", "SATURACAO",
    "GARGANTA", "DIARREIA", "VOMITO", "FADIGA", "PERD_OLFT", "PERD_PALA", "DOR_ABD",
    "CARDIOPATI", "DIABETES", "OBESIDADE", "IMUNODEPRE", "RENAL",
    "ASMA", "NEUROLOGIC", "PNEUMOPATI", "HEMATOLOGI", "SIND_DOWN", "HEPATICA", "PUERPERA",
    "HOSPITAL", "NOSOCOMIAL", "UTI", "SUPORT_VEN",
    "VACINA", "VACINA_COV",
    "AMOSTRA", "PCR_RESUL", "POS_PCRFLU", "TP_FLU_PCR",
    "PCR_VSR", "PCR_ADENO", "PCR_METAP", "PCR_RINO", "PCR_SARS2", "PCR_BOCA",
    "PCR_PARA1", "PCR_PARA2", "PCR_PARA3", "PCR_PARA4", "PCR_OUTRO", "AN_SARS2",
    "ANTIVIRAL", "TP_ANTIVIR", "TRAT_COV", "TIPO_TRAT",
    "CLASSI_FIN", "CRITERIO", "EVOLUCAO", "REINF",
]

COLS_STR = [
    "SG_UF", "SG_UF_INTE",
    "CS_SEXO",
    "DOSE_1_COV", "DOSE_2_COV", "DOSE_REF", "DOSE_2REF", "DOSE_ADIC", "DOS_RE_BI",
    "FAB_COV_1", "FAB_COV_2", "FAB_ADIC", "FAB_COVREF", "FAB_COVRF2", "FAB_RE_BI",
]

COLS_DATE = [
    "DT_NOTIFIC", "DT_SIN_PRI", "DT_DIGITA", "DT_ENCERRA", "DT_INTERNA", "DT_ENTUTI", "DT_SAIDUTI",
    "DT_COLETA", "DT_EVOLUCA", "DT_UT_DOSE",
]

COLS_IBGE = ["CO_MUN_NOT", "CO_MUN_RES", "CO_MU_INTE"]

SEM_NOT_COL = ["SEM_NOT"]

ALL_SOURCE_COLS = (
    ["NU_NOTIFIC", "SEM_NOT"]
    + COLS_INT[1:]
    + COLS_STR
    + COLS_DATE
    + COLS_IBGE
)

# ─── Ordem das colunas no COPY (deve corresponder ao INSERT do load_influd) ──

COPY_COLS = (
    "nu_notific, dt_notific, sem_not, ano_epi, dt_sin_pri, sem_pri, dt_digita, dt_encerra, "
    "sg_uf, co_mun_not, co_mun_res, "
    "cs_sexo, nu_idade_n, tp_idade, cs_raca, cs_gestant, cs_escol_n, "
    "febre, tosse, dispneia, desc_resp, saturacao, garganta, diarreia, vomito, "
    "fadiga, perd_olft, perd_pala, dor_abd, "
    "cardiopati, diabetes, obesidade, imunodepre, renal, asma, "
    "neurologic, pneumopati, hematologi, sind_down, hepatica, puerpera, "
    "hospital, nosocomial, dt_interna, sg_uf_inte, co_mu_inte, "
    "uti, dt_entuti, dt_saiduti, suport_ven, "
    "vacina, vacina_cov, dose_1_cov, dose_2_cov, dose_ref, dose_2ref, dose_adic, dos_re_bi, "
    "fab_cov_1, fab_cov_2, fab_adic, fab_covref, fab_covrf2, fab_re_bi, dt_ut_dose, "
    "amostra, dt_coleta, pcr_resul, pos_pcrflu, tp_flu_pcr, "
    "pcr_vsr, pcr_adeno, pcr_metap, pcr_rino, pcr_sars2, pcr_boca, "
    "pcr_para1, pcr_para2, pcr_para3, pcr_para4, pcr_outro, an_sars2, "
    "antiviral, tp_antivir, trat_cov, tipo_trat, "
    "classi_fin, criterio, evolucao, dt_evoluca, reinf"
)

COPY_SQL = (
    f"COPY fato_caso_srag ({COPY_COLS}) "
    r"FROM STDIN WITH (FORMAT text, DELIMITER E'\t', NULL '\N')"
)

# ─── Helpers de conversão ──────────────────────────────────────────────────────

NULL_MARKER = r"\N"

def to_int(val):
    return normalization.to_int(val)

def to_str(val, length=None):
    return normalization.to_str(val, length)

def to_date(val):
    return normalization.to_date(val)

def to_ibge6(val):
    return normalization.to_ibge6(val)

def to_copy_val(val):
    """Serializa um valor Python para o protocolo COPY TEXT do PostgreSQL."""
    if val is None:
        return NULL_MARKER
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    s = str(val)
    # Escapar \, tab e newline conforme protocolo COPY TEXT
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")

# ─── Conversão de linha ────────────────────────────────────────────────────────

def row_to_copy_line(r, valid_munis):
    core, _reason = normalization.normalize_core(r)
    if core is None:
        return None
    dt_notific = core.notification_date
    ano_epi    = core.epidemiological_year

    co_mun_res_raw = to_ibge6(r.get("CO_MUN_RES"))
    co_mun_res = co_mun_res_raw if co_mun_res_raw in valid_munis else None

    vals = [
        to_int(r.get("NU_NOTIFIC")),
        dt_notific,
        to_int(r.get("SEM_NOT")),
        ano_epi,
        to_date(r.get("DT_SIN_PRI")), to_int(r.get("SEM_PRI")),
        to_date(r.get("DT_DIGITA")), to_date(r.get("DT_ENCERRA")),
        # localização
        to_str(r.get("SG_UF"), 2),
        to_ibge6(r.get("CO_MUN_NOT")),
        co_mun_res,
        # demográfico
        to_str(r.get("CS_SEXO"), 1),
        core.age,
        core.age_unit,
        to_int(r.get("CS_RACA")),
        to_int(r.get("CS_GESTANT")),
        to_int(r.get("CS_ESCOL_N")),
        # sintomas
        to_int(r.get("FEBRE")),     to_int(r.get("TOSSE")),
        to_int(r.get("DISPNEIA")),  to_int(r.get("DESC_RESP")),
        to_int(r.get("SATURACAO")), to_int(r.get("GARGANTA")),
        to_int(r.get("DIARREIA")),  to_int(r.get("VOMITO")),
        to_int(r.get("FADIGA")),    to_int(r.get("PERD_OLFT")),
        to_int(r.get("PERD_PALA")), to_int(r.get("DOR_ABD")),
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
        core.pcr_result,              to_int(r.get("POS_PCRFLU")),
        to_int(r.get("TP_FLU_PCR")),
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
    ]
    return "\t".join(to_copy_val(v) for v in vals)

# ─── Main ──────────────────────────────────────────────────────────────────────

def load_file(cur, conn, csv_path: Path, valid_munis: set, seen_notifics: set, truncate: bool):
    print(f"\n📂 {csv_path.name}")

    # Detecta colunas disponíveis no CSV
    header = pd.read_csv(csv_path, encoding="latin1", sep=";", nrows=0)
    disponiveis = set(header.columns.str.upper())
    usar = [c for c in ALL_SOURCE_COLS if c in disponiveis]

    print(f"   {len(usar)} colunas selecionadas de {len(disponiveis)} disponíveis")

    if truncate:
        print("   🗑️  TRUNCATE fato_caso_srag CASCADE...", end="", flush=True)
        cur.execute("SET statement_timeout = 0")
        cur.execute("TRUNCATE fato_caso_srag CASCADE")
        conn.commit()
        print(" ok")

    print("   📖 Lendo CSV...", end="", flush=True)
    df = pd.read_csv(
        csv_path,
        encoding="latin1",
        sep=";",
        usecols=usar,
        dtype=str,
        keep_default_na=False,
    )
    df.columns = df.columns.str.upper()
    df = df[df["NU_NOTIFIC"].str.strip() != ""]
    print(f" {len(df):,} linhas")

    print("   🔄 Convertendo e serializando...", end="", flush=True)
    buf = StringIO()
    skipped = 0
    for r in df.to_dict("records"):
        nu_notific = to_int(r.get("NU_NOTIFIC"))
        if not nu_notific:
            skipped += 1
            continue
        if nu_notific in seen_notifics:
            skipped += 1
            continue
        seen_notifics.add(nu_notific)
        line = row_to_copy_line(r, valid_munis)
        if line is None:
            skipped += 1
            continue
        buf.write(line + "\n")
    buf.seek(0)
    print(f" {len(df) - skipped:,} linhas serializadas ({skipped} ignoradas sem nu_notific)")

    print("   📤 COPY FROM STDIN...", end="", flush=True)
    cur.execute("SET statement_timeout = 0")
    t0 = datetime.now()
    cur.copy_expert(COPY_SQL, buf)
    conn.commit()
    elapsed = (datetime.now() - t0).total_seconds()
    print(f" {elapsed:.1f}s")


def main():
    csv_paths = [Path(p) for p in sys.argv[1:]]
    if not csv_paths:
        print("Uso: python seed.py INFLUD25.csv [INFLUD26.csv ...]")
        sys.exit(1)

    for p in csv_paths:
        if not p.exists():
            print(f"❌ Arquivo não encontrado: {p}", file=sys.stderr)
            sys.exit(1)

    print("🔌 Conectando ao banco...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    cur.execute("SELECT co_ibge FROM dim_municipio")
    valid_munis = {row[0] for row in cur.fetchall()}
    print(f"✅ {len(valid_munis):,} municípios válidos carregados")

    seen_notifics = set()
    for i, csv_path in enumerate(csv_paths):
        load_file(cur, conn, csv_path, valid_munis, seen_notifics, truncate=(i == 0))

    print("\n🔄 Recalculando fato_casos_semana_mun e _uf...", end="", flush=True)
    cur.execute("CALL refresh_semana_mun();")
    conn.commit()
    print(" ok")

    cur.execute("SELECT COUNT(*) FROM fato_caso_srag")
    n_casos = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT ano_epi) FROM fato_caso_srag WHERE ano_epi IS NOT NULL")
    n_anos = cur.fetchone()[0]

    print(f"\n{'─'*50}")
    print(f"✅ fato_caso_srag: {n_casos:,} registros | {n_anos} anos distintos")
    print(f"{'─'*50}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
