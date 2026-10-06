import { manifestEvidence } from "../evidence.js";
import { getVarInfo, CAMPOS_VALIDOS } from "../catalog.js";
import {
  computeChiSquare, computeOR, computeRR,
  computeCramersV, interpretCramersV,
  fmt, fmtP,
} from "../stats.js";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Filtros {
  ano_epi?:    number;
  sg_uf?:      string[];
  cs_sexo?:    string;
  etiologia?:  string[];
  classi_fin?: string[];
  idade_min?:  number;
  idade_max?:  number;
}

interface BivariadadArgs {
  varX:             string;
  varY:             string;
  filtros?:         Filtros;
  excluirIgnorado?: boolean;
}

interface ContingenciaCell {
  vx: string;
  vy: string;
  n:  number;
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const TOOL_BIVARIADA = {
  name: "consultar_bivariada",
  description: `Executa análise bivariada (tabela de contingência + estatísticas) entre duas variáveis do SIVEP-Gripe.

Retorna:
 - Tabela de contingência com frequências e percentuais
 - Qui-quadrado (χ²), p-valor, graus de liberdade
 - V de Cramér (tamanho de efeito)
 - Odds Ratio (OR) e Risco Relativo (RR) com IC 95% — apenas para tabelas 2×2
 - N efetivo e registros excluídos

QUANDO USAR: perguntas como "pacientes com diabetes têm mais óbitos?", "vacinados têm menor risco de UTI?",
"qual a associação entre sexo e óbito por SRAG?".

IMPORTANTE — campos corretos:
 - Óbito: use "evolucao_bin" (binário, OR disponível), NÃO "evolucao"
 - Sexo: "cs_sexo" (M/F)
 - Comorbidades: "diabetes", "obesidade", "cardiopati", "imunodepre", etc.
 - Desfechos: "evolucao_bin", "uti", "suport_ven_bin"
 - Se a variável não aparecer aqui, use listar_variaveis primeiro.

FILTROS ÚTEIS:
 - Para "mulheres com diabetes": use varX="diabetes", varY="evolucao_bin", filtros={cs_sexo:"F"}
 - Para "ano 2024": filtros={ano_epi:2024}
 - Para "somente COVID-19": filtros={etiologia:["COVID-19"]}`,

  inputSchema: {
    type:       "object" as const,
    required:   ["varX", "varY"],
    properties: {
      varX: {
        type:        "string",
        description: "Campo da variável de exposição/preditor. Ex: 'diabetes', 'cs_sexo', 'vacina_cov'",
      },
      varY: {
        type:        "string",
        description: "Campo da variável de desfecho. Ex: 'evolucao_bin', 'uti', 'suport_ven_bin'",
      },
      filtros: {
        type:        "object",
        description: "Filtros opcionais para restringir a população",
        properties: {
          ano_epi:    { type: "number",  description: "Ano epidemiológico (ex: 2024)" },
          sg_uf:      { type: "array",   items: { type: "string" }, description: "Lista de UFs (ex: ['SP','RJ'])" },
          cs_sexo:    { type: "string",  description: "'M' para masculino, 'F' para feminino" },
          etiologia:  { type: "array",   items: { type: "string" }, description: "Etiologias (ex: ['COVID-19'])" },
          classi_fin: { type: "array",   items: { type: "string" }, description: "Códigos de classificação final" },
          idade_min:  { type: "number", description: "Idade mínima em anos (ex: 40). Filtra tp_idade=3 (anos). idade_min=0 inclui bebês." },
          idade_max:  { type: "number", description: "Idade máxima em anos (ex: 59). Combina com idade_min para um intervalo exato." },
        },
      },
      excluirIgnorado: {
        type:        "boolean",
        description: "Excluir valores Ignorado (código 9). Padrão: true (recomendado).",
      },
    },
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleBivariada(
  args: BivariadadArgs,
  apiUrl: string,
): Promise<string> {
  const { varX, varY, filtros = {}, excluirIgnorado = true } = args;

  // ── Validação ────────────────────────────────────────────────────────────────
  if (!CAMPOS_VALIDOS.has(varX)) {
    return `❌ Campo varX "${varX}" não existe no catálogo. Use listar_variaveis para ver os campos disponíveis.`;
  }
  if (!CAMPOS_VALIDOS.has(varY)) {
    return `❌ Campo varY "${varY}" não existe no catálogo. Use listar_variaveis para ver os campos disponíveis.`;
  }
  if (varX === varY) {
    return "❌ varX e varY não podem ser iguais.";
  }

  const xInfo = getVarInfo(varX)!;
  const yInfo = getVarInfo(varY)!;

  // ── Chamada à API ────────────────────────────────────────────────────────────
  let data: { cells: ContingenciaCell[]; totalN: number; excludedN: number; manifest?: unknown };
  try {
    const res = await fetch(`${apiUrl}/api/analise/contingencia`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ varX, varY, filtros, excluirIgnorado }),
      signal:  AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return `❌ Erro da API (HTTP ${res.status}): ${err.error ?? "erro desconhecido"}`;
    }
    data = await res.json() as typeof data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `❌ Falha na conexão com a API SivepLens: ${msg}\nVerifique se SIVEPLENS_API_URL está correto.`;
  }

  if (!data.cells || data.cells.length === 0) {
    return "Nenhum dado encontrado para essa combinação de variáveis e filtros.\n" + manifestEvidence(data.manifest);
  }

  // ── Construção da matriz (respeitando a ordem do catálogo) ───────────────────
  const presentX = new Set(data.cells.map(c => c.vx));
  const presentY = new Set(data.cells.map(c => c.vy));
  const xValues  = xInfo.codigosOrdem.filter(c => presentX.has(c));
  const yValues  = yInfo.codigosOrdem.filter(c => presentY.has(c));

  const matrix: number[][] = xValues.map(() => yValues.map(() => 0));
  for (const cell of data.cells) {
    const xi = xValues.indexOf(cell.vx);
    const yi = yValues.indexOf(cell.vy);
    if (xi >= 0 && yi >= 0) matrix[xi][yi] = cell.n;
  }

  // ── Estatísticas ──────────────────────────────────────────────────────────────
  const chi2Res  = computeChiSquare(matrix);
  const cramersV = computeCramersV(chi2Res.chi2, chi2Res.n, xValues.length, yValues.length);
  const is2x2    = xValues.length === 2 && yValues.length === 2;

  let orRes:  ReturnType<typeof computeOR>  | null = null;
  let rrRes:  ReturnType<typeof computeRR>  | null = null;
  let xCaso = "", xRef = "", yCaso = "", yRef = "";

  if (is2x2) {
    const [a, b] = [matrix[0][0], matrix[0][1]];
    const [c, d] = [matrix[1][0], matrix[1][1]];
    orRes  = computeOR(a, b, c, d);
    rrRes  = computeRR(a, b, c, d);
    xCaso  = xInfo.codigoLabels[xValues[0]] ?? xValues[0];
    xRef   = xInfo.codigoLabels[xValues[1]] ?? xValues[1];
    yCaso  = yInfo.codigoLabels[yValues[0]] ?? yValues[0];
    yRef   = yInfo.codigoLabels[yValues[1]] ?? yValues[1];
  }

  // ── Totais por linha/coluna ───────────────────────────────────────────────────
  const rowTotals  = matrix.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals  = yValues.map((_, j) => matrix.reduce((s, r) => s + r[j], 0));
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);

  // ── Filtros ativos (para o output) ────────────────────────────────────────────
  const filtrosAtivos: string[] = [];
  if (filtros.ano_epi)           filtrosAtivos.push(`Ano ${filtros.ano_epi}`);
  if (filtros.sg_uf?.length)     filtrosAtivos.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.cs_sexo)           filtrosAtivos.push(`Sexo: ${filtros.cs_sexo === "M" ? "Masculino" : "Feminino"}`);
  if (filtros.etiologia?.length) filtrosAtivos.push(`Etiologia: ${filtros.etiologia.join(", ")}`);
  if (filtros.idade_min !== undefined || filtros.idade_max !== undefined)
    filtrosAtivos.push(`Idade: ${filtros.idade_min ?? 0}–${filtros.idade_max ?? "∞"} anos`);

  // ── Formatação do output ──────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push("ANÁLISE BIVARIADA — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════");
  lines.push(`Variável X (Exposição): ${xInfo.label} [${varX}]`);
  lines.push(`Variável Y (Desfecho):  ${yInfo.label} [${varY}]`);
  if (filtrosAtivos.length) lines.push(`Filtros: ${filtrosAtivos.join(" · ")}`);
  else lines.push("Filtros: Nenhum (todos os dados)");
  lines.push("");

  // Tabela
  const yLabels = yValues.map(v => yInfo.codigoLabels[v] ?? v);
  const colW = Math.max(12, ...yLabels.map(l => l.length + 2));
  const rowLabelW = Math.max(20, ...xValues.map(v => (xInfo.codigoLabels[v] ?? v).length + 2));

  const header = `${"".padEnd(rowLabelW)}` +
    yLabels.map(l => l.padStart(colW)).join("") +
    "Total".padStart(colW) + "  % evento";
  lines.push("TABELA DE CONTINGÊNCIA");
  lines.push("─".repeat(header.length));
  lines.push(header);
  lines.push("─".repeat(header.length));

  xValues.forEach((xv, i) => {
    const xLabel = xInfo.codigoLabels[xv] ?? xv;
    const pctEvento = rowTotals[i] > 0 ? (matrix[i][0] / rowTotals[i] * 100).toFixed(1) + "%" : "—";
    const row = `${xLabel.padEnd(rowLabelW)}` +
      matrix[i].map(n => n.toLocaleString("pt-BR").padStart(colW)).join("") +
      rowTotals[i].toLocaleString("pt-BR").padStart(colW) +
      `  ${pctEvento}`;
    lines.push(row);
  });

  lines.push("─".repeat(header.length));
  const totalRow = `${"Total".padEnd(rowLabelW)}` +
    colTotals.map(n => n.toLocaleString("pt-BR").padStart(colW)).join("") +
    grandTotal.toLocaleString("pt-BR").padStart(colW);
  lines.push(totalRow);
  lines.push("");

  // Estatísticas
  lines.push("ESTATÍSTICAS");
  lines.push("─────────────────────────────────────────────────");
  lines.push(`N efetivo: ${data.totalN.toLocaleString("pt-BR")}  |  Excluídos: ${data.excludedN.toLocaleString("pt-BR")} (${data.totalN + data.excludedN > 0 ? ((data.excludedN / (data.totalN + data.excludedN)) * 100).toFixed(1) : 0}%) — NULL ou Ignorado`);
  lines.push(`Qui-quadrado (χ²): ${fmt(chi2Res.chi2)}  (gl = ${chi2Res.df},  p ${chi2Res.pValue < 0.001 ? "< 0,001" : "= " + fmtP(chi2Res.pValue)})`);
  lines.push(`V de Cramér: ${fmt(cramersV, 3)}  (efeito ${interpretCramersV(cramersV)})`);

  if (is2x2 && orRes && rrRes) {
    lines.push("");
    lines.push(`Odds Ratio (OR): ${fmt(orRes.or)}  (IC 95%: ${fmt(orRes.ci95Low)} – ${fmt(orRes.ci95High)})`);
    lines.push(`Risco Relativo (RR): ${fmt(rrRes.rr)}  (IC 95%: ${fmt(rrRes.ci95Low)} – ${fmt(rrRes.ci95High)})`);
    lines.push(`Grupos:  ${xCaso} vs ${xRef} (X)  ·  ${yCaso} vs ${yRef} (Y)`);
    if (orRes.continuity) lines.push("⚠ Correção de continuidade (+0,5) aplicada — alguma célula era zero.");
  }

  lines.push("");
  const sig = chi2Res.pValue < 0.05;
  if (sig) {
    lines.push(`✅ Associação estatisticamente SIGNIFICATIVA (p ${chi2Res.pValue < 0.001 ? "< 0,001" : "= " + fmtP(chi2Res.pValue)}, α = 0,05)`);
  } else {
    lines.push(`⬜ Sem associação estatisticamente significativa (p = ${fmtP(chi2Res.pValue)}, α = 0,05)`);
  }

  // Avisos
  const avisos: string[] = [];
  if (chi2Res.lowExpected)
    avisos.push("Frequência esperada < 5 em alguma célula — para tabelas 2×2 o teste exato de Fisher seria mais adequado.");
  if (xInfo.aviso) avisos.push(`${xInfo.label}: ${xInfo.aviso}`);
  if (yInfo.aviso) avisos.push(`${yInfo.label}: ${yInfo.aviso}`);
  if (!is2x2 && chi2Res.df > 0)
    avisos.push(`Tabela ${xValues.length}×${yValues.length} — OR e RR não calculados. Use V de Cramér como medida de efeito.`);
  if (cramersV < 0.1 && sig)
    avisos.push(`V de Cramér muito baixo (${fmt(cramersV, 3)}) apesar da significância — efeito clinicamente irrelevante; N grande infla o teste.`);

  if (avisos.length) {
    lines.push("");
    lines.push("AVISOS");
    lines.push("─────────────────────────────────────────────────");
    avisos.forEach(a => lines.push(`⚠ ${a}`));
  }

  lines.push("");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");

  lines.push("", manifestEvidence(data.manifest));
  return lines.join("\n");
}
