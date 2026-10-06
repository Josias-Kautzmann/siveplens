/** Read-only HTTP integration checks; start the application with DATABASE_READ_ONLY=true. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { replay } from "../scripts/replay-analysis.mjs";

const base = process.env.SIVEPLENS_API_URL ?? "http://127.0.0.1:3000";
const directory = "research/local";
await mkdir(directory, { recursive: true });
const checks = [];
async function request(path, body, status = 200) {
  const response = await fetch(new URL(path, base), { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180_000) });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}`);
  const data = await response.json();
  checks.push({ path, status }); console.log(`${path}: HTTP ${status}`);
  return data;
}
function checkManifest(result) {
  assert.equal(result.manifest.schemaVersion, "siveplens-analysis-spec/v2");
  assert.match(result.manifest.analysisId, /^[a-f0-9]{16}$/);
  assert.ok(["complete", "partial"].includes(result.manifest.source.provenance.status));
}
const descriptive = await request("/api/analise/descritiva", { variavel: "idade_anos", filtros: { ano_epi: 2024 } });
checkManifest(descriptive);
assert.ok(descriptive.summary.populationN > 0);
assert.equal(descriptive.summary.populationN, descriptive.summary.validN + descriptive.summary.missingN);
await writeFile(`${directory}/descriptive.json`, JSON.stringify(descriptive, null, 2));
const categorical = await request("/api/analise/descritiva", { tipo: "categorica", variavel: "evolucao", filtros: { ano_epi: 2024 } });
checkManifest(categorical);
const bivariate = await request("/api/analise/contingencia", { varX: "diabetes", varY: "evolucao_bin", filtros: { ano_epi: 2024 }, excluirIgnorado: true });
checkManifest(bivariate);
assert.equal(bivariate.totalN, bivariate.cells.reduce((n, c) => n + c.n, 0));
assert.equal(bivariate.totalN + bivariate.excludedN, bivariate.manifest.cohort.populationN);
await writeFile(`${directory}/bivariate.json`, JSON.stringify(bivariate, null, 2));
const regression = await request("/api/analise/regressao", { outcome: "evolucao_bin", preditores: ["cs_sexo", "diabetes"], refSexo: "M", filtros: { ano_epi: 2024 } });
checkManifest(regression);
assert.equal(regression.meta.converged, true);
assert.equal(regression.meta.nRaw, regression.meta.n + regression.meta.nExcluded);
assert.ok(regression.coeficientes.some(c => c.isReferencia && c.nome.includes("Masculino")));
assert.equal(regression.manifest.configuration.refSexo, "M");
await writeFile(`${directory}/regression.json`, JSON.stringify(regression, null, 2));
for (const result of [descriptive, categorical, bivariate, regression]) {
  const repeated = await replay(result, base);
  assert.equal(repeated.comparison.sameAnalysisId, true);
  assert.equal(repeated.comparison.sameCohort, true);
  checks.push({ replay: result.manifest.analysisType, sameAnalysisId: true });
}
for (const [name, args] of [["consultar_bivariada", { varX: "diabetes", varY: "evolucao_bin", filtros: { ano_epi: 2024 } }], ["consultar_regressao", { outcome: "evolucao_bin", preditores: ["cs_sexo", "diabetes"], refSexo: "M", filtros: { ano_epi: 2024 } }]]) {
  const rpc = await request("/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  assert.ok(!rpc.error, JSON.stringify(rpc.error));
  assert.match(rpc.result.content[0].text, /MANIFESTO DA ANÁLISE/);
  assert.match(rpc.result.content[0].text, /siveplens-analysis-spec\/v2/);
}
await request("/api/analise/descritiva", { variavel: "not-a-variable" }, 400);
await request("/api/analise/contingencia", { varX: "not-a-variable", varY: "uti" }, 400);
await request("/api/analise/regressao", { outcome: "uti", preditores: ["not-a-variable"] }, 400);
const validation = await request("/api/validacao");
await writeFile(`${directory}/validation-api.json`, JSON.stringify(validation, null, 2));
const article = await request("/api/artigo/eramia-2026");
assert.equal(article.metrics.length, 6);
await writeFile(`${directory}/article-api.json`, JSON.stringify(article, null, 2));
await writeFile(`${directory}/platform-checks.json`, JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2));
console.log(`${checks.length} verificações passaram; evidências em ${directory}.`);
