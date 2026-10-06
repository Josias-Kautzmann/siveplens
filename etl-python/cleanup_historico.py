"""
cleanup_historico.py
─────────────────────
Remove dados históricos (≤ 2022) do banco e reconstrói as tabelas agregadas.

Uso:
    python cleanup_historico.py           # remove 2019, 2020, 2021, 2022
    python cleanup_historico.py --dry-run # apenas conta, não deleta
"""

import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("❌  Variável DATABASE_URL não definida.", file=sys.stderr)
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv

def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # ── Conta o que será removido ──────────────────────────────────────────────
    cur.execute("""
        SELECT ano_epi, COUNT(*)
        FROM fato_caso_srag
        WHERE ano_epi <= 2022
        GROUP BY ano_epi
        ORDER BY ano_epi
    """)
    rows = cur.fetchall()

    if not rows:
        print("ℹ️  Nenhum dado de 2022 ou anterior encontrado no banco.")
        cur.close()
        conn.close()
        return

    total = sum(n for _, n in rows)
    print(f"\n{'='*55}")
    print(f"  Dados a remover (ano_epi ≤ 2022):")
    print(f"{'='*55}")
    for ano, n in rows:
        print(f"  {ano}: {n:>10,} registros")
    print(f"{'─'*55}")
    print(f"  Total: {total:>10,} registros")
    print(f"{'='*55}\n")

    if DRY_RUN:
        print("🔍  --dry-run: nenhuma alteração feita.")
        cur.close()
        conn.close()
        return

    # ── Transação 1: fato_caso_srag ────────────────────────────────────────────
    print("🗑️  Deletando fato_caso_srag (ano_epi ≤ 2022)...")
    cur.execute("DELETE FROM fato_caso_srag WHERE ano_epi <= 2022")
    deleted = cur.rowcount
    conn.commit()
    print(f"   ✅ {deleted:,} linhas removidas e commitadas")

    # ── Transação 2: tabelas agregadas (sem reconstrução total) ────────────────
    print("\n🗑️  Deletando fato_casos_semana_mun (ano_epi ≤ 2022)...")
    cur.execute("DELETE FROM fato_casos_semana_mun WHERE ano_epi <= 2022")
    n_mun = cur.rowcount
    conn.commit()
    print(f"   ✅ {n_mun:,} linhas removidas")

    print("\n🗑️  Deletando fato_casos_semana_uf (ano_epi ≤ 2022)...")
    cur.execute("DELETE FROM fato_casos_semana_uf WHERE ano_epi <= 2022")
    n_uf = cur.rowcount
    conn.commit()
    print(f"   ✅ {n_uf:,} linhas removidas")

    # ── Transação 3: controle_carga ────────────────────────────────────────────
    cur.execute("DELETE FROM controle_carga WHERE ano_epi <= 2022")
    n_ctrl = cur.rowcount
    conn.commit()
    print(f"\n🧹 {n_ctrl} entradas removidas de controle_carga")

    cur.close()
    conn.close()

    print(f"\n✅  Concluído — {deleted:,} registros históricos removidos.")
    print("   O filtro de anos no dashboard será atualizado automaticamente.\n")


if __name__ == "__main__":
    main()
