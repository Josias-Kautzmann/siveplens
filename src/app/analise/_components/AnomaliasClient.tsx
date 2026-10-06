"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import { VALIDATION_COHORTS } from "@/lib/scientific-validation";
import type { PontoCurva } from "@/dal/casos.repo";
import { analisarSerieTemporal, type PontoAnalise } from "@/services/anomaly-detector";
import { downloadCSV, csvNum } from "@/lib/export-csv";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { ChartTooltip, AreaGradient, GRID_PROPS, AXIS_PROPS } from "@/app/_components/charts/ChartKit";

// ── Catálogos ───────────────────────────────────────────────────────────────

type MetricId = "total" | "obitos" | "sars2" | "flu_a" | "flu_b" | "vsr" | "rino" | "metap";

const METRICS: { id: MetricId; label: string }[] = [
  { id: "total",  label: "Total de casos"   },
  { id: "obitos", label: "Óbitos"           },
  { id: "sars2",  label: "SARS-CoV-2"       },
  { id: "flu_a",  label: "Influenza A"      },
  { id: "flu_b",  label: "Influenza B"      },
  { id: "vsr",    label: "VSR"              },
  { id: "rino",   label: "Rinovírus"        },
  { id: "metap",  label: "Metapneumovírus"  },
];

const JANELAS    = [3, 4, 6, 8];
const LIMIARES   = [1.5, 2, 2.5, 3];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function filtrosLabel(f: FiltrosSRAG): string {
  const parts: string[] = [];
  if (f.ano_epi)            parts.push(String(f.ano_epi));
  if (f.anos_epi?.length)   parts.push(f.anos_epi.join(", "));
  if (f.semana_epi)         parts.push(`Semana ${f.semana_epi}`);
  if (f.sg_uf?.length)      parts.push(`UF: ${f.sg_uf.join(", ")}`);
  if (f.co_mun_res?.length) parts.push(`Mun.: ${f.co_mun_res.join(", ")}`);
  if (f.cs_sexo)            parts.push(`Sexo: ${f.cs_sexo}`);
  if (f.faixa_etaria)       parts.push(`Faixa: ${f.faixa_etaria}`);
  if (f.etiologia?.length)  parts.push(`Etio: ${f.etiologia.join(", ")}`);
  if (f.coorte_validacao)   parts.push(`Coorte: ${VALIDATION_COHORTS[f.coorte_validacao].label}`);
  return parts.length ? parts.join(" · ") : "Brasil — todos os dados";
}

// ── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? "border-[#f0c9a0] bg-[#fdf6ee]" : "border-[#E4E7EC] bg-white"}`}>
      <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-0.5 leading-tight">{label}</div>
      <div className={`text-lg font-bold leading-tight tabular-nums ${accent ? "text-[#b45309]" : "text-[#1C1C1C]"}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Gráfico (Recharts — área com gradiente) ──────────────────────────────────

function SerieChart({ analise, metricLabel }: { analise: PontoAnalise[]; metricLabel: string }) {
  const data = analise.map((p) => ({
    label:        p.label,
    valor:        p.valor,
    esperado:     isFinite(p.esperado)  ? Math.round(p.esperado)  : null,
    limiteSup:    isFinite(p.limiteSup) ? Math.round(p.limiteSup) : null,
    anomVal:      p.isAnomaly ? p.valor : null,
    zScore:       p.zScore,
    temHistorico: p.temHistorico,
  }));
  const step = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <AreaGradient id="grad-anom" color="#1a3a30" opacity={0.22} />
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" interval={step} minTickGap={12} {...AXIS_PROPS} />
          <YAxis
            width={42}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            {...AXIS_PROPS}
          />
          <Tooltip
            cursor={{ stroke: "#c5ddd6", strokeWidth: 1 }}
            content={
              <ChartTooltip
                filter={(e) => e.dataKey === "valor"}
                nameFormatter={() => metricLabel}
                footer={(label) => {
                  const p = data.find((d) => d.label === label);
                  if (!p) return null;
                  return (
                    <div className="space-y-0.5 text-[11px]">
                      {p.esperado != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-[#94A3B8]">Esperado</span>
                          <span className="tabular-nums text-[#555770]">≈ {p.esperado.toLocaleString("pt-BR")}</span>
                        </div>
                      )}
                      {p.temHistorico && (
                        <div className="flex justify-between gap-4">
                          <span className="text-[#94A3B8]">z-score</span>
                          <span className="tabular-nums text-[#555770]">{p.zScore.toFixed(1)}</span>
                        </div>
                      )}
                      {p.anomVal != null && <div className="text-[#dc2626] font-semibold">⚠ Pico atípico</div>}
                    </div>
                  );
                }}
              />
            }
          />
          <Area type="monotone" dataKey="valor" name={metricLabel} stroke="#1a3a30" strokeWidth={1.8}
                fill="url(#grad-anom)" dot={false} activeDot={{ r: 3 }}
                isAnimationActive animationDuration={1400} animationEasing="ease-out" />
          <Line type="monotone" dataKey="esperado" name="Esperado" stroke="#94A3B8" strokeWidth={1.2}
                strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="limiteSup" name="Limiar" stroke="#d97706" strokeWidth={1.2}
                strokeDasharray="2 3" dot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="anomVal" name="Pico" stroke="none"
                dot={{ r: 4, fill: "#dc2626", stroke: "#fff", strokeWidth: 1.2 }}
                isAnimationActive={false} connectNulls={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 mt-2 px-2 text-[10px] text-[#555770]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-[#1a3a30]" /> {metricLabel}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-[#94A3B8]" /> Esperado (média móvel)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-[#d97706]" /> Limiar de anomalia</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#dc2626]" /> Pico atípico</span>
      </div>
    </>
  );
}

// ── Barra de severidade ───────────────────────────────────────────────────────

function SeverityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#E4E7EC] overflow-hidden min-w-[48px]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#dc2626]" style={{ width: `${Math.max(8, pct)}%` }} />
      </div>
      <span className="text-[10px] text-[#94A3B8] tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Segmented control ─────────────────────────────────────────────────────────

function Segmented<T extends string | number>({ options, active, onChange, fmtOpt }: {
  options: readonly T[]; active: T; onChange: (v: T) => void; fmtOpt?: (v: T) => string;
}) {
  return (
    <div className="flex gap-1 bg-[#eaf5f1] rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            active === o ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]" : "text-[#555770] hover:text-[#1a3a30]"
          }`}
        >
          {fmtOpt ? fmtOpt(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AnomaliasClient({ serie, filtros }: { serie: PontoCurva[]; filtros: FiltrosSRAG }) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [metric, setMetric] = useState<MetricId>(() => {
    const m = searchParams.get("m");
    return (METRICS.some((x) => x.id === m) ? m : "total") as MetricId;
  });
  const [janela, setJanela] = useState<number>(() => {
    const w = Number(searchParams.get("w"));
    return JANELAS.includes(w) ? w : 4;
  });
  const [limiar, setLimiar] = useState<number>(() => {
    const z = Number(searchParams.get("z"));
    return LIMIARES.includes(z) ? z : 2;
  });
  const [linkCopied, setLinkCopied] = useState(false);

  // Reflete os controles na URL (preservando os filtros do FilterBar) → link compartilhável
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (metric === "total") params.delete("m"); else params.set("m", metric);
    if (janela === 4)       params.delete("w"); else params.set("w", String(janela));
    if (limiar === 2)       params.delete("z"); else params.set("z", String(limiar));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, janela, limiar]);

  const copiarLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); })
      .catch(() => {});
  }, []);

  // Série ordenada e mapeada para a métrica escolhida
  const pontos = useMemo(() => {
    return serie
      .filter((r) => r.ano_epi != null && r.sem_not != null)
      .map((r) => ({
        anoEpi:    Number(r.ano_epi),
        semanaEpi: Number(r.sem_not),
        valor:     Number(r[metric] ?? 0),
      }))
      .sort((a, b) => a.anoEpi - b.anoEpi || a.semanaEpi - b.semanaEpi);
  }, [serie, metric]);

  const analise = useMemo(
    () => analisarSerieTemporal(pontos, janela, limiar),
    [pontos, janela, limiar],
  );

  const anomalias    = useMemo(() => analise.filter((p) => p.isAnomaly), [analise]);
  const nComHist     = analise.filter((p) => p.temHistorico).length;
  const maiorPico    = anomalias.reduce<PontoAnalise | null>((max, p) => (!max || p.zScore > max.zScore ? p : max), null);
  const metricLabel  = METRICS.find((m) => m.id === metric)!.label;

  const handleExport = useCallback(() => {
    const rows: (string | number | null)[][] = [];
    rows.push(["SivepLens — Explorador de Anomalias"]);
    rows.push(["Gerado em", new Date().toLocaleString("pt-BR")]);
    rows.push(["Métrica", metricLabel]);
    rows.push(["Janela (média móvel)", `${janela} semanas`]);
    rows.push(["Sensibilidade (limiar z)", csvNum(limiar, 1)]);
    rows.push(["Filtros", filtrosLabel(filtros)]);
    rows.push(["Anomalias detectadas", anomalias.length]);
    rows.push([]);
    rows.push(["Semana", "Ano", "Observado", "Esperado", "DP", "z-score", "Limite superior", "Anomalia"]);
    for (const p of analise) {
      rows.push([
        p.semanaEpi, p.anoEpi, p.valor,
        isFinite(p.esperado) ? csvNum(p.esperado, 1) : "",
        isFinite(p.desvioPadrao) ? csvNum(p.desvioPadrao, 1) : "",
        p.temHistorico ? csvNum(p.zScore, 2) : "",
        isFinite(p.limiteSup) ? csvNum(p.limiteSup, 1) : "",
        p.isAnomaly ? "SIM" : "",
      ]);
    }
    rows.push([]);
    rows.push(["NOTA", `Detecção exploratória por z-score sobre média móvel de ${janela} semanas. Pico marcado quando z > ${limiar}. Dados: SIVEP-Gripe / OpenDataSUS via SivepLens.`]);
    downloadCSV(`anomalias-${metric}-janela${janela}-z${limiar}`, rows);
  }, [analise, anomalias.length, metric, metricLabel, janela, limiar, filtros]);

  const semDados = pontos.length === 0;
  const semHistorico = !semDados && nComHist === 0;

  return (
    <div className="space-y-6">

      {/* Controles */}
      <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <label htmlFor="metric" className="block text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-1.5">Métrica</label>
          <select
            id="metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricId)}
            className="px-3 py-2 text-sm border border-[#c5ddd6] rounded-lg bg-white text-[#1C1C1C] focus:outline-none focus:ring-2 focus:ring-[#1a3a30] cursor-pointer"
          >
            {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-1.5">Janela (média móvel)</div>
          <Segmented options={JANELAS} active={janela} onChange={setJanela} fmtOpt={(v) => `${v} sem`} />
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-1.5">
            Sensibilidade <span className="font-normal normal-case text-[#94A3B8]">(menor = mais sensível)</span>
          </div>
          <Segmented options={LIMIARES} active={limiar} onChange={setLimiar} fmtOpt={(v) => `z > ${v}`} />
        </div>
      </div>

      {semDados ? (
        <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-12 text-center">
          <div className="text-4xl mb-3 opacity-30">Λ</div>
          <div className="text-sm font-medium text-[#555770]">Nenhum dado para os filtros atuais</div>
          <div className="text-xs text-[#94A3B8] mt-2">Ajuste os filtros do painel para carregar uma série temporal.</div>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Semanas analisadas" value={fmt(nComHist)} sub={`${fmt(analise.length)} no total · janela ${janela}`} />
            <StatCard label="Anomalias detectadas" value={fmt(anomalias.length)} sub={`z > ${limiar}`} accent={anomalias.length > 0} />
            <StatCard
              label="Maior pico"
              value={maiorPico ? maiorPico.label : "—"}
              sub={maiorPico ? `${fmt(maiorPico.valor)} casos · z = ${maiorPico.zScore.toFixed(1)}` : "nenhum pico"}
              accent={!!maiorPico}
            />
            <StatCard label="Métrica" value={metricLabel} sub={filtrosLabel(filtros)} />
          </div>

          {/* Gráfico */}
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-sm font-bold text-[#1C1C1C]">Série temporal · {metricLabel}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={copiarLink}
                  title="Copiar link desta análise"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6.5 9.5l3-3M7 4.3l.9-.9a2.4 2.4 0 0 1 3.4 3.4l-.9.9M9 11.7l-.9.9a2.4 2.4 0 0 1-3.4-3.4l.9-.9" />
                  </svg>
                  {linkCopied ? "Copiado!" : "Copiar link"}
                </button>
                <button
                  onClick={handleExport}
                  title="Exportar série e anomalias como CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3" /><path d="M3 12h10" />
                  </svg>
                  Exportar CSV
                </button>
              </div>
            </div>
            {semHistorico ? (
              <div className="text-center py-10 text-sm text-[#555770]">
                Série muito curta para a janela de {janela} semanas. Reduza a janela ou amplie o período nos filtros.
              </div>
            ) : (
              <SerieChart analise={analise} metricLabel={metricLabel} />
            )}
          </div>

          {/* Tabela de anomalias */}
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
            <h3 className="text-sm font-bold text-[#1C1C1C] mb-4">
              Anomalias detectadas {anomalias.length > 0 && <span className="text-[#94A3B8] font-normal">· {anomalias.length}</span>}
            </h3>
            {anomalias.length === 0 ? (
              <p className="text-sm text-[#555770] py-4">
                Nenhum pico atípico com o limiar atual (z &gt; {limiar}). Aumente a sensibilidade reduzindo o limiar para detectar desvios menores.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#E4E7EC] text-left">
                      <th className="py-2 pr-3 font-bold text-[#555770] uppercase tracking-wider text-[10px]">Semana</th>
                      <th className="py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px] text-right">Observado</th>
                      <th className="py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px] text-right">Esperado</th>
                      <th className="py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px] text-right">z-score</th>
                      <th className="py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px] w-40">Severidade</th>
                      <th className="py-2 pl-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">Interpretação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalias.map((p, i) => (
                      <tr key={i} className={`border-b border-[#eaf5f1] ${i % 2 !== 0 ? "bg-[#fafbfa]" : ""}`}>
                        <td className="py-2 pr-3 font-semibold text-[#1C1C1C] whitespace-nowrap">{p.label}</td>
                        <td className="py-2 px-2 text-right font-bold text-[#dc2626] tabular-nums">{fmt(p.valor)}</td>
                        <td className="py-2 px-2 text-right text-[#555770] tabular-nums">≈ {fmt(Math.round(p.esperado))}</td>
                        <td className="py-2 px-2 text-right font-semibold text-[#b45309] tabular-nums">{p.zScore.toFixed(1)}</td>
                        <td className="py-2 px-2"><SeverityBar value={p.severidade} /></td>
                        <td className="py-2 pl-2 text-[#555770] leading-snug min-w-[220px]">{p.explicacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-[#94A3B8] mt-4 leading-relaxed border-t border-[#eaf5f1] pt-3">
              Método: z-score causal sobre média móvel das {janela} semanas anteriores (apenas o passado de cada ponto é usado).
              Quedas não são marcadas como anomalia — em vigilância costumam refletir atraso de notificação.
              As semanas mais recentes podem estar subnotificadas. Dados: SIVEP-Gripe / OpenDataSUS.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
