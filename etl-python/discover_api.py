"""
discover_api.py — Valida a API REST do DATASUS e mostra campos disponíveis
Execução: python etl-python/discover_api.py
"""

import sys
import requests

API_BASE  = "https://apidadosabertos.saude.gov.br"
ENDPOINT  = "/vigilancia-e-meio-ambiente/srag-2019-2026"

def main():
    print("=" * 60)
    print("SivepLens — Validação da API DATASUS")
    print(f"  {API_BASE}{ENDPOINT}")
    print("=" * 60)

    # 1 registro para inspecionar campos
    print("\n=== 1. Buscando 1 registro de jan/2025 ===")
    r = requests.get(
        API_BASE + ENDPOINT,
        params={"anomes_notific": "202501", "limit": 1, "offset": 0},
        timeout=30,
    )
    print(f"  HTTP {r.status_code}")
    r.raise_for_status()

    data  = r.json()
    key   = list(data.keys())[0]
    hits  = data[key]
    print(f"  Chave de resposta: {key!r}")
    print(f"  Registros retornados: {len(hits)}")

    if not hits:
        print("  Nenhum registro. Verifique o endpoint.")
        sys.exit(1)

    campos = list(hits[0].keys())
    print(f"\n=== 2. Campos disponíveis ({len(campos)}) ===")
    for c in campos:
        print(f"  {c}: {hits[0][c]!r}")

    # Conta total do mês
    print("\n=== 3. Contagem estimada jan/2025 (primeiras 5 páginas) ===")
    total = 0
    for offset in range(0, 5000, 1000):
        r2 = requests.get(
            API_BASE + ENDPOINT,
            params={"anomes_notific": "202501", "limit": 1000, "offset": offset},
            timeout=60,
        )
        r2.raise_for_status()
        batch = r2.json().get(key, [])
        total += len(batch)
        print(f"  offset={offset}: {len(batch)} registros")
        if len(batch) < 1000:
            break

    print(f"\n  Total jan/2025: ~{total} registros")
    print("\n=== RESUMO ===")
    print(f"  API funcional: SIM")
    print(f"  Endpoint: {API_BASE}{ENDPOINT}")
    print(f"  Filtro por mês: anomes_notific=YYYYMM")
    print(f"  Paginação: limit + offset (max 1000/página)")

if __name__ == "__main__":
    main()
