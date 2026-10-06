import { redirect } from "next/navigation";
import {
  getCategoricalSummary,
  getNumericSummary,
} from "@/dal/descriptive.repo";
import { CATEGORICAL_VARIABLES, type CategoricalVariable } from "@/lib/descriptive-catalog";
import { getAnosDisponiveis } from "@/dal/casos.repo";
import { parseFilters } from "@/lib/filter-utils";
import DescritivaClient from "../_components/DescritivaClient";

export const dynamic = "force-dynamic";

export default async function DescritivaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;

  if (!params.ano && !params.anos) {
    const years = await getAnosDisponiveis();
    const latestYear = years.at(-1);
    if (latestYear) {
      const next = new URLSearchParams(
        Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
      next.set("anos", String(latestYear));
      redirect(`/analise/descritiva?${next.toString()}`);
    }
  }

  const filters = parseFilters(params);
  const mode = params.modo === "categorica" ? "categorica" : "numerica";

  if (mode === "categorica") {
    const candidate = params.variavel ?? "evolucao";
    const variable = (candidate in CATEGORICAL_VARIABLES ? candidate : "evolucao") as CategoricalVariable;
    const result = await getCategoricalSummary(variable, filters);
    return (
      <DescritivaClient
        mode="categorica"
        selectedVariable={variable}
        filters={filters}
        categoricalResult={result}
      />
    );
  }

  const result = await getNumericSummary("idade_anos", filters);
  return (
    <DescritivaClient
      mode="numerica"
      selectedVariable="idade_anos"
      filters={filters}
      numericResult={result}
    />
  );
}
