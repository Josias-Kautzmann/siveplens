// Catálogo de variáveis disponíveis para análise estatística.
// Importável em client e server — sem imports de server-only.

export interface ValorInfo {
  codigo: string;   // string para unificar char e numeric (ex: "F", "1", "SP")
  label: string;
  isIgnorado?: boolean;
}

export interface VariableInfo {
  campo:           string;      // identificador único no catálogo (pode ser chave virtual)
  sqlColumn?:      string;      // coluna real no banco (quando diferente de campo)
  allowedValues?:  string[];    // restringe query a esses valores (variáveis derivadas binárias)
  label:           string;
  labelCurto:      string;
  categoria:       string;
  // Ordenação dos valores na tabela (define linha/coluna de referência)
  valores:         ValorInfo[];
  // Códigos excluídos quando "Excluir Ignorado" está ativo
  ignoradoCodigos: string[];
  // Para interpretação automática de OR em tabelas 2×2
  // valorCaso = value that represents "exposed/case" (row 0 / col 0)
  // valorRef  = reference value                    (row 1 / col 1)
  valorCaso?:      string;
  valorRef?:       string;
  aviso?:          string;
}

// ─── Catálogo completo ────────────────────────────────────────────────────────

export const VARIABLE_CATALOG: VariableInfo[] = [

  // ── Desfechos ─────────────────────────────────────────────────────────────

  {
    // Versão BINÁRIA — para OR, RR e Fisher. Usada na maioria dos artigos.
    campo:         "evolucao_bin",
    sqlColumn:     "evolucao",
    allowedValues: ["1", "2"],
    label:         "Óbito por SRAG — binário (Cura vs Óbito)",
    labelCurto:    "Óbito (bin.)",
    categoria:     "Desfecho",
    valores: [
      { codigo: "2", label: "Óbito por SRAG" },
      { codigo: "1", label: "Cura" },
    ],
    ignoradoCodigos: [],   // allowedValues já exclui tudo que não é 1 ou 2
    valorCaso: "2",
    valorRef:  "1",
    aviso: "Restrito a Cura (1) e Óbito por SRAG (2). Exclui automaticamente 'Óbito por outras causas' — padrão na literatura.",
  },
  {
    // Versão COMPLETA — 3 categorias, útil para tabelas descritivas
    campo: "evolucao",
    label: "Desfecho clínico — completo (Cura / Óbito / Outras causas)",
    labelCurto: "Desfecho (completo)",
    categoria: "Desfecho",
    valores: [
      { codigo: "1", label: "Cura" },
      { codigo: "2", label: "Óbito por SRAG" },
      { codigo: "3", label: "Óbito outras causas" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    // 3 categorias — OR/RR não se aplicam; use V de Cramér
    aviso: "3 categorias — OR e RR não calculados. Para análise de risco de óbito, use 'Óbito por SRAG — binário'.",
  },
  {
    campo: "uti",
    label: "Internação em UTI",
    labelCurto: "UTI",
    categoria: "Desfecho",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    // Versão BINÁRIA — invasivo vs não invasivo (exclui "nenhum")
    campo:         "suport_ven_bin",
    sqlColumn:     "suport_ven",
    allowedValues: ["1", "2"],
    label:         "Ventilação invasiva — binário (Invasivo vs Não invasivo)",
    labelCurto:    "Ventil. invasiva",
    categoria:     "Desfecho",
    valores: [
      { codigo: "1", label: "Invasivo" },
      { codigo: "2", label: "Não invasivo" },
    ],
    ignoradoCodigos: [],
    valorCaso: "1",
    valorRef:  "2",
    aviso: "Exclui pacientes sem suporte ventilatório (código 3). Compara apenas os que receberam algum tipo de ventilação.",
  },
  {
    // Versão COMPLETA — 3 categorias
    campo: "suport_ven",
    label: "Suporte ventilatório — completo",
    labelCurto: "Ventilação",
    categoria: "Desfecho",
    valores: [
      { codigo: "1", label: "Invasivo" },
      { codigo: "2", label: "Não invasivo" },
      { codigo: "3", label: "Nenhum" },
    ],
    ignoradoCodigos: [],
    // 3 categorias — OR não se aplica, só χ² e V de Cramér
  },
  {
    campo: "classi_fin",
    label: "Classificação etiológica final",
    labelCurto: "Classificação",
    categoria: "Desfecho / Etiológico",
    valores: [
      { codigo: "1", label: "Influenza" },
      { codigo: "2", label: "Outro vírus" },
      { codigo: "3", label: "Outro agente" },
      { codigo: "4", label: "SRAG NE" },
      { codigo: "5", label: "COVID-19" },
    ],
    ignoradoCodigos: [],
    // 5 categorias — OR não se aplica
  },

  // ── Demográfico ───────────────────────────────────────────────────────────

  {
    campo: "cs_sexo",
    label: "Sexo biológico",
    labelCurto: "Sexo",
    categoria: "Demográfico",
    valores: [
      { codigo: "M", label: "Masculino" },
      { codigo: "F", label: "Feminino" },
      { codigo: "I", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["I"],
    valorCaso: "M",
    valorRef:  "F",
  },
  {
    campo: "cs_raca",
    label: "Raça / Cor",
    labelCurto: "Raça/Cor",
    categoria: "Demográfico",
    valores: [
      { codigo: "1", label: "Branca" },
      { codigo: "2", label: "Preta" },
      { codigo: "3", label: "Amarela" },
      { codigo: "4", label: "Parda" },
      { codigo: "5", label: "Indígena" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    // 5 categorias — OR não se aplica
  },
  {
    campo: "cs_escol_n",
    label: "Escolaridade",
    labelCurto: "Escolaridade",
    categoria: "Demográfico",
    valores: [
      { codigo: "0", label: "Nenhuma" },
      { codigo: "1", label: "Fund. I incompleto" },
      { codigo: "2", label: "Fund. I completo" },
      { codigo: "3", label: "Fund. II incompleto" },
      { codigo: "4", label: "Fund. II completo" },
      { codigo: "5", label: "Médio incompleto" },
      { codigo: "6", label: "Médio completo" },
      { codigo: "7", label: "Superior incompleto" },
      { codigo: "8", label: "Superior completo" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    // Ordinal — OR não se aplica; χ² e V de Cramér
  },
  {
    campo: "cs_gestant",
    label: "Gestação",
    labelCurto: "Gestação",
    categoria: "Demográfico",
    valores: [
      { codigo: "1", label: "1º trimestre" },
      { codigo: "2", label: "2º trimestre" },
      { codigo: "3", label: "3º trimestre" },
      { codigo: "4", label: "Idade gestacional ignorada" },
      { codigo: "5", label: "Não se aplica" },
      { codigo: "6", label: "Não informado" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9", "6"],
    aviso: "Variável significativa somente para pacientes do sexo feminino. Considere filtrar por Sexo = Feminino antes de executar esta análise.",
  },

  // ── Vacinação ─────────────────────────────────────────────────────────────

  {
    campo: "vacina_cov",
    label: "Vacina COVID-19",
    labelCurto: "Vacina COVID",
    categoria: "Vacinação",
    valores: [
      { codigo: "1", label: "Vacinado" },
      { codigo: "2", label: "Não vacinado" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "vacina",
    label: "Vacina Influenza (temporada vigente)",
    labelCurto: "Vacina Influenza",
    categoria: "Vacinação",
    valores: [
      { codigo: "1", label: "Vacinado" },
      { codigo: "2", label: "Não vacinado" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },

  // ── Comorbidades ──────────────────────────────────────────────────────────

  {
    campo: "diabetes",
    label: "Diabetes mellitus",
    labelCurto: "Diabetes",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "obesidade",
    label: "Obesidade (IMC ≥ 30)",
    labelCurto: "Obesidade",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "cardiopati",
    label: "Cardiopatia crônica",
    labelCurto: "Cardiopatia",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "imunodepre",
    label: "Imunodepressão / Imunossupressão",
    labelCurto: "Imunodepressão",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "renal",
    label: "Doença renal crônica",
    labelCurto: "Doença Renal",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "asma",
    label: "Asma",
    labelCurto: "Asma",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "pneumopati",
    label: "Pneumopatia crônica (exceto asma)",
    labelCurto: "Pneumopatia",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "neurologic",
    label: "Doença neurológica crônica",
    labelCurto: "Neurológica",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "sind_down",
    label: "Síndrome de Down",
    labelCurto: "S. Down",
    categoria: "Comorbidades",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },

  // ── Sintomas ──────────────────────────────────────────────────────────────

  {
    campo: "febre",
    label: "Febre",
    labelCurto: "Febre",
    categoria: "Sintomas",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "tosse",
    label: "Tosse",
    labelCurto: "Tosse",
    categoria: "Sintomas",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "dispneia",
    label: "Dispneia (falta de ar)",
    labelCurto: "Dispneia",
    categoria: "Sintomas",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },
  {
    campo: "saturacao",
    label: "Saturação O₂ < 95%",
    labelCurto: "Saturação",
    categoria: "Sintomas",
    valores: [
      { codigo: "1", label: "Sim" },
      { codigo: "2", label: "Não" },
      { codigo: "9", label: "Ignorado", isIgnorado: true },
    ],
    ignoradoCodigos: ["9"],
    valorCaso: "1",
    valorRef:  "2",
  },

  // ── Geográfico ────────────────────────────────────────────────────────────

  {
    campo: "sg_uf",
    label: "UF de notificação",
    labelCurto: "UF",
    categoria: "Geográfico",
    valores: [
      "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
      "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
    ].map((uf) => ({ codigo: uf, label: uf })),
    ignoradoCodigos: [],
    aviso: "27 categorias — gera tabela grande. V de Cramér é a métrica de efeito mais adequada.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export const CAMPOS_PERMITIDOS = new Set(VARIABLE_CATALOG.map((v) => v.campo));

export function getVariableInfo(campo: string): VariableInfo | undefined {
  return VARIABLE_CATALOG.find((v) => v.campo === campo);
}

export const CATEGORIAS_DESFECHO = ["Desfecho", "Desfecho / Etiológico"] as const;

export const VARIAVEIS_DESFECHO = VARIABLE_CATALOG.filter((v) =>
  CATEGORIAS_DESFECHO.some((c) => v.categoria.startsWith(c))
);

export const VARIAVEIS_EXPOSICAO = VARIABLE_CATALOG;

/** Retorna o label de um código, ou o próprio código se não encontrado */
export function getValueLabel(info: VariableInfo, codigo: string): string {
  return info.valores.find((v) => v.codigo === codigo)?.label ?? codigo;
}
