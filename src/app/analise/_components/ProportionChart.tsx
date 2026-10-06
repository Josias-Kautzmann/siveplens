"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from "recharts";
import type { ContingenciaCell } from "@/app/api/analise/contingencia/route";
import type { VariableInfo } from "@/lib/variable-catalog";
import { getValueLabel } from "@/lib/variable-catalog";
import { ChartTooltip } from "@/app/_components/charts/ChartKit";

interface Props {
  cells:    ContingenciaCell[];
  varXInfo: VariableInfo;
  varYInfo: VariableInfo;
}

const PALETTE = [
  "#1a3a30", "#0E7490", "#059669", "#D97706",
  "#DC2626", "#7C3AED", "#DB2777", "#2563EB",
];

type Orientation = "horizontal" | "vertical";
type SortMode    = "catalog" | "frequency";

export default function ProportionChart({ cells, varXInfo, varYInfo }: Props) {
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [sortMode,    setSortMode]    = useState<SortMode>("catalog");
  const [showLabels,  setShowLabels]  = useState(false);

  const presentX = new Set(cells.map((c) => c.vx));
  const presentY = new Set(cells.map((c) => c.vy));
  const catalogX = varXInfo.valores.map((v) => v.codigo).filter((c) => presentX.has(c));
  const orderedY = varYInfo.valores.map((v) => v.codigo).filter((c) => presentY.has(c));

  // Compute per-X percentage rows
  const rows = catalogX.map((xVal) => {
    const rowCells = cells.filter((c) => c.vx === xVal);
    const rowTotal = rowCells.reduce((s, c) => s + c.n, 0);
    const pct: Record<string, number> = {};
    const abs: Record<string, number> = {};
    for (const yVal of orderedY) {
      const n = rowCells.find((c) => c.vy === yVal)?.n ?? 0;
      pct[yVal] = rowTotal > 0 ? Math.round((n / rowTotal) * 1000) / 10 : 0;
      abs[yVal] = n;
    }
    return { xVal, name: getValueLabel(varXInfo, xVal), pct, abs, rowTotal };
  });

  // Sort: by frequency of first Y value (typically the "outcome" of interest)
  const sorted = sortMode === "frequency"
    ? [...rows].sort((a, b) => (b.pct[orderedY[0]] ?? 0) - (a.pct[orderedY[0]] ?? 0))
    : rows;

  const data = sorted.map((r) => ({
    name: r.name,
    ...Object.fromEntries(orderedY.map((y) => [y, r.pct[y]])),
    _abs: r.abs,
    _total: r.rowTotal,
  }));

  const isHorizontal = orientation === "horizontal";
  const barH   = Math.max(56, sorted.length * 52);
  const chartH  = isHorizontal ? barH : 340;
  const yWidth  = isHorizontal ? 104 : undefined;

  return (
    <div>
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest">
          Distribuição de {varYInfo.labelCurto} por {varXInfo.labelCurto}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Orientação */}
          <div className="flex gap-0.5 bg-[#eaf5f1] rounded-md p-0.5">
            <button
              onClick={() => setOrientation("horizontal")}
              title="Barras horizontais"
              className={`px-2.5 py-1 text-[11px] rounded transition-all ${
                orientation === "horizontal"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              ⇔ Horizontal
            </button>
            <button
              onClick={() => setOrientation("vertical")}
              title="Barras verticais"
              className={`px-2.5 py-1 text-[11px] rounded transition-all ${
                orientation === "vertical"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              ⇕ Vertical
            </button>
          </div>

          {/* Ordenação */}
          <div className="flex gap-0.5 bg-[#eaf5f1] rounded-md p-0.5">
            <button
              onClick={() => setSortMode("catalog")}
              className={`px-2.5 py-1 text-[11px] rounded transition-all ${
                sortMode === "catalog"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              Ordem padrão
            </button>
            <button
              onClick={() => setSortMode("frequency")}
              title={`Ordenar por % de "${getValueLabel(varYInfo, orderedY[0])}"`}
              className={`px-2.5 py-1 text-[11px] rounded transition-all ${
                sortMode === "frequency"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              ↓ Freq. {getValueLabel(varYInfo, orderedY[0])}
            </button>
          </div>

          {/* Rótulos */}
          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`px-2.5 py-1 text-[11px] rounded-md border transition-all ${
              showLabels
                ? "bg-[#1a3a30] text-white border-[#1a3a30]"
                : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
            }`}
          >
            % nas barras
          </button>
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: showLabels ? 36 : 16, left: 8, bottom: isHorizontal ? 0 : 20 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="#eaf5f1"
            horizontal={isHorizontal}
            vertical={!isHorizontal}
          />
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={yWidth}
                tick={{ fontSize: 11, fill: "#555770" }}
                axisLine={false}
                tickLine={false}
              />
            </>
          ) : (
            <>
              <XAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "#555770" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={sorted.length > 5 ? -30 : 0}
                textAnchor={sorted.length > 5 ? "end" : "middle"}
                height={sorted.length > 5 ? 60 : 30}
              />
              <YAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
            </>
          )}

          <Tooltip
            cursor={{ fill: "#eaf5f1" }}
            content={
              <ChartTooltip
                nameFormatter={(name) => getValueLabel(varYInfo, String(name))}
                valueFormatter={(value, name, entry) => {
                  const abs = (entry.payload as Record<string, unknown>)?._abs as Record<string, number> | undefined;
                  const n = abs?.[String(name)];
                  return `${value}%${n !== undefined ? ` · n=${n.toLocaleString("pt-BR")}` : ""}`;
                }}
              />
            }
          />
          <Legend
            formatter={(name) => getValueLabel(varYInfo, String(name))}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />

          {orderedY.map((yVal, i) => (
            <Bar
              key={yVal}
              dataKey={yVal}
              stackId="a"
              fill={PALETTE[i % PALETTE.length]}
              radius={
                i === orderedY.length - 1
                  ? isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]
                  : undefined
              }
              isAnimationActive
              animationDuration={1300}
              animationEasing="ease-out"
            >
              {showLabels && (
                <LabelList
                  dataKey={yVal}
                  position="inside"
                  formatter={(v) => (Number(v) >= 8 ? `${v}%` : "")}
                  style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-[#94A3B8] mt-2">
        Cada barra representa 100% dos casos naquele grupo — valores = % dentro do grupo.
      </p>
    </div>
  );
}
