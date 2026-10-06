import type { AnalysisManifestBase } from "@/lib/analysis-manifest";

export default function ProvenanceNotice({ manifest }: { manifest: AnalysisManifestBase }) {
  const provenance = manifest.source.provenance;
  const complete = provenance?.status === "complete";
  return (
    <div className={`rounded-lg border p-3 text-xs ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <strong>{complete ? "Arquivos-fonte identificados" : "Proveniência parcial"}</strong>
      <p className="mt-1">O manifesto registra filtros, população, exclusões e origem dos dados. Reabrir um link recalcula a análise na base disponível naquele momento.</p>
      {!complete && <p className="mt-1">{provenance?.warnings.join(" ") || "Não foi possível confirmar a identidade dos arquivos-fonte."}</p>}
      <p className="mt-1">Guarde o JSON com manifesto para conferir e reexecutar esta configuração.</p>
    </div>
  );
}
