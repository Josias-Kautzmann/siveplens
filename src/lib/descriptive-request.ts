import {
  CAMPOS_CRITERIO,
  FAIXAS_ETARIAS,
  type CriterioCodificado,
  type FiltrosSRAG,
} from "@/lib/filter-utils";
import {
  CATEGORICAL_VARIABLES,
  DESCRIPTIVE_VARIABLES,
  type CategoricalVariable,
  type DescriptiveVariable,
} from "@/lib/descriptive-catalog";
import { isValidationCohortId } from "@/lib/scientific-validation";

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

function objectOrEmpty(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("filtros deve ser um objeto");
  }
  return value as Record<string, unknown>;
}

function optionalInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${name} deve ser inteiro entre ${min} e ${max}`);
  }
  return Number(value);
}

function integerArray(value: unknown, name: string, allowed?: ReadonlySet<number>): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || !value.every(Number.isInteger)) {
    throw new Error(`${name} deve ser um array não vazio de inteiros`);
  }
  const result = [...new Set(value.map(Number))];
  if (allowed && result.some((item) => !allowed.has(item))) {
    throw new Error(`${name} contém código não permitido`);
  }
  return result;
}

function optionalDatePart(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} deve usar o formato DD-MM`);
  }
  const [day, month] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`${name} contém dia ou mês inválido`);
  }
  return value;
}

function parseCriteria(value: unknown): CriterioCodificado[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("criterios deve ser um array");
  const allowedFields = new Set<string>(CAMPOS_CRITERIO);
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`criterios[${index}] deve ser um objeto`);
    }
    const criterion = raw as Record<string, unknown>;
    if (typeof criterion.campo !== "string" || !allowedFields.has(criterion.campo)) {
      throw new Error(`criterios[${index}].campo não é permitido`);
    }
    const values = integerArray(criterion.valores, `criterios[${index}].valores`);
    return {
      campo: criterion.campo as CriterioCodificado["campo"],
      valores: values!,
    };
  });
}

export function parseDescriptiveFilters(value: unknown): FiltrosSRAG {
  const raw = objectOrEmpty(value);
  const filters: FiltrosSRAG = {};

  filters.ano_epi = optionalInteger(raw.ano_epi, "ano_epi", 2009, 2100);
  filters.semana_epi = optionalInteger(raw.semana_epi, "semana_epi", 1, 53);
  filters.anos_epi = integerArray(raw.anos_epi, "anos_epi")?.map((year) => {
    if (year < 2009 || year > 2100) throw new Error("anos_epi contém ano fora do intervalo 2009–2100");
    return year;
  });
  if (filters.ano_epi !== undefined && filters.anos_epi?.length) {
    throw new Error("use ano_epi ou anos_epi, não ambos");
  }
  filters.idade_min = optionalInteger(raw.idade_min, "idade_min", 0, 130);
  filters.idade_max = optionalInteger(raw.idade_max, "idade_max", 0, 130);
  if (
    filters.idade_min !== undefined &&
    filters.idade_max !== undefined &&
    filters.idade_min > filters.idade_max
  ) {
    throw new Error("idade_min não pode ser maior que idade_max");
  }

  if (raw.sg_uf !== undefined) {
    if (!Array.isArray(raw.sg_uf) || raw.sg_uf.length === 0) {
      throw new Error("sg_uf deve ser um array não vazio");
    }
    const ufs = [...new Set(raw.sg_uf.map((item) => String(item).toUpperCase()))];
    if (ufs.some((uf) => !UFS.has(uf))) throw new Error("sg_uf contém uma UF inválida");
    filters.sg_uf = ufs;
  }

  if (raw.co_mun_res !== undefined) {
    if (!Array.isArray(raw.co_mun_res) || raw.co_mun_res.length === 0) {
      throw new Error("co_mun_res deve ser um array não vazio");
    }
    const municipalities = [...new Set(raw.co_mun_res.map(String))];
    if (municipalities.some((code) => !/^\d{6}$/.test(code))) {
      throw new Error("co_mun_res contém código IBGE inválido");
    }
    filters.co_mun_res = municipalities;
  }

  if (raw.cs_sexo !== undefined) {
    if (raw.cs_sexo !== "M" && raw.cs_sexo !== "F" && raw.cs_sexo !== "I") {
      throw new Error("cs_sexo deve ser M, F ou I");
    }
    filters.cs_sexo = raw.cs_sexo;
  }

  filters.classi_fin = integerArray(raw.classi_fin, "classi_fin", new Set([1, 2, 3, 4, 5]));
  filters.evolucao = integerArray(raw.evolucao, "evolucao", new Set([1, 2, 3, 9]));
  filters.criterios = parseCriteria(raw.criterios);
  if (raw.coorte_validacao !== undefined) {
    if (typeof raw.coorte_validacao !== "string" || !isValidationCohortId(raw.coorte_validacao)) {
      throw new Error("coorte_validacao não é permitida");
    }
    filters.coorte_validacao = raw.coorte_validacao;
  }

  if (raw.faixa_etaria !== undefined) {
    const allowed = new Set(FAIXAS_ETARIAS.map((range) => range.id));
    if (typeof raw.faixa_etaria !== "string" || !allowed.has(raw.faixa_etaria)) {
      throw new Error("faixa_etaria não é permitida");
    }
    filters.faixa_etaria = raw.faixa_etaria;
  }

  filters.data_ini = optionalDatePart(raw.data_ini, "data_ini");
  filters.data_fim = optionalDatePart(raw.data_fim, "data_fim");

  if (raw.etiologia !== undefined) {
    const allowed = new Set(["flu_a", "flu_b", "sars2", "vsr", "rino", "metap"]);
    if (!Array.isArray(raw.etiologia) || raw.etiologia.length === 0) {
      throw new Error("etiologia deve ser um array não vazio");
    }
    const etiologies = [...new Set(raw.etiologia.map(String))];
    if (etiologies.some((item) => !allowed.has(item))) {
      throw new Error("etiologia contém um agente não permitido");
    }
    filters.etiologia = etiologies;
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([, child]) => child !== undefined),
  ) as FiltrosSRAG;
}

export function parseDescriptiveVariable(value: unknown): DescriptiveVariable {
  if (typeof value !== "string" || !(value in DESCRIPTIVE_VARIABLES)) {
    throw new Error(`variavel deve ser uma de: ${Object.keys(DESCRIPTIVE_VARIABLES).join(", ")}`);
  }
  return value as DescriptiveVariable;
}

export function parseCategoricalVariable(value: unknown): CategoricalVariable {
  if (typeof value !== "string" || !(value in CATEGORICAL_VARIABLES)) {
    throw new Error(`variavel deve ser uma de: ${Object.keys(CATEGORICAL_VARIABLES).join(", ")}`);
  }
  return value as CategoricalVariable;
}
