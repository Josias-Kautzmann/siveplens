import { CATALOGO, OUTCOMES_REGRESSAO, PREDITORES_REGRESSAO } from "../catalog.js";

export const TOOL_CATALOGO = {
  name: "listar_variaveis",
  description: `Lista todas as variáveis disponíveis no banco SIVEP-Gripe para análise.

Use esta ferramenta ANTES de consultar_bivariada ou consultar_regressao sempre que não tiver certeza de qual campo usar.
Por exemplo: se o usuário menciona "diabetes", confirme que o campo é "diabetes";
se menciona "óbito", use "evolucao_bin" (não "evolucao" — que tem 3 categorias).

Retorna: campo (nome para a API), label, categoria, descrição e avisos.`,
  inputSchema: {
    type:       "object" as const,
    properties: {
      categoria: {
        type:        "string",
        description: "Filtrar por categoria (opcional): Desfecho | Demográfico | Vacinação | Comorbidades | Sintomas | Geográfico",
      },
    },
  },
};

export function handleCatalogo(args: { categoria?: string }): string {
  const { categoria } = args;

  const vars = categoria
    ? CATALOGO.filter(v => v.categoria.toLowerCase() === categoria.toLowerCase())
    : CATALOGO;

  if (vars.length === 0) {
    return `Nenhuma variável encontrada para a categoria "${categoria}".`;
  }

  const grupos = new Map<string, typeof CATALOGO>();
  for (const v of vars) {
    if (!grupos.has(v.categoria)) grupos.set(v.categoria, []);
    grupos.get(v.categoria)!.push(v);
  }

  const linhas: string[] = [
    "VARIÁVEIS DISPONÍVEIS NO SIVEP-GRIPE — SivepLens",
    "═══════════════════════════════════════════════════",
    "",
    "ANÁLISE BIVARIADA: qualquer variável abaixo pode ser varX ou varY.",
    "REGRESSÃO LOGÍSTICA:",
    `  Desfechos (outcome): ${OUTCOMES_REGRESSAO.join(", ")}`,
    `  Preditores válidos: ${PREDITORES_REGRESSAO.join(", ")} (+ faixa_etaria)`,
    "",
  ];

  for (const [cat, lista] of grupos) {
    linhas.push(`── ${cat.toUpperCase()} ──────────────────────────────────`);
    for (const v of lista) {
      linhas.push(`  Campo: "${v.campo}"`);
      linhas.push(`  Label: ${v.label}`);
      linhas.push(`  Descrição: ${v.descricao}`);
      linhas.push(`  OR/RR disponíveis: ${v.is2x2 ? "Sim (tabela 2×2)" : "Não (tabela " + v.codigosOrdem.length + "×N)"}`);
      const codStr = Object.entries(v.codigoLabels)
        .slice(0, 5)
        .map(([k, lbl]) => `${k}=${lbl}`)
        .join(", ");
      linhas.push(`  Códigos: ${codStr}`);
      if (v.aviso) linhas.push(`  ⚠ AVISO: ${v.aviso}`);
      linhas.push("");
    }
  }

  linhas.push("───────────────────────────────────────────────────");
  linhas.push("FILTROS DISPONÍVEIS (aplicáveis em qualquer análise):");
  linhas.push("  ano_epi: número (ex: 2024, 2023, 2022)");
  linhas.push('  sg_uf: array de siglas (ex: ["SP", "RJ", "MG"])');
  linhas.push('  cs_sexo: "M" ou "F" (filtro global de sexo)');
  linhas.push('  etiologia: ["COVID-19", "Influenza A", "Influenza B", "VSR"]');
  linhas.push("  excluirIgnorado: true (padrão) | false — para bivariada");

  return linhas.join("\n");
}
