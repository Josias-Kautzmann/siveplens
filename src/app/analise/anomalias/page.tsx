import { parseFilters } from "@/lib/filter-utils";
import { getCurvaEtiologica } from "@/dal/casos.repo";
import AnomaliasClient from "../_components/AnomaliasClient";

export default async function AnomaliasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params  = await searchParams;
  const filtros = parseFilters(params);
  const serie   = await getCurvaEtiologica(filtros);

  return (
    <>
      <div className="bg-[#eaf5f1] border border-[#c5ddd6] rounded-xl px-5 py-3 text-xs text-[#1a3a30] mb-6 flex items-start gap-2">
        <span className="shrink-0 mt-0.5">ℹ</span>
        <span>
          Cada semana epidemiológica é comparada à média móvel das semanas anteriores (detecção causal por
          z-score) e os picos atípicos são destacados. Os filtros do painel restringem a série analisada.
          Atenção: as semanas mais recentes podem estar subnotificadas.
        </span>
      </div>
      <AnomaliasClient serie={serie} filtros={filtros} />
    </>
  );
}
