import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST() {
  return NextResponse.json(
    {
      access_token: randomBytes(32).toString("hex"),
      token_type:   "Bearer",
      expires_in:   31_536_000, // 1 year
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
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
