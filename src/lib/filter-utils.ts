import { isValidationCohortId, type ValidationCohortId } from "@/lib/scientific-validation";

export interface FiltrosSRAG {
  ano_epi?: number;      // ano único — mantido por compat com analise pages
  anos_epi?: number[];   // multi-ano — usado pelo FilterBar principal (?anos=2024,2025)
  semana_epi?: number;   // semana epidemiológica 1–53 (?semana=17)
  sg_uf?: string[];      // e.g. ["SP", "RJ"] — multi-seleção de estados
  co_mun_res?: string[]; // e.g. ["355030", "330455"] — IBGE 6 dígitos
  cs_sexo?: string;      // "M", "F", "I"
  faixa_etaria?: string; // e.g. "0-4", "5-11", "12-17", "18-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"
  idade_min?: number;    // idade mínima em anos (0–130)
  idade_max?: number;    // idade máxima em anos (0–130)
  classi_fin?: number[]; // [1, 2, 3, 4, 5]
  evolucao?: number[];   // [1, 2, 3, 9]
  etiologia?: string[];  // ["flu_a","flu_b","sars2","vsr","rino","metap"] — PCR confirmado
  data_ini?: string;     // data inicial DD-MM (ex: "15-04")
  data_fim?: string;     // data final   DD-MM (ex: "30-06")
  criterios?: CriterioCodificado[]; // filtros adicionais seguros (ex: diabetes=1)
  coorte_validacao?: ValidationCohortId; // coorte publicada e allowlisted
}

/**
 * Campos categóricos que podem ser usados como filtros adicionais nas análises.
 * A lista fechada impede que nomes de coluna recebidos via API virem SQL arbitrário.
 */
export const CAMPOS_CRITERIO = [
  "diabetes", "obesidade", "cardiopati", "imunodepre", "renal", "asma",
  "neurologic", "pneumopati", "hematologi", "sind_down", "hepatica", "puerpera",
  "febre", "tosse", "dispneia", "desc_resp", "saturacao", "garganta",
  "diarreia", "vomito", "fadiga", "perd_olft", "perd_pala", "dor_abd",
  "hospital", "uti", "vacina", "vacina_cov", "pcr_resul", "pcr_sars2",
] as const;

export type CampoCriterio = typeof CAMPOS_CRITERIO[number];

export interface CriterioCodificado {
  campo: CampoCriterio;
  valores: number[];
}

// Patógenos laboratorialmente confirmados (PCR) — usados em FilterBar e MapContainer
export const PATOGENOS = [
  { id: "flu_a",  label: "Influenza A",     cor: "#2563EB" },
  { id: "flu_b",  label: "Influenza B",     cor: "#93C5FD" },
  { id: "sars2",  label: "SARS-CoV-2",      cor: "#EF4444" },
  { id: "vsr",    label: "VSR",             cor: "#F59E0B" },
  { id: "rino",   label: "Rinovírus",       cor: "#A855F7" },
  { id: "metap",  label: "Metapneumovírus", cor: "#22C55E" },
] as const;

export type PatogenoId = typeof PATOGENOS[number]["id"];

export const FAIXAS_ETARIAS = [
  { id: "0-4", label: "0 a 4 anos" },
  { id: "5-11", label: "5 a 11 anos" },
  { id: "12-17", label: "12 a 17 anos" },
  { id: "18-29", label: "18 a 29 anos" },
  { id: "30-39", label: "30 a 39 anos" },
  { id: "40-49", label: "40 a 49 anos" },
  { id: "50-59", label: "50 a 59 anos" },
  { id: "60-69", label: "60 a 69 anos" },
  { id: "70-79", label: "70 a 79 anos" },
  { id: "80+", label: "80 anos ou mais" },
];

export const CLASSIFICACOES = [
  { id: 1, label: "Influenza" },
  { id: 2, label: "Outro Vírus" },
  { id: 3, label: "Outro Agente" },
  { id: 4, label: "SRAG NE" },
  { id: 5, label: "COVID-19" },
];

export const EVOLUCOES = [
  { id: 1, label: "Cura" },
  { id: 2, label: "Óbito por SRAG" },
  { id: 3, label: "Óbito Outras Causas" },
  { id: 9, label: "Ignorado" },
];

export function parseCriteriaParam(value: string | undefined): CriterioCodificado[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<string>(CAMPOS_CRITERIO);
  const criteria = value.split(";").flatMap((token) => {
    const [field, rawValues] = token.split(":", 2);
    if (!allowed.has(field) || !rawValues) return [];
    const values = rawValues.split("|").map(Number).filter(Number.isInteger);
    if (values.length === 0) return [];
    return [{ campo: field as CampoCriterio, valores: [...new Set(values)] }];
  });
  return criteria.length ? criteria : undefined;
}

export function serializeCriteriaParam(criteria: CriterioCodificado[] | undefined): string | null {
  if (!criteria?.length) return null;
  return [...criteria]
    .sort((a, b) => a.campo.localeCompare(b.campo))
    .map((criterion) => `${criterion.campo}:${[...new Set(criterion.valores)].sort((a, b) => a - b).join("|")}`)
    .join(";");
}

/** Parses searchParams into a typed object */
export function parseFilters(searchParams: { [key: string]: string | undefined }): FiltrosSRAG {
  const parsed: FiltrosSRAG = {};

  if (searchParams.anos) {
    parsed.anos_epi = searchParams.anos.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
  } else if (searchParams.ano) {
    parsed.ano_epi = Number(searchParams.ano);
  }
  if (searchParams.semana) {
    const semana = Number(searchParams.semana);
    if (Number.isInteger(semana) && semana >= 1 && semana <= 53) parsed.semana_epi = semana;
  }
  if (searchParams.uf) parsed.sg_uf = searchParams.uf.split(",").filter(Boolean);
  if (searchParams.mun) parsed.co_mun_res = searchParams.mun.split(",").filter(Boolean);

  if (searchParams.sexo) parsed.cs_sexo = searchParams.sexo;
  if (searchParams.faixa) parsed.faixa_etaria = searchParams.faixa;

  if (searchParams.classi) {
    parsed.classi_fin = searchParams.classi.split(',').map(Number);
  }

  if (searchParams.evolucao) {
    parsed.evolucao = searchParams.evolucao.split(',').map(Number);
  }

  if (searchParams.etio) {
    parsed.etiologia = searchParams.etio.split(',').filter(Boolean);
  }

  if (searchParams.data_ini) parsed.data_ini = searchParams.data_ini;
  if (searchParams.data_fim) parsed.data_fim = searchParams.data_fim;
  parsed.criterios = parseCriteriaParam(searchParams.criterios);
  if (searchParams.coorte && isValidationCohortId(searchParams.coorte)) {
    parsed.coorte_validacao = searchParams.coorte;
  }

  return parsed;
}

/** Converts a faixa etaria string to min/max age range */
export function faixaEtariaToRange(faixa: string): { min: number; max: number } | null {
  if (faixa === "80+") return { min: 80, max: 999 };
  const parts = faixa.split('-');
  if (parts.length === 2) {
    return { min: Number(parts[0]), max: Number(parts[1]) };
  }
  return null;
}

/** Counts active filters (includes location) */
export function countActiveFilters(filtros: FiltrosSRAG): number {
  let count = 0;
  if (filtros.sg_uf && filtros.sg_uf.length > 0) count++;
  if (filtros.semana_epi) count++;
  if (filtros.co_mun_res && filtros.co_mun_res.length > 0) count++;
  if (filtros.cs_sexo) count++;
  if (filtros.faixa_etaria) count++;
  if (filtros.classi_fin && filtros.classi_fin.length > 0) count++;
  if (filtros.evolucao && filtros.evolucao.length > 0) count++;
  if (filtros.etiologia && filtros.etiologia.length > 0) count++;
  if (filtros.data_ini || filtros.data_fim) count++;
  if (filtros.criterios?.length) count++;
  if (filtros.coorte_validacao) count++;
  return count;
}
