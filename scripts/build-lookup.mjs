/**
 * Gera os arquivos de lookup geográfico a partir do CSV de referência.
 *
 * Uso:
 *   node scripts/build-lookup.mjs [caminho-do-csv]
 *
 * Padrão: ../../ccmec25a64.csv/ccmec25a64.csv (relativo a este script)
 *
 * Saída:
 *   public/data/mun-names.json  →  { [co_ibge]: no_municipio }
 *   public/data/uf-names.json   →  { [sg_uf]: no_uf }
 *
 * Correspondência com o TopoJSON:
 *   geo.properties.codarea (7 dígitos) → co_ibge (6 dígitos) = codarea.slice(0, 6)
 */

import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CSV = join(
  __dirname,
  "../../ccmec25a64.csv/ccmec25a64.csv"
);

const CSV_PATH   = process.argv[2] ?? DEFAULT_CSV;
const OUT_DIR    = join(__dirname, "../public/data");
const MUN_OUT    = join(OUT_DIR, "mun-names.json");
const UF_OUT     = join(OUT_DIR, "uf-names.json");

// ─── Parse CSV linha por linha (sem dependências externas) ───────────────────

function parseLine(line, headers, sep) {
  const values = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      values.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  values.push(cur.trim());

  const row = {};
  headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
  return row;
}

async function main() {
  console.log(`📂 Lendo CSV: ${CSV_PATH}`);

  const munNames = {};
  const ufNames  = {};
  let headers    = null;
  let sep        = ",";
  let lineCount  = 0;

  const rl = createInterface({
    input: createReadStream(CSV_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headers) {
      // Detecta separador: ponto-e-vírgula ou vírgula
      sep = line.includes(";") ? ";" : ",";
      headers = line.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
      continue;
    }

    const row = parseLine(line, headers, sep);
    const coIbge      = (row["co_ibge"]      ?? "").trim();
    const noMunicipio = (row["no_municipio"] ?? "").trim();
    const sgUf        = (row["sg_uf"]        ?? "").trim();
    const noUf        = (row["no_uf"]        ?? "").trim();

    if (coIbge && noMunicipio) {
      munNames[coIbge] = noMunicipio;
    }
    if (sgUf && noUf) {
      ufNames[sgUf] = noUf;
    }

    lineCount++;
  }

  console.log(`✅ Linhas processadas: ${lineCount}`);
  console.log(`✅ Municípios únicos: ${Object.keys(munNames).length}`);
  console.log(`✅ UFs únicas:        ${Object.keys(ufNames).length}`);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(MUN_OUT, JSON.stringify(munNames, null, 0), "utf-8");
  await writeFile(UF_OUT,  JSON.stringify(ufNames,  null, 0), "utf-8");

  console.log(`📝 ${MUN_OUT}`);
  console.log(`📝 ${UF_OUT}`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
