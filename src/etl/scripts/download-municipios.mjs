import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import rewind from '@turf/rewind';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'geo');
const TEMP_DIR = path.resolve(__dirname, '..', '.temp_geo');
const CONCURRENCY = 5; // Limita requests simultâneos

// Siglas de todos os estados do Brasil e seus códigos IBGE
const ESTADOS = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23',
  DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50',
  MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22',
  RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
  SP: '35', SE: '28', TO: '17',
};

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function processState(sigla, ibgeCode) {
  const finalOutputPath = path.join(OUTPUT_DIR, `mun-${ibgeCode}.topo.json`);
  const tempInputPath = path.join(TEMP_DIR, `temp_in_${ibgeCode}.json`);
  const tempOutputPath = path.join(TEMP_DIR, `temp_out_${ibgeCode}.json`);

  console.log(`[${sigla}] Iniciando download do IBGE...`);

  // 1. Download do GeoJSON cru com múltiplos polígonos
  const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ibgeCode}?formato=application/vnd.geo+json&resolucao=5&intrarregiao=municipio`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[${sigla}] Erro HTTP ${res.status}`);
  const data = await res.json();

  // 2. Transforma o GeometryCollection burro da API num FeatureCollection real
  let geoJSON = data;
  if (data.type === 'GeometryCollection') {
    geoJSON = {
      type: 'FeatureCollection',
      features: data.geometries.map((geom, i) => ({
        type: 'Feature',
        id: i,
        // Mantemos os metadados super leves. Os dados reais (Srag) virão via API
        properties: { name: `Município IBGE` },
        geometry: geom,
      })),
    };
  }

  // 3. Corrige o Winding Order (RFC 7946) para não zoar o d3-geo
  const fixedGeoJSON = rewind(geoJSON, { reverse: true });
  const originalSizeMB = JSON.stringify(fixedGeoJSON).length / 1024 / 1024;

  // Salva no dir temp
  fs.writeFileSync(tempInputPath, JSON.stringify(fixedGeoJSON));

  // 4. Simplificação Extrema e conversão para TopoJSON via npx mapshaper
  console.log(`[${sigla}] Simplificando geometria (${originalSizeMB.toFixed(2)} MB cruz)...`);

  try {
    // -simplify dp 5% = Usa algoritmo de Douglas-Peucker reduzindo em 95% o nro de pontos
    // force = sobrescreve sem perguntar
    execSync(`npx mapshaper -i "${tempInputPath}" -simplify dp 5% -o "${tempOutputPath}" format=topojson force`, { stdio: 'ignore' });
  } catch(e) {
    throw new Error(`Falha no mapshaper: ${e}`);
  }

  // 5. Copia pro local público final
  fs.copyFileSync(tempOutputPath, finalOutputPath);

  // Limpa arquivos pesados assincronamente (ou sincronamente)
  fs.unlinkSync(tempInputPath);
  fs.unlinkSync(tempOutputPath);

  const topoSizeMB = fs.statSync(finalOutputPath).size / 1024 / 1024;
  console.log(`[${sigla}] ✓ FINALIZADO: De ${originalSizeMB.toFixed(2)} MB para ${topoSizeMB.toFixed(2)} MB (${Math.round((1 - topoSizeMB/originalSizeMB)*100)}% de compressão!)`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await ensureDir(TEMP_DIR);

  const argStates = process.argv.slice(2).map(s => s.toUpperCase());
  const statesToProcess = argStates.length > 0
    ? argStates.filter(s => ESTADOS[s])
    : Object.keys(ESTADOS);

  console.log(`Iniciando ETL TopoJSON para ${statesToProcess.length} estados (Concorrência: ${CONCURRENCY})...`);

  for (let i = 0; i < statesToProcess.length; i += CONCURRENCY) {
    const batch = statesToProcess.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(sigla => processState(sigla, ESTADOS[sigla]).catch(err => console.error(err)))
    );
  }

  // cleanup dir temporário vazio
  if (fs.existsSync(TEMP_DIR) && fs.readdirSync(TEMP_DIR).length === 0) {
    fs.rmdirSync(TEMP_DIR);
  }

  console.log('\n✅ Pipeline finalizado! Os mapas otimizados `.topo.json` já estão em /public/geo.');
}

main();
