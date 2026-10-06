import { parseFilters } from "@/lib/filter-utils";
import AnaliseClient from "../_components/AnaliseClient";

export default async function AssociacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params  = await searchParams;
  const filtros = parseFilters(params);

  return (
    <>
      <div className="bg-[#EEF3FF] border border-[#C7D7F9] rounded-xl px-5 py-3 text-xs text-[#1a3a30] mb-6 flex items-start gap-2">
        <span className="shrink-0 mt-0.5">ℹ</span>
        <span>
          Os filtros do painel são aplicados à análise. Para iniciar sem filtros, limpe-os antes de executar.
          Os resultados são calculados diretamente sobre os microdados SIVEP-Gripe.
        </span>
      </div>
      <AnaliseClient filtros={filtros} />
    </>
  );
}
