import { getPanoramaGeral, getCurvaEtiologica, getAnosDisponiveis } from "@/dal/casos.repo";
import type { PanoramaGeral, PontoCurva } from "@/dal/casos.repo";
import KpiCard from "./KpiCard";
import CurvaEpidemica from "./client/CurvaEpidemica";

import type { FiltrosSRAG } from "@/lib/filter-utils";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

interface PanoramaSectionProps {
  filtros: FiltrosSRAG;
}

export default async function PanoramaSection({ filtros }: PanoramaSectionProps) {
  let anosDisponiveis: number[]       = [];
  let panorama:    PanoramaGeral      | null = null;
  let curva:       PontoCurva[]       | null = null;
  let anoAtivo:    number | undefined        = filtros.ano_epi;
  let queryFiltros: typeof filtros           = filtros;

  try {
    anosDisponiveis = await getAnosDisponiveis();
    anoAtivo        = filtros.ano_epi ?? anosDisponiveis.at(-1);
    queryFiltros    = { ...filtros, ano_epi: anoAtivo };

    [panorama, curva] = await Promise.all([
      getPanoramaGeral(queryFiltros),
      getCurvaEtiologica(queryFiltros),
    ]);
  } catch (err) {
    console.error("[PanoramaSection]", err);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Não foi possível carregar os dados epidemiológicos.
        <pre className="mt-2 text-xs whitespace-pre-wrap opacity-70">
          {err instanceof Error ? err.message : String(err)}
        </pre>
      </div>
    );
  }

  if (!panorama || !curva) return null;

  const { kpis } = panorama;

  // Casos que não têm sem_not não aparecem na curva — mostra aviso se relevante
  const totalNaSerie  = panorama.serie.reduce((sum, s) => sum + s.total_casos, 0);
  const semSemana     = kpis.total_casos - totalNaSerie;

  return (
    <section className="w-full space-y-6">
      {/* KPI cards */}
      <div className="enter-stagger grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total de casos"
          value={fmt(kpis.total_casos)}
          sub="notificações SIVEP-Gripe"
          highlight
        />
        <KpiCard
          label="Óbitos"
          value={fmt(kpis.total_obitos)}
          sub={`${kpis.taxa_letalidade.toFixed(1)}% de letalidade`}
        />
        <KpiCard
          label="Internados em UTI"
          value={fmt(kpis.total_uti)}
          sub="com registro de UTI"
        />
        <KpiCard
          label="Internações"
          value={fmt(kpis.total_internacoes)}
          sub="hospitalizações registradas"
        />
      </div>

      {/* Aviso de casos sem semana epidemiológica */}
      {semSemana > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5 -mt-2">
          <span>⚠</span>
          <span>
            <strong>{fmt(semSemana)}</strong> caso{semSemana > 1 ? "s" : ""} sem semana epidemiológica registrada no SIVEP-Gripe — contabilizados nos KPIs acima, mas não aparecem na curva temporal abaixo.
          </span>
        </p>
      )}

      {/* Curva epidêmica por agente */}
      <div className="enter">
        <CurvaEpidemica serie={curva} ano={anoAtivo ?? 0} filtros={queryFiltros} />
      </div>
    </section>
  );
}
