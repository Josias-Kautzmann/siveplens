import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

export function replayRequest(manifest) {
  if (manifest?.schemaVersion !== "siveplens-analysis-spec/v2") throw new Error("Manifesto v2 esperado.");
  const c = manifest.configuration;
  if (!c || !manifest.filters) throw new Error("Configuração ou filtros ausentes.");
  const filtros = manifest.filters;
  switch (manifest.analysisType) {
    case "descriptive-numeric":
    case "descriptive-categorical":
      if (typeof c.variable !== "string") throw new Error("Variável ausente.");
      return { path: "/api/analise/descritiva", body: { filtros, variavel: c.variable, tipo: manifest.analysisType === "descriptive-categorical" ? "categorica" : "numerica" } };
    case "bivariate-association":
      if (typeof c.varX !== "string" || typeof c.varY !== "string") throw new Error("Variáveis ausentes.");
      return { path: "/api/analise/contingencia", body: { filtros, varX: c.varX, varY: c.varY, excluirIgnorado: c.excluirIgnorado } };
    case "logistic-regression":
      if (typeof c.outcome !== "string" || !Array.isArray(c.predictors)) throw new Error("Desfecho ou preditores ausentes.");
      return { path: "/api/analise/regressao", body: { filtros, outcome: c.outcome, preditores: c.predictors, incluirIgnorado: c.incluirIgnorado, ausenteComoAusencia: c.ausenteComoAusencia, refFaixa: c.refFaixa, refSexo: c.refSexo } };
    default: throw new Error("Tipo de análise não suportado.");
  }
}

export async function replay(input, baseUrl) {
  const original = input.manifest ?? input.result?.manifest ?? input;
  const request = replayRequest(original);
  const response = await fetch(new URL(request.path, baseUrl), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.body), signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`A API recusou a reexecução (HTTP ${response.status}).`);
  const result = await response.json();
  if (!result.manifest) throw new Error("A resposta não contém manifesto.");
  const identities = (m) => (m.source?.files ?? []).map(({ year, sha256, normalizationVersion }) => ({ year, sha256, normalizationVersion })).sort((a, b) => a.year - b.year);
  return {
    comparison: {
      originalAnalysisId: original.analysisId,
      currentAnalysisId: result.manifest.analysisId,
      sameAnalysisId: original.analysisId === result.manifest.analysisId,
      sameSourceFiles: identities(original).length > 0 && isDeepStrictEqual(identities(original), identities(result.manifest)),
      sameCohort: isDeepStrictEqual(original.cohort, result.manifest.cohort),
      caveat: "Reexecução na base atual. Identificadores iguais não substituem a preservação do snapshot nem provam equivalência de todos os resultados.",
    },
    result,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputPath, outputPath, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
  if (!inputPath || !outputPath || resolve(inputPath) === resolve(outputPath)) {
    console.error("Uso: npm run replay:analysis -- entrada.json saida.json [http://localhost:3000]. Preserve o arquivo de entrada.");
    process.exitCode = 1;
  } else {
    try {
      const report = await replay(JSON.parse(await readFile(inputPath, "utf8")), baseUrl);
      await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
      console.log(JSON.stringify(report.comparison, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Falha na reexecução.");
      process.exitCode = 1;
    }
  }
}
