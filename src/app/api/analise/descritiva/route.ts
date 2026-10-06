import { NextRequest, NextResponse } from "next/server";
import { getCategoricalSummary, getNumericSummary } from "@/dal/descriptive.repo";
import {
  parseCategoricalVariable,
  parseDescriptiveFilters,
  parseDescriptiveVariable,
} from "@/lib/descriptive-request";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const filters = parseDescriptiveFilters(body.filtros);
    const result = body.tipo === "categorica"
      ? await getCategoricalSummary(parseCategoricalVariable(body.variavel), filters)
      : await getNumericSummary(parseDescriptiveVariable(body.variavel), filters);
    return NextResponse.json(result);
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : String(error);
    const cause = (error as { cause?: unknown })?.cause;
    const causeMessage = cause instanceof Error ? cause.message : null;
    const message = process.env.NODE_ENV === "production" || !causeMessage
      ? baseMessage
      : `${baseMessage}\nCause: ${causeMessage}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
