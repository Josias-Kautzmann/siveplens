"""
fix_datas.py
────────────
Corrige dt_notific e ano_epi em fato_caso_srag para registros onde
essas colunas ficaram NULL por bug no parser to_date().

Estratégia rápida:
  1. Lê só NU_NOTIFIC + DT_NOTIFIC do CSV (colunas mínimas)
  2. Carrega em tabela temporária via COPY (mais rápido que INSERT)
  3. Faz um único UPDATE JOIN server-side (sem ida-e-volta por linha)

Uso:
    python fix_datas.py "caminho/para/INFLUD25.csv"
    python fix_datas.py "caminho/para/INFLUD26.csv"
"""

import os
import sys
from pathlib import Path
from datetime import datetime

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
DATABASE_URL = os.environ["DATABASE_URL"]

CSV_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not CSV_PATH or not CSV_PATH.exists():
    print(f"❌ Arquivo não encontrado: {CSV_PATH}", file=sys.stderr)
    sys.exit(1)

def to_date(val):
    if pd.isna(val) or not str(val).strip():
        return None
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

print(f"📂 CSV: {CSV_PATH}")
print("🔌 Conectando ao banco...")
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# ── 1. Lê apenas as colunas necessárias ──────────────────────────────────────
print("📖 Lendo CSV (apenas NU_NOTIFIC + DT_NOTIFIC)...", end="", flush=True)
df = pd.read_csv(
    CSV_PATH,
    encoding="latin1",
    sep=";",
    usecols=["NU_NOTIFIC", "DT_NOTIFIC"],
    dtype=str,
    keep_default_na=False,
)
df.columns = df.columns.str.upper()
print(f" {len(df):,} linhas lidas.")

# ── 2. Converte datas e filtra linhas válidas ─────────────────────────────────
print("🔍 Amostra de DT_NOTIFIC:")
sample = df["DT_NOTIFIC"].dropna().head(10).tolist()
for v in sample:
    print(f"   {repr(v)}")
non_empty = df["DT_NOTIFIC"].apply(lambda x: bool(str(x).strip())).sum()
print(f"   ({non_empty:,} de {len(df):,} não-vazios)")

print("🔄 Convertendo datas...", end="", flush=True)
df["dt_notific"] = df["DT_NOTIFIC"].apply(to_date)
df["nu_notific"] = pd.to_numeric(df["NU_NOTIFIC"], errors="coerce")
df["ano_epi"]    = df["dt_notific"].apply(lambda d: d.year if d else None)

# Só precisa atualizar linhas com data válida
df = df.dropna(subset=["nu_notific", "dt_notific"])
df["nu_notific"] = df["nu_notific"].astype(int)
print(f" {len(df):,} linhas com data válida.")

print(f"✅ {len(df):,} linhas prontas para atualização.")

# ── 4. UPDATE em batches de 10k ──────────────────────────────────────────────
BATCH = 10_000
UPDATE_SQL = """
    UPDATE fato_caso_srag SET
        dt_notific = data.dt_notific,
        ano_epi    = data.ano_epi
    FROM (VALUES %s) AS data(nu_notific, dt_notific, ano_epi)
    WHERE fato_caso_srag.nu_notific = data.nu_notific
"""

tuples = list(df[["nu_notific", "dt_notific", "ano_epi"]].itertuples(index=False, name=None))
total_updated = 0
n_batches = (len(tuples) + BATCH - 1) // BATCH

print(f"✏️  Atualizando em {n_batches} batches de {BATCH:,}...")
for i in range(0, len(tuples), BATCH):
    batch = tuples[i : i + BATCH]
    psycopg2.extras.execute_values(cur, UPDATE_SQL, batch, template="(%s, %s::date, %s::smallint)", page_size=BATCH)
    conn.commit()
    total_updated += cur.rowcount
    pct = min((i + BATCH) / len(tuples) * 100, 100)
    print(f"  batch {i//BATCH+1:4d}/{n_batches} | {cur.rowcount:,} atualizados | {pct:.0f}%")

cur.close()
conn.close()
print("✅ Concluído.")
