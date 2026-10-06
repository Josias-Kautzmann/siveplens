import { manifestEvidence, unavailableRegression } from "../evidence.js";
import { OUTCOMES_REGRESSAO, PREDITORES_REGRESSAO, OUTCOME_LABELS } from "../catalog.js";
import { fmt, fmtP, sigStars } from "../stats.js";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Filtros {
  ano_epi?:   number;
  sg_uf?:     string[];
  cs_sexo?:   string;
  etiologia?: string[];
  idade_min?: number;
  idade_max?: number;
}

interface RegressaoArgs {
  outcome:          string;
  preditores?:      string[];
  filtros?:         Filtros;
  incluirIgnorado?: boolean;
}

interface LinhaCoef {
  nome:         string;
  beta?:        number;
  se?:          number;
  aOR:          number;
  ci95Low:      number;
  ci95High:     number;
  z:            number;
  pValue:       number;
  isIntercept?: boolean;
  isReferencia?: boolean;
}

interface RegressaoResponse {
  manifest?: unknown;
  refFaixa?: string;
  refSexo?: string;
  coeficientes: LinhaCoef[];
  meta: {
    n:            number;
    nRaw:         number;
    nExcluded:    number;
    events:       number;
    taxaEventos:  number;
    aic:          number;
    devianceNull: number;
    deviance:     number;
    r2McFadden:   number;
    converged:    boolean;
    iteracoes:    number;
  };
  outcome:         { campo: string; label: string; eventLabel: string };
  incluirIgnorado: boolean;
  avisos:          string[];
}

// ── Tool definition ───────────────────────────────────────────────────────────

const outcomesList = (OUTCOMES_REGRESSAO as readonly string[]).join(", ");
const predList     = (PREDITORES_REGRESSAO as readonly string[]).join(", ");

export const TOOL_REGRESSAO = {
  name: "consultar_regressao",
  description: `Executa regressão logística multivariada (via IRLS) com dados SIVEP-Gripe.

Retorna aOR (Odds Ratio ajustado), IC 95% e p-valor para cada preditor,
controlando simultaneamente para todos os outros preditores selecionados.

QUANDO USAR: perguntas como "após ajustar para sexo e idade, diabetes ainda é fator de risco?",
"quais comorbidades aumentam o risco de óbito independentemente?",
"qual o impacto da vacinação COVID-19 no risco de UTI controlando para comorbidades?".

OUTCOMES disponíveis (campo):
  evolucao_bin   → Óbito por SRAG (vs Cura)
  uti            → Internação em UTI
  suport_ven_bin → Ventilação mecânica invasiva
  hospital       → Hospitalização

PREDITORES disponíveis:
  ${predList}

PADRÃO RECOMENDADO: incluir faixa_etaria e cs_sexo sempre como preditores base
para ajuste demográfico.

NOTA: usa Complete Case Analysis (CCA) — registros com dados ausentes em qualquer
preditor são excluídos. Com muitos preditores, o N pode reduzir bastante.
Use incluirIgnorado=true para tratar código 9 como categoria separada e aumentar o N.`,

  inputSchema: {
    type:       "object" as const,
    required:   ["outcome"],
    properties: {
      outcome: {
        type:        "string",
        description: `Campo do desfecho. Valores válidos: ${outcomesList}`,
        enum:        [...OUTCOMES_REGRESSAO],
      },
      preditores: {
        type:        "array",
        items:       { type: "string" },
        description: `Lista de preditores. Padrão se omitido: faixa_etaria, cs_sexo, diabetes, obesidade, cardiopati, imunodepre, dispneia, saturacao.`,
      },
      filtros: {
        type:        "object",
        description: "Filtros opcionais",
        properties: {
          ano_epi:   { type: "number",  description: "Ano epidemiológico (ex: 2024)" },
          sg_uf:     { type: "array",   items: { type: "string" } },
          cs_sexo:   { type: "string",  description: "'M' ou 'F'" },
          etiologia: { type: "array",   items: { type: "string" } },
          idade_min: { type: "number", description: "Idade mínima em anos (ex: 40). Restringe a população antes do ajuste." },
          idade_max: { type: "number", description: "Idade máxima em anos (ex: 59). Combina com idade_min para um intervalo exato." },
        },
      },
      incluirIgnorado: {
        type:        "boolean",
        description: "Tratar código 9 / NULL como categoria 'Ignorado/ausente' (dummy separada). Aumenta N mas revela MNAR. Padrão: false.",
      },
    },
  },
};

// ── Preditores padrão ─────────────────────────────────────────────────────────

const DEFAULT_PREDITORES = [
  "faixa_etaria", "cs_sexo",
  "diabetes", "obesidade", "cardiopati", "imunodepre",
  "dispneia", "saturacao",
];

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleRegressao(
  args: RegressaoArgs,
  apiUrl: string,
): Promise<string> {
  const {
    outcome,
    preditores     = DEFAULT_PREDITORES,
    filtros        = {},
    incluirIgnorado = false,
  } = args;

  // ── Validação ────────────────────────────────────────────────────────────────
  if (!(OUTCOMES_REGRESSAO as readonly string[]).includes(outcome)) {
    return `❌ Outcome "${outcome}" inválido. Válidos: ${outcomesList}`;
  }

  const predInvalidos = preditores.filter(
    p => !(PREDITORES_REGRESSAO as readonly string[]).includes(p) && p !== "faixa_etaria",
  );
  if (predInvalidos.length > 0) {
    return `❌ Preditores inválidos: ${predInvalidos.join(", ")}.\nUse listar_variaveis para ver os preditores disponíveis.`;
  }

  // ── Chamada à API ────────────────────────────────────────────────────────────
  let data: RegressaoResponse;
  try {
    const res = await fetch(`${apiUrl}/api/analise/regressao`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ outcome, preditores, filtros, incluirIgnorado }),
      signal:  AbortSignal.timeout(60_000),   // regressão pode demorar mais
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return `❌ Erro da API (HTTP ${res.status}): ${err.error ?? "erro desconhecido"}`;
    }
    data = await res.json() as RegressaoResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `❌ Falha na conexão com a API SivepLens: ${msg}`;
  }

  const unavailable = unavailableRegression(data);
  if (unavailable) return unavailable;
  const meta         = data.meta;
  const outcomeLabel = OUTCOME_LABELS[outcome] ?? { label: outcome, eventLabel: "Evento", nonEventLabel: "Não evento" };

  // ── Filtros ativos ────────────────────────────────────────────────────────────
  const filtrosAtivos: string[] = [];
  if (filtros.ano_epi)           filtrosAtivos.push(`Ano ${filtros.ano_epi}`);
  if (filtros.sg_uf?.length)     filtrosAtivos.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.cs_sexo)           filtrosAtivos.push(`Sexo: ${filtros.cs_sexo === "M" ? "Masculino" : "Feminino"}`);
  if (filtros.etiologia?.length) filtrosAtivos.push(`Etiologia: ${filtros.etiologia.join(", ")}`);
  if (filtros.idade_min !== undefined || filtros.idade_max !== undefined)
    filtrosAtivos.push(`Idade: ${filtros.idade_min ?? 0}–${filtros.idade_max ?? "∞"} anos`);

  // ── Separa coeficientes em sig / não sig / referências ───────────────────────
  const coefs       = data.coeficientes.filter(l => !l.isIntercept);
  const significativos   = coefs.filter(l => !l.isReferencia && Number.isFinite(l.pValue) && l.pValue < 0.05);
  const naoSignificativos = coefs.filter(l => !l.isReferencia && Number.isFinite(l.pValue) && l.pValue >= 0.05);
  const indisponiveis     = coefs.filter(l => !l.isReferencia && (!Number.isFinite(l.pValue) || !Number.isFinite(l.aOR)));

  // ── Formatação ────────────────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push("REGRESSÃO LOGÍSTICA MULTIVARIADA — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`Desfecho: ${outcomeLabel.label}`);
  lines.push(`Preditores: ${preditores.join(", ")}`);
  if (filtrosAtivos.length) lines.push(`Filtros: ${filtrosAtivos.join(" · ")}`);
  else lines.push("Filtros: Nenhum (todos os dados)");
  lines.push("");

  // Métricas do modelo
  const pctExcl    = meta.nRaw > 0 ? ((meta.nExcluded / meta.nRaw) * 100).toFixed(1) : "—";
  const pctEventos = (meta.taxaEventos * 100).toFixed(1);
  const pctRedDev  = meta.devianceNull > 0
    ? (((meta.devianceNull - meta.deviance) / meta.devianceNull) * 100).toFixed(1)
    : "—";

  lines.push("MÉTRICAS DO MODELO");
  lines.push("─────────────────────────────────────────────────");
  lines.push(`N (casos no modelo):   ${meta.n.toLocaleString("pt-BR")}`);
  lines.push(`N elegíveis (total):   ${meta.nRaw.toLocaleString("pt-BR")}`);
  lines.push(`Excluídos (ausentes):  ${meta.nExcluded.toLocaleString("pt-BR")} (${pctExcl}%) — CCA${incluirIgnorado ? " + modo Ignorado" : ""}`);
  lines.push(`${outcomeLabel.eventLabel}s (eventos):  ${meta.events.toLocaleString("pt-BR")} (${pctEventos}% do N)`);
  lines.push(`R² McFadden:           ${fmt(meta.r2McFadden, 4)}`);
  lines.push(`AIC:                   ${meta.aic.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`);
  lines.push(`Redução da deviance:   ${pctRedDev}%  (nula: ${meta.devianceNull.toFixed(0)} → ajustada: ${meta.deviance.toFixed(0)})`);
  lines.push(`Convergência:          ${meta.converged ? `Sim (${meta.iteracoes} iterações IRLS)` : `NÃO CONVERGIU (${meta.iteracoes} iter.) ⚠`}`);

  if (meta.nExcluded / meta.nRaw > 0.30) {
    lines.push("");
    lines.push(`⚠ ATRITO ELEVADO: ${pctExcl}% dos casos foi excluído por dados ausentes.`);
    lines.push("  Os resultados representam a subpopulação com preenchimento completo.");
    lines.push("  Considere incluirIgnorado=true para tratar Ignorado como categoria.");
  }

  // Tabela de coeficientes — significativos primeiro
  if (significativos.length > 0) {
    lines.push("");
    lines.push("PREDITORES SIGNIFICATIVOS (p < 0,05)");
    lines.push("─────────────────────────────────────────────────");
    lines.push(fmtCoefHeader());
    for (const l of coefs) {
      if (l.isReferencia) {
        lines.push(`  ${"(ref.) " + l.nome}`.padEnd(42) + "  1,00  referência");
      } else if (Number.isFinite(l.pValue) && l.pValue < 0.05) {
        lines.push(fmtCoefLine(l));
      }
    }
  }

  if (naoSignificativos.length > 0) {
    lines.push("");
    lines.push("PREDITORES NÃO SIGNIFICATIVOS");
    lines.push("─────────────────────────────────────────────────");
    if (significativos.length === 0) lines.push(fmtCoefHeader());
    for (const l of coefs) {
      if (l.isReferencia) continue;
      if (Number.isFinite(l.pValue) && l.pValue >= 0.05) lines.push(fmtCoefLine(l));
    }
  }

  if (indisponiveis.length > 0) {
    lines.push("");
    lines.push("ESTIMATIVAS INDISPONÍVEIS");
    lines.push("─────────────────────────────────────────────────");
    for (const l of indisponiveis) {
      lines.push(`  ${l.nome}  →  estimativa instável (possível separação completa)`);
    }
  }

  // Avisos da API
  if (data.avisos.length > 0) {
    lines.push("");
    lines.push("AVISOS DO MODELO");
    lines.push("─────────────────────────────────────────────────");
    data.avisos.forEach(a => lines.push(`⚠ ${a}`));
  }

  lines.push("");
  lines.push(`Categorias de referência: ${data.coeficientes.filter(c => c.isReferencia).map(c => c.nome).join("; ")}.`);
  lines.push(`Método: IRLS (regressão logística binomial agrupada). IC 95% de Wald.`);
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");

  // ── #5 Análise de sensibilidade automática ────────────────────────────────
  // Ativada quando: atrito > 30% E modo CCA (incluirIgnorado=false)
  const atrito = meta.nRaw > 0 ? meta.nExcluded / meta.nRaw : 0;
  if (!incluirIgnorado && atrito > 0.30) {
    let data2: RegressaoResponse | null = null;
    try {
      const res2 = await fetch(`${apiUrl}/api/analise/regressao`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ outcome, preditores, filtros, incluirIgnorado: true, refFaixa: data.refFaixa, refSexo: data.refSexo }),
        signal:  AbortSignal.timeout(60_000),
      });
      if (res2.ok) data2 = await res2.json() as RegressaoResponse;
    } catch {
      // silencia — sensibilidade é opcional
    }

    if (data2 && !unavailableRegression(data2)) {
      lines.push("", "EVIDÊNCIA DO MODELO ALTERNATIVO", manifestEvidence(data2.manifest));
      const pctExcl2 = data2.meta.nRaw > 0
        ? ((data2.meta.nExcluded / data2.meta.nRaw) * 100).toFixed(1)
        : "—";

      // Mapeia nome → aOR do modelo alternativo (ignora dummies de Ignorado)
      const aorAlt = new Map<string, number>();
      for (const c of data2.coeficientes) {
        if (!c.isIntercept && !c.isReferencia && Number.isFinite(c.aOR) &&
            !c.nome.includes("Ignorado/ausente")) {
          aorAlt.set(c.nome, c.aOR);
        }
      }

      // Preditores comparáveis — presentes em ambos os modelos
      const comparaveis = coefs.filter(
        c => !c.isReferencia && Number.isFinite(c.aOR) && aorAlt.has(c.nome)
      );

      if (comparaveis.length > 0) {
        lines.push("");
        lines.push("ANÁLISE DE SENSIBILIDADE — CCA vs Ignorado como Categoria");
        lines.push("─────────────────────────────────────────────────");
        lines.push(`N modelo CCA:          ${meta.n.toLocaleString("pt-BR")} (atrito ${(atrito * 100).toFixed(1)}%)`);
        lines.push(`N modelo c/ Ignorado:  ${data2.meta.n.toLocaleString("pt-BR")} (atrito ${pctExcl2}%)`);
        lines.push("");

        const COL_NOME = 38;
        lines.push(
          `  ${"Preditor".padEnd(COL_NOME)}  ${"aOR CCA".padStart(8)}  ${"aOR Ign.".padStart(8)}  ${"Δ".padStart(6)}`,
        );
        lines.push("  " + "─".repeat(COL_NOME + 30));

        let maxDelta = 0;
        for (const c of comparaveis) {
          const aorCca = c.aOR;
          const aorIgn = aorAlt.get(c.nome)!;
          const delta  = ((aorIgn - aorCca) / aorCca) * 100;
          maxDelta = Math.max(maxDelta, Math.abs(delta));
          const sign = delta >= 0 ? "+" : "";
          lines.push(
            `  ${c.nome.padEnd(COL_NOME)}  ${fmt(aorCca).padStart(8)}  ${fmt(aorIgn).padStart(8)}  ${(sign + delta.toFixed(0) + "%").padStart(6)}`,
          );
        }

        lines.push("");
        if (maxDelta > 20) {
          lines.push(`⚠ Diferença máxima: ${maxDelta.toFixed(0)}% — resultados sensíveis ao tratamento de ausências; essa comparação não identifica o mecanismo de ausência.`);
          lines.push("  Considere reportar ambos os modelos ou usar imputação múltipla.");
        } else {
          lines.push(`Diferença máxima de ${maxDelta.toFixed(0)}% entre os ORs comparados. Esse limiar descritivo não comprova robustez nem ausência de viés.`);
        }
      }
    }
  }

  lines.push("", manifestEvidence(data.manifest));
  return lines.join("\n");
}

// ── Formatação auxiliar de tabela de coeficientes ─────────────────────────────

function fmtCoefHeader(): string {
  return `  ${"Variável".padEnd(38)}  ${"aOR".padStart(6)}  ${"IC 95%".padStart(18)}  ${"p-valor".padStart(8)}  Sig.`;
}

function fmtCoefLine(l: LinhaCoef): string {
  const nome    = l.nome.padEnd(38);
  const aor     = fmt(l.aOR).padStart(6);
  const ci      = `${fmt(l.ci95Low)} – ${fmt(l.ci95High)}`.padStart(18);
  const pv      = fmtP(l.pValue).padStart(8);
  const sig     = sigStars(l.pValue).padStart(4);
  const arrow   = Number.isFinite(l.aOR) ? (l.aOR < 1 ? " ▼" : " ▲") : "";
  return `  ${nome}  ${aor}  ${ci}  ${pv}  ${sig}${arrow}`;
}
