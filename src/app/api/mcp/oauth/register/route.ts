import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  return NextResponse.json(
    {
      client_id:                  randomUUID(),
      client_id_issued_at:        Math.floor(Date.now() / 1000),
      redirect_uris:              (body.redirect_uris as string[]) ?? [],
      grant_types:                ["authorization_code"],
      response_types:             ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
