"use client";

import { useState, useMemo, useCallback } from "react";
import { downloadCSV, csvNum } from "@/lib/export-csv";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { PerfilResult } from "@/dal/casos.repo";

const COR_TOTAL = "#1a3a30";
const COR_CURA  = "#16A34A";
const COR_OBITO = "#C0392B";

type Mode = "total" | "desfecho";

interface RowTotal {
  label:  string;
  nota?:  string;
  pct:    number;
  nSim:   number;
  totalN: number;
}

interface RowDesfecho {
  label:     string;
  nota?:     string;
  pctCura:   number;
  pctObito:  number;
  nCura:     number;
  nObito:    number;
  delta:     number;  // pctObito - pctCura
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipTotal({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as RowTotal;
  return (
    <div className="bg-white border border-[#c5ddd6] rounded-lg shadow-md p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-[#1C1C1C] mb-1.5">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-[#555770]">Prevalência</span>
        <span className="font-bold text-[#1a3a30]">{d.pct.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between gap-4 text-[#94A3B8]">
        <span>Casos</span>
        <span>{d.nSim.toLocaleString("pt-BR")} / {d.totalN.toLocaleString("pt-BR")}</span>
      </div>
      {d.nota && <p className="mt-1.5 text-amber-600 text-[10px]">⚠ {d.nota}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipDesfecho({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as RowDesfecho;
  const deltaPos = d.delta > 0;
  return (
    <div className="bg-white border border-[#c5ddd6] rounded-lg shadow-md p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-[#1C1C1C] mb-1.5">{label}</p>
      <div className="flex justify-between gap-4 mb-0.5">
        <span style={{ color: COR_CURA }}>● Cura</span>
        <span className="font-medium">{d.pctCura.toFixed(1)}% ({d.nCura.toLocaleString("pt-BR")})</span>
      </div>
      <div className="flex justify-between gap-4 mb-1.5">
        <span style={{ color: COR_OBITO }}>● Óbito</span>
        <span className="font-medium">{d.pctObito.toFixed(1)}% ({d.nObito.toLocaleString("pt-BR")})</span>
      </div>
      <div className={`text-[10px] font-semibold ${deltaPos ? "text-red-600" : "text-green-700"}`}>
        {deltaPos ? "▲" : "▼"} {Math.abs(d.delta).toFixed(1)} p.p. {deltaPos ? "mais em óbitos" : "mais em curas"}
      </div>
      {d.nota && <p className="mt-1.5 text-amber-600 text-[10px]">⚠ {d.nota}</p>}
    </div>
  );
}

interface Props {
  resultado:    PerfilResult;
  filtrosLabel: string;
}

export default function PerfilClient({ resultado, filtrosLabel }: Props) {
  const [mode, setMode] = useState<Mode>("total");

  const { sintomas, totalN, totalCura, totalObito } = resultado;

  // ── Modo Total ──────────────────────────────────────────────────────────────
  const dadosTotal = useMemo<RowTotal[]>(() => {
    return sintomas
      .map(s => ({
        label:  s.label,
        nota:   s.nota,
        pct:    totalN > 0 ? (s.nSim / totalN) * 100 : 0,
        nSim:   s.nSim,
        totalN,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [sintomas, totalN]);

  // ── Modo Por Desfecho ───────────────────────────────────────────────────────
  const dadosDesfecho = useMemo<RowDesfecho[]>(() => {
    return sintomas
      .map(s => {
        const pctCura  = totalCura  > 0 ? (s.nCura  / totalCura)  * 100 : 0;
        const pctObito = totalObito > 0 ? (s.nObito / totalObito) * 100 : 0;
        return {
          label:    s.label,
          nota:     s.nota,
          pctCura,
          pctObito,
          nCura:    s.nCura,
          nObito:   s.nObito,
          delta:    pctObito - pctCura,
        };
      })
      // Ordena pelo maior diferencial absoluto (sintomas mais discriminantes primeiro)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [sintomas, totalCura, totalObito]);

  const hasDesfecho = totalCura > 0 || totalObito > 0;

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const rows: (string | number | null)[][] = [];

    // Metadados
    rows.push(["SivepLens — Perfil Sintomatológico"]);
    rows.push(["Gerado em", new Date().toLocaleString("pt-BR")]);
    rows.push(["Filtros", filtrosLabel]);
    rows.push([]);
    rows.push(["N total", totalN]);
    rows.push(["N curados", totalCura]);
    rows.push(["N óbitos", totalObito]);
    rows.push(["Letalidade (%)", totalN > 0 ? csvNum((totalObito / totalN) * 100, 2) : ""]);
    rows.push([]);

    // Tabela prevalência total (ordenada por pct desc)
    rows.push(["PREVALÊNCIA TOTAL"]);
    rows.push(["Sintoma / Sinal", "N Sim", "N Total", "Prevalência (%)"]);
    for (const r of dadosTotal) {
      rows.push([r.label, r.nSim, r.totalN, csvNum(r.pct, 2)]);
    }
    rows.push([]);

    // Tabela por desfecho (Cura × Óbito), se disponível
    if (hasDesfecho) {
      rows.push(["CURA × ÓBITO (ordenado por maior diferencial)"]);
      rows.push(["Sintoma / Sinal", "N Cura", "N Óbito", "% Cura", "% Óbito", "Δ (p.p.)"]);
      for (const r of dadosDesfecho) {
        rows.push([r.label, r.nCura, r.nObito, csvNum(r.pctCura, 2), csvNum(r.pctObito, 2), csvNum(r.delta, 2)]);
      }
      rows.push([]);
    }

    rows.push(["NOTA", "Prevalência calculada sobre total de casos filtrados (inclui sem sintoma declarado). Dados: SIVEP-Gripe / OpenDataSUS via SivepLens."]);

    downloadCSV(`perfil-sintomatologico-${filtrosLabel.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-")}`, rows);
  }, [dadosTotal, dadosDesfecho, hasDesfecho, totalN, totalCura, totalObito, filtrosLabel]);

  if (totalN === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-12 text-center">
        <div className="text-4xl mb-3 opacity-30">☰</div>
        <div className="text-sm font-medium text-[#555770]">Nenhum dado para os filtros ativos.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#1C1C1C]">Perfil Sintomatológico</h2>
          <p className="text-xs text-[#555770] mt-0.5">
            N = {totalN.toLocaleString("pt-BR")} · {filtrosLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Toggle de modo */}
          <div className="flex gap-1 bg-[#eaf5f1] rounded-lg p-0.5">
            <button
              onClick={() => setMode("total")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === "total"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              Prevalência total
            </button>
            <button
              onClick={() => setMode("desfecho")}
              disabled={!hasDesfecho}
              title={!hasDesfecho ? "Sem dados de desfecho suficientes" : undefined}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === "desfecho"
                  ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                  : "text-[#555770] hover:text-[#1a3a30]"
              }`}
            >
              Cura × Óbito
            </button>
          </div>

          {/* Exportar */}
          <button
            onClick={handleExport}
            title="Exportar perfil sintomatológico como CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3" />
              <path d="M3 12h10" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Total</div>
          <div className="text-lg font-bold text-[#1C1C1C]">{totalN.toLocaleString("pt-BR")}</div>
          <div className="text-[10px] text-[#94A3B8]">casos</div>
        </div>
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Sintoma mais prevalente</div>
          <div className="text-sm font-bold text-[#1a3a30] truncate">{dadosTotal[0]?.label ?? "—"}</div>
          <div className="text-[10px] text-[#94A3B8]">{dadosTotal[0]?.pct.toFixed(1) ?? "—"}%</div>
        </div>
        <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] px-4 py-3 text-center">
          <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">
            {mode === "desfecho" ? "Maior diferencial" : "Cura / Óbito"}
          </div>
          {mode === "desfecho" ? (
            <>
              <div className="text-sm font-bold text-[#1C1C1C] truncate">{dadosDesfecho[0]?.label ?? "—"}</div>
              <div className={`text-[10px] font-semibold ${(dadosDesfecho[0]?.delta ?? 0) > 0 ? "text-red-600" : "text-green-700"}`}>
                Δ {Math.abs(dadosDesfecho[0]?.delta ?? 0).toFixed(1)} p.p.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-[#1C1C1C]">
                {totalCura.toLocaleString("pt-BR")} / {totalObito.toLocaleString("pt-BR")}
              </div>
              <div className="text-[10px] text-[#94A3B8]">
                {totalN > 0 ? ((totalObito / totalN) * 100).toFixed(1) : "—"}% letalidade
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legenda do modo desfecho */}
      {mode === "desfecho" && (
        <div className="flex items-center gap-5 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COR_CURA }} />
            <span className="text-[#555770]">Cura ({totalCura.toLocaleString("pt-BR")} casos)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COR_OBITO }} />
            <span className="text-[#555770]">Óbito ({totalObito.toLocaleString("pt-BR")} casos)</span>
          </div>
          <span className="text-[#94A3B8] text-[10px]">ordenado pelo maior diferencial</span>
        </div>
      )}

      {/* Gráfico */}
      {mode === "total" ? (
        <ResponsiveContainer width="100%" height={370}>
          <BarChart
            layout="vertical"
            data={dadosTotal}
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            barCategoryGap="25%"
          >
            <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#eaf5f1" />
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
              dataKey="label"
              tick={{ fontSize: 11, fill: "#555770" }}
              width={150}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TooltipTotal />} cursor={{ fill: "#eaf5f1" }} />
            <Bar dataKey="pct" radius={[0, 3, 3, 0]} isAnimationActive animationDuration={1300} animationEasing="ease-out">
              {dadosTotal.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.nota ? "#F59E0B" : COR_TOTAL}
                  fillOpacity={1 - i * 0.04}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            layout="vertical"
            data={dadosDesfecho}
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            barCategoryGap="20%"
            barGap={2}
          >
            <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#eaf5f1" />
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
              dataKey="label"
              tick={{ fontSize: 11, fill: "#555770" }}
              width={150}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TooltipDesfecho />} cursor={{ fill: "#eaf5f1" }} />
            <Bar dataKey="pctCura"  name="Cura"  fill={COR_CURA}  radius={[0, 3, 3, 0]} isAnimationActive animationDuration={1300} animationEasing="ease-out" />
            <Bar dataKey="pctObito" name="Óbito" fill={COR_OBITO} radius={[0, 3, 3, 0]} isAnimationActive animationDuration={1300} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Notas */}
      <div className="space-y-1.5 text-[10px] text-[#94A3B8]">
        <p>Prevalência calculada sobre o total de casos filtrados (N = {totalN.toLocaleString("pt-BR")}), incluindo registros sem sintoma declarado.</p>
        {sintomas.some(s => s.nota) && (
          <p className="text-amber-600">⚠ Sintomas marcados em amarelo são específicos de COVID-19 — prevalência baixa em outros anos/etiologias.</p>
        )}
        {mode === "desfecho" && (
          <p>Percentual de desfecho calculado separadamente: % de curados com o sintoma vs % de óbitos com o sintoma.</p>
        )}
      </div>
    </div>
  );
}
