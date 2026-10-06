import { NextResponse } from "next/server";
import { getAlertasByUF, getAlertasRecentes } from "@/dal/alertas.repo";

/**
 * GET /api/alertas
 *
 * Parâmetros:
 *   uf     (opcional) — filtra alertas por estado, ex: RS
 *   limit  (opcional) — máximo de resultados, padrão 20
 *
 * Exemplos:
 *   /api/alertas
 *   /api/alertas?uf=RS&limit=50
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uf    = searchParams.get("uf");
  const limit = searchParams.get("limit") ?? "20";

  try {
    const data = uf
      ? await getAlertasByUF(uf, +limit)
      : await getAlertasRecentes(+limit);

    return NextResponse.json({ data });

  } catch (err) {
    console.error("[/api/alertas]", err);
    return NextResponse.json({ error: "Erro interno ao consultar alertas" }, { status: 500 });
  }
}
