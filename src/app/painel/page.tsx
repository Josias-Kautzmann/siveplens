import { Suspense } from "react";
import Link from "next/link";
import MapContainer from "../_components/client/MapContainer";
import SiteHeader from "../_components/SiteHeader";
import PanoramaSection from "../_components/PanoramaSection";
import { getCasosByUFEtio, getUltimaCarga, getAnosDisponiveis } from "@/dal/casos.repo";
import FilterBar from "../_components/client/FilterBar";
import { parseFilters } from "@/lib/filter-utils";

const FERRAMENTAS = [
  { label: "Associação", href: "/analise/associacao", icon: "⊕" },
  { label: "Regressão",  href: "/analise/regressao",  icon: "β" },
  { label: "Pirâmide",   href: "/analise/piramide",   icon: "▲" },
  { label: "Perfil",     href: "/analise/perfil",      icon: "◈" },
  { label: "Anomalias",  href: "/analise/anomalias",   icon: "Λ" },
];

function PanoramaFallback() {
  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl skeleton" />
        ))}
      </div>
      <div className="h-80 rounded-xl skeleton" />
    </div>
  );
}

/**
 * Painel do mapa — isolado em seu próprio Suspense para que a query pesada
 * de agregação por UF (getCasosByUFEtio) não bloqueie o restante da página.
 * O cabeçalho, filtros e KPIs aparecem assim que estiverem prontos.
 */
async function MapPanel({
  anosAtivos, filtros, anoAtivo,
}: {
  anosAtivos: number[] | undefined;
  filtros: ReturnType<typeof parseFilters>;
  anoAtivo: number | undefined;
}) {
  const dadosUFEtio = await getCasosByUFEtio(anosAtivos, filtros.etiologia);
  return (
    <MapContainer dadosUFEtio={dadosUFEtio} ufAtiva={filtros.sg_uf} munAtiva={filtros.co_mun_res} anoAtivo={anoAtivo} etiologia={filtros.etiologia} />
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const filtros = parseFilters(params);

  const anosAtivos = filtros.anos_epi?.length ? filtros.anos_epi
    : filtros.ano_epi ? [filtros.ano_epi]
    : undefined;

  const [ultimaCarga, anosDisponiveis] = await Promise.all([
    getUltimaCarga(),
    getAnosDisponiveis(),
  ]);
  const anoAtivo = anosAtivos?.at(-1) ?? anosDisponiveis.at(-1);

  const formatarData = (dataVal: Date | string | null | undefined): string => {
    if (!dataVal) return "";
    const d = typeof dataVal === "string" ? new Date(dataVal.includes("T") ? dataVal : dataVal + "T12:00:00") : dataVal;
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR");
  };

  const ultimaAtualizacao = ultimaCarga
    ? `Dados DataSUS: ${formatarData(ultimaCarga.dt_fim_busca)} · Importado em: ${formatarData(ultimaCarga.concluido_em)} · ${ultimaCarga.total_inseridos?.toLocaleString("pt-BR") ?? 0} registros`
    : "Dados: IBGE / OpenDataSUS";

  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">

      {/* Header */}
      <SiteHeader right={ultimaAtualizacao} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-6">

        <Suspense fallback={
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3 flex gap-4 items-center">
              <div className="h-4 w-12 bg-[#E4E7EC] rounded animate-pulse" />
              <div className="h-7 w-64 bg-[#E4E7EC] rounded-md animate-pulse" />
              <div className="h-7 w-40 bg-[#E4E7EC] rounded-md animate-pulse" />
            </div>
          </div>
        }>
          <FilterBar anos={anosDisponiveis} anoAtivo={anoAtivo} />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] gap-6">

          <Suspense fallback={<PanoramaFallback />}>
            <PanoramaSection filtros={filtros} />
          </Suspense>

          <div className="enter bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden min-h-[560px]">
            <Suspense fallback={<div className="h-full min-h-[560px] skeleton" />}>
              <MapPanel anosAtivos={anosAtivos} filtros={filtros} anoAtivo={anoAtivo} />
            </Suspense>
          </div>

        </div>

        {/* Convite para análise */}
        <div className="enter mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[#c5ddd6] bg-white px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-[#1C1C1C]">Vá além do panorama agregado</p>
            <div className="flex flex-wrap gap-2">
              {FERRAMENTAS.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#c5ddd6] bg-[#f4fbf8] px-3 py-1 text-xs font-medium text-[#2a6b55] transition-colors hover:bg-[#e2f3ec] hover:border-[#2a6b55]"
                >
                  <span className="text-[10px] opacity-70">{f.icon}</span>
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
          <Link
            href="/analise"
            className="shrink-0 rounded-lg bg-[#1a3a30] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a6b55]"
          >
            Explorar análises →
          </Link>
        </div>

      </main>
    </div>
  );
}
