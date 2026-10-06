"""
update_csv.py — ETL automático via CSV do OpenDataSUS

Fluxo:
  1. Raspa dadosabertos.saude.gov.br/dataset/srag-2019-a-2026 para obter
     as URLs S3 dos arquivos INFLUD25 e INFLUD26 mais recentes.
  2. Extrai a data de publicação do nome do arquivo
     (ex: INFLUD26-23-03-2026.csv → 2026-03-23).
  3. Consulta controle_carga: se dt_fim_busca == data extraída → já
     atualizado, encerra com código 0 sem tocar no banco.
  4. Baixa os dois CSVs via streaming para diretório temporário.
  5. TRUNCATE fato_caso_srag + COPY para cada arquivo (igual ao seed.py).
  6. Registra sucesso em controle_carga.
  7. Remove arquivos temporários.

Uso:
    python etl-python/update_csv.py
    python etl-python/update_csv.py --dry-run   # não persiste, só mostra o que faria
    python etl-python/update_csv.py --force     # ignora verificação de data

Variáveis de ambiente (etl-python/.env ou GitHub Secrets):
    DATABASE_URL — connection string PostgreSQL
"""

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import date, datetime
from io import StringIO
from pathlib import Path

import pandas as pd
import psycopg2
import requests
from dotenv import load_dotenv
import normalization

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"].strip()

PORTAL_URL = "https://dadosabertos.saude.gov.br/dataset/srag-2019-a-2026"

# Captura URLs S3 do tipo INFLUD26-23-03-2026.csv
S3_PATTERN = re.compile(
    r"https://s3\.sa-east-1\.amazonaws\.com/ckan\.saude\.gov\.br/SRAG/(\d{4})/"
    r"(INFLUD\d{2}-(\d{2})-(\d{2})-(\d{4})\.csv)"
)

# ─── Colunas do CSV (mesmas do seed.py) ───────────────────────────────────────

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

COLS_STR  = [
    "SG_UF", "SG_UF_INTE", "CS_SEXO", "DOSE_1_COV", "DOSE_2_COV", "DOSE_REF", "DOSE_2REF",
    "DOSE_ADIC", "DOS_RE_BI", "FAB_COV_1", "FAB_COV_2", "FAB_ADIC", "FAB_COVREF", "FAB_COVRF2", "FAB_RE_BI",
]
COLS_DATE = [
    "DT_NOTIFIC", "DT_SIN_PRI", "DT_DIGITA", "DT_ENCERRA", "DT_INTERNA",
    "DT_ENTUTI", "DT_SAIDUTI", "DT_COLETA", "DT_EVOLUCA", "DT_UT_DOSE",
]
COLS_IBGE = ["CO_MUN_NOT", "CO_MUN_RES", "CO_MU_INTE"]
ALL_SOURCE_COLS = ["NU_NOTIFIC", "SEM_NOT"] + COLS_INT[1:] + COLS_STR + COLS_DATE + COLS_IBGE

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

COPY_SQL = f"COPY fato_caso_srag ({COPY_COLS}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')"

NULL_MARKER = r"\N"

# ─── Helpers de conversão ─────────────────────────────────────────────────────

def to_int(val):
    return normalization.to_int(val)

def to_str(val, length=None):
    return normalization.to_str(val, length)

def to_date(val):
    return normalization.to_date(val)

def to_ibge6(val):
    return normalization.to_ibge6(val)

def to_copy_val(val):
    if val is None:
        return NULL_MARKER
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    s = str(val)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")

def row_to_copy_line(r, valid_munis):
    core, _reason = normalization.normalize_core(r)
    if core is None:
        return None
    dt_notific     = core.notification_date
    ano_epi        = core.epidemiological_year
    co_mun_res_raw = to_ibge6(r.get("CO_MUN_RES"))
    co_mun_res     = co_mun_res_raw if co_mun_res_raw in valid_munis else None

    vals = [
        to_int(r.get("NU_NOTIFIC")),
        dt_notific, to_int(r.get("SEM_NOT")), ano_epi,
        to_date(r.get("DT_SIN_PRI")), to_int(r.get("SEM_PRI")),
        to_date(r.get("DT_DIGITA")), to_date(r.get("DT_ENCERRA")),
        to_str(r.get("SG_UF"), 2), to_ibge6(r.get("CO_MUN_NOT")), co_mun_res,
        to_str(r.get("CS_SEXO"), 1), core.age,
        core.age_unit, to_int(r.get("CS_RACA")),
        to_int(r.get("CS_GESTANT")), to_int(r.get("CS_ESCOL_N")),
        to_int(r.get("FEBRE")),     to_int(r.get("TOSSE")),
        to_int(r.get("DISPNEIA")),  to_int(r.get("DESC_RESP")),
        to_int(r.get("SATURACAO")), to_int(r.get("GARGANTA")),
        to_int(r.get("DIARREIA")),  to_int(r.get("VOMITO")),
        to_int(r.get("FADIGA")),    to_int(r.get("PERD_OLFT")),
        to_int(r.get("PERD_PALA")), to_int(r.get("DOR_ABD")),
        to_int(r.get("CARDIOPATI")), to_int(r.get("DIABETES")),
        to_int(r.get("OBESIDADE")),  to_int(r.get("IMUNODEPRE")),
        to_int(r.get("RENAL")),      to_int(r.get("ASMA")),
        to_int(r.get("NEUROLOGIC")), to_int(r.get("PNEUMOPATI")),
        to_int(r.get("HEMATOLOGI")), to_int(r.get("SIND_DOWN")),
        to_int(r.get("HEPATICA")),   to_int(r.get("PUERPERA")),
        to_int(r.get("HOSPITAL")),   to_int(r.get("NOSOCOMIAL")),
        to_date(r.get("DT_INTERNA")),
        to_str(r.get("SG_UF_INTE"), 2),
        to_ibge6(r.get("CO_MU_INTE")),
        to_int(r.get("UTI")),
        to_date(r.get("DT_ENTUTI")), to_date(r.get("DT_SAIDUTI")),
        to_int(r.get("SUPORT_VEN")),
        to_int(r.get("VACINA")),     to_int(r.get("VACINA_COV")),
        to_str(r.get("DOSE_1_COV")), to_str(r.get("DOSE_2_COV")),
        to_str(r.get("DOSE_REF")),   to_str(r.get("DOSE_2REF")),
        to_str(r.get("DOSE_ADIC")),  to_str(r.get("DOS_RE_BI")),
        to_str(r.get("FAB_COV_1")),  to_str(r.get("FAB_COV_2")),
        to_str(r.get("FAB_ADIC")),   to_str(r.get("FAB_COVREF")),
        to_str(r.get("FAB_COVRF2")), to_str(r.get("FAB_RE_BI")),
        to_date(r.get("DT_UT_DOSE")),
        to_int(r.get("AMOSTRA")),    to_date(r.get("DT_COLETA")),
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
        to_int(r.get("CLASSI_FIN")), to_int(r.get("CRITERIO")),
        to_int(r.get("EVOLUCAO")),   to_date(r.get("DT_EVOLUCA")),
        to_int(r.get("REINF")),
    ]
    return "\t".join(to_copy_val(v) for v in vals)

# ─── Scraping / download ──────────────────────────────────────────────────────

def scrape_influd_urls() -> dict[int, tuple[str, date]]:
    """
    Raspa o portal OpenDataSUS e retorna {ano: (url, data_publicacao)} para
    2025 e 2026. Lança exceção se não encontrar nenhuma URL.
    """
    print(f"Buscando URLs em {PORTAL_URL}…", flush=True)
    r = requests.get(PORTAL_URL, timeout=30)
    r.raise_for_status()

    encontrados: dict[int, tuple[str, date]] = {}
    for m in S3_PATTERN.finditer(r.text):
        ano_dir  = int(m.group(1))
        filename = m.group(2)
        dd, mm, yyyy = m.group(3), m.group(4), m.group(5)
        pub_date = date(int(yyyy), int(mm), int(dd))
        url = f"https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SRAG/{ano_dir}/{filename}"
        # Mantém apenas a versão mais recente de cada ano (caso apareça mais de uma)
        if ano_dir not in encontrados or pub_date > encontrados[ano_dir][1]:
            encontrados[ano_dir] = (url, pub_date)

    if not encontrados:
        raise RuntimeError("Nenhuma URL INFLUD encontrada na página do portal.")

    for ano, (url, dt) in sorted(encontrados.items()):
        print(f"  INFLUD{str(ano)[-2:]} ({ano}): {url}  [publicado {dt}]")

    return encontrados

def download_csv(url: str, dest: Path) -> None:
    """Download com streaming e progresso em MB."""
    print(f"  Baixando {dest.name}…", end=" ", flush=True)
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()
    total = 0
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
            f.write(chunk)
            total += len(chunk)
            print(f"{total // (1024*1024)}MB", end="\r  Baixando … ", flush=True)
    print(f"{total / (1024*1024):.1f}MB — ok")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

# ─── Carga no banco ───────────────────────────────────────────────────────────

def load_file(cur, conn, csv_path: Path, valid_munis: set, seen_notifics: set, truncate: bool) -> dict:
    """Carrega um CSV e devolve estatísticas necessárias ao manifesto."""
    print(f"\n  {csv_path.name}")

    header    = pd.read_csv(csv_path, encoding="latin1", sep=";", nrows=0)
    disponiveis = set(header.columns.str.upper())
    usar      = [c for c in ALL_SOURCE_COLS if c in disponiveis]
    print(f"    {len(usar)} colunas selecionadas de {len(disponiveis)} disponíveis")

    if truncate:
        print("    TRUNCATE fato_caso_srag CASCADE…", end=" ", flush=True)
        cur.execute("SET statement_timeout = 0")
        cur.execute("TRUNCATE fato_caso_srag CASCADE")
        conn.commit()
        print("ok")

    print("    Lendo CSV…", end=" ", flush=True)
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
    print(f"{len(df):,} linhas")

    print("    Serializando…", end=" ", flush=True)
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
    inseridos = len(df) - skipped
    buf.seek(0)
    print(f"{inseridos:,} linhas ({skipped} ignoradas)")

    print("    COPY FROM STDIN…", end=" ", flush=True)
    cur.execute("SET statement_timeout = 0")
    t0 = datetime.now()
    cur.copy_expert(COPY_SQL, buf)
    conn.commit()
    print(f"{(datetime.now() - t0).total_seconds():.1f}s")

    notification_dates = pd.to_datetime(
        df.get("DT_NOTIFIC"), format="mixed", dayfirst=True, errors="coerce", utc=True
    )
    return {
        "total_linhas": inseridos,
        "min_dt_notific": notification_dates.min().date() if notification_dates.notna().any() else None,
        "max_dt_notific": notification_dates.max().date() if notification_dates.notna().any() else None,
        "sha256": sha256_file(csv_path),
        "tamanho_bytes": csv_path.stat().st_size,
    }

# ─── Controle de carga ────────────────────────────────────────────────────────

def ultima_publicacao(cur) -> date | None:
    """Retorna o dt_fim_busca da última carga csv_influd bem-sucedida."""
    cur.execute(
        "SELECT dt_fim_busca FROM controle_carga "
        "WHERE fonte = 'csv_influd' AND status = 'sucesso' "
        "ORDER BY concluido_em DESC LIMIT 1"
    )
    row = cur.fetchone()
    return row[0] if row else None

def registrar_inicio(cur, conn, pub_date: date) -> int:
    cur.execute(
        "INSERT INTO controle_carga (fonte, status, dt_fim_busca) "
        "VALUES ('csv_influd', 'rodando', %s) RETURNING id",
        (pub_date,),
    )
    carga_id = cur.fetchone()[0]
    conn.commit()
    return carga_id

def registrar_fim(cur, conn, carga_id: int, status: str, total: int, erro: str | None = None):
    cur.execute(
        "UPDATE controle_carga "
        "SET status=%s, concluido_em=NOW(), total_inseridos=%s, erro_mensagem=%s "
        "WHERE id=%s",
        (status, total, erro, carga_id),
    )
    conn.commit()


def registrar_manifesto(
    cur,
    conn,
    carga_id: int,
    ano: int,
    csv_path: Path,
    url: str,
    publicado_em: date,
    stats: dict,
):
    """Persiste uma identidade verificável para cada arquivo anual carregado."""
    cur.execute(
        """
        INSERT INTO manifesto_fonte (
          controle_carga_id, ano_epi, arquivo_nome, arquivo_url, publicado_em,
          sha256, tamanho_bytes, total_linhas, min_dt_notific, max_dt_notific,
          normalizacao_versao, metadados
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ano_epi, sha256) DO UPDATE SET
          controle_carga_id = EXCLUDED.controle_carga_id,
          arquivo_url = EXCLUDED.arquivo_url,
          publicado_em = EXCLUDED.publicado_em,
          total_linhas = EXCLUDED.total_linhas,
          min_dt_notific = EXCLUDED.min_dt_notific,
          max_dt_notific = EXCLUDED.max_dt_notific,
          normalizacao_versao = EXCLUDED.normalizacao_versao,
          metadados = EXCLUDED.metadados,
          carregado_em = NOW()
        """,
        (
            carga_id, ano, csv_path.name, url, publicado_em,
            stats["sha256"], stats["tamanho_bytes"], stats["total_linhas"],
            stats["min_dt_notific"], stats["max_dt_notific"],
            normalization.NORMALIZATION_VERSION,
            json.dumps({"source": "OpenDataSUS/SIVEP-Gripe", "format": "CSV"}),
        ),
    )
    conn.commit()

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ETL automático SRAG via CSV OpenDataSUS")
    parser.add_argument("--dry-run", action="store_true", help="Não persiste no banco")
    parser.add_argument("--force",   action="store_true", help="Ignora verificação de data")
    args = parser.parse_args()

    # 1. Descobrir URLs e data de publicação
    influd_urls = scrape_influd_urls()
    anos_alvo = [a for a in sorted(influd_urls) if a >= 2024]
    if not anos_alvo:
        print("Nenhum arquivo INFLUD25/INFLUD26 encontrado. Abortando.")
        sys.exit(1)

    # Data de publicação = a mais recente dentre os arquivos encontrados
    pub_date = max(influd_urls[a][1] for a in anos_alvo)
    print(f"\nData de publicação detectada: {pub_date}")

    # 2. Verificar se já foi processado
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur  = conn.cursor()

    try:
        ultima = ultima_publicacao(cur)
        print(f"Última publicação processada:  {ultima or '(nenhuma)'}")

        if not args.force and ultima == pub_date:
            print("\nCSV já está atualizado. Nenhuma ação necessária.")
            return

        if args.dry_run:
            print("\n[DRY-RUN] Seria baixado e carregado:")
            for ano in anos_alvo:
                url, dt = influd_urls[ano]
                print(f"  INFLUD{str(ano)[-2:]}: {url}  ({dt})")
            return

        # 3. Baixar CSVs para diretório temporário
        print("\nBaixando arquivos CSV…")
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            csv_paths = []
            for ano in anos_alvo:
                url, _ = influd_urls[ano]
                filename = url.split("/")[-1]
                dest = tmp / filename
                download_csv(url, dest)
                csv_paths.append(dest)

            # 4. Registrar início no controle_carga
            carga_id = registrar_inicio(cur, conn, pub_date)
            print(f"\nCarga registrada (id={carga_id}). Iniciando seed…")

            # 5. Carregar municípios válidos
            cur.execute("SELECT co_ibge FROM dim_municipio")
            valid_munis = {r[0] for r in cur.fetchall()}
            print(f"{len(valid_munis):,} municípios válidos carregados")

            # 6. TRUNCATE + COPY para cada arquivo
            seen_notifics = set()
            total_inseridos = 0
            try:
                for i, (ano, csv_path) in enumerate(zip(anos_alvo, csv_paths)):
                    stats = load_file(cur, conn, csv_path, valid_munis, seen_notifics, truncate=(i == 0))
                    total_inseridos += stats["total_linhas"]
                    url, publicado_em = influd_urls[ano]
                    registrar_manifesto(cur, conn, carga_id, ano, csv_path, url, publicado_em, stats)

                # 7. Recalcular agregações
                print("\nRecalculando agregações…", end=" ", flush=True)
                cur.execute("SET statement_timeout = 0")
                cur.execute("CALL refresh_semana_mun()")
                conn.commit()
                print("ok")

                # 8. Registrar sucesso
                registrar_fim(cur, conn, carga_id, "sucesso", total_inseridos)
                print(f"\nCarga concluida. {total_inseridos:,} registros inseridos.")

            except Exception as e:
                conn.rollback()
                registrar_fim(cur, conn, carga_id, "erro", 0, str(e))
                raise

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
