"""
seed_dim_municipio.py
─────────────────────
Popula a tabela dim_municipio no Supabase a partir de duas fontes:
  1. mun-names.json   → co_ibge + no_municipio  (gerado pelo build-lookup.mjs)
  2. ccmec25a64.csv   → hierarquia geográfica completa (co_uf, sg_uf, no_uf,
                         co_regiao_saude, no_regiao_saude, co_macro, no_macro,
                         co_regiao_brasil, no_regiao_brasil, sg_regiao_brasil)

Uso:
    python seed_dim_municipio.py

O script é idempotente: usa INSERT ... ON CONFLICT DO UPDATE.
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ─── Configuração ─────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL    = os.environ["DATABASE_URL"].strip()
MUN_NAMES_JSON  = Path(os.environ.get("MUN_NAMES_JSON",  "../public/data/mun-names.json"))
CCMEC_CSV       = Path(os.environ.get("CCMEC_CSV",       "../../ccmec25a64.csv/ccmec25a64.csv"))

# Resolve caminhos relativos à pasta do script
BASE = Path(__file__).parent
MUN_NAMES_JSON = BASE / MUN_NAMES_JSON if not MUN_NAMES_JSON.is_absolute() else MUN_NAMES_JSON
CCMEC_CSV      = BASE / CCMEC_CSV      if not CCMEC_CSV.is_absolute()      else CCMEC_CSV

# ─── Helpers ──────────────────────────────────────────────────────────────────

def to_int_or_none(val):
    try:
        v = str(val).strip()
        return int(float(v)) if v else None
    except (ValueError, TypeError):
        return None

def to_str_or_none(val):
    v = str(val).strip() if pd.notna(val) else None
    return v if v else None

# ─── 1. Carrega lookup de nomes ───────────────────────────────────────────────

print(f"📂 Lendo {MUN_NAMES_JSON}...")
with open(MUN_NAMES_JSON, encoding="utf-8") as f:
    mun_names: dict[str, str] = json.load(f)   # {co_ibge: no_municipio}

print(f"   → {len(mun_names):,} municípios no lookup")

# ─── 2. Carrega hierarquia do CCMEC ──────────────────────────────────────────

print(f"📂 Lendo {CCMEC_CSV}...")
df = pd.read_csv(
    CCMEC_CSV,
    encoding="utf-8",
    sep=",",
    dtype=str,
    usecols=["co_ibge", "co_uf", "sg_uf", "no_uf",
             "co_regiao_saude", "no_regiao_saude",
             "co_macro", "no_macro",
             "co_regiao_brasil", "no_regiao_brasil", "sg_regiao_brasil"],
)

# Remove duplicatas — um município aparece N vezes (uma por competência)
df = df.drop_duplicates(subset=["co_ibge"])
df["co_ibge"] = df["co_ibge"].str.strip().str.zfill(6)

# Índice para lookup rápido
hierarquia: dict[str, dict] = df.set_index("co_ibge").to_dict("index")
print(f"   → {len(hierarquia):,} municípios com hierarquia geográfica")

# ─── 3. Monta registros para inserção ────────────────────────────────────────

registros = []
sem_hierarquia = 0

for co_ibge, no_municipio in mun_names.items():
    h = hierarquia.get(co_ibge, {})
    if not h:
        sem_hierarquia += 1

    registros.append({
        "co_ibge":          co_ibge,
        "no_municipio":     no_municipio,
        "co_uf":            to_int_or_none(h.get("co_uf")),
        "sg_uf":            to_str_or_none(h.get("sg_uf")) or "??",
        "no_uf":            to_str_or_none(h.get("no_uf"))  or "Desconhecido",
        "co_regiao_saude":  to_int_or_none(h.get("co_regiao_saude")),
        "no_regiao_saude":  to_str_or_none(h.get("no_regiao_saude")),
        "co_macro":         to_int_or_none(h.get("co_macro")),
        "no_macro":         to_str_or_none(h.get("no_macro")),
        "co_regiao_brasil": to_int_or_none(h.get("co_regiao_brasil")),
        "no_regiao_brasil": to_str_or_none(h.get("no_regiao_brasil")),
        "sg_regiao_brasil": to_str_or_none(h.get("sg_regiao_brasil")),
    })

print(f"   → {len(registros):,} registros montados  ({sem_hierarquia} sem hierarquia no CCMEC)")

# ─── 4. Insere no Supabase ────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO dim_municipio (
  co_ibge, no_municipio, co_uf, sg_uf, no_uf,
  co_regiao_saude, no_regiao_saude,
  co_macro, no_macro,
  co_regiao_brasil, no_regiao_brasil, sg_regiao_brasil
) VALUES %s
ON CONFLICT (co_ibge) DO UPDATE SET
  no_municipio     = EXCLUDED.no_municipio,
  co_uf            = EXCLUDED.co_uf,
  sg_uf            = EXCLUDED.sg_uf,
  no_uf            = EXCLUDED.no_uf,
  co_regiao_saude  = EXCLUDED.co_regiao_saude,
  no_regiao_saude  = EXCLUDED.no_regiao_saude,
  co_macro         = EXCLUDED.co_macro,
  no_macro         = EXCLUDED.no_macro,
  co_regiao_brasil = EXCLUDED.co_regiao_brasil,
  no_regiao_brasil = EXCLUDED.no_regiao_brasil,
  sg_regiao_brasil = EXCLUDED.sg_regiao_brasil;
"""

print(f"\n🔌 Conectando ao Supabase...")
conn = psycopg2.connect(DATABASE_URL)
cur  = conn.cursor()

rows = [
    (
        r["co_ibge"], r["no_municipio"], r["co_uf"], r["sg_uf"], r["no_uf"],
        r["co_regiao_saude"], r["no_regiao_saude"],
        r["co_macro"], r["no_macro"],
        r["co_regiao_brasil"], r["no_regiao_brasil"], r["sg_regiao_brasil"],
    )
    for r in registros
]

psycopg2.extras.execute_values(cur, UPSERT_SQL, rows, page_size=500)
conn.commit()

print(f"✅ {len(rows):,} municípios inseridos/atualizados em dim_municipio")

cur.close()
conn.close()
