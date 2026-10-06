import test from "node:test";
import assert from "node:assert/strict";
import { buildInterpretacao, referenceSummary } from "../src/lib/regression-interpretation.ts";
import { assessProvenance } from "../src/lib/source-provenance.ts";
import { fitLogistic } from "../src/lib/logistic-regression.ts";
import { replayRequest, replay } from "../scripts/replay-analysis.mjs";
import { regressionSettingsKey, sexPredictorConflict } from "../src/lib/regression-config.ts";
import { csvPValue } from "../src/lib/export-csv.ts";
import { computeFisher, computeOR, computeRR, computeChiSquare } from "../src/lib/stat-utils.ts";

test("reviewed 2x2 export agrees with independent exact enumeration and ratio formulas", () => {
  const fisher = computeFisher(7, 43, 8, 320);
  // Independently enumerated hypergeometric probabilities with Python math.comb.
  assert.ok(Math.abs(fisher.pValue - 0.0013186375890006236) < 1e-10);
  assert.ok(Math.abs(computeOR(7, 43, 8, 320).or - (7 * 320) / (43 * 8)) < 1e-12);
  assert.ok(Math.abs(computeRR(7, 43, 8, 320).rr - 5.74) < 1e-12);
  const chi = computeChiSquare([[7, 43], [8, 320]]);
  assert.equal(chi.n, 378);
  assert.equal(chi.lowExpectedWarning, true);
  assert.ok(Math.abs(chi.chi2 - 15.216919169522274) < 1e-10);
});

test("draft filter and reference changes cannot identify an old result as current", () => {
  const original = { filtros: { ano_epi: 2024 }, refSexo: "M" };
  assert.equal(regressionSettingsKey(original), regressionSettingsKey({ refSexo: "M", filtros: { ano_epi: 2024 } }));
  assert.notEqual(regressionSettingsKey(original), regressionSettingsKey({ ...original, filtros: { ano_epi: 2024, cs_sexo: "F" } }));
  assert.notEqual(regressionSettingsKey(original), regressionSettingsKey({ ...original, refSexo: "F" }));
});

test("a single-sex population cannot estimate a sex comparison, but can estimate other predictors", () => {
  for (const cs_sexo of ["F", "M", "I"]) assert.match(sexPredictorConflict(["cs_sexo", "diabetes"], { cs_sexo }), /remova Sexo/);
  assert.equal(sexPredictorConflict(["diabetes"], { cs_sexo: "F" }), null);
  assert.equal(sexPredictorConflict(["cs_sexo"], {}), null);
});

test("CSV keeps small p-values positive and blanks unavailable statistics", () => {
  for (const p of [2.5474936000010265e-8, 6.649396712778098e-129, 6.166792825542332e-128]) {
    assert.ok(Number(csvPValue(p)) > 0);
    assert.ok(Math.abs(Number(csvPValue(p)) / p - 1) < 1e-6);
  }
  assert.equal(csvPValue(0.037555497), "0.037555");
  assert.equal(csvPValue(0), "0.000000");
  for (const p of [null, undefined, NaN, Infinity]) assert.equal(csvPValue(p), "");
});

const coef = { nome: "Sexo feminino", beta: -0.7, se: 0.2, aOR: 0.5, ci95Low: 0.3, ci95High: 0.8, z: -3.5, pValue: 0.001, isIntercept: false };
const result = () => ({
  coeficientes: [coef, { ...coef, nome: "Masculino (ref.)", isReferencia: true }, { ...coef, nome: "60-69 anos (ref.)", isReferencia: true }],
  meta: { n: 500, nRaw: 600, nExcluded: 100, events: 150, taxaEventos: 0.3, aic: 100, r2McFadden: 0.1, converged: true, iteracoes: 6 },
  outcome: { label: "Óbito", campo: "evolucao_bin" }, incluirIgnorado: false, ausenteComoAusencia: false,
});

test("nonconverged models cannot produce positive significance claims or a successful methods note", () => {
  const r = result(); r.meta.converged = false;
  const text = buildInterpretacao(r);
  assert.match(text.paragrafos.join(" "), /não convergiu/);
  assert.doesNotMatch(text.paragrafos.join(" "), /associação protetora|Preditores associados|convergindo/);
  assert.match(text.notaMetodos, /Não foram extraídas conclusões/);
});

test("JSON null statistics and separated estimates suspend interpretation", () => {
  for (const patch of [{ pValue: null }, { aOR: null }, { beta: 10 }, { se: 4 }]) {
    const r = result(); r.coeficientes = [{ ...coef, ...patch }];
    assert.match(buildInterpretacao(r).paragrafos.join(" "), /suspensa/);
  }
});

test("references follow returned model, and odds are not described as risk reductions", () => {
  const r = result(); const text = buildInterpretacao(r);
  assert.equal(referenceSummary(r.coeficientes), "Categorias de referência: Masculino; 60-69 anos.");
  assert.match(text.notaMetodos, /Masculino; 60-69/);
  assert.match(text.paragrafos.join(" "), /odds/);
  assert.doesNotMatch(text.paragrafos.join(" "), /protetora|maior risco/);
});

test("source coverage must include every requested year and valid identities", () => {
  const file = { year: 2024, sha256: "a".repeat(64), fileName: "2024.csv", normalizationVersion: "1" };
  assert.equal(assessProvenance([file], [2024]).status, "complete");
  assert.equal(assessProvenance([file], [2024, 2025]).status, "partial");
  assert.equal(assessProvenance([{ ...file, sha256: "invalid" }], [2024]).status, "partial");
  assert.equal(assessProvenance([file], [2024], true).status, "partial");
  assert.equal(assessProvenance([], [2024]).status, "partial");
});

test("logistic engine matches an analytical intercept and flags singular models", () => {
  const r = fitLogistic([[1,-2],[1,-1],[1,0],[1,1],[1,2]], [30,30,30,30,30], [100,100,100,100,100], ["intercept", "x"]);
  assert.equal(r.converged, true);
  assert.ok(Math.abs(r.coeficientes[0].beta - Math.log(0.3 / 0.7)) < 1e-8);
  assert.ok(Math.abs(r.coeficientes[1].beta) < 1e-8);
  const singular = fitLogistic([[1,1],[1,1],[1,1]], [10,20,30], [100,100,100], ["intercept","duplicate"]);
  assert.equal(singular.converged, false);
});

test("one binary predictor matches the analytical grouped-binomial solution", () => {
  const r = fitLogistic([[1, 0], [1, 1]], [10, 30], [100, 100], ["intercept", "exposure"]);
  assert.equal(r.converged, true);
  const coefficient = r.coeficientes[1];
  assert.ok(Math.abs(r.coeficientes[0].beta - Math.log(10 / 90)) < 1e-8);
  assert.ok(Math.abs(coefficient.beta - Math.log((30 / 70) / (10 / 90))) < 1e-8);
  assert.ok(Math.abs(coefficient.se - Math.sqrt(1 / 10 + 1 / 90 + 1 / 30 + 1 / 70)) < 1e-8);
  assert.equal(r.hosmerLemeshowDf, 0);
  assert.ok(Number.isNaN(r.hosmerLemeshowPValue));
});

const manifest = (analysisType, configuration) => ({ schemaVersion: "siveplens-analysis-spec/v2", analysisId: "original", analysisType, configuration, filters: { ano_epi: 2024 }, cohort: { effectiveN: 10 }, source: { files: [] } });
test("replay preserves regression references, missing-data mode and cohort filters", () => {
  const m = manifest("logistic-regression", { outcome: "uti", predictors: ["cs_sexo"], refSexo: "M", refFaixa: "60-69", ausenteComoAusencia: true, incluirIgnorado: false });
  assert.deepEqual(replayRequest(m), { path: "/api/analise/regressao", body: { filtros: { ano_epi: 2024 }, outcome: "uti", preditores: ["cs_sexo"], refSexo: "M", refFaixa: "60-69", ausenteComoAusencia: true, incluirIgnorado: false } });
  assert.equal(replayRequest(manifest("descriptive-categorical", { variable: "evolucao" })).body.tipo, "categorica");
  assert.equal(replayRequest(manifest("bivariate-association", { varX: "uti", varY: "evolucao_bin", excluirIgnorado: false })).body.excluirIgnorado, false);
  assert.throws(() => replayRequest({ ...m, schemaVersion: "unknown" }));
});

test("replay identifies drift and does not claim matching sources when identity is missing", async (t) => {
  const m = manifest("descriptive-numeric", { variable: "idade_anos" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ manifest: { ...m, analysisId: "changed", cohort: { effectiveN: 12 } } }));
  const r = await replay({ manifest: m }, "http://localhost:3000");
  assert.equal(r.comparison.sameAnalysisId, false);
  assert.equal(r.comparison.sameCohort, false);
  assert.equal(r.comparison.sameSourceFiles, false);
});
