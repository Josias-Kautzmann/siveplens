import { manifestEvidence, unavailableRegression } from "../../../../mcp/src/evidence";
import { NextRequest, NextResponse } from "next/server";
import {
  VARIABLE_CATALOG, CAMPOS_PERMITIDOS, getVariableInfo,
  type VariableInfo,
} from "@/lib/variable-catalog";
import {
  computeChiSquare, computeOR, computeRR,
  computeCramersV, interpretCramersV,
} from "@/lib/stat-utils";
import {
  getPanoramaGeral, getCurvaEtiologica, getPrevalenciaRecente, getPiramideEtaria,
  getPerfilSintomatologico,
} from "@/dal/casos.repo";
import {
  DESCRIPTIVE_VARIABLES,
  getNumericSummary,
  type DescriptiveVariable,
} from "@/dal/descriptive.repo";
import { parseDescriptiveFilters } from "@/lib/descriptive-request";
import { analisarSerieTemporal, type SerieDataPoint } from "@/services/anomaly-detector";
import type { CriterioCodificado, FiltrosSRAG } from "@/lib/filter-utils";

// ── Config ────────────────────────────────────────────────────────────────────

const SITE = (process.env.SITE_URL ?? "https://siveplens.literato.io").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
};

// ── Outcome / predictor catalog (mirrors /api/analise/regressao) ──────────────

const OUTCOMES_REGRESSAO = ["evolucao_bin", "uti", "suport_ven_bin", "hospital"] as const;

const PREDITORES_REGRESSAO = [
  "cs_sexo",
  "diabetes", "obesidade", "cardiopati", "imunodepre", "renal", "asma",
  "pneumopati", "neurologic", "sind_down", "hematologi", "hepatica", "puerpera",
  "vacina_cov", "vacina",
  "dispneia", "saturacao", "febre", "tosse", "desc_resp", "garganta", "fadiga", "diarreia",
];

const OUTCOME_LABELS: Record<string, { label: string; eventLabel: string }> = {
  evolucao_bin:   { label: "Óbito por SRAG (vs Cura)",            eventLabel: "Óbito SRAG"    },
  uti:            { label: "Internação em UTI",                     eventLabel: "UTI"           },
  suport_ven_bin: { label: "Ventilação invasiva (vs não invasiva)", eventLabel: "Invasivo"      },
  hospital:       { label: "Hospitalização",                        eventLabel: "Hospitalizado" },
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return p.toFixed(3).replace(".", ",");
}

function sigStars(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01)  return "**";
  if (p < 0.05)  return "*";
  return "ns";
}

function getLabel(info: VariableInfo, code: string): string {
  return info.valores.find(v => v.codigo === code)?.label ?? code;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "listar_variaveis",
    description: `Lista todas as variáveis disponíveis no banco SIVEP-Gripe para análise bivariada e regressão logística.

Use ANTES de consultar_bivariada ou consultar_regressao sempre que não souber qual campo usar.
Por exemplo: se o usuário menciona "óbito", use "evolucao_bin" (não "evolucao" — que tem 3 categorias).

Retorna: campo (nome para a API), label, categoria, descrição e avisos.`,
    inputSchema: {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          description: "Filtrar por categoria (opcional): Desfecho | Demográfico | Vacinação | Comorbidades | Sintomas | Geográfico",
        },
      },
    },
  },
  {
    name: "resumir_variavel",
    description: `Calcula estatísticas descritivas foundation-first para uma variável do SIVEP-Gripe, com denominadores, ausências e proveniência explícitos.

Retorna N da população filtrada, N válido, ausentes, média, desvio-padrão, mediana, quartis, mínimo e máximo, além de um manifesto JSON reproduzível.

QUANDO USAR: antes de regressão ou testes de associação; perguntas como "qual a média de idade dos óbitos com diabetes e COVID-19?".

DEFINIÇÃO DE COVID-19 — escolha conscientemente:
 - classificação final de COVID-19: filtros.classi_fin=[5]
 - PCR SARS-CoV-2 positivo: filtros.criterios=[{campo:"pcr_sars2", valores:[1]}]

EXEMPLO (idade de óbitos com diabetes classificados como COVID-19):
variavel="idade_anos", filtros={classi_fin:[5], evolucao:[2], criterios:[{campo:"diabetes", valores:[1]}]}`,
    inputSchema: {
      type: "object",
      required: ["variavel"],
      properties: {
        variavel: {
          type: "string",
          enum: Object.keys(DESCRIPTIVE_VARIABLES),
          description: "Variável numérica. Nesta versão: idade_anos.",
        },
        filtros: {
          type: "object",
          description: "Definição auditável da população analisada.",
          properties: {
            ano_epi:   { type: "number", description: "Ano epidemiológico." },
            sg_uf:     { type: "array", items: { type: "string" }, description: "UFs." },
            cs_sexo:   { type: "string", enum: ["M", "F", "I"] },
            classi_fin:{ type: "array", items: { type: "number" }, description: "Classificação final: 5=COVID-19." },
            evolucao:  { type: "array", items: { type: "number" }, description: "Desfecho: 1=cura, 2=óbito por SRAG, 3=óbito outras causas, 9=ignorado." },
            etiologia: { type: "array", items: { type: "string" }, description: "PCR por agente: sars2, flu_a, flu_b, vsr, rino, metap." },
            idade_min: { type: "number" },
            idade_max: { type: "number" },
            criterios: {
              type: "array",
              description: "Condições categóricas adicionais. Códigos comuns: 1=sim, 2=não, 9=ignorado.",
              items: {
                type: "object",
                required: ["campo", "valores"],
                properties: {
                  campo: {
                    type: "string",
                    enum: [
                      "diabetes", "obesidade", "cardiopati", "imunodepre", "renal", "asma",
                      "neurologic", "pneumopati", "hematologi", "sind_down", "hepatica", "puerpera",
                      "febre", "tosse", "dispneia", "desc_resp", "saturacao", "garganta",
                      "diarreia", "vomito", "fadiga", "perd_olft", "perd_pala", "dor_abd",
                      "hospital", "uti", "vacina", "vacina_cov", "pcr_resul", "pcr_sars2",
                    ],
                  },
                  valores: { type: "array", items: { type: "number" } },
                },
              },
            },
          },
        },
      },
    },
  },
  {
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
 - Para "mulheres com diabetes": varX="diabetes", varY="evolucao_bin", filtros={cs_sexo:"F"}
 - Para "ano 2024": filtros={ano_epi:2024}
 - Para "somente COVID-19": filtros={etiologia:["COVID-19"]}`,
    inputSchema: {
      type: "object",
      required: ["varX", "varY"],
      properties: {
        varX: {
          type: "string",
          description: "Campo da variável de exposição/preditor. Ex: 'diabetes', 'cs_sexo', 'vacina_cov'",
        },
        varY: {
          type: "string",
          description: "Campo da variável de desfecho. Ex: 'evolucao_bin', 'uti', 'suport_ven_bin'",
        },
        filtros: {
          type: "object",
          description: "Filtros opcionais para restringir a população",
          properties: {
            ano_epi:   { type: "number",  description: "Ano epidemiológico (ex: 2024)" },
            sg_uf:     { type: "array",   items: { type: "string" }, description: "Lista de UFs (ex: ['SP','RJ'])" },
            cs_sexo:   { type: "string",  description: "'M' para masculino, 'F' para feminino" },
            etiologia: { type: "array",   items: { type: "string" }, description: "Etiologias (ex: ['COVID-19'])" },
            idade_min: { type: "number", description: "Idade mínima em anos (ex: 40). Filtra a população antes da análise. idade_min=0 inclui bebês." },
            idade_max: { type: "number", description: "Idade máxima em anos (ex: 59). Combina com idade_min para um intervalo exato (ex: 40–59 anos)." },
          },
        },
        excluirIgnorado: {
          type: "boolean",
          description: "Excluir valores Ignorado (código 9). Padrão: true (recomendado).",
        },
      },
    },
  },
  {
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
  ${PREDITORES_REGRESSAO.join(", ")} + faixa_etaria

PADRÃO RECOMENDADO: incluir faixa_etaria e cs_sexo sempre como preditores base para ajuste demográfico.

NOTA: usa Complete Case Analysis (CCA) — registros com dados ausentes em qualquer
preditor são excluídos. Com muitos preditores, o N pode reduzir bastante.
Use incluirIgnorado=true para tratar código 9 como categoria separada e aumentar o N.`,
    inputSchema: {
      type: "object",
      required: ["outcome"],
      properties: {
        outcome: {
          type: "string",
          description: "Campo do desfecho.",
          enum: [...OUTCOMES_REGRESSAO],
        },
        preditores: {
          type: "array",
          items: { type: "string" },
          description: "Lista de preditores. Padrão se omitido: faixa_etaria, cs_sexo, diabetes, obesidade, cardiopati, imunodepre, dispneia, saturacao.",
        },
        filtros: {
          type: "object",
          description: "Filtros opcionais",
          properties: {
            ano_epi:   { type: "number",  description: "Ano epidemiológico (ex: 2024)" },
            sg_uf:     { type: "array",   items: { type: "string" } },
            cs_sexo:   { type: "string",  description: "'M' ou 'F'" },
            etiologia: { type: "array",   items: { type: "string" } },
            idade_min: { type: "number",  description: "Idade mínima em anos (ex: 40). Restringe a população antes do ajuste." },
            idade_max: { type: "number",  description: "Idade máxima em anos (ex: 59). Combina com idade_min para um intervalo exato." },
          },
        },
        incluirIgnorado: {
          type: "boolean",
          description: "Tratar código 9 / NULL como categoria 'Ignorado/ausente'. Aumenta N mas revela MNAR. Padrão: false.",
        },
        refFaixa: {
          type: "string",
          description: "Categoria de referência da faixa etária (o aOR das demais é comparado a ela). Valores: 0-4, 5-11, 12-17, 18-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80+. Padrão: 0-4. Ex: use '80+' para comparar idosos como base.",
        },
        refSexo: {
          type: "string",
          enum: ["F", "M"],
          description: "Sexo de referência (base de comparação). Padrão: F (Feminino).",
        },
      },
    },
  },
  {
    name: "consultar_panorama",
    description: `Panorama epidemiológico descritivo de SRAG: indicadores-chave e tendência temporal.

Retorna:
 - Casos, óbitos e taxa de letalidade
 - Internações em UTI e hospitalizações (com % sobre os casos)
 - Tendência semanal: semana de pico, variação das últimas 4 semanas e mini-série recente
 - Opcionalmente, desagregação por etiologia, faixa etária ou sexo

QUANDO USAR: perguntas DESCRITIVAS de contagem/tendência, como "quantos casos e óbitos de SRAG em SP em 2025?",
"qual a letalidade da SRAG este ano?", "a curva está subindo ou caindo?", "como se distribuem os casos por faixa etária?".

NÃO confundir com consultar_bivariada/consultar_regressao (que testam associações estatísticas).
Para "qual vírus predomina agora?", prefira prevalencia_recente.`,
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          description: "Filtros opcionais para restringir a população",
          properties: {
            ano_epi:      { type: "number", description: "Ano epidemiológico (ex: 2025). Se omitido, considera todos os anos." },
            sg_uf:        { type: "array",  items: { type: "string" }, description: "Lista de UFs (ex: ['SP','RJ'])" },
            cs_sexo:      { type: "string", description: "'M' ou 'F'" },
            faixa_etaria: { type: "string", description: "Faixa etária (ex: '60-69', '80+'). Valores: 0-4, 5-11, 12-17, 18-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80+." },
            etiologia:    { type: "array",  items: { type: "string" }, description: "Etiologias confirmadas por PCR (ex: ['sars2','flu_a','vsr'])" },
            idade_min:    { type: "number", description: "Idade mínima em anos." },
            idade_max:    { type: "number", description: "Idade máxima em anos." },
          },
        },
        desagregar_por: {
          type: "string",
          enum: ["etiologia", "faixa_etaria", "sexo"],
          description: "Opcional. Adiciona uma quebra dos casos por etiologia, faixa etária ou sexo.",
        },
      },
    },
  },
  {
    name: "prevalencia_recente",
    description: `Prevalência por agente etiológico nas últimas semanas (estilo InfoGripe): qual vírus está circulando/predominando.

Considera apenas casos com PCR positivo no período. Retorna detecções por agente (SARS-CoV-2, Influenza A/B,
VSR, Rinovírus, Metapneumovírus, Adenovírus), % de positividade, óbitos por agente (quando disponível) e o agente predominante.

QUANDO USAR: "qual vírus predomina agora?", "como está a circulação de SARS-CoV-2 vs Influenza nas últimas semanas?",
"qual a positividade de PCR recente em SP?".

Para indicadores gerais (casos/óbitos/letalidade/tendência), use consultar_panorama.`,
    inputSchema: {
      type: "object",
      properties: {
        semanas: {
          type: "number",
          description: "Número de semanas epidemiológicas recentes a considerar. Padrão: 4.",
        },
        filtros: {
          type: "object",
          description: "Filtros opcionais",
          properties: {
            ano_epi:      { type: "number", description: "Ano epidemiológico (ex: 2025)." },
            sg_uf:        { type: "array",  items: { type: "string" }, description: "Lista de UFs (ex: ['SP'])" },
            cs_sexo:      { type: "string", description: "'M' ou 'F'" },
            faixa_etaria: { type: "string", description: "Faixa etária (ex: '60-69')." },
            idade_min:    { type: "number", description: "Idade mínima em anos." },
            idade_max:    { type: "number", description: "Idade máxima em anos." },
          },
        },
      },
    },
  },
  {
    name: "perfil_sintomatologico",
    description: `Perfil sintomatológico dos casos de SRAG: prevalência de cada sintoma e sua relação com o desfecho (cura vs óbito).

Retorna, para cada sintoma (febre, tosse, dispneia, saturação < 95%, desconforto respiratório, dor de garganta,
fadiga, diarreia, vômito, perda de olfato/paladar): quantos casos apresentaram o sintoma e a letalidade
entre eles (% de óbito). Ordena por letalidade para destacar sinais de gravidade.

QUANDO USAR: "quais sintomas mais associados a óbito por SRAG?", "qual a prevalência de dispneia nos casos?",
"qual o perfil clínico dos pacientes em 2025?".

Para testar a associação de UM sintoma específico com o desfecho de forma inferencial (OR, p-valor), use consultar_bivariada.`,
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          description: "Filtros opcionais",
          properties: {
            ano_epi:      { type: "number", description: "Ano epidemiológico (ex: 2025)." },
            sg_uf:        { type: "array",  items: { type: "string" }, description: "Lista de UFs (ex: ['SP'])" },
            cs_sexo:      { type: "string", description: "'M' ou 'F'" },
            faixa_etaria: { type: "string", description: "Faixa etária (ex: '60-69')." },
            etiologia:    { type: "array",  items: { type: "string" }, description: "Etiologias por PCR (ex: ['sars2'])" },
            idade_min:    { type: "number", description: "Idade mínima em anos." },
            idade_max:    { type: "number", description: "Idade máxima em anos." },
          },
        },
      },
    },
  },
  {
    name: "consultar_alertas",
    description: `Detecção de anomalias/sinais de surto na série temporal de SRAG (z-score sobre média móvel).

Roda o detector AO VIVO sobre a curva semanal de casos: para cada semana, compara o valor com a média móvel
das semanas anteriores e sinaliza picos atípicos (z-score acima do limiar). Retorna as semanas anômalas
(com severidade e explicação) e o status da semana mais recente.

QUANDO USAR: "tem algum surto ou pico anômalo em SRAG no RS?", "a última semana está fora do esperado?",
"houve aceleração atípica de casos este ano?".

Quedas não são marcadas como anomalia (costumam refletir atraso de notificação). Recomenda-se filtrar por ano e/ou UF.`,
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          description: "Filtros opcionais. Recomenda-se ano_epi e/ou sg_uf para uma série coerente.",
          properties: {
            ano_epi:      { type: "number", description: "Ano epidemiológico (ex: 2025)." },
            sg_uf:        { type: "array",  items: { type: "string" }, description: "Lista de UFs (ex: ['RS'])" },
            cs_sexo:      { type: "string", description: "'M' ou 'F'" },
            faixa_etaria: { type: "string", description: "Faixa etária (ex: '60-69')." },
            etiologia:    { type: "array",  items: { type: "string" }, description: "Etiologias por PCR (ex: ['vsr'])" },
            idade_min:    { type: "number", description: "Idade mínima em anos." },
            idade_max:    { type: "number", description: "Idade máxima em anos." },
          },
        },
        janela: {
          type: "number",
          description: "Janela da média móvel, em semanas. Padrão: 4.",
        },
        limite: {
          type: "number",
          description: "Limiar de z-score para considerar pico. Padrão: 2.0.",
        },
      },
    },
  },
];

// ── Tool: listar_variaveis ────────────────────────────────────────────────────

function handleListarVariaveis(args: { categoria?: string }): string {
  const { categoria } = args;

  const vars = categoria
    ? VARIABLE_CATALOG.filter(v => v.categoria.toLowerCase() === categoria.toLowerCase())
    : VARIABLE_CATALOG;

  if (vars.length === 0) {
    return `Nenhuma variável encontrada para a categoria "${categoria}".`;
  }

  const grupos = new Map<string, typeof VARIABLE_CATALOG>();
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
      const codStr = v.valores.slice(0, 5).map(val => `${val.codigo}=${val.label}`).join(", ");
      linhas.push(`  Códigos: ${codStr}`);
      const nonIgn = v.valores.filter(val => !val.isIgnorado).length;
      linhas.push(`  OR/RR disponíveis: ${nonIgn === 2 ? "Sim (tabela 2×2)" : "Não"}`);
      if (v.aviso) linhas.push(`  ⚠ AVISO: ${v.aviso}`);
      linhas.push("");
    }
  }

  linhas.push("───────────────────────────────────────────────────");
  linhas.push("FILTROS DISPONÍVEIS (aplicáveis em qualquer análise):");
  linhas.push("  ano_epi:   número (ex: 2024, 2025)");
  linhas.push('  sg_uf:     array de siglas (ex: ["SP", "RJ", "MG"])');
  linhas.push('  cs_sexo:   "M" ou "F"');
  linhas.push('  etiologia: ["COVID-19", "Influenza A", "Influenza B", "VSR"]');
  linhas.push("  idade_min: número em anos (ex: 40) — filtra população por idade mínima");
  linhas.push("  idade_max: número em anos (ex: 59) — filtra população por idade máxima");
  linhas.push("  excluirIgnorado: true (padrão) | false — para bivariada");

  return linhas.join("\n");
}

// ── Tool: consultar_bivariada ─────────────────────────────────────────────────

interface Filtros {
  ano_epi?:      number;
  sg_uf?:        string[];
  cs_sexo?:      string;
  faixa_etaria?: string;
  etiologia?:    string[];
  idade_min?:    number;
  idade_max?:    number;
  classi_fin?:   number[];
  evolucao?:     number[];
  criterios?:    CriterioCodificado[];
}

// Mapeia o objeto de filtros do MCP para o tipo canônico FiltrosSRAG do DAL.
function toFiltrosSRAG(f: Filtros): FiltrosSRAG {
  return {
    ano_epi:      f.ano_epi,
    sg_uf:        f.sg_uf,
    cs_sexo:      f.cs_sexo,
    faixa_etaria: f.faixa_etaria,
    etiologia:    f.etiologia,
    idade_min:    f.idade_min,
    idade_max:    f.idade_max,
    classi_fin:   f.classi_fin,
    evolucao:     f.evolucao,
    criterios:    f.criterios,
  };
}

// Descrição textual dos filtros ativos, reutilizada pelas tools de panorama.
function descreverFiltros(f: Filtros): string {
  const ativos: string[] = [];
  if (f.ano_epi)           ativos.push(`Ano ${f.ano_epi}`);
  if (f.sg_uf?.length)     ativos.push(`UF: ${f.sg_uf.join(", ")}`);
  if (f.cs_sexo)           ativos.push(`Sexo: ${f.cs_sexo === "M" ? "Masculino" : "Feminino"}`);
  if (f.faixa_etaria)      ativos.push(`Faixa etária: ${f.faixa_etaria}`);
  if (f.etiologia?.length) ativos.push(`Etiologia: ${f.etiologia.join(", ")}`);
  if (f.classi_fin?.length) ativos.push(`Classificação final: ${f.classi_fin.join(", ")}`);
  if (f.evolucao?.length)   ativos.push(`Evolução: ${f.evolucao.join(", ")}`);
  for (const criterio of f.criterios ?? []) {
    ativos.push(`${criterio.campo}: ${criterio.valores.join("/")}`);
  }
  if (f.idade_min !== undefined || f.idade_max !== undefined)
    ativos.push(`Idade: ${f.idade_min ?? 0}–${f.idade_max ?? "∞"} anos`);
  return ativos.length ? ativos.join(" · ") : "Nenhum (todos os dados)";
}

// ── Tool: resumir_variavel ───────────────────────────────────────────────────

async function handleResumoDescritivo(args: {
  variavel: DescriptiveVariable;
  filtros?: unknown;
}): Promise<string> {
  try {
    const filtros = parseDescriptiveFilters(args.filtros);
    const result = await getNumericSummary(args.variavel, filtros);
    const { summary, manifest } = result;

    if (summary.populationN === 0) {
      return `Nenhuma notificação encontrada para a população definida. Filtros: ${descreverFiltros(filtros)}.`;
    }

    if (summary.suppressed) {
      return [
        `Resultado suprimido: a população contém menos de ${summary.minimumPopulationN} notificações.`,
        `Filtros: ${descreverFiltros(filtros)}.`,
        "A supressão reduz o risco de divulgação de informações em recortes pequenos.",
        "",
        "MANIFESTO REPRODUTÍVEL (JSON)",
        JSON.stringify(manifest, null, 2),
      ].join("\n");
    }

    const lines: string[] = [];
    lines.push(`RESUMO DESCRITIVO — ${manifest.variable.label}`);
    lines.push("═══════════════════════════════════════════════════════");
    lines.push(`População: ${descreverFiltros(filtros)}`);
    lines.push(`Definição: ${manifest.variable.definition}`);
    lines.push(`N da população filtrada: ${summary.populationN!.toLocaleString("pt-BR")}`);
    lines.push(`N válido: ${summary.validN!.toLocaleString("pt-BR")}`);
    lines.push(`Ausentes/inválidos: ${summary.missingN!.toLocaleString("pt-BR")} (${fmt(summary.missingPct!)}%)`);
    lines.push("");
    lines.push(`Média (DP): ${fmt(summary.mean ?? NaN)} (${fmt(summary.stdDev ?? NaN)}) anos`);
    lines.push(`Mediana [Q1; Q3]: ${fmt(summary.median ?? NaN)} [${fmt(summary.q1 ?? NaN)}; ${fmt(summary.q3 ?? NaN)}] anos`);
    lines.push(`Mínimo–máximo: ${fmt(summary.min ?? NaN)}–${fmt(summary.max ?? NaN)} anos`);
    lines.push("");
    lines.push(`Corte dos dados: ${manifest.source.latestNotificationDate ?? "não informado"}`);
    lines.push(`ID da análise: ${manifest.analysisId}`);
    lines.push("Estratégia de ausências: available-case (métricas calculadas apenas entre idades válidas; denominador total preservado acima).");
    lines.push("");
    lines.push("MANIFESTO REPRODUTÍVEL (JSON)");
    lines.push(JSON.stringify(manifest, null, 2));
    lines.push("");
    lines.push("Resultado descritivo/exploratório; não implica associação causal nem validação clínica.");
    return lines.join("\n");
  } catch (error) {
    return `❌ Parâmetros inválidos: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const FAIXA_ORDER = ["0-4", "5-11", "12-17", "18-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"] as const;

interface ContingenciaCell { vx: string; vy: string; n: number }

async function handleBivariada(args: {
  varX:             string;
  varY:             string;
  filtros?:         Filtros;
  excluirIgnorado?: boolean;
}): Promise<string> {
  const { varX, varY, filtros = {}, excluirIgnorado = true } = args;

  if (!CAMPOS_PERMITIDOS.has(varX)) {
    return `❌ Campo varX "${varX}" não existe no catálogo. Use listar_variaveis para ver os campos disponíveis.`;
  }
  if (!CAMPOS_PERMITIDOS.has(varY)) {
    return `❌ Campo varY "${varY}" não existe no catálogo. Use listar_variaveis para ver os campos disponíveis.`;
  }
  if (varX === varY) return "❌ varX e varY não podem ser iguais.";

  const xInfo = getVariableInfo(varX)!;
  const yInfo = getVariableInfo(varY)!;

  let data: { cells: ContingenciaCell[]; totalN: number; excludedN: number; manifest?: unknown };
  try {
    const res = await fetch(`${SITE}/api/analise/contingencia`, {
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
    return `❌ Falha na conexão: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (!data.cells || data.cells.length === 0) {
    return "Nenhum dado encontrado para essa combinação de variáveis e filtros.\n" + manifestEvidence(data.manifest);
  }

  // Build matrix respecting catalog ordering
  const presentX = new Set(data.cells.map(c => c.vx));
  const presentY = new Set(data.cells.map(c => c.vy));
  const xValues  = xInfo.valores.map(v => v.codigo).filter(c => presentX.has(c));
  const yValues  = yInfo.valores.map(v => v.codigo).filter(c => presentY.has(c));

  const matrix: number[][] = xValues.map(() => yValues.map(() => 0));
  for (const cell of data.cells) {
    const xi = xValues.indexOf(cell.vx);
    const yi = yValues.indexOf(cell.vy);
    if (xi >= 0 && yi >= 0) matrix[xi][yi] = cell.n;
  }

  const chi2Res  = computeChiSquare(matrix);
  const cramersV = computeCramersV(chi2Res.chi2, chi2Res.n, xValues.length, yValues.length);
  const is2x2    = xValues.length === 2 && yValues.length === 2;

  let orRes  = null;
  let rrRes  = null;
  let xCaso  = "", xRef = "", yCaso = "", yRef = "";

  if (is2x2) {
    orRes = computeOR(matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1]);
    rrRes = computeRR(matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1]);
    xCaso = getLabel(xInfo, xValues[0]);
    xRef  = getLabel(xInfo, xValues[1]);
    yCaso = getLabel(yInfo, yValues[0]);
    yRef  = getLabel(yInfo, yValues[1]);
  }

  const rowTotals  = matrix.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals  = yValues.map((_, j) => matrix.reduce((s, r) => s + r[j], 0));
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);

  const filtrosAtivos: string[] = [];
  if (filtros.ano_epi)           filtrosAtivos.push(`Ano ${filtros.ano_epi}`);
  if (filtros.sg_uf?.length)     filtrosAtivos.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.cs_sexo)           filtrosAtivos.push(`Sexo: ${filtros.cs_sexo === "M" ? "Masculino" : "Feminino"}`);
  if (filtros.etiologia?.length) filtrosAtivos.push(`Etiologia: ${filtros.etiologia.join(", ")}`);
  if (filtros.idade_min !== undefined || filtros.idade_max !== undefined)
    filtrosAtivos.push(`Idade: ${filtros.idade_min ?? 0}–${filtros.idade_max ?? "∞"} anos`);

  const lines: string[] = [];
  lines.push("ANÁLISE BIVARIADA — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════");
  lines.push(`Variável X (Exposição): ${xInfo.label} [${varX}]`);
  lines.push(`Variável Y (Desfecho):  ${yInfo.label} [${varY}]`);
  lines.push(filtrosAtivos.length ? `Filtros: ${filtrosAtivos.join(" · ")}` : "Filtros: Nenhum (todos os dados)");
  lines.push("");

  const yLabels   = yValues.map(v => getLabel(yInfo, v));
  const colW      = Math.max(12, ...yLabels.map(l => l.length + 2));
  const rowLabelW = Math.max(20, ...xValues.map(v => getLabel(xInfo, v).length + 2));
  const header    = "".padEnd(rowLabelW) +
    yLabels.map(l => l.padStart(colW)).join("") +
    "Total".padStart(colW) + "  % evento";

  lines.push("TABELA DE CONTINGÊNCIA");
  lines.push("─".repeat(header.length));
  lines.push(header);
  lines.push("─".repeat(header.length));
  xValues.forEach((xv, i) => {
    const pct = rowTotals[i] > 0 ? (matrix[i][0] / rowTotals[i] * 100).toFixed(1) + "%" : "—";
    lines.push(
      getLabel(xInfo, xv).padEnd(rowLabelW) +
      matrix[i].map(n => n.toLocaleString("pt-BR").padStart(colW)).join("") +
      rowTotals[i].toLocaleString("pt-BR").padStart(colW) +
      `  ${pct}`,
    );
  });
  lines.push("─".repeat(header.length));
  lines.push(
    "Total".padEnd(rowLabelW) +
    colTotals.map(n => n.toLocaleString("pt-BR").padStart(colW)).join("") +
    grandTotal.toLocaleString("pt-BR").padStart(colW),
  );
  lines.push("");

  const totalPop = data.totalN + data.excludedN;
  const pctExcl  = totalPop > 0 ? ((data.excludedN / totalPop) * 100).toFixed(1) : "0";

  lines.push("ESTATÍSTICAS");
  lines.push("─────────────────────────────────────────────────");
  lines.push(`N efetivo: ${data.totalN.toLocaleString("pt-BR")}  |  Excluídos: ${data.excludedN.toLocaleString("pt-BR")} (${pctExcl}%) — NULL ou Ignorado`);
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
  if (chi2Res.pValue < 0.05) {
    lines.push(`✅ Associação estatisticamente SIGNIFICATIVA (p ${chi2Res.pValue < 0.001 ? "< 0,001" : "= " + fmtP(chi2Res.pValue)}, α = 0,05)`);
  } else {
    lines.push(`⬜ Sem associação estatisticamente significativa (p = ${fmtP(chi2Res.pValue)}, α = 0,05)`);
  }

  const avisos: string[] = [];
  if (chi2Res.lowExpectedWarning)
    avisos.push("Frequência esperada < 5 em alguma célula — para tabelas 2×2 o teste exato de Fisher seria mais adequado.");
  if (xInfo.aviso) avisos.push(`${xInfo.label}: ${xInfo.aviso}`);
  if (yInfo.aviso) avisos.push(`${yInfo.label}: ${yInfo.aviso}`);
  if (!is2x2 && chi2Res.df > 0)
    avisos.push(`Tabela ${xValues.length}×${yValues.length} — OR e RR não calculados. Use V de Cramér como medida de efeito.`);
  if (cramersV < 0.1 && chi2Res.pValue < 0.05)
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

// ── Tool: consultar_regressao ─────────────────────────────────────────────────

const DEFAULT_PREDITORES = [
  "faixa_etaria", "cs_sexo",
  "diabetes", "obesidade", "cardiopati", "imunodepre",
  "dispneia", "saturacao",
];

interface LinhaCoef {
  nome:          string;
  aOR:           number;
  ci95Low:       number;
  ci95High:      number;
  pValue:        number;
  isIntercept?:  boolean;
  isReferencia?: boolean;
}

interface RegressaoResp {
  manifest?: unknown;
  coeficientes: LinhaCoef[];
  meta: {
    n: number; nRaw: number; nExcluded: number;
    events: number; taxaEventos: number;
    aic: number; devianceNull: number; deviance: number;
    r2McFadden: number; converged: boolean; iteracoes: number;
  };
  outcome:         { campo: string; label: string; eventLabel: string };
  incluirIgnorado: boolean;
  avisos:          string[];
  refFaixa?:       string;
  refSexo?:        string;
}

async function handleRegressao(args: {
  outcome:          string;
  preditores?:      string[];
  filtros?:         Filtros;
  incluirIgnorado?: boolean;
  refFaixa?:        string;
  refSexo?:         string;
}): Promise<string> {
  const { outcome, preditores = DEFAULT_PREDITORES, filtros = {}, incluirIgnorado = false, refFaixa, refSexo } = args;

  if (!(OUTCOMES_REGRESSAO as readonly string[]).includes(outcome)) {
    return `❌ Outcome "${outcome}" inválido. Válidos: ${OUTCOMES_REGRESSAO.join(", ")}`;
  }
  const predInvalidos = preditores.filter(
    p => !PREDITORES_REGRESSAO.includes(p) && p !== "faixa_etaria"
  );
  if (predInvalidos.length > 0) {
    return `❌ Preditores inválidos: ${predInvalidos.join(", ")}.\nUse listar_variaveis para ver os preditores disponíveis.`;
  }

  let data: RegressaoResp;
  try {
    const res = await fetch(`${SITE}/api/analise/regressao`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ outcome, preditores, filtros, incluirIgnorado, refFaixa, refSexo }),
      signal:  AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      return `❌ Erro da API (HTTP ${res.status}): ${err.error ?? "erro desconhecido"}`;
    }
    data = await res.json() as RegressaoResp;
  } catch (e) {
    return `❌ Falha na conexão: ${e instanceof Error ? e.message : String(e)}`;
  }

  const unavailable = unavailableRegression(data);
  if (unavailable) return unavailable;
  const meta         = data.meta;
  const outcomeLabel = OUTCOME_LABELS[outcome] ?? { label: outcome, eventLabel: "Evento" };

  const filtrosAtivos: string[] = [];
  if (filtros.ano_epi)           filtrosAtivos.push(`Ano ${filtros.ano_epi}`);
  if (filtros.sg_uf?.length)     filtrosAtivos.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.cs_sexo)           filtrosAtivos.push(`Sexo: ${filtros.cs_sexo === "M" ? "Masculino" : "Feminino"}`);
  if (filtros.etiologia?.length) filtrosAtivos.push(`Etiologia: ${filtros.etiologia.join(", ")}`);
  if (filtros.idade_min !== undefined || filtros.idade_max !== undefined)
    filtrosAtivos.push(`Idade: ${filtros.idade_min ?? 0}–${filtros.idade_max ?? "∞"} anos`);

  const coefs            = data.coeficientes.filter(l => !l.isIntercept);
  const significativos   = coefs.filter(l => !l.isReferencia && Number.isFinite(l.pValue) && l.pValue < 0.05);
  const naoSignificativos = coefs.filter(l => !l.isReferencia && Number.isFinite(l.pValue) && l.pValue >= 0.05);
  const indisponiveis    = coefs.filter(l => !l.isReferencia && (!Number.isFinite(l.pValue) || !Number.isFinite(l.aOR)));

  const pctExcl   = meta.nRaw > 0 ? ((meta.nExcluded / meta.nRaw) * 100).toFixed(1) : "—";
  const pctEventos = (meta.taxaEventos * 100).toFixed(1);
  const pctRedDev  = meta.devianceNull > 0
    ? (((meta.devianceNull - meta.deviance) / meta.devianceNull) * 100).toFixed(1)
    : "—";

  const lines: string[] = [];
  lines.push("REGRESSÃO LOGÍSTICA MULTIVARIADA — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`Desfecho: ${outcomeLabel.label}`);
  lines.push(`Preditores: ${preditores.join(", ")}`);
  lines.push(filtrosAtivos.length ? `Filtros: ${filtrosAtivos.join(" · ")}` : "Filtros: Nenhum (todos os dados)");
  lines.push("");

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

  if (meta.nRaw > 0 && meta.nExcluded / meta.nRaw > 0.30) {
    lines.push("");
    lines.push(`⚠ ATRITO ELEVADO: ${pctExcl}% dos casos foi excluído por dados ausentes.`);
    lines.push("  Os resultados representam a subpopulação com preenchimento completo.");
    lines.push("  Considere incluirIgnorado=true para tratar Ignorado como categoria.");
  }

  const fmtCoefHeader = () =>
    `  ${"Variável".padEnd(38)}  ${"aOR".padStart(6)}  ${"IC 95%".padStart(18)}  ${"p-valor".padStart(8)}  Sig.`;

  const fmtCoefLine = (l: LinhaCoef) => {
    const arrow = Number.isFinite(l.aOR) ? (l.aOR < 1 ? " ▼" : " ▲") : "";
    return (
      `  ${l.nome.padEnd(38)}` +
      `  ${fmt(l.aOR).padStart(6)}` +
      `  ${`${fmt(l.ci95Low)} – ${fmt(l.ci95High)}`.padStart(18)}` +
      `  ${fmtP(l.pValue).padStart(8)}` +
      `  ${sigStars(l.pValue).padStart(4)}${arrow}`
    );
  };

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

  if (data.avisos.length > 0) {
    lines.push("");
    lines.push("AVISOS DO MODELO");
    lines.push("─────────────────────────────────────────────────");
    data.avisos.forEach(a => lines.push(`⚠ ${a}`));
  }

  lines.push("");
  lines.push(`Categorias de referência: ${data.coeficientes.filter(c => c.isReferencia).map(c => c.nome).join("; ")}.`);
  lines.push("Método: IRLS (regressão logística binomial agrupada). IC 95% de Wald.");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");

  // ── Análise de sensibilidade automática ───────────────────────────────────
  // Ativada quando atrito > 30% e a chamada original usou CCA (incluirIgnorado=false)
  const atrito = meta.nRaw > 0 ? meta.nExcluded / meta.nRaw : 0;
  if (!incluirIgnorado && atrito > 0.30) {
    let data2: RegressaoResp | null = null;
    try {
      const res2 = await fetch(`${SITE}/api/analise/regressao`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ outcome, preditores, filtros, incluirIgnorado: true, refFaixa: data.refFaixa, refSexo: data.refSexo }),
        signal:  AbortSignal.timeout(60_000),
      });
      if (res2.ok) data2 = await res2.json() as RegressaoResp;
    } catch { /* sensibilidade é opcional */ }

    if (data2 && !unavailableRegression(data2)) {
      lines.push("", "EVIDÊNCIA DO MODELO ALTERNATIVO", manifestEvidence(data2.manifest));
      const pctExcl2 = data2.meta.nRaw > 0
        ? ((data2.meta.nExcluded / data2.meta.nRaw) * 100).toFixed(1)
        : "—";

      const aorAlt = new Map<string, number>();
      for (const c of data2.coeficientes) {
        if (!c.isIntercept && !c.isReferencia && Number.isFinite(c.aOR) &&
            !c.nome.includes("Ignorado/ausente")) {
          aorAlt.set(c.nome, c.aOR);
        }
      }

      const comparaveis = coefs.filter(
        c => !c.isReferencia && Number.isFinite(c.aOR) && aorAlt.has(c.nome)
      );

      if (comparaveis.length > 0) {
        const COL = 38;
        lines.push("");
        lines.push("ANÁLISE DE SENSIBILIDADE — CCA vs Ignorado como Categoria");
        lines.push("─────────────────────────────────────────────────");
        lines.push(`N modelo CCA:          ${meta.n.toLocaleString("pt-BR")} (atrito ${(atrito * 100).toFixed(1)}%)`);
        lines.push(`N modelo c/ Ignorado:  ${data2.meta.n.toLocaleString("pt-BR")} (atrito ${pctExcl2}%)`);
        lines.push("");
        lines.push(`  ${"Preditor".padEnd(COL)}  ${"aOR CCA".padStart(8)}  ${"aOR Ign.".padStart(8)}  ${"Δ".padStart(6)}`);
        lines.push("  " + "─".repeat(COL + 30));

        let maxDelta = 0;
        for (const c of comparaveis) {
          const aorIgn = aorAlt.get(c.nome)!;
          const delta  = ((aorIgn - c.aOR) / c.aOR) * 100;
          maxDelta = Math.max(maxDelta, Math.abs(delta));
          const sign = delta >= 0 ? "+" : "";
          lines.push(
            `  ${c.nome.padEnd(COL)}  ${fmt(c.aOR).padStart(8)}  ${fmt(aorIgn).padStart(8)}  ${(sign + delta.toFixed(0) + "%").padStart(6)}`
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

// ── Tool: consultar_panorama ──────────────────────────────────────────────────

function barra(valor: number, max: number, largura = 20): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((valor / max) * largura)));
}

async function handlePanorama(args: {
  filtros?:        Filtros;
  desagregar_por?: "etiologia" | "faixa_etaria" | "sexo";
}): Promise<string> {
  const { filtros = {}, desagregar_por } = args;
  const srag = toFiltrosSRAG(filtros);

  let pano: Awaited<ReturnType<typeof getPanoramaGeral>>;
  try {
    pano = await getPanoramaGeral(srag);
  } catch (e) {
    return `❌ Falha ao consultar panorama: ${e instanceof Error ? e.message : String(e)}`;
  }

  const k = pano.kpis;
  if (k.total_casos === 0) {
    return `Nenhum caso encontrado para os filtros: ${descreverFiltros(filtros)}.`;
  }

  const pctUti  = k.total_casos > 0 ? (k.total_uti / k.total_casos) * 100 : 0;
  const pctHosp = k.total_casos > 0 ? (k.total_internacoes / k.total_casos) * 100 : 0;

  const lines: string[] = [];
  lines.push("PANORAMA EPIDEMIOLÓGICO — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Filtros: ${descreverFiltros(filtros)}`);
  lines.push(`Ano de referência: ${filtros.ano_epi ?? `todos (mais recente: ${pano.meta.ano})`}  ·  dados até SE ${pano.meta.sem_mais_recente ?? "—"}`);
  lines.push("");
  lines.push("INDICADORES");
  lines.push("─────────────────────────────────────────────────");
  lines.push(`Casos (SRAG):          ${k.total_casos.toLocaleString("pt-BR")}`);
  lines.push(`Óbitos (SRAG):         ${k.total_obitos.toLocaleString("pt-BR")}  (letalidade ${fmt(k.taxa_letalidade)}%)`);
  lines.push(`Internações em UTI:    ${k.total_uti.toLocaleString("pt-BR")}  (${fmt(pctUti)}% dos casos)`);
  lines.push(`Hospitalizações:       ${k.total_internacoes.toLocaleString("pt-BR")}  (${fmt(pctHosp)}% dos casos)`);

  const serie = pano.serie.filter(s => s.sem_not != null);
  if (serie.length > 0) {
    const pico = serie.reduce((a, b) => (b.total_casos > a.total_casos ? b : a));
    lines.push("");
    lines.push("TENDÊNCIA SEMANAL");
    lines.push("─────────────────────────────────────────────────");
    lines.push(`Semana de pico: SE ${pico.sem_not} (${pico.total_casos.toLocaleString("pt-BR")} casos)`);

    if (serie.length >= 8) {
      const ult = serie.slice(-4).reduce((s, p) => s + p.total_casos, 0);
      const ant = serie.slice(-8, -4).reduce((s, p) => s + p.total_casos, 0);
      if (ant > 0) {
        const delta = ((ult - ant) / ant) * 100;
        const dir = delta > 5 ? "↑ alta" : delta < -5 ? "↓ queda" : "→ estável";
        lines.push(`Últimas 4 SE vs 4 anteriores: ${ult.toLocaleString("pt-BR")} vs ${ant.toLocaleString("pt-BR")}  (${dir}, ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%)`);
      }
    }

    const tail = serie.slice(-8);
    const maxV = Math.max(...tail.map(p => p.total_casos), 1);
    lines.push("");
    lines.push(`  ${"SE".padStart(3)}  ${"Casos".padStart(7)}  ${"Óbitos".padStart(7)}`);
    for (const p of tail) {
      lines.push(`  ${String(p.sem_not).padStart(3)}  ${p.total_casos.toLocaleString("pt-BR").padStart(7)}  ${p.total_obitos.toLocaleString("pt-BR").padStart(7)}  ${barra(p.total_casos, maxV)}`);
    }
  }

  // ── Desagregação opcional ────────────────────────────────────────────────
  if (desagregar_por === "etiologia") {
    const curva = await getCurvaEtiologica(srag);
    const t = curva.reduce(
      (a, c) => ({
        flu_a: a.flu_a + c.flu_a, flu_b: a.flu_b + c.flu_b, sars2: a.sars2 + c.sars2,
        vsr: a.vsr + c.vsr, rino: a.rino + c.rino, metap: a.metap + c.metap, nao_id: a.nao_id + c.nao_id,
      }),
      { flu_a: 0, flu_b: 0, sars2: 0, vsr: 0, rino: 0, metap: 0, nao_id: 0 },
    );
    const totalConf = t.flu_a + t.flu_b + t.sars2 + t.vsr + t.rino + t.metap;
    const rows = ([
      ["SARS-CoV-2", t.sars2], ["Influenza A", t.flu_a], ["Influenza B", t.flu_b],
      ["VSR", t.vsr], ["Rinovírus", t.rino], ["Metapneumovírus", t.metap],
    ] as [string, number][]).sort((a, b) => b[1] - a[1]);
    lines.push("");
    lines.push("DISTRIBUIÇÃO POR ETIOLOGIA (PCR confirmado)");
    lines.push("─────────────────────────────────────────────────");
    for (const [label, n] of rows) {
      const pc = totalConf > 0 ? (n / totalConf) * 100 : 0;
      lines.push(`  ${label.padEnd(18)} ${n.toLocaleString("pt-BR").padStart(8)}  (${fmt(pc)}%)`);
    }
    lines.push(`  ${"Não identificado".padEnd(18)} ${t.nao_id.toLocaleString("pt-BR").padStart(8)}  (sem PCR+ para os agentes rastreados)`);
  } else if (desagregar_por === "faixa_etaria" || desagregar_por === "sexo") {
    const pir = await getPiramideEtaria(srag);
    lines.push("");
    if (desagregar_por === "faixa_etaria") {
      const byFaixa = new Map<string, number>();
      for (const r of pir) byFaixa.set(r.faixa, (byFaixa.get(r.faixa) ?? 0) + Number(r.n));
      const totF = [...byFaixa.values()].reduce((s, v) => s + v, 0);
      lines.push("DISTRIBUIÇÃO POR FAIXA ETÁRIA");
      lines.push("─────────────────────────────────────────────────");
      for (const f of FAIXA_ORDER) {
        const n = byFaixa.get(f) ?? 0;
        if (n === 0) continue;
        const pc = totF > 0 ? (n / totF) * 100 : 0;
        lines.push(`  ${f.padEnd(8)} ${n.toLocaleString("pt-BR").padStart(8)}  (${fmt(pc)}%)`);
      }
    } else {
      const bySexo = new Map<string, number>();
      for (const r of pir) bySexo.set(r.sexo, (bySexo.get(r.sexo) ?? 0) + Number(r.n));
      const totS = [...bySexo.values()].reduce((s, v) => s + v, 0);
      lines.push("DISTRIBUIÇÃO POR SEXO");
      lines.push("─────────────────────────────────────────────────");
      for (const [code, label] of [["M", "Masculino"], ["F", "Feminino"]] as const) {
        const n = bySexo.get(code) ?? 0;
        const pc = totS > 0 ? (n / totS) * 100 : 0;
        lines.push(`  ${label.padEnd(10)} ${n.toLocaleString("pt-BR").padStart(8)}  (${fmt(pc)}%)`);
      }
    }
    lines.push("  (considera apenas casos com idade e sexo válidos)");
  }

  lines.push("");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");
  return lines.join("\n");
}

// ── Tool: prevalencia_recente ─────────────────────────────────────────────────

async function handlePrevalencia(args: {
  filtros?: Filtros;
  semanas?: number;
}): Promise<string> {
  const { filtros = {}, semanas = 4 } = args;
  const n = Math.min(Math.max(Math.round(semanas), 1), 52);
  const srag = toFiltrosSRAG(filtros);

  let prev: Awaited<ReturnType<typeof getPrevalenciaRecente>>;
  try {
    prev = await getPrevalenciaRecente(n, srag);
  } catch (e) {
    return `❌ Falha ao consultar prevalência: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (prev.total_casos === 0) {
    return `Nenhum caso nas últimas ${n} semanas para os filtros: ${descreverFiltros(filtros)}.`;
  }

  const agentes: { label: string; pos: number; ob: number | null }[] = [
    { label: "SARS-CoV-2",      pos: prev.sars2, ob: prev.obitos_sars2 },
    { label: "Influenza A",     pos: prev.flu_a, ob: prev.obitos_flu_a },
    { label: "Influenza B",     pos: prev.flu_b, ob: null },
    { label: "VSR",             pos: prev.vsr,   ob: prev.obitos_vsr },
    { label: "Rinovírus",       pos: prev.rino,  ob: prev.obitos_rino },
    { label: "Metapneumovírus", pos: prev.metap, ob: null },
    { label: "Adenovírus",      pos: prev.adeno, ob: null },
  ].sort((a, b) => b.pos - a.pos);

  const somaPos      = agentes.reduce((s, a) => s + a.pos, 0);
  const positividade = prev.total_casos > 0 ? (prev.total_pos / prev.total_casos) * 100 : 0;

  const lines: string[] = [];
  lines.push("PREVALÊNCIA RECENTE POR AGENTE — SIVEP-Gripe / SivepLens");
  lines.push("════════════════════════════════════════════════════════════");
  lines.push(`Janela: últimas ${n} semanas (SE ${prev.semanas.min} a ${prev.semanas.max})`);
  lines.push(`Filtros: ${descreverFiltros(filtros)}`);
  lines.push("");
  lines.push(`Casos no período:   ${prev.total_casos.toLocaleString("pt-BR")}`);
  lines.push(`PCR positivos:      ${prev.total_pos.toLocaleString("pt-BR")}  (positividade ${fmt(positividade)}%)`);
  lines.push("");
  lines.push("AGENTES DETECTADOS (PCR+)");
  lines.push("────────────────────────────────────────────────────────────");
  lines.push(`  ${"Agente".padEnd(18)} ${"Detecções".padStart(10)} ${"% dos +".padStart(9)} ${"Óbitos".padStart(7)}`);
  for (const a of agentes) {
    if (a.pos === 0) continue;
    const pc = somaPos > 0 ? (a.pos / somaPos) * 100 : 0;
    const obStr = a.ob == null ? "n/d" : a.ob.toLocaleString("pt-BR");
    lines.push(`  ${a.label.padEnd(18)} ${a.pos.toLocaleString("pt-BR").padStart(10)} ${(fmt(pc) + "%").padStart(9)} ${obStr.padStart(7)}  ${barra(pc, 100, 20)}`);
  }

  const dom = agentes.find(a => a.pos > 0);
  lines.push("");
  if (dom) {
    const pc = somaPos > 0 ? (dom.pos / somaPos) * 100 : 0;
    lines.push(`Agente predominante: ${dom.label} (${fmt(pc)}% das detecções).`);
  } else {
    lines.push("Nenhum agente rastreado teve PCR positivo no período (casos sem identificação laboratorial).");
  }
  lines.push("");
  lines.push("Nota: 'detecções' contam PCR positivo por agente — coinfecções entram em mais de um agente. 'n/d' = óbitos por agente não disponíveis.");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");
  return lines.join("\n");
}

// ── Tool: perfil_sintomatologico ──────────────────────────────────────────────

async function handlePerfil(args: { filtros?: Filtros }): Promise<string> {
  const { filtros = {} } = args;
  const srag = toFiltrosSRAG(filtros);

  let perfil: Awaited<ReturnType<typeof getPerfilSintomatologico>>;
  try {
    perfil = await getPerfilSintomatologico(srag);
  } catch (e) {
    return `❌ Falha ao consultar perfil sintomatológico: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (perfil.totalN === 0) {
    return `Nenhum caso encontrado para os filtros: ${descreverFiltros(filtros)}.`;
  }

  // Ordena por letalidade entre quem apresentou o sintoma (sinal de gravidade)
  const linhas = perfil.sintomas
    .map((s) => {
      const desfechoConhecido = s.nCura + s.nObito;
      const letal = desfechoConhecido > 0 ? (s.nObito / desfechoConhecido) * 100 : 0;
      const prev  = perfil.totalN > 0 ? (s.nSim / perfil.totalN) * 100 : 0;
      return { ...s, letal, prev, desfechoConhecido };
    })
    .sort((a, b) => b.letal - a.letal);

  const letalGeral = (perfil.totalCura + perfil.totalObito) > 0
    ? (perfil.totalObito / (perfil.totalCura + perfil.totalObito)) * 100
    : 0;

  const lines: string[] = [];
  lines.push("PERFIL SINTOMATOLÓGICO — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Filtros: ${descreverFiltros(filtros)}`);
  lines.push(`N de casos: ${perfil.totalN.toLocaleString("pt-BR")}  ·  letalidade geral: ${fmt(letalGeral)}% (entre casos com desfecho conhecido)`);
  lines.push("");
  lines.push("SINTOMAS (ordenados por letalidade entre quem apresentou)");
  lines.push("─────────────────────────────────────────────────");
  lines.push(`  ${"Sintoma".padEnd(24)} ${"Prevalência".padStart(12)} ${"Letalidade".padStart(11)}`);
  for (const s of linhas) {
    const marca = s.letal > letalGeral ? " ▲" : "";
    lines.push(
      `  ${s.label.padEnd(24)} ${(fmt(s.prev) + "%").padStart(12)} ${(fmt(s.letal) + "%").padStart(11)}${marca}`
    );
  }
  lines.push("");
  lines.push("▲ = letalidade acima da média geral (possível marcador de gravidade).");
  lines.push("Prevalência = % dos casos que apresentaram o sintoma. Letalidade = % de óbito entre os que o apresentaram e têm desfecho conhecido.");
  lines.push("Atenção: associação ≠ causalidade; para ajustar por confundidores, use consultar_regressao.");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");
  return lines.join("\n");
}

// ── Tool: consultar_alertas ───────────────────────────────────────────────────

async function handleAlertas(args: {
  filtros?: Filtros;
  janela?:  number;
  limite?:  number;
}): Promise<string> {
  const { filtros = {}, janela = 4, limite = 2.0 } = args;
  const window    = Math.min(Math.max(Math.round(janela), 2), 12);
  const threshold = Math.min(Math.max(limite, 1), 5);
  const srag = toFiltrosSRAG(filtros);

  let curva: Awaited<ReturnType<typeof getCurvaEtiologica>>;
  try {
    curva = await getCurvaEtiologica(srag);
  } catch (e) {
    return `❌ Falha ao consultar série temporal: ${e instanceof Error ? e.message : String(e)}`;
  }

  const serie: SerieDataPoint[] = curva
    .filter((c) => c.ano_epi != null && c.sem_not != null)
    .map((c) => ({ anoEpi: Number(c.ano_epi), semanaEpi: Number(c.sem_not), valor: c.total }))
    .sort((a, b) => (a.anoEpi - b.anoEpi) || (a.semanaEpi - b.semanaEpi));

  if (serie.length < window + 1) {
    return `Série insuficiente para detecção (${serie.length} semanas; mínimo ${window + 1}). Filtros: ${descreverFiltros(filtros)}.`;
  }

  const analise   = analisarSerieTemporal(serie, window, threshold);
  const anomalias = analise.filter((p) => p.isAnomaly);
  const ultimo    = analise[analise.length - 1];

  const lines: string[] = [];
  lines.push("DETECÇÃO DE ANOMALIAS — SIVEP-Gripe / SivepLens");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Filtros: ${descreverFiltros(filtros)}`);
  lines.push(`Método: z-score sobre média móvel de ${window} semanas · limiar z > ${fmt(threshold, 1)}`);
  lines.push(`Período analisado: ${serie.length} semanas (até ${ultimo.label})`);
  lines.push("");

  // Status da semana mais recente
  lines.push("SEMANA MAIS RECENTE");
  lines.push("─────────────────────────────────────────────────");
  if (ultimo.isAnomaly) {
    lines.push(`🔴 ${ultimo.label}: ${ultimo.explicacao}`);
    lines.push(`   Severidade: ${(ultimo.severidade * 100).toFixed(0)}%`);
  } else {
    lines.push(`🟢 ${ultimo.label}: ${ultimo.explicacao}`);
  }
  lines.push("");

  if (anomalias.length === 0) {
    lines.push(`Nenhum pico atípico detectado nas ${serie.length} semanas analisadas.`);
  } else {
    lines.push(`PICOS ATÍPICOS DETECTADOS (${anomalias.length})`);
    lines.push("─────────────────────────────────────────────────");
    lines.push(`  ${"Semana".padEnd(9)} ${"Casos".padStart(8)} ${"Esperado".padStart(9)} ${"z".padStart(6)} ${"Sev.".padStart(6)}`);
    for (const a of anomalias.slice(-12)) {
      lines.push(
        `  ${a.label.padEnd(9)} ${a.valor.toLocaleString("pt-BR").padStart(8)} ${Math.round(a.esperado).toLocaleString("pt-BR").padStart(9)} ${a.zScore.toFixed(1).padStart(6)} ${((a.severidade * 100).toFixed(0) + "%").padStart(6)}`
      );
    }
    if (anomalias.length > 12) lines.push(`  … (${anomalias.length - 12} picos mais antigos omitidos)`);
  }

  lines.push("");
  lines.push("Quedas não são sinalizadas (costumam refletir atraso de notificação, não melhora real).");
  lines.push("Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.");
  return lines.join("\n");
}

// ── JSON-RPC ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc?: string;
  id?:      number | string | null;
  method:   string;
  params?:  unknown;
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function isAuthorized(req: NextRequest): boolean {
  const configuredToken = process.env.MCP_ACCESS_TOKEN?.trim();
  if (!configuredToken) return true; // dados públicos; acesso somente leitura
  return getToken(req) === configuredToken;
}

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
    { status: 401, headers: { ...CORS, "WWW-Authenticate": `Bearer realm="SRAG-DATASUS MCP"` } },
  );
}

// ── Route exports ─────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  return NextResponse.json(
    {
      service: "SivepLens MCP",
      version: "1.1.0",
      transport: "MCP Streamable HTTP (stateless JSON responses)",
      authentication: process.env.MCP_ACCESS_TOKEN ? "Bearer token" : "public read-only",
    },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Content-Type must be application/json" } },
      { status: 415, headers: CORS },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json() as JsonRpcRequest;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS },
    );
  }

  if (body.jsonrpc !== "2.0") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Invalid Request" } },
      { status: 400, headers: CORS },
    );
  }

  // Notifications have no id — acknowledge without a body
  if (body.id === undefined) {
    return new NextResponse(null, { status: 202, headers: CORS });
  }

  let result: unknown;

  try {
    switch (body.method) {
      case "initialize": {
        // This endpoint implements the 2025-03-26 stateless Streamable HTTP
        // contract. Do not echo a newer client version: that would advertise
        // requirements (headers/session semantics) the server does not enforce.
        result = {
          protocolVersion: "2025-03-26",
          capabilities:    { tools: { listChanged: false } },
          serverInfo:      { name: "srag-datasus", version: "1.1.0" },
          instructions:    "Dados públicos do SIVEP-Gripe. Prefira resumir_variavel antes de análises inferenciais e sempre informe filtros, denominadores e ausências.",
        };
        break;
      }

      case "ping":
        result = {};
        break;

      case "tools/list":
        result = { tools: TOOLS };
        break;

      case "tools/call": {
        const { name, arguments: toolArgs = {} } =
          (body.params as { name: string; arguments?: Record<string, unknown> }) ?? {};
        let text: string;
        switch (name) {
          case "listar_variaveis":
            text = handleListarVariaveis(toolArgs as { categoria?: string });
            break;
          case "resumir_variavel":
            text = await handleResumoDescritivo(toolArgs as Parameters<typeof handleResumoDescritivo>[0]);
            break;
          case "consultar_bivariada":
            text = await handleBivariada(toolArgs as Parameters<typeof handleBivariada>[0]);
            break;
          case "consultar_regressao":
            text = await handleRegressao(toolArgs as Parameters<typeof handleRegressao>[0]);
            break;
          case "consultar_panorama":
            text = await handlePanorama(toolArgs as Parameters<typeof handlePanorama>[0]);
            break;
          case "prevalencia_recente":
            text = await handlePrevalencia(toolArgs as Parameters<typeof handlePrevalencia>[0]);
            break;
          case "perfil_sintomatologico":
            text = await handlePerfil(toolArgs as Parameters<typeof handlePerfil>[0]);
            break;
          case "consultar_alertas":
            text = await handleAlertas(toolArgs as Parameters<typeof handleAlertas>[0]);
            break;
          default:
            return NextResponse.json(
              { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Tool not found: ${name}` } },
              { headers: CORS },
            );
        }
        result = { content: [{ type: "text" as const, text }] };
        break;
      }

      default:
        return NextResponse.json(
          { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } },
          { headers: CORS },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: body.id, error: { code: -32603, message: `Internal error: ${msg}` } },
      { status: 500, headers: CORS },
    );
  }

  return NextResponse.json({ jsonrpc: "2.0", id: body.id, result }, { headers: CORS });
}
