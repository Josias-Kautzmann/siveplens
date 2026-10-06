/** Read-only regression checks for the author's manual review feedback. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.SIVEPLENS_API_URL ?? "http://127.0.0.1:3000";
async function run(patch, expectedStatus = 200) {
  const response = await fetch(new URL("/api/analise/regressao", base), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "evolucao_bin", preditores: ["cs_sexo", "diabetes"], filtros: { ano_epi: 2024 }, refSexo: "M", ...patch }),
    signal: AbortSignal.timeout(120_000),
  });
  assert.equal(response.status, expectedStatus);
  return response.json();
}
const maleReference = await run({});
const femaleReference = await run({ refSexo: "F" });
assert.equal(maleReference.meta.converged, true);
assert.equal(femaleReference.meta.converged, true);
assert.equal(maleReference.meta.n, femaleReference.meta.n);
assert.equal(maleReference.meta.events, femaleReference.meta.events);
const female = maleReference.coeficientes.find(c => c.nome === "Sexo feminino");
const male = femaleReference.coeficientes.find(c => c.nome === "Sexo masculino");
assert.ok(Math.abs(female.beta + male.beta) < 1e-8);
assert.ok(Math.abs(female.aOR * male.aOR - 1) < 1e-8);
assert.ok(femaleReference.coeficientes.some(c => c.isReferencia && c.nome === "Feminino (ref.)"));
assert.equal(femaleReference.manifest.configuration.refSexo, "F");
assert.notEqual(maleReference.manifest.analysisId, femaleReference.manifest.analysisId);
const conflict = await run({ filtros: { ano_epi: 2024, cs_sexo: "F" } }, 422);
assert.match(conflict.error, /filtro global de sexo/);
const subgroup = await run({ filtros: { ano_epi: 2024, cs_sexo: "F" }, preditores: ["diabetes"] });
assert.equal(subgroup.meta.converged, true);
assert.ok(subgroup.meta.n < maleReference.meta.n);
assert.equal(subgroup.manifest.filters.cs_sexo, "F");
const report = {
  generatedAt: new Date().toISOString(), requestsPassed: 4,
  maleReference: { n: maleReference.meta.n, events: maleReference.meta.events, sexOR: female.aOR },
  femaleReference: { n: femaleReference.meta.n, events: femaleReference.meta.events, sexOR: male.aOR },
  singleSexConflict: conflict.error,
  femaleSubgroup: { n: subgroup.meta.n, events: subgroup.meta.events, converged: subgroup.meta.converged },
};
await mkdir("research/local", { recursive: true });
await writeFile("research/local/regression-feedback.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
