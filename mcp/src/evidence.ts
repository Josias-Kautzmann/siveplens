/** Keep the original API manifest intact in both remote and stdio MCP responses. */
export function manifestEvidence(manifest: unknown): string {
  if (!manifest || typeof manifest !== "object") return "Manifesto indisponível: a proveniência desta resposta não pôde ser confirmada.";
  return `MANIFESTO DA ANÁLISE\n${JSON.stringify(manifest, null, 2)}`;
}

export function unavailableRegression(data: {
  meta: { converged: boolean; iteracoes: number };
  coeficientes: { aOR: number; ci95Low: number; ci95High: number; pValue: number; isReferencia?: boolean }[];
  avisos: string[];
  manifest?: unknown;
}): string | null {
  const invalid = data.coeficientes.some((c) => !c.isReferencia && ![c.aOR, c.ci95Low, c.ci95High, c.pValue].every(Number.isFinite));
  const unstable = data.avisos.some((warning) => /separação completa|estimativa instável/i.test(warning));
  if (data.meta.converged && !invalid && !unstable) return null;
  return [
    "REGRESSÃO SEM INTERPRETAÇÃO AUTOMÁTICA",
    data.meta.converged ? "Estimativas instáveis ou indisponíveis." : `O modelo não convergiu após ${data.meta.iteracoes} iterações.`,
    "Revise a coorte e os preditores. Não foram extraídas conclusões de significância desse ajuste.",
    ...data.avisos,
    manifestEvidence(data.manifest),
  ].join("\n");
}
