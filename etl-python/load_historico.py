"""
load_historico.py
──────────────────
Baixa e importa os arquivos INFLUD históricos (2019–2022) do OpenDataSUS.
Usa o mesmo scraping de portal que update_csv.py — sem URLs hardcoded.

Uso:
    python load_historico.py              # importa 2019, 2020, 2021, 2022
    python load_historico.py 2020 2021    # apenas anos específicos
"""

import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Garante UTF-8 no terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Reutiliza o scraper já testado de update_csv.py
sys.path.insert(0, str(Path(__file__).parent))
from update_csv import scrape_influd_urls

BASE        = Path(__file__).parent
HIST_DIR    = BASE / "historico"
LOAD_SCRIPT = BASE / "load_influd.py"

ANOS_HISTORICOS = [2019, 2020, 2021, 2022]


def download_file(url: str, dest: Path) -> bool:
    import requests
    if dest.exists():
        print(f"   ⏭  Já existe: {dest.name} ({dest.stat().st_size / 1_048_576:.0f} MB) — pulando")
        return True

    print(f"   ⬇  Baixando {dest.name}...")
    HIST_DIR.mkdir(exist_ok=True)
    t0 = datetime.now()
    try:
        resp = requests.get(url, stream=True, timeout=600,
                            headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        last_pct = -1
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = int(downloaded / total * 100 // 10) * 10
                    if pct > last_pct:
                        print(f"   {pct}%...", end=" ", flush=True)
                        last_pct = pct
        elapsed = (datetime.now() - t0).total_seconds()
        size_mb = dest.stat().st_size / 1_048_576
        print(f"\n   ✅ {dest.name} ({size_mb:.0f} MB) em {elapsed:.0f}s")
        return True
    except Exception as e:
        print(f"\n   ❌ Falha no download: {e}", file=sys.stderr)
        if dest.exists():
            dest.unlink()
        return False


def load_file(csv_path: Path) -> bool:
    print(f"\n🚀 Carregando {csv_path.name}...")
    result = subprocess.run(
        [sys.executable, str(LOAD_SCRIPT), str(csv_path)],
        check=False,
    )
    if result.returncode != 0:
        print(f"❌ load_influd.py falhou para {csv_path.name}", file=sys.stderr)
        return False
    return True


def main():
    anos_alvo = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else ANOS_HISTORICOS

    print(f"{'='*60}")
    print(f"  Carga histórica SRAG — anos: {anos_alvo}")
    print(f"{'='*60}\n")

    # Descobre URLs usando o mesmo scraper de update_csv.py
    # O portal srag-2019-a-2026 contém links para TODOS os anos
    print("🔍 Descobrindo URLs no portal OpenDataSUS...")
    try:
        todas_urls = scrape_influd_urls()   # retorna {ano: (url, data)}
    except Exception as e:
        print(f"   ❌ Scraping falhou: {e}", file=sys.stderr)
        sys.exit(1)

    # Filtra apenas os anos históricos pedidos
    urls_historicas = {
        ano: url
        for ano, (url, _) in todas_urls.items()
        if ano in anos_alvo
    }

    if not urls_historicas:
        print(f"❌ Nenhuma URL encontrada para os anos {anos_alvo}")
        print(f"   URLs disponíveis no portal: {sorted(todas_urls.keys())}")
        sys.exit(1)

    print(f"   {len(urls_historicas)} ano(s) encontrado(s): {sorted(urls_historicas.keys())}\n")

    erros = []
    for ano in sorted(anos_alvo):
        if ano not in urls_historicas:
            print(f"⚠  Ano {ano} não encontrado no portal (disponíveis: {sorted(urls_historicas)})")
            erros.append(f"{ano}: URL não encontrada no portal")
            continue

        url  = urls_historicas[ano]
        nome = url.split("/")[-1]
        dest = HIST_DIR / nome

        print(f"\n{'─'*60}")
        print(f"  Ano {ano}: {nome}")
        print(f"{'─'*60}")

        ok = download_file(url, dest)
        if not ok:
            erros.append(f"{ano}: falha no download")
            continue

        ok = load_file(dest)
        if not ok:
            erros.append(f"{ano}: falha na carga")

    print(f"\n{'='*60}")
    if erros:
        print(f"⚠  Concluído com {len(erros)} erro(s):")
        for e in erros:
            print(f"   • {e}")
    else:
        print(f"✅ Todos os anos carregados com sucesso!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
