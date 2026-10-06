import { NextResponse } from "next/server";
import { getPanoramaGeral } from "@/dal/casos.repo";

/**
 * GET /api/panorama
 *
 * Parâmetros opcionais:
 *   uf   — sigla do estado (ex: SP). Se omitido, retorna totais nacionais.
 *   ano  — ano epidemiológico (ex: 2025). Se omitido, usa o ano mais recente.
 *
 * Resposta:
 *   { kpis, serie, meta }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf  = searchParams.get("uf")  ?? undefined;
  const ano = searchParams.get("ano") ? Number(searchParams.get("ano")) : undefined;

  try {
    const data = await getPanoramaGeral({ ano_epi: ano, sg_uf: uf ? [uf] : undefined });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[/api/panorama]", err);
    return NextResponse.json({ error: "Erro ao buscar panorama" }, { status: 500 });
  }
}
