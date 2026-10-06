"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { PiramideDado } from "@/dal/casos.repo";

// Ordem das faixas: mais velhos no topo, mais jovens na base
const FAIXAS_ORDER = [
  "80+", "70-79", "60-69", "50-59", "40-49",
  "30-39", "18-29", "12-17", "5-11", "0-4",
];

const COR_M = "#1a3a30";
const COR_F = "#C0392B";

interface ChartRow {
  faixa:     string;
  masculino: number;   // negativo para ir à esquerda
  feminino:  number;
  mAbs:      number;   // valor absoluto para tooltip
  fAbs:      number;
}

interface Props {
  dados:   PiramideDado[];
  totalN:  number;
  filtrosLabel: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow;
  return (
    <div className="bg-white border border-[#c5ddd6] rounded-lg shadow-md p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-[#1C1C1C] mb-1.5">Faixa {label}</p>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COR_M }} />
        <span className="text-[#555770]">Masculino</span>
        <span className="ml-auto font-medium">{row.mAbs.toLocaleString("pt-BR")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COR_F }} />
        <span className="text-[#555770]">Feminino</span>
        <span className="ml-auto font-medium">{row.fAbs.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
}

export default function PiramideClient({ dados, totalN, filtrosLabel }: Props) {
  const [mode, setMode] = useState<"abs" | "pct">("abs");

  const totalM = useMemo(() => dados.filter(d => d.sexo === "M").reduce((s, d) => s + d.n, 0), [dados]);
  const totalF = useMemo(() => dados.filter(d => d.sexo === "F").reduce((s, d) => s + d.n, 0), [dados]);
  const razaoMF = totalF > 0 ? (totalM / totalF).toFixed(2) : "—";

  const chartData: ChartRow[] = useMemo(() => {
    return FAIXAS_ORDER.map((faixa) => {
      const mAbs = dados.find(d => d.faixa === faixa && d.sexo === "M")?.n ?? 0;
      const fAbs = dados.find(d => d.faixa === faixa && d.sexo === "F")?.n ?? 0;

      if (mode === "pct") {
        const mPct = totalM > 0 ? (mAbs / totalM) * 100 : 0;
        const fPct = totalF > 0 ? (fAbs / totalF) * 100 : 0;
        return { faixa, masculino: -mPct, feminino: fPct, mAbs, fAbs };
      }
      return { faixa, masculino: -mAbs, feminino: fAbs, mAbs, fAbs };
    });
  }, [dados, mode, totalM, totalF]);

  const maxVal = useMemo(() => {
    if (mode === "pct") {
      return Math.max(...chartData.map(d => Math.max(Math.abs(d.masculino), d.feminino)));
    }
    return Math.max(...chartData.map(d => Math.max(Math.abs(d.masculino), d.feminino)));
  }, [chartData, mode]);

  const tickFormatter = (v: number) => {
    const abs = Math.abs(v);
    if (mode === "pct") return `${abs.toFixed(1)}%`;
    return abs >= 1000 ? `${(abs / 1000).toFixed(0)}k` : String(abs);
  };

  if (dados.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-12 text-center">
        <div className="text-4xl mb-3 opacity-30">▦</div>
        <div className="text-sm font-medium text-[#555770]">Nenhum dado encontrado para os filtros ativos.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#1C1C1C]">Pirâmide Etária</h2>
          <p className="text-xs text-[#555770] mt-0.5">
            N = {totalN.toLocaleString("pt-BR")} · {filtrosLabel}
          </p>
        </div>
        {/* Toggle abs / % */}
        <div className="flex gap-1 bg-[#eaf5f1] rounded-lg p-0.5 shrink-0">
          {(["abs", "pct"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === m
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              {m === "abs" ? "Contagem" : "% por sexo"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Masculino</div>
          <div className="text-lg font-bold text-[#1a3a30]">{totalM.toLocaleString("pt-BR")}</div>
          <div className="text-[10px] text-[#94A3B8]">{totalN > 0 ? ((totalM / totalN) * 100).toFixed(1) : "—"}%</div>
        </div>
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Feminino</div>
          <div className="text-lg font-bold" style={{ color: COR_F }}>{totalF.toLocaleString("pt-BR")}</div>
          <div className="text-[10px] text-[#94A3B8]">{totalN > 0 ? ((totalF / totalN) * 100).toFixed(1) : "—"}%</div>
        </div>
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Razão M/F</div>
          <div className="text-lg font-bold text-[#1C1C1C]">{razaoMF}</div>
          <div className="text-[10px] text-[#94A3B8]">homens por mulher</div>
        </div>
      </div>

      {/* Gráfico */}
      <div>
        {/* Legenda manual (simétrica) */}
        <div className="flex items-center justify-center gap-6 mb-3 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COR_M }} />
            <span className="text-[#555770]">← Masculino</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#555770]">Feminino →</span>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COR_F }} />
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id="grad-pir-m" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={COR_M} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COR_M} stopOpacity={1} />
              </linearGradient>
              <linearGradient id="grad-pir-f" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={COR_F} stopOpacity={1} />
                <stop offset="100%" stopColor={COR_F} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#eaf5f1" />
            <XAxis
              type="number"
              domain={[-maxVal * 1.05, maxVal * 1.05]}
              tickFormatter={tickFormatter}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickCount={9}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="faixa"
              tick={{ fontSize: 11, fill: "#555770" }}
              width={44}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#eaf5f1" }} />
            <Bar dataKey="masculino" fill="url(#grad-pir-m)" radius={[0, 2, 2, 0]} isAnimationActive animationDuration={1300} animationEasing="ease-out" />
            <Bar dataKey="feminino"  fill="url(#grad-pir-f)" radius={[2, 0, 0, 2]} isAnimationActive animationDuration={1300} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Nota metodológica */}
      <p className="text-[10px] text-[#94A3B8]">
        Faixas etárias baseadas em <code>nu_idade_n</code> + <code>tp_idade</code> (SIVEP-Gripe).
        Bebês (dias/meses) incluídos na faixa 0–4. Registros sem idade ou sexo excluídos.
        {mode === "pct" && " Percentual calculado sobre o total de cada sexo."}
      </p>
    </div>
  );
}
