"use client";

import type { ReactNode } from "react";

/**
 * Kit de tema para gráficos (estética inspirada no shadcn/charts, sobre Recharts).
 * Centraliza paleta, estilos de eixo/grade, gradientes e um tooltip consistente.
 */

// Paleta coesa — verde da identidade liderando, acentos para séries adicionais
export const CHART_PALETTE = [
  "#1a3a30", "#0E7490", "#059669", "#D97706",
  "#DC2626", "#7C3AED", "#DB2777", "#2563EB",
];

// Estilos compartilhados de eixo e grade (look limpo: grade só horizontal, sem linhas de eixo)
export const GRID_PROPS = {
  vertical: false as const,
  stroke: "#eaf5f1",
  strokeDasharray: "4 4",
};

export const AXIS_TICK = { fontSize: 11, fill: "#94A3B8" } as const;

export const AXIS_PROPS = {
  axisLine: false as const,
  tickLine: false as const,
  tick: AXIS_TICK,
};

/** Definição de gradiente vertical para preenchimento de áreas. Usar dentro de <defs>. */
export function AreaGradient({ id, color, opacity = 0.25 }: { id: string; color: string; opacity?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor={color} stopOpacity={opacity} />
      <stop offset="95%"  stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipEntry = { name?: string; value?: number | string; color?: string; dataKey?: string; payload?: any };

interface ChartTooltipProps {
  // injetados pelo Recharts via content={<ChartTooltip ... />}
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  // configuração
  hideLabel?: boolean;
  indicator?: "dot" | "line";
  labelFormatter?: (label: string | number) => ReactNode;
  nameFormatter?: (name: string, entry: TipEntry) => ReactNode;
  valueFormatter?: (value: number | string, name: string, entry: TipEntry) => ReactNode;
  /** filtra/ordena as entradas exibidas (ex: esconder séries auxiliares) */
  filter?: (entry: TipEntry) => boolean;
  footer?: (label: string | number | undefined) => ReactNode;
}

/** Tooltip estilo shadcn: cartão arredondado, rótulo no topo, linhas com bolinha de cor + valor. */
export function ChartTooltip({
  active, payload, label,
  hideLabel, indicator = "dot",
  labelFormatter, nameFormatter, valueFormatter, filter, footer,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entries = filter ? payload.filter(filter) : payload;
  if (!entries.length) return null;

  return (
    <div className="rounded-lg border border-[#c5ddd6] bg-white/95 backdrop-blur-sm px-3 py-2 shadow-lg text-xs min-w-[10rem]">
      {!hideLabel && label !== undefined && (
        <div className="font-semibold text-[#0f2820] mb-1.5">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="space-y-1">
        {entries.map((entry, i) => {
          const color = entry.color ?? "#1a3a30";
          const name  = entry.name ?? entry.dataKey ?? "";
          const displayName  = nameFormatter ? nameFormatter(String(name), entry) : name;
          const displayValue = valueFormatter
            ? valueFormatter(entry.value as number | string, String(name), entry)
            : (typeof entry.value === "number" ? entry.value.toLocaleString("pt-BR") : entry.value);
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#555770]">
                <span
                  className={indicator === "line" ? "inline-block h-[2px] w-3 rounded-full" : "inline-block h-2 w-2 rounded-full"}
                  style={{ background: color }}
                />
                {displayName}
              </span>
              <span className="font-semibold text-[#0f2820] tabular-nums">{displayValue}</span>
            </div>
          );
        })}
      </div>
      {footer && <div className="mt-2 pt-2 border-t border-[#eaf5f1]">{footer(label)}</div>}
    </div>
  );
}
