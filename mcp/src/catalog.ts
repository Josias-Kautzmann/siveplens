/**
 * catalog.ts — catálogo de variáveis disponíveis no SIVEP-Gripe.
 *
 * Usado pelo MCP para:
 *  1. Validar campos antes de chamar a API
 *  2. Ordenar células da tabela de contingência (para chi², OR, RR corretos)
 *  3. Responder à tool `listar_variaveis`
 *  4. Enriquecer o output com labels legíveis
 */

export interface VarEntry {
  campo:       string;           // identificador na API
  label:       string;           // nome legível
  categoria:   string;
  descricao:   string;
  /** Códigos em ordem de exibição — IMPORTANTE para or/rr: index 0 = "caso/exposto", index 1 = "referência" */
  codigosOrdem: string[];
  codigoLabels: Record<string, string>;
  ignorado:    string[];         // códigos de "Ignorado" (excluídos por padrão)
  is2x2:       boolean;          // permite OR/RR
  aviso?:      string;
}

export const CATALOGO: VarEntry[] = [

  // ── Desfechos ───────────────────────────────────────────────────────────────

  {
    campo:        "evolucao_bin",
    label:        "Óbito por SRAG (binário)",
    categoria:    "Desfecho",
    descricao:    "Óbito por SRAG vs Cura. Exclui 'óbito por outras causas'. Padrão da literatura para análise de risco de óbito.",
    codigosOrdem: ["2", "1"],
    codigoLabels: { "2": "Óbito por SRAG", "1": "Cura" },
    ignorado:     [],
    is2x2:        true,
  },
  {
    campo:        "evolucao",
    label:        "Desfecho clínico completo",
    categoria:    "Desfecho",
    descricao:    "3 categorias: Cura, Óbito SRAG, Óbito outras causas. OR/RR indisponíveis — use evolucao_bin para isso.",
    codigosOrdem: ["1", "2", "3"],
    codigoLabels: { "1": "Cura", "2": "Óbito SRAG", "3": "Óbito outras causas", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        false,
    aviso:        "3 categorias — OR/RR não disponíveis. Use evolucao_bin para análise de risco de óbito.",
  },
  {
    campo:        "uti",
    label:        "Internação em UTI",
    categoria:    "Desfecho",
    descricao:    "Se o paciente foi internado em UTI durante a internação.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim (UTI)", "2": "Não" },
    ignorado:     [],
    is2x2:        true,
  },
  {
    campo:        "suport_ven_bin",
    label:        "Ventilação invasiva (binário)",
    categoria:    "Desfecho",
    descricao:    "Ventilação invasiva vs não invasiva. Exclui pacientes sem suporte ventilatório (código 3).",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Invasivo", "2": "Não invasivo" },
    ignorado:     [],
    is2x2:        true,
    aviso:        "Exclui pacientes sem ventilação — compara apenas os que receberam algum tipo.",
  },
  {
    campo:        "suport_ven",
    label:        "Suporte ventilatório completo",
    categoria:    "Desfecho",
    descricao:    "3 categorias: invasivo, não invasivo, nenhum.",
    codigosOrdem: ["1", "2", "3"],
    codigoLabels: { "1": "Invasivo", "2": "Não invasivo", "3": "Nenhum" },
    ignorado:     [],
    is2x2:        false,
  },
  {
    campo:        "classi_fin",
    label:        "Classificação etiológica final",
    categoria:    "Desfecho",
    descricao:    "Agente etiológico identificado. 5 categorias.",
    codigosOrdem: ["1", "2", "3", "4", "5"],
    codigoLabels: { "1": "Influenza", "2": "Outro vírus", "3": "Outro agente", "4": "SRAG NE", "5": "COVID-19" },
    ignorado:     [],
    is2x2:        false,
  },

  // ── Demográfico ─────────────────────────────────────────────────────────────

  {
    campo:        "cs_sexo",
    label:        "Sexo biológico",
    categoria:    "Demográfico",
    descricao:    "Sexo biológico do paciente notificado.",
    codigosOrdem: ["M", "F"],
    codigoLabels: { "M": "Masculino", "F": "Feminino", "I": "Ignorado" },
    ignorado:     ["I"],
    is2x2:        true,
  },
  {
    campo:        "cs_raca",
    label:        "Raça / Cor",
    categoria:    "Demográfico",
    descricao:    "Raça/cor autodeclarada. 5 categorias — OR/RR indisponíveis.",
    codigosOrdem: ["1", "2", "3", "4", "5"],
    codigoLabels: { "1": "Branca", "2": "Preta", "3": "Amarela", "4": "Parda", "5": "Indígena", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        false,
  },
  {
    campo:        "cs_escol_n",
    label:        "Escolaridade",
    categoria:    "Demográfico",
    descricao:    "Nível de escolaridade. Ordinal, 9 categorias.",
    codigosOrdem: ["0","1","2","3","4","5","6","7","8"],
    codigoLabels: { "0":"Nenhuma","1":"Fund. I inc.","2":"Fund. I comp.","3":"Fund. II inc.","4":"Fund. II comp.",
                    "5":"Médio inc.","6":"Médio comp.","7":"Superior inc.","8":"Superior comp.","9":"Ignorado" },
    ignorado:     ["9"],
    is2x2:        false,
  },

  // ── Vacinação ────────────────────────────────────────────────────────────────

  {
    campo:        "vacina_cov",
    label:        "Vacina COVID-19",
    categoria:    "Vacinação",
    descricao:    "Se o paciente recebeu vacina contra COVID-19.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Vacinado", "2": "Não vacinado", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "vacina",
    label:        "Vacina Influenza",
    categoria:    "Vacinação",
    descricao:    "Se o paciente recebeu vacina de Influenza na temporada vigente.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Vacinado", "2": "Não vacinado", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },

  // ── Comorbidades ─────────────────────────────────────────────────────────────

  {
    campo:        "diabetes",
    label:        "Diabetes mellitus",
    categoria:    "Comorbidades",
    descricao:    "Presença de diabetes mellitus.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "obesidade",
    label:        "Obesidade (IMC ≥ 30)",
    categoria:    "Comorbidades",
    descricao:    "Presença de obesidade.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "cardiopati",
    label:        "Cardiopatia crônica",
    categoria:    "Comorbidades",
    descricao:    "Doença cardíaca crônica.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "imunodepre",
    label:        "Imunodepressão / Imunossupressão",
    categoria:    "Comorbidades",
    descricao:    "Imunodepressão ou uso de imunossupressores.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "renal",
    label:        "Doença renal crônica",
    categoria:    "Comorbidades",
    descricao:    "Doença renal crônica.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "asma",
    label:        "Asma",
    categoria:    "Comorbidades",
    descricao:    "Presença de asma.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "pneumopati",
    label:        "Pneumopatia crônica",
    categoria:    "Comorbidades",
    descricao:    "Doença pulmonar crônica (exceto asma).",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "neurologic",
    label:        "Doença neurológica crônica",
    categoria:    "Comorbidades",
    descricao:    "Doença neurológica crônica.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "sind_down",
    label:        "Síndrome de Down",
    categoria:    "Comorbidades",
    descricao:    "Diagnóstico de Síndrome de Down.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },

  // ── Sintomas ─────────────────────────────────────────────────────────────────

  {
    campo:        "febre",
    label:        "Febre",
    categoria:    "Sintomas",
    descricao:    "Presença de febre na admissão.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "tosse",
    label:        "Tosse",
    categoria:    "Sintomas",
    descricao:    "Presença de tosse.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "dispneia",
    label:        "Dispneia (falta de ar)",
    categoria:    "Sintomas",
    descricao:    "Presença de dispneia.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sim", "2": "Não", "9": "Ignorado" },
    ignorado:     ["9"],
    is2x2:        true,
  },
  {
    campo:        "saturacao",
    label:        "Saturação O₂ < 95%",
    categoria:    "Sintomas",
    descricao:    "Saturação de oxigênio < 95% na admissão.",
    codigosOrdem: ["1", "2"],
    codigoLabels: { "1": "Sat < 95%", "2": "Normal" },
    ignorado:     ["9"],
    is2x2:        true,
  },

  // ── Geográfico ────────────────────────────────────────────────────────────────

  {
    campo:        "sg_uf",
    label:        "UF de notificação",
    categoria:    "Geográfico",
    descricao:    "Estado de notificação (27 UFs). Preferencialmente use como filtro, não como variável de análise.",
    codigosOrdem: ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
                   "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"],
    codigoLabels: { "SP": "São Paulo", "RJ": "Rio de Janeiro", "MG": "Minas Gerais",
                    "BA": "Bahia", "PR": "Paraná", "RS": "Rio Grande do Sul" },
    ignorado:     [],
    is2x2:        false,
    aviso:        "27 categorias — use V de Cramér. Melhor como filtro do que como variável de análise.",
  },
];

// ── Lookups ────────────────────────────────────────────────────────────────────

export const CAMPOS_VALIDOS = new Set(CATALOGO.map(v => v.campo));

export function getVarInfo(campo: string): VarEntry | undefined {
  return CATALOGO.find(v => v.campo === campo);
}

// Desfechos válidos para regressão logística
export const OUTCOMES_REGRESSAO = [
  "evolucao_bin",
  "uti",
  "suport_ven_bin",
  "hospital",
] as const;

// Preditores válidos para regressão logística
export const PREDITORES_REGRESSAO = [
  "faixa_etaria", "cs_sexo",
  "diabetes", "obesidade", "cardiopati", "imunodepre", "renal", "asma",
  "pneumopati", "neurologic", "sind_down", "hematologi", "hepatica", "puerpera",
  "vacina_cov", "vacina",
  "dispneia", "saturacao", "febre", "tosse", "desc_resp", "garganta", "fadiga", "diarreia",
] as const;

// Labels dos outcomes para output legível
export const OUTCOME_LABELS: Record<string, { label: string; eventLabel: string; nonEventLabel: string }> = {
  evolucao_bin:   { label: "Óbito por SRAG (vs Cura)",         eventLabel: "Óbito",         nonEventLabel: "Cura"             },
  uti:            { label: "Internação em UTI",                 eventLabel: "UTI",            nonEventLabel: "Sem UTI"          },
  suport_ven_bin: { label: "Ventilação invasiva (vs não inv.)", eventLabel: "Invasivo",       nonEventLabel: "Não invasivo"     },
  hospital:       { label: "Hospitalização",                    eventLabel: "Hospitalizado",  nonEventLabel: "Não hospitalizado"},
};
