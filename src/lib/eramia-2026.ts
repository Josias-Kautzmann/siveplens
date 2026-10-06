export const ERAMIA_ARTIFACT_VERSION = "eramia-rs-2026/article-companion/1.2.0";
export const ERAMIA_ARTICLE_ROUTE = "/artigo/eramia-2026";
export const REZENDE_ENGINE_VALIDATION_ROUTE = "/artifacts/eramia-2026/rezende-web-engine-validation.json";

export type ArticleMetricId =
  | "influenza-pcr"
  | "influenza-fatality"
  | "infant-total"
  | "pediatric-regression"
  | "vaccination-icu-or"
  | "vaccination-regression";

export interface ArticleMetricDefinition {
  id: ArticleMetricId;
  tableOrder: number;
  study: "Sardinha et al. (2026)" | "Soares et al. (2025)" | "Rezende et al. (2026)";
  studyUrl: string;
  layer: "Exploração descritiva" | "Análise bivariada" | "Regressão logística";
  label: string;
  publishedDisplay: string;
  frozenDisplay: string;
  frozenRaw: number | number[];
  frozenSource: "siveplens-snapshot-2026-08-27" | "authors-xlsx-2025-03-29";
  frozenInterpretation: string;
  formula: string;
  numerator?: string;
  denominator?: string;
  fields: string[];
  filters: string[];
  analysisHref?: string;
  analysisLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  validationHref?: string;
  validationLabel?: string;
  limitation?: string;
}

export const ERAMIA_FROZEN_PROVENANCE = {
  frozenAt: "2026-08-27T16:46:07.799Z",
  articleDraft: "SivepLens: uma Plataforma Web Auditável para Análise Interpretável de Dados do SIVEP-Gripe",
  sivepLensSnapshot: {
    analysisId: "9d5081def43b55ea",
    year: 2024,
    records: 265288,
    uniqueNotifications: 265288,
    minNotificationDate: "2024-01-01",
    maxNotificationDate: "2024-12-31",
    validationArtifactSha256: "5e5fa509181cbb1dea01cf578f0d7be60b188e5236f4ec5702afbfd771d8767f",
    protocol: "published-benchmarks/2.0.0",
  },
  authorsVaccinationSnapshot: {
    fileName: "SRAG 2024_DOWNLOAD 29_3_25 IMUNODEPRE_RT_PCR OU ANTIGENO POSITIVO.xlsx",
    accessedByAuthorsAt: "2025-03-29",
    sha256: "721c8c40212b9f11c1b211f2fde89de73f896765f65ed16a44bfec8e6366bf6d",
    cohort: 474,
    deaths: 171,
    survivors: 303,
    note: "O arquivo público não contém NU_NOTIFIC; por isso não permite pareamento individual com o snapshot corrente.",
  },
  engineValidation: {
    artifactUrl: REZENDE_ENGINE_VALIDATION_ROUTE,
    reference: "R glm(family=binomial)",
    engine: "SivepLens fitLogistic",
    cohort: 474,
    events: 171,
    coefficientsMatched: 12,
    standardErrorsMatched: 12,
    tolerance: 0.000005,
    maxBetaDifference: 4.986298821618718e-7,
    maxStandardErrorDifference: 3.680679795947661e-7,
    converged: true,
    iterations: 6,
  },
} as const;

export const ERAMIA_ARTICLE_METRICS: ArticleMetricDefinition[] = [
  {
    id: "influenza-pcr",
    tableOrder: 1,
    study: "Sardinha et al. (2026)",
    studyUrl: "https://doi.org/10.1007/s12026-026-09792-0",
    layer: "Exploração descritiva",
    label: "Influenza confirmada por RT-PCR",
    publishedDisplay: "17.145",
    frozenDisplay: "17.111",
    frozenRaw: 17111,
    frozenSource: "siveplens-snapshot-2026-08-27",
    frozenInterpretation: "Diferença relativa de -0,20%; reprodução muito próxima no artefato do SivepLens de 27/08/2026.",
    formula: "COUNT(*) após aplicar confirmação laboratorial de influenza por RT-PCR em notificações de 2024.",
    numerator: "Registros com PCR_RESUL=1 e POS_PCRFLU=1.",
    denominator: "Todas as notificações de SRAG de 2024 carregadas no snapshot.",
    fields: ["ANO_EPI", "PCR_RESUL", "POS_PCRFLU"],
    filters: ["ANO_EPI = 2024", "PCR_RESUL = 1", "POS_PCRFLU = 1"],
    analysisHref: "/analise/descritiva?anos=2024&modo=numerica&variavel=idade_anos&coorte=influenza-pcr",
    analysisLabel: "Abrir coorte no SivepLens",
  },
  {
    id: "influenza-fatality",
    tableOrder: 2,
    study: "Sardinha et al. (2026)",
    studyUrl: "https://doi.org/10.1007/s12026-026-09792-0",
    layer: "Exploração descritiva",
    label: "Letalidade hospitalar por influenza",
    publishedDisplay: "12,10%",
    frozenDisplay: "12,11%",
    frozenRaw: 12.114619592242665,
    frozenSource: "siveplens-snapshot-2026-08-27",
    frozenInterpretation: "Diferença de +0,01 ponto percentual no snapshot congelado.",
    formula: "100 × óbitos por SRAG / casos de influenza confirmados com evolução conhecida.",
    numerator: "1.949 registros com EVOLUCAO=2 no snapshot congelado.",
    denominator: "16.088 registros com EVOLUCAO em {1,2} no snapshot congelado.",
    fields: ["ANO_EPI", "PCR_RESUL", "POS_PCRFLU", "EVOLUCAO"],
    filters: ["ANO_EPI = 2024", "PCR_RESUL = 1", "POS_PCRFLU = 1", "EVOLUCAO em {1,2}"],
    analysisHref: "/analise/descritiva?anos=2024&modo=categorica&variavel=evolucao&coorte=influenza-known-outcome",
    analysisLabel: "Abrir distribuição do desfecho",
  },
  {
    id: "infant-total",
    tableOrder: 3,
    study: "Soares et al. (2025)",
    studyUrl: "https://doi.org/10.3390/tropicalmed10060168",
    layer: "Exploração descritiva",
    label: "Notificações em menores de um ano",
    publishedDisplay: "66.170",
    frozenDisplay: "66.545",
    frozenRaw: 66545,
    frozenSource: "siveplens-snapshot-2026-08-27",
    frozenInterpretation: "Diferença relativa de +0,57%; resultado sensível à versão temporal da base e à definição da coorte.",
    formula: "COUNT(*) das notificações cuja idade foi registrada em dias ou meses.",
    denominator: "Todas as notificações de SRAG de 2024 carregadas no snapshot.",
    fields: ["ANO_EPI", "TP_IDADE", "NU_IDADE_N"],
    filters: ["ANO_EPI = 2024", "TP_IDADE em {1,2}"],
    analysisHref: "/analise/descritiva?anos=2024&modo=numerica&variavel=idade_anos&coorte=infant-under-one",
    analysisLabel: "Abrir coorte no SivepLens",
  },
  {
    id: "pediatric-regression",
    tableOrder: 4,
    study: "Soares et al. (2025)",
    studyUrl: "https://doi.org/10.3390/tropicalmed10060168",
    layer: "Regressão logística",
    label: "Coeficientes com IC 95% sobreposto",
    publishedDisplay: "11/11",
    frozenDisplay: "11/11",
    frozenRaw: 11,
    frozenSource: "siveplens-snapshot-2026-08-27",
    frozenInterpretation: "Os intervalos dos 11 odds ratios ajustados se sobrepõem aos intervalos publicados.",
    formula: "Regressão logística binomial de óbito versus cura; compatibilidade = interseção não vazia entre os ICs de 95%.",
    numerator: "11 coeficientes com intervalos sobrepostos.",
    denominator: "11 preditores publicados e reproduzidos.",
    fields: ["EVOLUCAO", "PCR_PARA4", "RENAL", "IMUNODEPRE", "SIND_DOWN", "CARDIOPATI", "NEUROLOGIC", "SATURACAO", "PCR_SARS2", "DESC_RESP", "PCR_VSR", "TOSSE"],
    filters: ["ANO_EPI = 2024", "TP_IDADE em {1,2}", "PCR_RESUL = 1", "ao menos um vírus positivo", "EVOLUCAO em {1,2}"],
    analysisHref: "/analise/regressao?anos=2024&coorte=infant-virus-positive-known-outcome&out=evolucao_bin&missing=absence&preds=pcr_para4%2Crenal%2Cimunodepre%2Csind_down%2Ccardiopati%2Cneurologic%2Csaturacao%2Cpcr_sars2%2Cdesc_resp%2Cpcr_vsr%2Ctosse",
    analysisLabel: "Abrir regressão no SivepLens",
    secondaryHref: "/docs/validacao#inferencial",
    secondaryLabel: "Ver todos os coeficientes",
    limitation: "Sobreposição de intervalos é uma verificação de compatibilidade, não um teste formal de equivalência.",
  },
  {
    id: "vaccination-icu-or",
    tableOrder: 5,
    study: "Rezende et al. (2026)",
    studyUrl: "https://doi.org/10.1590/1980-549720260041",
    layer: "Análise bivariada",
    label: "Admissão em UTI × óbito hospitalar (OR bruto)",
    publishedDisplay: "2,60",
    frozenDisplay: "2,71",
    frozenRaw: 2.71,
    frozenSource: "siveplens-snapshot-2026-08-27",
    frozenInterpretation: "Diferença de +4,23%, com sobreposição dos intervalos de confiança de 95%.",
    formula: "OR = (óbitos com UTI × sobreviventes sem UTI) / (sobreviventes com UTI × óbitos sem UTI).",
    numerator: "Produto cruzado da tabela 2×2 após a recodificação publicada.",
    denominator: "Coorte vacinal elegível com evolução conhecida.",
    fields: ["UTI", "EVOLUCAO"],
    filters: ["Coorte vacinal de Rezende et al.", "UTI=1 como sim", "UTI=2, 9 ou ausente como não", "EVOLUCAO em {1,2}"],
    analysisHref: "/analise/associacao?anos=2024&coorte=vaccination-eligible&vx=uti&vy=evolucao_bin",
    analysisLabel: "Abrir associação no SivepLens",
    secondaryHref: "/docs/validacao#inferencial",
    secondaryLabel: "Ver tabela 2×2",
  },
  {
    id: "vaccination-regression",
    tableOrder: 6,
    study: "Rezende et al. (2026)",
    studyUrl: "https://doi.org/10.1590/1980-549720260041",
    layer: "Regressão logística",
    label: "OR ajustado por número de doses",
    publishedDisplay: "0,67; 0,67; 0,54; 0,56",
    frozenDisplay: "0,665; 0,669; 0,545; 0,556",
    frozenRaw: [0.665044, 0.668953, 0.544951, 0.556129],
    frozenSource: "authors-xlsx-2025-03-29",
    frozenInterpretation: "Teste controlado do motor SivepLens no XLSX original: os 12 coeficientes e erros-padrão coincidem com o glm() dos autores na precisão publicada.",
    formula: "Regressão logística binomial ajustada por idade, sexo, escolaridade, UTI, ventilação invasiva e categorias de doses.",
    numerator: "Óbitos hospitalares na coorte elegível.",
    denominator: "474 registros no arquivo original dos autores; grupo de referência com 56 não vacinados.",
    fields: ["NU_IDADE_N", "CS_SEXO", "CS_ESCOL_N", "UTI", "SUPORT_VEN", "DOSE_1_COV", "DOSE_2_COV", "DOSE_ADIC", "DOSE_REF", "DOSE_2REF", "DOS_RE_BI", "EVOLUCAO"],
    filters: ["Idade ≥ 60", "IMUNODEPRE = 1", "HOSPITAL = 1", "NOSOCOMIAL = 2", "CLASSI_FIN = 5", "PCR_SARS2 = 1 ou AN_SARS2 = 1", "EVOLUCAO em {1,2}"],
    secondaryHref: "/docs/validacao#multivariada-vacinacao",
    secondaryLabel: "Ver modelo atual completo",
    validationHref: REZENDE_ENGINE_VALIDATION_ROUTE,
    validationLabel: "Abrir validação controlada do motor",
    limitation: "O XLSX original não está carregado no banco de produção. O teste controlado executa o mesmo núcleo fitLogistic usado pela aplicação e apresenta separadamente o cálculo sobre a carga atual.",
  },
];
