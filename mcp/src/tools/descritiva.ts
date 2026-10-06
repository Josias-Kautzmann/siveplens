import { fmt } from "../stats.js";

export const TOOL_DESCRITIVA = {
  name: "resumir_variavel",
  description: `Calcula estatísticas descritivas foundation-first com denominadores, ausências e manifesto reproduzível.

Use antes de análises inferenciais. Exemplo: média de idade de óbitos com diabetes e COVID-19:
variavel="idade_anos", filtros={classi_fin:[5], evolucao:[2], criterios:[{campo:"diabetes", valores:[1]}]}.

COVID-19 deve ser definido explicitamente: classi_fin=[5] para classificação final ou criterio pcr_sars2=1 para PCR positivo.`,
  inputSchema: {
    type: "object" as const,
    required: ["variavel"],
    properties: {
      variavel: {
        type: "string",
        enum: ["idade_anos"],
      },
      filtros: {
        type: "object",
        properties: {
          ano_epi: { type: "number" },
          sg_uf: { type: "array", items: { type: "string" } },
          cs_sexo: { type: "string", enum: ["M", "F", "I"] },
          classi_fin: { type: "array", items: { type: "number" } },
          evolucao: { type: "array", items: { type: "number" } },
          etiologia: { type: "array", items: { type: "string" } },
          idade_min: { type: "number" },
          idade_max: { type: "number" },
          criterios: {
            type: "array",
            items: {
              type: "object",
              required: ["campo", "valores"],
              properties: {
                campo: { type: "string" },
                valores: { type: "array", items: { type: "number" } },
              },
            },
          },
        },
      },
    },
  },
};

interface DescriptiveApiResult {
  summary: {
    suppressed: boolean;
    minimumPopulationN: number;
    populationN: number | null;
    validN: number | null;
    missingN: number | null;
    missingPct: number | null;
    mean: number | null;
    stdDev: number | null;
    median: number | null;
    q1: number | null;
    q3: number | null;
    min: number | null;
    max: number | null;
  };
  manifest: {
    analysisId: string;
    variable: { label: string; definition: string };
    source: { latestNotificationDate: string | null };
    filters: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export async function handleDescritiva(
  args: { variavel: "idade_anos"; filtros?: Record<string, unknown> },
  apiUrl: string,
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/analise/descritiva`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(error.error ?? `API retornou HTTP ${response.status}`);
  }

  const { summary, manifest } = await response.json() as DescriptiveApiResult;
  if (summary.suppressed) {
    return [
      `Resultado suprimido: a população contém menos de ${summary.minimumPopulationN} notificações.`,
      `Filtros: ${JSON.stringify(manifest.filters)}`,
      "A supressão reduz o risco de divulgação de informações em recortes pequenos.",
      "",
      "MANIFESTO REPRODUTÍVEL (JSON)",
      JSON.stringify(manifest, null, 2),
    ].join("\n");
  }
  if (summary.populationN === 0) {
    return `Nenhuma notificação encontrada. Filtros: ${JSON.stringify(manifest.filters)}.`;
  }
  const value = (number: number | null) => number === null ? "—" : fmt(number);
  const lines = [
    `RESUMO DESCRITIVO — ${manifest.variable.label}`,
    "═══════════════════════════════════════════════════════",
    `Definição: ${manifest.variable.definition}`,
    `Filtros: ${JSON.stringify(manifest.filters)}`,
    `N da população: ${summary.populationN!.toLocaleString("pt-BR")}`,
    `N válido: ${summary.validN!.toLocaleString("pt-BR")}`,
    `Ausentes/inválidos: ${summary.missingN!.toLocaleString("pt-BR")} (${fmt(summary.missingPct!)}%)`,
    "",
    `Média (DP): ${value(summary.mean)} (${value(summary.stdDev)}) anos`,
    `Mediana [Q1; Q3]: ${value(summary.median)} [${value(summary.q1)}; ${value(summary.q3)}] anos`,
    `Mínimo–máximo: ${value(summary.min)}–${value(summary.max)} anos`,
    "",
    `Corte dos dados: ${manifest.source.latestNotificationDate ?? "não informado"}`,
    `ID da análise: ${manifest.analysisId}`,
    "",
    "MANIFESTO REPRODUTÍVEL (JSON)",
    JSON.stringify(manifest, null, 2),
    "",
    "Resultado descritivo/exploratório; não implica associação causal nem validação clínica.",
  ];
  return lines.join("\n");
}
