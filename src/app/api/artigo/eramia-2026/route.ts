import { NextRequest } from "next/server";
import { getEramia2026ArticleArtifact } from "@/dal/eramia-2026-artifact";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const artifact = await getEramia2026ArticleArtifact();
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(`${JSON.stringify(artifact, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": "attachment; filename=siveplens-eramia-2026-evidencias.json" } : {}),
    },
  });
}
