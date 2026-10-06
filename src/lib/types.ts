// ─── Tipos compartilhados do domínio ────────────────────────────────────────

/** Lookup estático gerado a partir do CSV: co_ibge (6 dígitos) → nome do município */
export type MunNames = Record<string, string>;

/** Lookup estático gerado a partir do CSV: sg_uf → nome do estado */
export type UfNames = Record<string, string>;

export interface SelectedState {
  name: string;
  sigla: string;
  center: [number, number];
  scale: number;
}

export interface CasoSRAG {
  codigoIbge: string;
  municipio?: string;
  semanaEpi: number;
  anoEpi: number;
  casosTotais: number;
  obitos: number;
}

export interface AlertaAnomalia {
  id: number;
  uf: string;
  semanaEpi: number;
  tipo: "anomalia" | "surto" | "tendencia";
  severidade: number;
  explicacao: string | null;
}
