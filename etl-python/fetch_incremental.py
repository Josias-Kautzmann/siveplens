"""
fetch_incremental.py — ETL incremental via API REST do DATASUS (apidadosabertos.saude.gov.br)

Busca dia a dia os registros das últimas N semanas. Necessário porque o SIVEP-Gripe
insere registros com atraso — um caso notificado em março pode chegar ao sistema em abril,
e resultados de PCR chegam semanas depois da notificação.

A API é atualizada semanalmente pelo DATASUS. Rodamos buscando os últimos BUFFER_DAYS
dias para capturar tanto novos registros quanto atualizações de PCR/desfecho tardias.

Uso:
    python etl-python/fetch_incremental.py
    python etl-python/fetch_incremental.py --since 2024-10-01
    python etl-python/fetch_incremental.py --since 2024-10-01 --dry-run

Variáveis de ambiente (etl-python/.env):
    DATABASE_URL  — connection string PostgreSQL
"""

import argparse
import os
import time
from datetime import date, datetime, timedelta
from io import StringIO
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
import normalization

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]

API_BASE     = "https://apidadosabertos.saude.gov.br"
ENDPOINT     = "/vigilancia-e-meio-ambiente/srag-2019-2026"
PAGE_SIZE    = 1000
BUFFER_DAYS  = 60   # re-busca últimos N dias — captura inserções tardias e PCR atrasado
MAX_RETRIES  = 3

# ─── Helpers de conversão ─────────────────────────────────────────────────────

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
    if val is None:
        return NULL_MARKER
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    s = str(val)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")

# ─── Conversão de registro da API → lista de valores do COPY ─────────────────

def parse_record(r: dict, valid_munis: set) -> list | None:
    """Converte um registro da API para lista de valores na ordem do COPY."""
    core, _reason = normalization.normalize_core(r)
    if core is None:
        return None
    dt_notific = core.notification_date
    ano_epi = core.epidemiological_year

    def valid_municipality(value):
        code = to_ibge6(value)
        return code if code in valid_munis else None

    co_mun_not = valid_municipality(r.get("co_mun_not"))
    co_mun_res = valid_municipality(r.get("co_mun_res"))
    co_mu_inte = valid_municipality(r.get("co_mu_inte"))

    nu_notific = to_int(r.get("nu_notific"))
    if nu_notific is None:
        return None

    return [
        nu_notific,
        dt_notific,
        to_int(r.get("sem_not")),
        ano_epi,
        to_date(r.get("dt_sin_pri")),
        to_int(r.get("sem_pri")),
        to_date(r.get("dt_digita")),
        to_date(r.get("dt_encerra")),
        to_str(r.get("sg_uf"), 2),
        co_mun_not,
        co_mun_res,
        to_str(r.get("cs_sexo"), 1),
        core.age,
        core.age_unit,
        to_int(r.get("cs_raca")),
        to_int(r.get("cs_gestant")),
        to_int(r.get("cs_escol_n")),
        to_int(r.get("febre")),     to_int(r.get("tosse")),
        to_int(r.get("dispneia")),  to_int(r.get("desc_resp")),
        to_int(r.get("saturacao")), to_int(r.get("garganta")),
        to_int(r.get("diarreia")),  to_int(r.get("vomito")),
        to_int(r.get("fadiga")),    to_int(r.get("perd_olft")),
        to_int(r.get("perd_pala")), to_int(r.get("dor_abd")),
        to_int(r.get("cardiopati")), to_int(r.get("diabetes")),
        to_int(r.get("obesidade")),  to_int(r.get("imunodepre")),
        to_int(r.get("renal")),      to_int(r.get("asma")),
        to_int(r.get("neurologic")), to_int(r.get("pneumopati")),
        to_int(r.get("hematologi")), to_int(r.get("sind_down")),
        to_int(r.get("hepatica")),   to_int(r.get("puerpera")),
        to_int(r.get("hospital")),   to_int(r.get("nosocomial")),
        to_date(r.get("dt_interna")),
        to_str(r.get("sg_uf_inte"), 2),
        co_mu_inte,
        to_int(r.get("uti")),
        to_date(r.get("dt_entuti")), to_date(r.get("dt_saiduti")),
        to_int(r.get("suport_ven")),
        to_int(r.get("vacina")),     to_int(r.get("vacina_cov")),
        to_str(r.get("dose_1_cov")), to_str(r.get("dose_2_cov")),
        to_str(r.get("dose_ref")),   to_str(r.get("dose_2ref")),
        to_str(r.get("dose_adic")),  to_str(r.get("dos_re_bi")),
        to_str(r.get("fab_cov_1")),  to_str(r.get("fab_cov_2")),
        to_str(r.get("fab_adic")),   to_str(r.get("fab_covref")),
        to_str(r.get("fab_covrf2")), to_str(r.get("fab_re_bi")),
        to_date(r.get("dt_ut_dose")),
        to_int(r.get("amostra")),
        to_date(r.get("dt_coleta")),
        core.pcr_result,              to_int(r.get("pos_pcrflu")),
        to_int(r.get("tp_flu_pcr")),
        to_int(r.get("pcr_vsr")),    to_int(r.get("pcr_adeno")),
        to_int(r.get("pcr_metap")),  to_int(r.get("pcr_rino")),
        to_int(r.get("pcr_sars2")),  to_int(r.get("pcr_boca")),
        to_int(r.get("pcr_para1")),  to_int(r.get("pcr_para2")),
        to_int(r.get("pcr_para3")),  to_int(r.get("pcr_para4")),
        to_int(r.get("pcr_outro")),  to_int(r.get("an_sars2")),
        to_int(r.get("antiviral")),  to_int(r.get("tp_antivir")),
        to_int(r.get("trat_cov")),   to_int(r.get("tipo_trat")),
        to_int(r.get("classi_fin")), to_int(r.get("criterio")),
        to_int(r.get("evolucao")),
        to_date(r.get("dt_evoluca")),
        to_int(r.get("reinf")),
    ]

# ─── API fetch ────────────────────────────────────────────────────────────────

def fetch_day(dt: date) -> list[dict]:
    """Busca todos os registros de um dia específico (dt_notific = YYYY-MM-DD)."""
    url     = API_BASE + ENDPOINT
    records = []
    offset  = 0
    pagina  = 0

    while True:
        params = {"dt_notific": dt.isoformat(), "limit": PAGE_SIZE, "offset": offset}
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(url, params=params, timeout=60)
                r.raise_for_status()
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(5 * (attempt + 1))
                else:
                    raise

        hits = r.json().get("srag_2019_2026", [])
        records.extend(hits)
        pagina += 1

        if len(hits) < PAGE_SIZE:
            break

        offset += PAGE_SIZE
        print(f"    pág {pagina}: {len(records)} registros acumulados…", flush=True)

    return records

# ─── COPY cols + ON CONFLICT ──────────────────────────────────────────────────

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

UPDATE_COLS = [column.strip() for column in COPY_COLS.split(",") if column.strip() != "nu_notific"]
ON_CONFLICT_UPDATE = (
    "ON CONFLICT (nu_notific) DO UPDATE SET\n  "
    + ",\n  ".join(f"{column} = EXCLUDED.{column}" for column in UPDATE_COLS)
)

def upsert_records(cur, records: list, valid_munis: set, dry_run: bool) -> int:
    rows = []
    for rec in records:
        vals = parse_record(rec, valid_munis)
        if vals is None:
            continue
        rows.append(vals)

    if not rows or dry_run:
        return len(rows)

    cur.execute("""
        CREATE TEMP TABLE IF NOT EXISTS _etl_stage (LIKE fato_caso_srag)
        ON COMMIT DELETE ROWS
    """)

    buf = StringIO("\n".join("\t".join(to_copy_val(v) for v in r) for r in rows))
    cur.copy_expert(
        f"COPY _etl_stage ({COPY_COLS}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')",
        buf,
    )

    cur.execute(f"""
        INSERT INTO fato_caso_srag ({COPY_COLS})
        SELECT {COPY_COLS} FROM _etl_stage
        {ON_CONFLICT_UPDATE}
    """)

    return cur.rowcount

# ─── Controle de carga ────────────────────────────────────────────────────────

def registrar_inicio(cur, since: date, until: date) -> int:
    cur.execute(
        "INSERT INTO controle_carga (fonte, status, dt_inicio_busca, dt_fim_busca) VALUES (%s, 'rodando', %s, %s) RETURNING id",
        ("api_datasus", since, until),
    )
    return cur.fetchone()[0]

def registrar_fim(cur, carga_id: int, status: str,
                  buscados: int, inseridos: int, erro: str | None = None):
    cur.execute(
        "UPDATE controle_carga SET status=%s, concluido_em=NOW(), total_buscados=%s, total_inseridos=%s, erro_mensagem=%s WHERE id=%s",
        (status, buscados, inseridos, erro, carga_id),
    )

def ultima_carga_bem_sucedida(cur) -> date | None:
    cur.execute(
        "SELECT dt_fim_busca FROM controle_carga WHERE status='sucesso' ORDER BY concluido_em DESC LIMIT 1"
    )
    row = cur.fetchone()
    return row[0] if row else None

# ─── Detecta o último dia disponível na API (busca binária rápida) ───────────

def detectar_ultimo_dia_api() -> date | None:
    """Retorna o último dt_notific disponível na API via busca binária por offset."""
    try:
        # Offset alto conhecido: em testes, ~4.4M registros com último = 2024-12-29
        # Busca rápida: vai ao offset 4.4M e checa se tem dados
        for offset in [4_400_000, 4_000_000, 3_500_000]:
            r = requests.get(API_BASE + ENDPOINT,
                             params={"limit": 1, "offset": offset}, timeout=20)
            hits = r.json().get("srag_2019_2026", [])
            if hits:
                dt = hits[0].get("dt_notific")
                if dt:
                    return date.fromisoformat(dt)
        return None
    except Exception:
        return None

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ETL incremental SRAG via API DATASUS")
    parser.add_argument("--since", help="Data início busca YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="Não persiste no banco")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur  = conn.cursor()

    try:
        cur.execute("SET statement_timeout = 0")

        if args.since:
            since = date.fromisoformat(args.since)
        else:
            ultima = ultima_carga_bem_sucedida(cur)
            if ultima:
                since = ultima - timedelta(days=BUFFER_DAYS)
                print(f"Última carga bem-sucedida: {ultima} → buscando desde {since} (buffer {BUFFER_DAYS}d)")
            else:
                since = date(2025, 1, 1)
                print(f"Sem carga anterior. Carga inicial desde {since}")

        until = date.today()
        print(f"Janela: {since} → {until}")

        if args.dry_run:
            print("** DRY-RUN: nenhum dado será gravado **")

        cur.execute("SELECT co_ibge FROM dim_municipio")
        valid_munis = {r[0] for r in cur.fetchall()}
        print(f"Municípios válidos: {len(valid_munis)}")

        # A API DATASUS tem um lag — não adianta pedir datas futuras além do banco deles
        # Detecta o último dia disponível fazendo uma busca rápida
        api_until = detectar_ultimo_dia_api()
        if api_until and until > api_until:
            print(f"API disponível até {api_until}. Ajustando until.")
            until = api_until

        dias = [(since + timedelta(days=i)) for i in range((until - since).days + 1)]
        print(f"Dias a buscar: {len(dias)} ({since} → {until})")

        carga_id = None if args.dry_run else registrar_inicio(cur, since, until)
        if not args.dry_run:
            conn.commit()

        total_buscados  = 0
        total_inseridos = 0

        try:
            for i, dia in enumerate(dias, 1):
                print(f"  [{i}/{len(dias)}] {dia}…", end=" ", flush=True)
                records = fetch_day(dia)
                print(f"{len(records)} registros", flush=True)
                if not records:
                    continue
                total_buscados += len(records)
                inseridos = upsert_records(cur, records, valid_munis, args.dry_run)
                total_inseridos += inseridos
                if not args.dry_run:
                    conn.commit()

            print(f"\nTotal buscados: {total_buscados} | Inseridos/atualizados: {total_inseridos}")

            if not args.dry_run:
                print("Recalculando agregações…", flush=True)
                cur.execute("CALL refresh_semana_mun()")
                conn.commit()
                registrar_fim(cur, carga_id, "sucesso", total_buscados, total_inseridos)
                conn.commit()
                print("Carga concluída com sucesso.")

        except Exception as e:
            conn.rollback()
            if carga_id:
                try:
                    registrar_fim(cur, carga_id, "erro", total_buscados, 0, str(e))
                    conn.commit()
                except Exception:
                    pass
            raise

    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
