import { Suspense } from "react";
import FilterBar from "@/app/_components/client/FilterBar";
import { getAnosDisponiveis } from "@/dal/casos.repo";
import AnaliseIsland from "./_components/AnaliseIsland";
import SiteHeader from "@/app/_components/SiteHeader";

function FilterBarSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm mb-6 overflow-hidden">
      <div className="px-5 py-3 flex gap-4 items-center">
        <div className="h-4 w-12 bg-[#E4E7EC] rounded animate-pulse" />
        <div className="h-7 w-64 bg-[#E4E7EC] rounded-md animate-pulse" />
        <div className="h-7 w-40 bg-[#E4E7EC] rounded-md animate-pulse" />
      </div>
      <div className="px-5 py-3 border-t border-[#eaf5f1] flex gap-4 items-center">
        <div className="h-7 w-80 bg-[#E4E7EC] rounded-md animate-pulse" />
        <div className="h-7 w-64 bg-[#E4E7EC] rounded-md animate-pulse" />
      </div>
    </div>
  );
}

export default async function AnaliseLayout({ children }: { children: React.ReactNode }) {
  const anosDisponiveis = await getAnosDisponiveis();

  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">

      {/* Header */}
      <SiteHeader />

      {/* Corpo: título + FilterBar + ferramentas */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-5 py-6 flex flex-col gap-0">

        <div className="mb-5">
          <h1 className="text-lg font-bold text-[#1C1C1C]">Análise</h1>
          <p className="text-xs text-[#555770] mt-0.5">
            Ferramentas estatísticas sobre os microdados do SIVEP-Gripe — selecione uma ferramenta na barra inferior.
          </p>
        </div>

        <Suspense fallback={<FilterBarSkeleton />}>
          <FilterBar anos={anosDisponiveis} />
        </Suspense>

        <main className="min-w-0 pb-28">{children}</main>

        <Suspense fallback={null}>
          <AnaliseIsland />
        </Suspense>

      </div>

    </div>
  );
}
