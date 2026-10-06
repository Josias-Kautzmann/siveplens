/**
 * Run the production SivepLens logistic engine on the authors' exact design matrix
 * and compare it with the glm() coefficients printed in their public analysis.html.
 */

import { readFile, writeFile } from "node:fs/promises";
// Node's type-stripping runner requires the explicit extension; the app build does not import this audit script.
// @ts-expect-error TS5097: explicit .ts extension is intentional for the standalone validation command.
import { fitLogistic } from "../src/lib/logistic-regression.ts";

interface MatrixPayload {
  source: { fileName: string; sha256: string; protocol: string };
  names: string[];
  X: number[][];
  y: number[];
  w: number[];
  cohort: { n: number; events: number; survivors: number; doseGroups: Record<string, number> };
}

const REFERENCE = [
  { name: "(Intercept)", beta: -2.040698, se: 0.932136 },
  { name: "NU_IDADE_N", beta: 0.009214, se: 0.011312 },
  { name: "CS_SEXOM", beta: 0.069242, se: 0.219842 },
  { name: "education_levelElementary", beta: 1.078364, se: 0.389687 },
  { name: "education_levelMiddle", beta: 1.060408, se: 0.482131 },
  { name: "education_levelUnknown", beta: 0.563076, se: 0.340037 },
  { name: "nominal_icu_admissionYes", beta: 0.365988, se: 0.254819 },
  { name: "nominal_invasive_support_venYes", beta: 2.529359, se: 0.359145 },
  { name: "categorical_doses1-2", beta: -0.407902, se: 0.373804 },
  { name: "categorical_doses3", beta: -0.402041, se: 0.383953 },
  { name: "categorical_doses4", beta: -0.607060, se: 0.381589 },
  { name: "categorical_doses5+", beta: -0.586755, se: 0.378867 },
] as const;

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node validate_rezende_web_engine.ts <matrix.json> <report.json>");
  }

  const payload = JSON.parse(await readFile(inputPath, "utf8")) as MatrixPayload;
  const result = fitLogistic(payload.X, payload.y, payload.w, payload.names);

  const comparisons = REFERENCE.map((reference, index) => {
    const actual = result.coeficientes[index];
    if (actual.nome !== reference.name) {
      throw new Error(`Coefficient order mismatch: ${actual.nome} != ${reference.name}`);
    }
    return {
      name: reference.name,
      referenceBeta: reference.beta,
      sivepLensBeta: actual.beta,
      absoluteBetaDifference: Math.abs(actual.beta - reference.beta),
      referenceSE: reference.se,
      sivepLensSE: actual.se,
      absoluteSEDifference: Math.abs(actual.se - reference.se),
      referenceOR: Math.exp(reference.beta),
      sivepLensOR: actual.aOR,
    };
  });

  const maxBetaDifference = Math.max(...comparisons.map((item) => item.absoluteBetaDifference));
  const maxSEDifference = Math.max(...comparisons.map((item) => item.absoluteSEDifference));
  const tolerance = 5e-6; // Authors' HTML prints beta and SE to six decimal places.
  const report = {
    schemaVersion: "siveplens-engine-validation/v1",
    generatedAt: new Date().toISOString(),
    source: payload.source,
    reference: {
      implementation: "R glm(family=binomial)",
      url: "https://joaofelipe.github.io/COVID-Study/analysis.html",
      precision: "Coefficients and standard errors printed to six decimal places",
    },
    engine: {
      implementation: "SivepLens fitLogistic",
      algorithm: "binomial-logit IRLS maximum likelihood",
      sourceFile: "src/lib/logistic-regression.ts",
    },
    cohort: payload.cohort,
    result: {
      converged: result.converged,
      iterations: result.iteracoes,
      maxBetaDifference,
      maxSEDifference,
      tolerance,
      allCoefficientsMatched: comparisons.every(
        (item) => item.absoluteBetaDifference <= tolerance && item.absoluteSEDifference <= tolerance,
      ),
    },
    coefficients: comparisons,
  };

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.result));
  console.log(JSON.stringify({
    doseOddsRatios: comparisons.slice(8).map((item) => item.sivepLensOR),
  }));

  if (!report.result.converged || !report.result.allCoefficientsMatched) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha na validação do motor.");
  process.exitCode = 1;
});
