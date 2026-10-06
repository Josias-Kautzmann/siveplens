import { NextResponse } from "next/server";

const SITE = (process.env.SITE_URL ?? "https://siveplens.literato.io").replace(/\/$/, "");

export function GET() {
  return NextResponse.json(
    {
      issuer:                                SITE,
      authorization_endpoint:                `${SITE}/api/mcp/oauth/authorize`,
      token_endpoint:                        `${SITE}/api/mcp/oauth/token`,
      registration_endpoint:                 `${SITE}/api/mcp/oauth/register`,
      response_types_supported:              ["code"],
      grant_types_supported:                 ["authorization_code"],
      code_challenge_methods_supported:      ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported:                      ["mcp"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
