import SiteHeader from "../_components/SiteHeader";

/**
 * Mostrado instantaneamente pelo Next ao navegar para /painel, enquanto o
 * server component resolve as queries. Espelha o layout real para que a troca
 * skeleton → conteúdo aconteça nas mesmas posições, sem salto.
 */
export default function PainelLoading() {
  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">
      <SiteHeader right="Carregando dados…" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-6">

        {/* FilterBar */}
        <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 flex gap-4 items-center">
            <div className="h-7 w-16 rounded-md skeleton" />
            <div className="h-7 w-64 rounded-md skeleton" />
            <div className="h-7 w-40 rounded-md skeleton" />
            <div className="h-7 w-32 rounded-md skeleton ml-auto" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] gap-6">

          {/* Painel (KPIs + curva) */}
          <div className="w-full space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl skeleton" />
              ))}
            </div>
            <div className="h-80 rounded-xl skeleton" />
          </div>

          {/* Mapa */}
          <div className="rounded-xl skeleton min-h-[560px]" />

        </div>

        {/* Convite */}
        <div className="mt-8 h-24 rounded-xl skeleton" />

      </main>
    </div>
  );
}
