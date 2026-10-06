import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const redirectUri = searchParams.get("redirect_uri");
  const state       = searchParams.get("state") ?? "";

  if (!redirectUri) {
    return NextResponse.json({ error: "redirect_uri required" }, { status: 400 });
  }

  const code     = randomBytes(16).toString("hex");
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString());
}
