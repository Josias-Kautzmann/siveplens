"use client";

import { useState, useEffect, useRef } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { feature } from "topojson-client";
import { BRAZIL_STATES_URL, MAP_COLORS, SIGLA_TO_IBGE, MUN_TOPO_URL } from "@/lib/constants";
import type { SelectedState, MunNames } from "@/lib/types";

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 12;
const ZOOM_STEP = 1.15;

interface StateMapProps {
  selectedState: SelectedState;
  onBack:       () => void;
  munNames:     MunNames;
  munAtiva?:    string[];
  onMunSelect?: (ibge: string) => void;
  onMunClear?:  (ibge: string) => void;
}

interface MousePos { x: number; y: number }

export default function StateMap({ selectedState, onBack, munNames, munAtiva, onMunSelect, onMunClear }: StateMapProps) {
  const [hoveredName, setHoveredName] = useState("");
  const [mousePos,    setMousePos]    = useState<MousePos | null>(null);
  // Each response belongs to a state; late requests cannot replace a newer selection.
  const [resource, setResource] = useState<{ sigla: string; geo: ReturnType<typeof feature> | null; error: string | null } | null>(null);
  const ibgeCode = SIGLA_TO_IBGE[selectedState.sigla];
  const current = resource?.sigla === selectedState.sigla ? resource : null;
  const munGeoJSON = current?.geo ?? null;
  const loading = !!ibgeCode && !current;
  const error = ibgeCode ? current?.error ?? null : `Código IBGE não encontrado para "${selectedState.sigla}".`;

  // Transform armazenado em ref — muta sem re-render
  const transformRef = useRef({ zoom: 1, tx: 0, ty: 0 });
  const svgWrapRef   = useRef<HTMLDivElement>(null);
  const outerRef     = useRef<HTMLDivElement>(null);

  function applyTransform() {
    const { zoom, tx, ty } = transformRef.current;
    if (svgWrapRef.current) {
      svgWrapRef.current.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`;
    }
  }

  // Reseta zoom ao trocar de estado
  useEffect(() => {
    transformRef.current = { zoom: 1, tx: 0, ty: 0 };
    applyTransform();
  }, [selectedState.sigla]);

  // Wheel zoom direto no DOM — zero re-renders durante o zoom
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom, tx, ty } = transformRef.current;
      const factor  = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newZoom = Math.min(Math.max(zoom * factor, ZOOM_MIN), ZOOM_MAX);
      const ratio   = newZoom / zoom;

      const rect = el.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;

      transformRef.current = {
        zoom: newZoom,
        tx:   cx * (1 - ratio) + tx * ratio,
        ty:   cy * (1 - ratio) + ty * ratio,
      };
      applyTransform();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!ibgeCode) return;
    const controller = new AbortController();
    fetch(MUN_TOPO_URL(ibgeCode), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((topoData) => {
        const objectKey = Object.keys(topoData.objects)[0];
        const geo = feature(topoData, topoData.objects[objectKey]);
        if (!controller.signal.aborted) setResource({ sigla: selectedState.sigla, geo, error: null });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setResource({ sigla: selectedState.sigla, geo: null, error: `Erro ao carregar municípios: ${String(err)}` });
      });
    return () => controller.abort();
  }, [selectedState.sigla, ibgeCode]);

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a3a30] hover:bg-[#0D3F8F] text-white text-sm font-semibold transition-all hover:-translate-x-1"
        >
          ← Voltar
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {munAtiva?.map((ibge6) => (
            <button
              key={ibge6}
              onClick={() => onMunClear?.(ibge6)}
              className="text-xs px-2.5 py-1 rounded-full bg-[#1a3a30] text-white font-medium flex items-center gap-1 hover:bg-[#0D3F8F] transition-colors"
            >
              {munNames[ibge6] ?? ibge6} ✕
            </button>
          ))}
          <span className="text-base font-semibold text-[#1a3a30]">
            {selectedState.name}
          </span>
        </div>
      </div>

      {/* Container do mapa */}
      <div
        ref={outerRef}
        className="relative overflow-hidden rounded-xl border border-[#c5ddd6] bg-white p-4"
      >
        {/* Tooltip — fora do elemento transformado, posicionado com clientX/Y */}
        {hoveredName && mousePos && (
          <div
            className="pointer-events-none absolute z-20 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1C1C] shadow-md ring-1 ring-[#c5ddd6]"
            style={{ left: mousePos.x + 12, top: mousePos.y - 30 }}
          >
            {hoveredName}
          </div>
        )}

        {/* Spinner */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/90">
            <svg className="animate-spin h-10 w-10 text-[#1a3a30] mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-[#1a3a30] text-sm font-medium animate-pulse">
              Carregando municípios ({selectedState.sigla})…
            </p>
          </div>
        )}

        {/* Erro */}
        {error && !loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-900/90 text-red-100 text-xs px-4 py-2 rounded-lg border border-red-500 shadow-lg">
            {error}
          </div>
        )}

        {/* Wrapper escalado via CSS transform — sem re-render do React */}
        <div ref={svgWrapRef} style={{ transformOrigin: "0 0" }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: selectedState.scale, center: selectedState.center }}
            width={800}
            height={750}
            style={{ width: "100%", height: "auto" }}
          >
            {/* Contorno do estado como background */}
            <Geographies geography={BRAZIL_STATES_URL}>
              {({ geographies }) =>
                geographies
                  .filter((g) => g.properties.sigla === selectedState.sigla)
                  .map((geo) => (
                    <Geography
                      key={geo.rsmKey + "-base"}
                      geography={geo}
                      style={{
                        default: { fill: MAP_COLORS.STATE_BG, stroke: MAP_COLORS.STATE_BORDER, strokeWidth: 1.5, outline: "none" },
                        hover:   { fill: MAP_COLORS.STATE_BG, outline: "none" },
                        pressed: { fill: MAP_COLORS.STATE_BG, outline: "none" },
                      }}
                    />
                  ))
              }
            </Geographies>

            {/* Municípios */}
            {munGeoJSON && (
              <Geographies geography={munGeoJSON}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const codarea: string = geo.properties.codarea ?? "";
                    const ibge6:   string = codarea.slice(0, 6);
                    const name:    string = munNames[ibge6] ?? codarea;
                    const ativo          = !!munAtiva?.includes(ibge6);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => onMunSelect?.(ibge6)}
                        onMouseEnter={(evt) => {
                          setHoveredName(name);
                          const rect = outerRef.current!.getBoundingClientRect();
                          setMousePos({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
                        }}
                        onMouseMove={(evt) => {
                          const rect = outerRef.current!.getBoundingClientRect();
                          setMousePos({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
                        }}
                        onMouseLeave={() => {
                          setHoveredName("");
                          setMousePos(null);
                        }}
                        style={{
                          default: { fill: ativo ? "#1a3a30" : MAP_COLORS.MUN_DEFAULT, stroke: ativo ? "#0D3F8F" : MAP_COLORS.STROKE, strokeWidth: ativo ? 1 : 0.4, outline: "none", transition: "fill 0.1s ease" },
                          hover:   { fill: ativo ? "#0D3F8F" : MAP_COLORS.MUN_HOVER, stroke: "#000", strokeWidth: 0.8, outline: "none", cursor: "pointer" },
                          pressed: { fill: MAP_COLORS.MUN_PRESSED, outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            )}
          </ComposableMap>
        </div>
      </div>
    </>
  );
}
