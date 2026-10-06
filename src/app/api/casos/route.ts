import { NextResponse } from "next/server";
import { getSerieTemporalUF, getCasosByMunicipio } from "@/dal/casos.repo";

/**
 * GET /api/casos
 *
 * Parâmetros:
 *   uf      (obrigatório) — sigla do estado, ex: RS
 *   ano     (opcional)   — ano epidemiológico, ex: 2025
 *   semana  (opcional)   — semana epidemiológica, ex: 12
 *   view    (opcional)   — "serie" (padrão) | "municipios"
 *
 * Exemplos:
 *   /api/casos?uf=RS
 *   /api/casos?uf=RS&ano=2025
 *   /api/casos?uf=RS&ano=2025&semana=12&view=municipios
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf     = searchParams.get("uf");
  const ano    = searchParams.get("ano");
  const semana = searchParams.get("semana");
  const view   = searchParams.get("view") ?? "serie";

  if (!uf) {
    return NextResponse.json({ error: "Parâmetro 'uf' é obrigatório" }, { status: 400 });
  }

  try {
    if (view === "municipios") {
      if (!ano) {
        return NextResponse.json({ error: "Parâmetro 'ano' é obrigatório para view=municipios" }, { status: 400 });
      }
      const data = await getCasosByMunicipio(uf, +ano, semana ? +semana : undefined);
      return NextResponse.json({ data });
    }

    // view === "serie" (padrão)
    const data = await getSerieTemporalUF(uf, ano ? +ano : undefined);
    return NextResponse.json({ data });

  } catch (err) {
    console.error("[/api/casos]", err);
    return NextResponse.json({ error: "Erro interno ao consultar dados" }, { status: 500 });
  }
}
