import type { FiltrosSRAG } from "./filter-utils";

/** Stable identity for draft settings; results retain their own executed settings. */
export function regressionSettingsKey(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]),
    );
    return item;
  };
  return JSON.stringify(canonical(value));
}

export function sexPredictorConflict(predictors: readonly string[], filters: FiltrosSRAG): string | null {
  if (!predictors.includes("cs_sexo") || !filters.cs_sexo) return null;
  return "O filtro global de sexo restringe a população a uma única categoria. Para comparar feminino e masculino, selecione todos os sexos no filtro global e escolha a categoria de referência na configuração do modelo. Para analisar somente esse grupo, remova Sexo dos preditores.";
}
