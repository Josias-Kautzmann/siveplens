"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from "recharts";
import type { PontoCurva } from "@/dal/casos.repo";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import { semNotToDate, fmtDDMM, fmtDDMMYY } from "@/lib/epi-utils";
import { ChartTooltip, AreaGradient, GRID_PROPS, AXIS_PROPS } from "@/app/_components/charts/ChartKit";

interface CurvaEpidemicaProps {
  serie:   PontoCurva[];
  ano:     number;
  filtros: FiltrosSRAG;
}

const AGENTES = [
  { key: "total",  label: "Total SRAG",        cor: "#4a9a80", dashed: false },
  { key: "rino",   label: "Rinovírus",         cor: "#7C3AED", dashed: false },
  { key: "flu_a",  label: "Influenza A",       cor: "#1a3a30", dashed: false },
  { key: "vsr",    label: "VSR",               cor: "#F59E0B", dashed: false },
  { key: "sars2",  label: "SARS-CoV-2",       cor: "#E52207", dashed: false },
  { key: "flu_b",  label: "Influenza B",       cor: "#2670E8", dashed: false },
  { key: "metap",  label: "Metapneumovírus",   cor: "#059669", dashed: false },
  { key: "obitos", label: "Óbitos",            cor: "#1C1C1C", dashed: true  },
  { key: "nao_id", label: "Não identificado",  cor: "#9CA3AF", dashed: true  },
] as const;

const SEMANAS_INCOMPLETAS = 3;

function formatY(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

/** Constrói URLSearchParams a partir dos filtros atuais + overrides pontuais. */
function buildParams(filtros: FiltrosSRAG, overrides: Record<string, string | null>): URLSearchParams {
  const p = new URLSearchParams();
  if (filtros.ano_epi)              p.set("ano",  String(filtros.ano_epi));
  if (filtros.sg_uf?.length)        p.set("uf",   filtros.sg_uf.join(","));
  if (filtros.co_mun_res?.length)   p.set("mun",  filtros.co_mun_res.join(","));
  if (filtros.cs_sexo)           p.set("sexo",     filtros.cs_sexo);
  if (filtros.faixa_etaria)      p.set("faixa",    filtros.faixa_etaria);
  if (filtros.classi_fin?.length)  p.set("classi",  filtros.classi_fin.join(","));
  if (filtros.evolucao?.length)    p.set("evolucao",filtros.evolucao.join(","));
  if (filtros.etiologia?.length)   p.set("etio",    filtros.etiologia.join(","));
  if (filtros.data_ini) p.set("data_ini", filtros.data_ini);
  if (filtros.data_fim) p.set("data_fim", filtros.data_fim);
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== null) p.set(k, v);
    else p.delete(k);
  }
  return p;
}

export default function CurvaEpidemica({ serie, ano, filtros }: CurvaEpidemicaProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [ocultos,     setOcultos]     = useState<Set<string>>(new Set(["obitos", "flu_b", "metap"]));
  const [selection, setSelection] = useState<{ serie: PontoCurva[]; range: [number, number] } | null>(null);
  const zoomRange = selection?.serie === serie ? selection.range : null;
  const [selectStart, setSelectStart] = useState<string>("");
  const [selectEnd,   setSelectEnd]   = useState<string>("");
  const [isSelecting, setIsSelecting] = useState(false);

  const multiAno = new Set(serie.map((p) => p.ano_epi)).size > 1;

  const data = serie.map((p) => {
    const label = (p.ano_epi && p.sem_not)
      ? (multiAno
          ? fmtDDMMYY(semNotToDate(p.ano_epi, p.sem_not))
          : fmtDDMM(semNotToDate(p.ano_epi, p.sem_not)))
      : `SE ${String(p.sem_not ?? "").padStart(2, "0")}`;
    return { semana: label, ...p };
  });


  // Dados exibidos: série já filtrada pelo servidor quando há zoom de URL,
  // ou fatia local durante a transição (enquanto o servidor ainda não respondeu).
  const displayData = zoomRange ? data.slice(zoomRange[0], zoomRange[1] + 1) : data;

  // Zoom ativo = parâmetros de data na URL OU seleção local ainda em transição
  const isZoomed = (!!(filtros.data_ini || filtros.data_fim)) || zoomRange !== null;

  // Período exibido na faixa de zoom
  const zoomLabel = {
    start: displayData[0]?.semana ?? "",
    end:   displayData[displayData.length - 1]?.semana ?? "",
    count: displayData.length,
  };

  const incompletaSet   = new Set(data.slice(-SEMANAS_INCOMPLETAS).map((d) => d.semana));
  const incompleteStart = data.length >= SEMANAS_INCOMPLETAS ? data[data.length - SEMANAS_INCOMPLETAS].semana : null;
  const incompleteEnd   = data.length > 0 ? data[data.length - 1].semana : null;

  function toggleAgente(key: string) {
    setOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleMouseDown(e: any) {
    if (!e?.activeLabel) return;
    setSelectStart(e.activeLabel);
    setSelectEnd(e.activeLabel);
    setIsSelecting(true);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleMouseMove(e: any) {
    if (!isSelecting || !e?.activeLabel) return;
    setSelectEnd(e.activeLabel);
  }

  function handleMouseUp() {
    if (!isSelecting) return;
    setIsSelecting(false);

    if (!selectStart || !selectEnd || selectStart === selectEnd) {
      setSelectStart(""); setSelectEnd(""); return;
    }

    const idxL = data.findIndex((d) => d.semana === selectStart);
    const idxR = data.findIndex((d) => d.semana === selectEnd);
    if (idxL < 0 || idxR < 0) { setSelectStart(""); setSelectEnd(""); return; }

    const [newLeft, newRight] = idxL <= idxR ? [idxL, idxR] : [idxR, idxL];

    // Atualiza zoom local imediatamente (feedback visual instantâneo)
    setSelection({ serie, range: [newLeft, newRight] });
    setSelectStart(""); setSelectEnd("");

    // Sincroniza com a URL → recarrega KPIs, Prevalência, etc.
    const semIni = data[newLeft].sem_not;
    const semFim = data[newRight].sem_not;
    if (semIni != null && semFim != null && ano) {
      const toddmm = (sem: number) => {
        const d = semNotToDate(ano, sem);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      };
      startTransition(() => {
        router.push(
          `?${buildParams(filtros, { data_ini: toddmm(semIni), data_fim: toddmm(semFim) })}`,
          { scroll: false },
        );
      });
    }
  }

  function resetZoom() {
    setSelection(null);
    startTransition(() => {
      router.push(
        `?${buildParams(filtros, { data_ini: null, data_fim: null })}`,
        { scroll: false },
      );
    });
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-6 transition-colors duration-150 ${isPending ? "border-[#1a3a30]" : "border-[#c5ddd6]"}`}>

      {/* Cabeçalho */}
      <div className="mb-1">
        <h2 className="text-base font-semibold text-[#1C1C1C]">
          Curva Epidêmica — SRAG {ano}
        </h2>
        {!isZoomed && (
          <p className="text-xs text-[#555770] mt-0.5">
            Clique na legenda para mostrar/ocultar · arraste no gráfico para ampliar um período
          </p>
        )}
      </div>

      {/* Faixa de zoom ativo */}
      {isZoomed && (
        <div className={`flex items-center justify-between gap-3 mt-2 mb-1 rounded-lg px-3 py-2 border transition-colors ${isPending ? "bg-[#dff0ea] border-[#A8C0F0]" : "bg-[#EEF3FF] border-[#C7D7F9]"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-3.5 h-3.5 text-[#1a3a30] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="4"/><path strokeLinecap="round" d="M10 10l4 4"/>
            </svg>
            <span className="text-xs font-bold text-[#1a3a30] tabular-nums">{zoomLabel.start}</span>
            <svg className="w-3 h-3 text-[#1a3a30] shrink-0" viewBox="0 0 12 6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M0 3h10M7 1l3 2-3 2"/>
            </svg>
            <span className="text-xs font-bold text-[#1a3a30] tabular-nums">{zoomLabel.end}</span>
            <span className="text-[11px] text-[#4A6FA5]">· {zoomLabel.count} semanas</span>
            {isPending && (
              <span className="text-[11px] text-[#1a3a30] animate-pulse">· atualizando dados…</span>
            )}
          </div>
          <button
            onClick={resetZoom}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#1a3a30] hover:bg-[#0D3F8F] disabled:opacity-50 text-white rounded-md px-2.5 py-1 transition-colors shrink-0"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M2 2l8 8M10 2l-8 8"/>
            </svg>
            Resetar zoom
          </button>
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-2 mb-4 mt-3">
        {AGENTES.map(({ key, label, cor }) => {
          const ativo = !ocultos.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleAgente(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${ativo ? "opacity-100" : "opacity-35"}`}
              style={{ borderColor: cor, color: ativo ? cor : "#94A3B8" }}
            >
              <span className="inline-block w-5 h-0.5 rounded-full" style={{ backgroundColor: cor }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Gráfico */}
      <div style={{ userSelect: "none", cursor: isSelecting ? "crosshair" : "default" }}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={displayData}
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isSelecting) handleMouseUp(); }}
          >
            <defs>
              <AreaGradient id="grad-total" color="#4a9a80" opacity={0.22} />
            </defs>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="semana" interval="preserveStartEnd" {...AXIS_PROPS} />
            <YAxis tickFormatter={formatY} width={40} {...AXIS_PROPS} />

            {!isSelecting && (
              <Tooltip
                cursor={{ stroke: "#c5ddd6", strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    indicator="line"
                    footer={(label) =>
                      incompletaSet.has(label as string) ? (
                        <span className="flex items-start gap-1.5 text-amber-700">
                          <span className="text-amber-500 shrink-0">⚠</span>
                          <span className="leading-tight">Semana em consolidação — notificações ainda sendo processadas</span>
                        </span>
                      ) : null
                    }
                  />
                }
              />
            )}

            {incompleteStart && incompleteEnd && (
              <ReferenceArea x1={incompleteStart} x2={incompleteEnd} fill="#FEF3C7" fillOpacity={0.6} />
            )}
            {incompleteStart && (
              <ReferenceLine
                x={incompleteStart}
                stroke="#F59E0B"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: "em consolidação →", position: "insideTopRight", fontSize: 10, fill: "#B45309", dy: 4 }}
              />
            )}

            {/* Área de seleção em tempo real */}
            {isSelecting && selectStart && selectEnd && (
              <ReferenceArea x1={selectStart} x2={selectEnd} fill="#1a3a30" fillOpacity={0.15} stroke="#1a3a30" strokeOpacity={0.4} strokeWidth={1} />
            )}

            {AGENTES.map(({ key, label, cor, dashed }) => {
              if (ocultos.has(key)) return null;
              if (key === "total") {
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={cor}
                    strokeWidth={1.8}
                    fill="url(#grad-total)"
                    dot={false}
                    activeDot={isSelecting ? false : { r: 3 }}
                    isAnimationActive={!isSelecting}
                    animationDuration={1400}
                    animationEasing="ease-out"
                  />
                );
              }
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stroke={cor}
                  strokeWidth={2}
                  strokeDasharray={dashed ? "5 3" : undefined}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={isSelecting ? false : { r: 3 }}
                  isAnimationActive={!isSelecting}
                  animationDuration={1400}
                  animationEasing="ease-out"
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1">
        <span>⚠</span>
        Área sombreada: últimas {SEMANAS_INCOMPLETAS} semanas em consolidação — subnotificação esperada
      </p>
    </div>
  );
}
