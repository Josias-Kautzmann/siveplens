"use client";

import { useState } from "react";
import type { OddsRatioResult } from "@/lib/stat-utils";
import { formatNumber } from "@/lib/stat-utils";

interface Props {
  orResult:    OddsRatioResult;
  xCasoLabel:  string;
  xRefLabel:   string;
  yCasoLabel:  string;
  yRefLabel:   string;
}

/** Compute a "nice" log10 axis range around the given values */
function niceLogRange(low: number, high: number, or: number): [number, number] {
  // Symmetric on log scale around OR=1
  const maxDist = Math.max(
    Math.abs(Math.log10(Math.max(low, 0.001))),
    Math.abs(Math.log10(Math.max(high, 0.001))),
    Math.abs(Math.log10(Math.max(or, 0.001))),
    0.5, // minimum half-decade each side
  );
  const margin = maxDist * 1.25;
  const minVal = Math.pow(10, -margin);
  const maxVal = Math.pow(10, margin);
  // Clamp to sensible absolute limits
  return [Math.max(minVal, 0.01), Math.min(maxVal, 200)];
}

function toX(value: number, logMin: number, logMax: number, plotW: number): number {
  const logVal = Math.log10(Math.max(0.001, value));
  return ((logVal - logMin) / (logMax - logMin)) * plotW;
}

function niceTickValues(logMin: number, logMax: number): number[] {
  const candidates = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50,100,200];
  return candidates.filter((v) => {
    const lv = Math.log10(v);
    return lv >= logMin - 0.01 && lv <= logMax + 0.01;
  });
}

export default function ForestPlot({
  orResult, xCasoLabel, xRefLabel, yCasoLabel, yRefLabel,
}: Props) {
  const [autoScale, setAutoScale] = useState(true);

  const svgW  = 600;
  const padL  = 24;
  const padR  = 24;
  const plotW = svgW - padL - padR;
  const rowY  = 80;
  const axisY = 126;
  const svgH  = 190;

  const [logMin, logMax] = autoScale
    ? (() => { const [a, b] = niceLogRange(orResult.ci95Low, orResult.ci95High, orResult.or); return [Math.log10(a), Math.log10(b)]; })()
    : [Math.log10(0.1), Math.log10(10)];

  const tx   = (v: number) => toX(v, logMin, logMax, plotW);
  const ticks = niceTickValues(logMin, logMax);

  const xOR   = tx(orResult.or);
  const xLow  = tx(orResult.ci95Low);
  const xHigh = tx(orResult.ci95High);
  const xRef  = tx(1.0);

  const protective = orResult.or < 1;
  const accent     = protective ? "#059669" : "#DC2626";
  const ciColor    = protective ? "#6EE7B7" : "#FCA5A5";

  const dSize   = 10;
  const dX      = padL + xOR;
  const diamond = [
    `${dX},${rowY - dSize}`,
    `${dX + dSize},${rowY}`,
    `${dX},${rowY + dSize}`,
    `${dX - dSize},${rowY}`,
  ].join(" ");

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-1">
            Forest Plot — Odds Ratio
          </div>
          <div className="text-[11px] text-[#94A3B8] leading-relaxed">
            Exposição: <strong className="text-[#555770]">{xCasoLabel}</strong> vs {xRefLabel}
            {" · "}
            Desfecho: <strong className="text-[#555770]">{yCasoLabel}</strong> vs {yRefLabel}
          </div>
        </div>
        <button
          onClick={() => setAutoScale((v) => !v)}
          className={`px-2.5 py-1 text-[11px] rounded-md border shrink-0 transition-all ${
            autoScale
              ? "bg-[#1a3a30] text-white border-[#1a3a30]"
              : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
          }`}
        >
          {autoScale ? "Escala auto" : "Escala 0,1–10"}
        </button>
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ maxHeight: svgH }}
        aria-label={`Forest plot: OR = ${formatNumber(orResult.or)}, IC 95% ${formatNumber(orResult.ci95Low)}–${formatNumber(orResult.ci95High)}`}
      >
        {/* Fundo do plot */}
        <rect x={padL} y={rowY - 40} width={plotW} height={80} fill="#f4fbf8" rx={6} />

        {/* Metades "protetor" / "risco" */}
        <rect x={padL} y={rowY - 40} width={padL + xRef - padL} height={80} fill="#ECFDF5" fillOpacity={0.5} rx={6} />
        <rect x={padL + xRef} y={rowY - 40} width={plotW - xRef} height={80} fill="#FFF1F2" fillOpacity={0.5} rx={6} />

        {/* Linha de referência OR=1 */}
        <line
          x1={padL + xRef} y1={rowY - 38}
          x2={padL + xRef} y2={axisY - 2}
          stroke="#64748B" strokeWidth={1.5} strokeDasharray="4 3"
        />
        <text x={padL + xRef} y={rowY - 42} textAnchor="middle" fontSize={9} fill="#64748B" fontWeight="600">
          OR = 1
        </text>

        {/* IC bar (background, wider) */}
        <line
          x1={padL + xLow} y1={rowY}
          x2={padL + xHigh} y2={rowY}
          stroke={ciColor} strokeWidth={10} strokeLinecap="round"
        />

        {/* IC endpoints */}
        <line x1={padL + xLow}  y1={rowY - 10} x2={padL + xLow}  y2={rowY + 10} stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={padL + xHigh} y1={rowY - 10} x2={padL + xHigh} y2={rowY + 10} stroke={accent} strokeWidth={2.5} strokeLinecap="round" />

        {/* Diamante */}
        <polygon points={diamond} fill={accent} />

        {/* OR value label (acima) */}
        <text x={padL + xOR} y={rowY - 18} textAnchor="middle" fontSize={13} fontWeight="bold" fill={accent}>
          {formatNumber(orResult.or)}
        </text>

        {/* IC bounds (abaixo) */}
        <text x={padL + xLow}  y={rowY + 24} textAnchor="middle" fontSize={9} fill="#555770">
          {formatNumber(orResult.ci95Low)}
        </text>
        <text x={padL + xHigh} y={rowY + 24} textAnchor="middle" fontSize={9} fill="#555770">
          {formatNumber(orResult.ci95High)}
        </text>
        <text x={padL + xOR}   y={rowY + 24} textAnchor="middle" fontSize={9} fill="#94A3B8">
          IC 95%
        </text>

        {/* Eixo */}
        <line x1={padL} y1={axisY} x2={padL + plotW} y2={axisY} stroke="#c5ddd6" strokeWidth={1} />
        {ticks.map((t) => {
          const tx2 = padL + tx(t);
          const isMajor = [0.1, 0.5, 1, 2, 5, 10].includes(t);
          return (
            <g key={t}>
              <line x1={tx2} y1={axisY} x2={tx2} y2={axisY + (isMajor ? 5 : 3)} stroke="#c5ddd6" strokeWidth={1} />
              {isMajor && (
                <text x={tx2} y={axisY + 14} textAnchor="middle" fontSize={9} fill="#94A3B8">
                  {t < 1 ? t.toString() : t}
                </text>
              )}
            </g>
          );
        })}

        {/* Rótulos de referência */}
        <text x={padL + 6}         y={axisY + 28} fontSize={9} fill="#059669" fontWeight="600">◀ Protetor</text>
        <text x={padL + plotW - 6} y={axisY + 28} fontSize={9} fill="#DC2626" fontWeight="600" textAnchor="end">Fator de risco ▶</text>
      </svg>

      {/* Legenda da cor */}
      <div className="flex justify-center mt-2">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          protective
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {protective ? "▲ OR < 1 — efeito protetor" : "▲ OR > 1 — fator de risco"}
          {" · "}
          OR = {formatNumber(orResult.or)} (IC 95%: {formatNumber(orResult.ci95Low)} – {formatNumber(orResult.ci95High)})
        </div>
      </div>
    </div>
  );
}
