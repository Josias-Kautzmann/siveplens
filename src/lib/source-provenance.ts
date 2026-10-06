import type { SourceFileIdentity } from "./analysis-manifest";

/** Complete means file identities are recorded, not that a historical database can be restored. */
export function assessProvenance(files: SourceFileIdentity[], years: number[], lookupFailed = false) {
  const warnings: string[] = [];
  const covered = new Set(files.filter((file) => /^[a-f0-9]{64}$/i.test(file.sha256) && file.normalizationVersion && file.fileName).map((file) => file.year));
  const missing = years.filter((year) => !covered.has(year));
  if (lookupFailed) warnings.push("Não foi possível consultar toda a proveniência da carga.");
  if (!files.length) warnings.push("Identidade dos arquivos-fonte indisponível; a reprodução histórica não pode ser confirmada.");
  else if (files.some((file) => !covered.has(file.year))) warnings.push("Há arquivos-fonte sem identidade ou versão de normalização válida.");
  if (missing.length) warnings.push(`Anos sem identidade de arquivo-fonte: ${missing.join(", ")}.`);
  if (!years.length) warnings.push("Cobertura temporal da fonte não determinada.");
  return { status: warnings.length ? "partial" as const : "complete" as const, warnings };
}
