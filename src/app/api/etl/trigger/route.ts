import { NextResponse } from "next/server";

const GITHUB_REPO  = process.env.GITHUB_REPO  ?? "Josias-Kautzmann/siveplens";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ETL_SECRET   = process.env.ETL_SECRET;

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!ETL_SECRET || auth !== `Bearer ${ETL_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  }

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ event_type: "run-etl" }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: "GitHub API error", detail: body }, { status: 502 });
  }

  return NextResponse.json({ status: "dispatched" });
}
