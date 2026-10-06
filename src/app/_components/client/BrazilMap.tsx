"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { BRAZIL_STATES_URL, MAP_COLORS, SIGLA_TO_IBGE } from "@/lib/constants";
import { getBBoxCenter, getZoomScale } from "@/lib/geo-utils";
import type { SelectedState, UfNames } from "@/lib/types";


const BASE_SCALE = 800;
const ZOOM_MIN   = 0.5;
const ZOOM_MAX   = 12;
const ZOOM_STEP  = 1.15;

// Paleta verde — do mais claro (baixa incidência) ao mais escuro (alta incidência)
const CHORO_STOPS = ["#e8f5f1", "#b7dfd3", "#6dbfaa", "#2a6b55", "#1a3a30"];

function choroFill(rate: number, max: number): string {
  if (!rate || !max) return MAP_COLORS.STATE_DEFAULT;
  const t = Math.log1p(rate) / Math.log1p(max);
  const i = Math.min(Math.floor(t * CHORO_STOPS.length), CHORO_STOPS.length - 1);
  return CHORO_STOPS[i];
}

interface BrazilMapProps {
  onStateSelect:      (state: SelectedState) => void;
  ufNames:            UfNames;
  casosUF:            Record<string, number>;
  tooltipLinesUF:     Record<string, string[]>;
  ufAtiva?:           string[];
  triggerSigla?:      string | null;
  onTriggerConsumed?: () => void;
}

interface MousePos { x: number; y: number }

export default function BrazilMap({ onStateSelect, ufNames, casosUF, tooltipLinesUF, ufAtiva, triggerSigla, onTriggerConsumed }: BrazilMapProps) {
  const maxCasos = Math.max(...Object.values(casosUF), 1);
  const [hoveredLines, setHoveredLines] = useState<string[]>([]);
  const [mousePos,     setMousePos]     = useState<MousePos | null>(null);
  // Sinaliza quando o GeoJSON dos estados foi carregado (fetch remoto)
  const [geosLoaded,   setGeosLoaded]   = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geosRef         = useRef<any[]>([]);
  const pendingTrigger  = useRef<string | null>(null);
  const transformRef    = useRef({ zoom: 1, tx: 0, ty: 0 });
  const svgWrapRef      = useRef<HTMLDivElement>(null);
  const outerRef        = useRef<HTMLDivElement>(null);

  function applyTransform() {
    const { zoom, tx, ty } = transformRef.current;
    if (svgWrapRef.current) {
      svgWrapRef.current.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`;
    }
  }

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

      // Cursor em relação ao container externo
      const rect = el.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;

      // Mantém o ponto sob o cursor estático
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

  // Geographies fetches independently; its child render does not rerender this parent.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (geosRef.current.length > 0) {
        setGeosLoaded(true);
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // triggerSigla: processa imediatamente se geos já carregaram, senão armazena pendente
  useEffect(() => {
    if (!triggerSigla) return;
    if (geosRef.current.length > 0) {
      const geo = geosRef.current.find((g) => g.properties.sigla === triggerSigla);
      if (geo) { handleClickGeo(geo); onTriggerConsumed?.(); return; }
    }
    // GeoJSON ainda não carregou — guarda para processar depois
    pendingTrigger.current = triggerSigla;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSigla]);

  // Quando o GeoJSON carrega, processa qualquer trigger pendente
  useEffect(() => {
    if (!geosLoaded || !pendingTrigger.current) return;
    const sigla = pendingTrigger.current;
    pendingTrigger.current = null;
    const geo = geosRef.current.find((g) => g.properties.sigla === sigla);
    if (geo) { handleClickGeo(geo); onTriggerConsumed?.(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geosLoaded]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleClickGeo(geo: any) {
    const sigla: string = geo.properties.sigla ?? "";
    if (!SIGLA_TO_IBGE[sigla]) return;
    const name: string = ufNames[sigla] ?? geo.properties.name ?? sigla;
    onStateSelect({
      name,
      sigla,
      center: getBBoxCenter(geo.geometry),
      scale:  getZoomScale(geo.geometry),
    });
  }

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (geo: any) => handleClickGeo(geo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ufNames, onStateSelect],
  );

  return (
    <div ref={outerRef} className="relative w-full">
      {/* Tooltip multi-linha — fora do elemento transformado */}
      {hoveredLines.length > 0 && mousePos && (
        <div
          className="pointer-events-none absolute z-20 rounded-md bg-white px-2.5 py-1.5 text-xs shadow-md ring-1 ring-[#c5ddd6]"
          style={{ left: mousePos.x + 12, top: mousePos.y - 30 }}
        >
          {hoveredLines.map((line, i) => (
            <div key={i} className={i === 0 ? "font-semibold text-[#1C1C1C]" : "text-[#555770]"}>
              {line}
            </div>
          ))}
          {hoveredLines.length > 1 && (
            <div className="text-[10px] text-[#94a3b8] mt-1.5 pt-1.5 border-t border-[#E2E8F0]">
              PCR confirmados · taxa por 100 mil hab.
            </div>
          )}
        </div>
      )}

      {/* Wrapper escalado via CSS transform — sem re-render do React */}
      <div ref={svgWrapRef} style={{ transformOrigin: "0 0" }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: BASE_SCALE, center: [-54, -15] }}
          width={800}
          height={750}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={BRAZIL_STATES_URL}>
            {({ geographies }) => {
              geosRef.current = geographies;
              return geographies.map((geo) => {
                const sigla: string = geo.properties.sigla ?? "";
                const name: string  = ufNames[sigla] ?? geo.properties.name ?? sigla;
                const isAtiva     = !!ufAtiva?.includes(sigla);
                const hasSelection = (ufAtiva?.length ?? 0) > 0;
                const total        = casosUF[sigla] ?? 0;
                // Com seleção ativa: estados selecionados = azul governo, outros = cinza claro
                // Sem seleção: coroplético normal
                const baseFill = isAtiva
                  ? "#1a3a30"
                  : hasSelection
                  ? "#dceee8"
                  : choroFill(total, maxCasos);
                const lines = tooltipLinesUF[sigla] ?? [name];

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(evt) => {
                      setHoveredLines(lines);
                      const rect = outerRef.current!.getBoundingClientRect();
                      setMousePos({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
                    }}
                    onMouseMove={(evt) => {
                      const rect = outerRef.current!.getBoundingClientRect();
                      setMousePos({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
                    }}
                    onMouseLeave={() => {
                      setHoveredLines([]);
                      setMousePos(null);
                    }}
                    onClick={() => handleClick(geo)}
                    style={{
                      default: {
                        fill: baseFill,
                        stroke: isAtiva ? "#1a3a30" : MAP_COLORS.STROKE,
                        strokeWidth: isAtiva ? 2 : (hasSelection ? 0.5 : 0.75),
                        outline: "none",
                        transition: "fill 0.15s ease",
                        cursor: "pointer",
                      },
                      hover: {
                        fill: isAtiva ? "#2a6b55" : MAP_COLORS.STATE_HOVER,
                        stroke: isAtiva ? "#1a3a30" : MAP_COLORS.STROKE,
                        strokeWidth: 1.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: MAP_COLORS.STATE_PRESSED,
                        outline: "none",
                      },
                    }}
                  />
                );
              });
            }}
          </Geographies>
        </ComposableMap>
      </div>
    </div>
  );
}
