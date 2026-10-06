/**
 * Serviço de Agregação Epidemiológica
 *
 * Transforma dados do DAL em estruturas prontas para consumo
 * pelos componentes do dashboard (KPIs, séries temporais, mapa choropleth).
 */

import { getSerieTemporalUF, getCasosByMunicipio } from "@/dal/casos.repo";

export interface KPIs {
  totalCasos: number;
  totalObitos: number;
  letalidade: number;      // % obitos/casos
  tendencia: "alta" | "estavel" | "queda";
}

export interface SerieTemporalFormatada {
  labels: string[];        // "SE 1/2025", "SE 2/2025", ...
  casos: number[];
  obitos: number[];
}

/** Calcula KPIs resumidos de uma UF para um ano epidemiológico */
export async function calcularKPIs(uf: string, anoEpi: number): Promise<KPIs> {
  const serie = await getSerieTemporalUF(uf, anoEpi);

  const totalCasos  = serie.reduce((s, r) => s + (r.total_casos  ?? 0), 0);
  const totalObitos = serie.reduce((s, r) => s + (r.total_obitos ?? 0), 0);
  const letalidade  = totalCasos > 0 ? (totalObitos / totalCasos) * 100 : 0;

  let tendencia: KPIs["tendencia"] = "estavel";
  if (serie.length >= 2) {
    const penultima = serie[serie.length - 2].total_casos ?? 0;
    const ultima    = serie[serie.length - 1].total_casos ?? 0;
    const delta = ((ultima - penultima) / Math.max(penultima, 1)) * 100;
    if      (delta >  10) tendencia = "alta";
    else if (delta < -10) tendencia = "queda";
  }

  return { totalCasos, totalObitos, letalidade, tendencia };
}

/** Série temporal formatada para gráficos */
export async function getSerieFormatada(uf: string, anoEpi?: number): Promise<SerieTemporalFormatada> {
  const serie = await getSerieTemporalUF(uf, anoEpi);

  return {
    labels: serie.map((r) => `SE ${r.sem_not}/${r.ano_epi}`),
    casos:  serie.map((r) => r.total_casos  ?? 0),
    obitos: serie.map((r) => r.total_obitos ?? 0),
  };
}

/** Mapa co_ibge → totais para o choropleth */
export async function getMapaChoropleth(uf: string, anoEpi: number, semNot?: number) {
  const dados = await getCasosByMunicipio(uf, anoEpi, semNot);
  const mapa: Record<string, { total: number; obitos: number }> = {};

  for (const row of dados) {
    if (!row.co_mun_res) continue;
    mapa[row.co_mun_res] = {
      total:  row.total_casos  ?? 0,
      obitos: row.total_obitos ?? 0,
    };
  }

  return mapa;
}
