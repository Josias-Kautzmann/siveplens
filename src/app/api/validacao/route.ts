import { NextResponse } from "next/server";
import { getScientificValidationSnapshot } from "@/dal/scientific-validation.repo";
import {
  ETL_NORMALIZATION_VERSION,
  SCIENTIFIC_VALIDATION_VERSION,
  STUDIES,
} from "@/lib/scientific-validation";
import { ERAMIA_FROZEN_PROVENANCE } from "@/lib/eramia-2026";

export const revalidate = 3600;

export async function GET() {
  const snapshot = await getScientificValidationSnapshot();
  const publicSnapshot = {
    ...snapshot,
    inferential: {
      vaccinationIcuMortality: snapshot.inferential.vaccinationIcuMortality,
      pediatricMortalityRegression: snapshot.inferential.pediatricMortalityRegression,
      vaccinationMortalityRegression: snapshot.inferential.vaccinationMortalityRegression,
    },
  };
  return NextResponse.json(
    {
      schemaVersion: "2.1.0",
      validationProtocol: SCIENTIFIC_VALIDATION_VERSION,
      normalizationProtocol: ETL_NORMALIZATION_VERSION,
      studies: STUDIES,
      controlledEngineValidation: ERAMIA_FROZEN_PROVENANCE.engineValidation,
      snapshot: publicSnapshot,
      caveat: "O teste controlado valida o núcleo estatístico sobre o XLSX público dos autores; os resultados calculados na base viva permanecem separados. Nenhum resultado constitui validação clínica nem prova causal.",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Content-Disposition": "inline; filename=siveplens-validacao-cientifica.json",
      },
    },
  );
}
