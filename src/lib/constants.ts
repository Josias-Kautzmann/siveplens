// ─── Sigla → código IBGE ─────────────────────────────────────────────────────
export const SIGLA_TO_IBGE: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MT: "51", MS: "50",
  MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
  RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17",
};

// ─── IBGE (2 dígitos) → Sigla ─────────────────────────────────────────────
export const IBGE_TO_SIGLA: Record<string, string> = Object.fromEntries(
  Object.entries(SIGLA_TO_IBGE).map(([sigla, ibge]) => [ibge, sigla]),
);

// ─── GeoJSON sources ────────────────────────────────────────────────────────
export const BRAZIL_STATES_URL =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

export const MUN_TOPO_URL = (ibgeCode: string) => `/geo/mun-${ibgeCode}.topo.json`;

// ─── Cores do mapa ──────────────────────────────────────────────────────────
export const MAP_COLORS = {
  STATE_DEFAULT:   "#e8f5f1",
  STATE_HOVER:     "#2a6b55",
  STATE_PRESSED:   "#1a3a30",
  MUN_DEFAULT:     "#c5ddd6",
  MUN_HOVER:       "#2a6b55",
  MUN_PRESSED:     "#1a3a30",
  STROKE:          "#94a3b8",
  STATE_BG:        "#f0faf6",
  STATE_BORDER:    "#c5ddd6",
} as const;

// ─── População por UF (Censo IBGE 2022) ────────────────────────────────────
export const UF_POPULACAO: Record<string, number> = {
  AC:   906_876,   AL: 3_127_683,  AP:   845_731,  AM: 4_269_995,
  BA: 14_873_064,  CE: 9_187_103,  DF: 2_817_068,  ES: 4_108_508,
  GO:  7_206_589,  MA: 6_775_152,  MT: 3_784_239,  MS: 2_833_742,
  MG: 20_732_660,  PA: 8_777_124,  PB: 4_059_905,  PR: 11_597_484,
  PE:  9_674_793,  PI: 3_289_290,  RJ: 16_054_524,  RN: 3_302_406,
  RS: 11_466_630,  RO: 1_815_278,  RR:   695_158,  SC:  7_762_154,
  SP: 44_420_459,  SE: 2_338_474,  TO: 1_607_363,
};
