"use client";

import ProvenanceNotice from "./ProvenanceNotice";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CATEGORICAL_VARIABLES,
  type CategoricalResult,
  type CategoricalVariable,
  type DescriptiveResult,
  type HistogramBin,
  type CategoryFrequency,
} from "@/lib/descriptive-catalog";
import {
  CLASSIFICACOES,
  EVOLUCOES,
  PATOGENOS,
  serializeCriteriaParam,
  type CampoCriterio,
  type CriterioCodificado,
  type FiltrosSRAG,
} from "@/lib/filter-utils";
import { AXIS_PROPS, GRID_PROPS } from "@/app/_components/charts/ChartKit";
import { VALIDATION_COHORTS } from "@/lib/scientific-validation";

type Mode = "numerica" | "categorica";

interface Props {
  mode: Mode;
  selectedVariable: "idade_anos" | CategoricalVariable;
  filters: FiltrosSRAG;
  numericResult?: DescriptiveResult;
  categoricalResult?: CategoricalResult;
}

const CLINICAL_FILTERS: Array<{ field: CampoCriterio; label: string; group: string }> = [
  { field: "diabetes", label: "Diabetes", group: "Comorbidade" },
  { field: "obesidade", label: "Obesidade", group: "Comorbidade" },
  { field: "cardiopati", label: "Cardiopatia", group: "Comorbidade" },
  { field: "hospital", label: "Hospitalização", group: "Assistência" },
  { field: "uti", label: "UTI", group: "Assistência" },
  { field: "dispneia", label: "Dispneia", group: "Sintoma" },
  { field: "saturacao", label: "Saturação < 95%", group: "Sintoma" },
  { field: "vacina_cov", label: "Vacina COVID-19", group: "Vacinação" },
];

const CRITERIA_LABELS = Object.fromEntries(CLINICAL_FILTERS.map((item) => [item.field, item.label]));
const CATEGORY_COLORS = ["#1a3a30", "#256b58", "#3c8f76", "#62ab92", "#8fc6b3", "#0E7490", "#D97706", "#7C3AED"];

const PRESETS = [
  {
    id: "idade-obitos-diabetes-covid",
    title: "Idade dos óbitos com diabetes e COVID-19",
    description: "Resumo numérico completo",
    params: { modo: "numerica", variavel: "idade_anos", classi: "5", evolucao: "2", criterios: "diabetes:1" },
  },
  {
    id: "desfechos-covid",
    title: "Desfechos dos casos de COVID-19",
    description: "Frequências de evolução",
    params: { modo: "categorica", variavel: "evolucao", classi: "5" },
  },
  {
    id: "idades-uti",
    title: "Faixas etárias entre internações em UTI",
    description: "Distribuição por idade",
    params: { modo: "categorica", variavel: "faixa_etaria", criterios: "uti:1" },
  },
  {
    id: "covid-uf",
    title: "Casos de COVID-19 por UF",
    description: "Panorama territorial",
    params: { modo: "categorica", variavel: "sg_uf", classi: "5", uf: null, mun: null },
  },
] as const;

function formatNumber(value: number | null, maximumFractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function compactNumber(value: number): string {
  return Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-4 shadow-sm ${accent ? "bg-[#153a30] border-[#153a30]" : "bg-white border-[#c5ddd6]"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.12em] ${accent ? "text-[#a8d5c7]" : "text-[#667085]"}`}>{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${accent ? "text-white" : "text-[#182230]"}`}>{value}</div>
      <div className={`text-[10px] mt-1 ${accent ? "text-[#b9d9cf]" : "text-[#98A2B3]"}`}>{note}</div>
    </div>
  );
}

function HistogramTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistogramBin }> }) {
  if (!active || !payload?.length) return null;
  const bin = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#c5ddd6] bg-white/95 px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-[#0f2820]">{bin.label} anos</div>
      <div className="mt-1 text-[#555770]">{bin.count.toLocaleString("pt-BR")} registros · {bin.pctValid.toFixed(1)}%</div>
    </div>
  );
}

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategoryFrequency }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#c5ddd6] bg-white/95 px-3 py-2 shadow-lg text-xs min-w-44">
      <div className="font-semibold text-[#0f2820]">{row.label}</div>
      <div className="mt-1 text-[#555770]">{row.count.toLocaleString("pt-BR")} registros</div>
      <div className="text-[#667085]">{row.pctValid.toFixed(1)}% dos valores válidos</div>
    </div>
  );
}

function SuppressedState({ minimum }: { minimum: number }) {
  return (
    <div className="rounded-xl border border-[#F3D5A0] bg-[#FFF8E8] px-6 py-8 text-center">
      <div className="text-3xl mb-2">◉</div>
      <h2 className="text-sm font-semibold text-[#7A4D05]">Resultado protegido</h2>
      <p className="text-xs text-[#8B651F] mt-1 max-w-xl mx-auto">
        A coorte contém menos de {minimum} notificações. Contagens e estatísticas foram suprimidas para reduzir o risco de divulgação em recortes pequenos.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-[#c5ddd6] bg-white px-6 py-10 text-center">
      <div className="text-4xl opacity-30 mb-2">∅</div>
      <h2 className="text-sm font-semibold text-[#344054]">Nenhuma notificação encontrada</h2>
      <p className="text-xs text-[#667085] mt-1">Revise ou remova alguns filtros para ampliar a coorte.</p>
    </div>
  );
}

export default function DescritivaClient({ mode, selectedVariable, filters, numericResult, categoricalResult }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [copyLabel, setCopyLabel] = useState("Copiar link");

  const result = mode === "numerica" ? numericResult : categoricalResult;
  const manifest = result?.manifest;
  const summary = result?.summary;

  const clinicalCriteria = useMemo(() => filters.criterios ?? [], [filters.criterios]);
  const activeCriteria = useMemo(() => new Set(
    clinicalCriteria.filter((criterion) => criterion.valores.includes(1)).map((criterion) => criterion.campo),
  ), [clinicalCriteria]);

  function navigate(mutator: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutator(next);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  function setMode(nextMode: Mode) {
    navigate((next) => {
      next.set("modo", nextMode);
      next.set("variavel", nextMode === "numerica" ? "idade_anos" : "evolucao");
    });
  }

  function setVariable(variable: string) {
    navigate((next) => next.set("variavel", variable));
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    navigate((next) => {
      ["modo", "variavel", "classi", "evolucao", "criterios", "faixa", "sexo", "etio"].forEach((key) => next.delete(key));
      Object.entries(preset.params).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
    });
  }

  function toggleCriterion(field: CampoCriterio) {
    const nextCriteria: CriterioCodificado[] = activeCriteria.has(field)
      ? clinicalCriteria.filter((criterion) => criterion.campo !== field)
      : [...clinicalCriteria.filter((criterion) => criterion.campo !== field), { campo: field, valores: [1] }];
    navigate((next) => {
      const encoded = serializeCriteriaParam(nextCriteria);
      if (encoded) next.set("criterios", encoded);
      else next.delete("criterios");
    });
  }

  function removeCriterion(field: CampoCriterio) {
    const nextCriteria = clinicalCriteria.filter((criterion) => criterion.campo !== field);
    navigate((next) => {
      const encoded = serializeCriteriaParam(nextCriteria);
      if (encoded) next.set("criterios", encoded);
      else next.delete("criterios");
    });
  }

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; criterion?: CampoCriterio }> = [];
    const years = filters.anos_epi ?? (filters.ano_epi ? [filters.ano_epi] : []);
    if (years.length) chips.push({ key: "anos", label: `Ano: ${years.join(", ")}` });
    if (filters.sg_uf?.length) chips.push({ key: "uf", label: `UF: ${filters.sg_uf.join(", ")}` });
    if (filters.co_mun_res?.length) chips.push({ key: "mun", label: `${filters.co_mun_res.length} município(s)` });
    if (filters.cs_sexo) chips.push({ key: "sexo", label: `Sexo: ${filters.cs_sexo === "F" ? "Feminino" : filters.cs_sexo === "M" ? "Masculino" : "Ignorado"}` });
    if (filters.faixa_etaria) chips.push({ key: "faixa", label: `Idade: ${filters.faixa_etaria}` });
    if (filters.classi_fin?.length) {
      const labels = filters.classi_fin.map((value) => CLASSIFICACOES.find((item) => item.id === value)?.label ?? value).join(", ");
      chips.push({ key: "classi", label: `Classificação: ${labels}` });
    }
    if (filters.evolucao?.length) {
      const labels = filters.evolucao.map((value) => EVOLUCOES.find((item) => item.id === value)?.label ?? value).join(", ");
      chips.push({ key: "evolucao", label: `Evolução: ${labels}` });
    }
    if (filters.etiologia?.length) {
      const labels = filters.etiologia.map((value) => PATOGENOS.find((item) => item.id === value)?.label ?? value).join(", ");
      chips.push({ key: "etio", label: `Etiologia: ${labels}` });
    }
    if (filters.data_ini || filters.data_fim) chips.push({ key: "periodo", label: `Período: ${filters.data_ini ?? "…"} a ${filters.data_fim ?? "…"}` });
    clinicalCriteria.forEach((criterion) => chips.push({
      key: "criterios",
      criterion: criterion.campo,
      label: `${CRITERIA_LABELS[criterion.campo] ?? criterion.campo}: sim`,
    }));
    if (filters.coorte_validacao) chips.push({
      key: "coorte",
      label: `Coorte: ${VALIDATION_COHORTS[filters.coorte_validacao].label}`,
    });
    if (filters.semana_epi) chips.push({
      key: "semana",
      label: `Semana epidemiológica: ${filters.semana_epi}`,
    });
    return chips;
  }, [clinicalCriteria, filters]);

  function removeChip(chip: typeof filterChips[number]) {
    if (chip.criterion) {
      removeCriterion(chip.criterion);
      return;
    }
    navigate((next) => {
      if (chip.key === "anos") {
        next.delete("anos");
        next.delete("ano");
      } else if (chip.key === "periodo") {
        next.delete("data_ini");
        next.delete("data_fim");
      } else {
        next.delete(chip.key);
      }
    });
  }

  function exportJson() {
    if (!result) return;
    download(`siveplens-descritiva-${manifest?.analysisId ?? "analise"}.json`, JSON.stringify(result, null, 2), "application/json;charset=utf-8");
  }

  function exportCsv() {
    if (!result) return;
    let lines: string[];
    if (mode === "categorica" && categoricalResult) {
      lines = [
        "categoria;contagem;percentual_validos;percentual_populacao",
        ...categoricalResult.summary.categories.map((row) => [row.label, row.count, row.pctValid.toFixed(4), row.pctPopulation.toFixed(4)].map(csvEscape).join(";")),
      ];
    } else if (numericResult) {
      const numeric = numericResult.summary;
      lines = [
        "metrica;valor",
        ["populacao_n", numeric.populationN].map(csvEscape).join(";"),
        ["validos_n", numeric.validN].map(csvEscape).join(";"),
        ["ausentes_n", numeric.missingN].map(csvEscape).join(";"),
        ["media", numeric.mean].map(csvEscape).join(";"),
        ["desvio_padrao", numeric.stdDev].map(csvEscape).join(";"),
        ["mediana", numeric.median].map(csvEscape).join(";"),
        ["q1", numeric.q1].map(csvEscape).join(";"),
        ["q3", numeric.q3].map(csvEscape).join(";"),
        ["minimo", numeric.min].map(csvEscape).join(";"),
        ["maximo", numeric.max].map(csvEscape).join(";"),
        "",
        "faixa;contagem;percentual_validos",
        ...numericResult.histogram.map((bin) => [bin.label, bin.count, bin.pctValid.toFixed(4)].map(csvEscape).join(";")),
      ];
    } else return;
    download(`siveplens-descritiva-${manifest?.analysisId ?? "analise"}.csv`, `\uFEFF${lines.join("\n")}`, "text/csv;charset=utf-8");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const input = document.createElement("textarea");
      input.value = window.location.href;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopyLabel("Link copiado");
    window.setTimeout(() => setCopyLabel("Copiar link"), 1800);
  }

  return (
    <div className={`space-y-5 transition-opacity ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      <section className="relative overflow-hidden rounded-2xl border border-[#b8d7cd] bg-gradient-to-br from-[#102b23] via-[#173d32] to-[#1c5948] text-white shadow-lg">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fd0ba]">Exploração foundation-first</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">Entenda a coorte antes de modelar</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#c6e2d8]">
                Estatísticas, frequências, ausências e proveniência sobre os microdados filtrados — sem expor registros individuais.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyLink} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">{copyLabel}</button>
              <button onClick={exportCsv} disabled={!result} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20 disabled:opacity-40">CSV</button>
              <button onClick={exportJson} disabled={!result} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#173d32] hover:bg-[#e8f5f0] disabled:opacity-40">JSON + manifesto</button>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PRESETS.map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)} className="rounded-xl border border-white/12 bg-white/[0.07] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.13]">
                <span className="block text-xs font-semibold text-white">{preset.title}</span>
                <span className="mt-1 block text-[10px] text-[#9dcbbb]">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#c5ddd6] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#e3f0ec] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-fit rounded-lg bg-[#eaf5f1] p-1">
            <button onClick={() => setMode("numerica")} className={`rounded-md px-4 py-2 text-xs font-semibold transition ${mode === "numerica" ? "bg-white text-[#153a30] shadow-sm" : "text-[#5b7169] hover:text-[#153a30]"}`}>Numérica</button>
            <button onClick={() => setMode("categorica")} className={`rounded-md px-4 py-2 text-xs font-semibold transition ${mode === "categorica" ? "bg-white text-[#153a30] shadow-sm" : "text-[#5b7169] hover:text-[#153a30]"}`}>Categórica</button>
          </div>
          <label className="flex items-center gap-3 text-xs text-[#667085]">
            Variável
            <select value={selectedVariable} onChange={(event) => setVariable(event.target.value)} className="min-w-56 rounded-lg border border-[#b9d4cb] bg-white px-3 py-2 text-xs font-semibold text-[#173d32] outline-none focus:ring-2 focus:ring-[#8fc6b3]">
              {mode === "numerica" ? (
                <option value="idade_anos">Idade em anos</option>
              ) : Object.entries(CATEGORICAL_VARIABLES).map(([id, info]) => (
                <option key={id} value={id}>{info.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-[#98A2B3]">Recortes clínicos</span>
            {CLINICAL_FILTERS.map((item) => {
              const active = activeCriteria.has(item.field);
              return (
                <button key={item.field} title={item.group} onClick={() => toggleCriterion(item.field)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${active ? "border-[#1a3a30] bg-[#1a3a30] text-white" : "border-[#c5ddd6] bg-white text-[#52665f] hover:border-[#1a3a30] hover:text-[#1a3a30]"}`}>
                  {active ? "✓ " : "+ "}{item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf4f1] pt-4">
            {filterChips.length ? filterChips.map((chip, index) => (
              <button key={`${chip.key}-${chip.criterion ?? index}`} onClick={() => removeChip(chip)} title="Remover filtro" className="inline-flex items-center gap-1.5 rounded-md bg-[#eaf5f1] px-2.5 py-1.5 text-[10px] font-semibold text-[#1a3a30] hover:bg-[#d5ebe3]">
                {chip.label}<span aria-hidden="true" className="text-[#6a8d80]">×</span>
              </button>
            )) : <span className="text-xs text-[#98A2B3]">Nenhum filtro aplicado.</span>}
          </div>
        </div>
      </section>

      {summary?.suppressed ? (
        <SuppressedState minimum={summary.minimumPopulationN} />
      ) : summary?.populationN === 0 ? (
        <EmptyState />
      ) : mode === "numerica" && numericResult ? (
        <NumericResults result={numericResult} />
      ) : categoricalResult ? (
        <CategoricalResults result={categoricalResult} />
      ) : null}

      {manifest && <ProvenanceNotice manifest={manifest} />}
      {manifest && (
        <details className="rounded-xl border border-[#c5ddd6] bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 text-xs font-semibold text-[#1a3a30]">Metodologia, filtros e proveniência</summary>
          <div className="border-t border-[#e3f0ec] px-5 py-5">
            <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="block text-[10px] font-bold uppercase tracking-widest text-[#98A2B3]">Variável</span><strong className="mt-1 block text-[#344054]">{manifest.variable.label}</strong><p className="mt-1 text-[#667085]">{manifest.variable.definition}</p></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-widest text-[#98A2B3]">Fonte</span><strong className="mt-1 block text-[#344054]">{manifest.source.dataset}</strong><p className="mt-1 text-[#667085]">Corte: {manifest.source.latestNotificationDate ?? "não informado"}</p></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-widest text-[#98A2B3]">Análise</span><strong className="mt-1 block font-mono text-[#344054]">{manifest.analysisId}</strong><p className="mt-1 text-[#667085]">Versão {manifest.analysisVersion}</p></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-widest text-[#98A2B3]">Arquivo-fonte</span><strong className="mt-1 block break-words text-[#344054]">{manifest.source.files[0]?.fileName ?? "manifesto de carga indisponível"}</strong><p className="mt-1 break-all font-mono text-[9px] text-[#667085]">{manifest.source.files[0]?.sha256 ?? "SHA-256 não registrado"}</p></div>
            </div>
            <pre className="mt-5 max-h-80 overflow-auto rounded-lg bg-[#102b23] p-4 text-[10px] leading-relaxed text-[#c9e5dc]">{JSON.stringify(manifest, null, 2)}</pre>
          </div>
        </details>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-[#98A2B3]">
        Resultados descritivos e exploratórios. Percentuais usam valores válidos como denominador principal; ausências permanecem visíveis. Os resultados não implicam associação causal, desempenho preditivo ou validação clínica.
      </p>
    </div>
  );
}

function NumericResults({ result }: { result: DescriptiveResult }) {
  const { summary, histogram } = result;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="População" value={formatNumber(summary.populationN, 0)} note="notificações filtradas" accent />
        <Kpi label="Idades válidas" value={formatNumber(summary.validN, 0)} note="denominador analítico" />
        <Kpi label="Ausentes" value={`${formatNumber(summary.missingPct)}%`} note={`${formatNumber(summary.missingN, 0)} registros`} />
        <Kpi label="Média" value={`${formatNumber(summary.mean)} anos`} note={`DP ${formatNumber(summary.stdDev)}`} />
        <Kpi label="Mediana" value={`${formatNumber(summary.median)} anos`} note={`Q1 ${formatNumber(summary.q1)} · Q3 ${formatNumber(summary.q3)}`} />
        <Kpi label="Amplitude" value={`${formatNumber(summary.min)}–${formatNumber(summary.max)}`} note="mínimo e máximo" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <div className="rounded-xl border border-[#c5ddd6] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-[#182230]">Distribuição da idade</h3>
            <p className="mt-1 text-[11px] text-[#667085]">Histograma em intervalos de dez anos · N válido = {formatNumber(summary.validN, 0)}</p>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={histogram} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="idade-bars" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a3a30" />
                  <stop offset="100%" stopColor="#5da58d" />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
              <YAxis {...AXIS_PROPS} tickFormatter={compactNumber} width={45} />
              <Tooltip cursor={{ fill: "#eaf5f1" }} content={<HistogramTooltip />} />
              <Bar dataKey="count" fill="url(#idade-bars)" radius={[5, 5, 0, 0]} isAnimationActive animationDuration={900} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-[#c5ddd6] bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#182230]">Leitura rápida</h3>
          <p className="mt-1 text-[11px] text-[#667085]">Resumo resistente a assimetria e valores extremos.</p>
          <dl className="mt-5 divide-y divide-[#edf4f1] text-xs">
            {[
              ["Média (DP)", `${formatNumber(summary.mean)} (${formatNumber(summary.stdDev)})`],
              ["Mediana", formatNumber(summary.median)],
              ["Intervalo interquartil", `${formatNumber(summary.q1)}–${formatNumber(summary.q3)}`],
              ["Mínimo–máximo", `${formatNumber(summary.min)}–${formatNumber(summary.max)}`],
              ["Completude", `${formatNumber(100 - (summary.missingPct ?? 0))}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3"><dt className="text-[#667085]">{label}</dt><dd className="font-semibold tabular-nums text-[#1a3a30]">{value}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}

function CategoricalResults({ result }: { result: CategoricalResult }) {
  const { summary, manifest } = result;
  const height = Math.max(300, Math.min(900, summary.categories.length * 38 + 50));
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="População" value={formatNumber(summary.populationN, 0)} note="notificações filtradas" accent />
        <Kpi label="Valores válidos" value={formatNumber(summary.validN, 0)} note="denominador percentual" />
        <Kpi label="Ausentes" value={`${formatNumber(summary.missingPct)}%`} note={`${formatNumber(summary.missingN, 0)} registros`} />
        <Kpi label="Categorias" value={formatNumber(summary.categories.length, 0)} note={manifest.variable.label} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
        <div className="rounded-xl border border-[#c5ddd6] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#182230]">{manifest.variable.label}</h3>
            <p className="mt-1 text-[11px] text-[#667085]">Contagem e percentual sobre {formatNumber(summary.validN, 0)} valores válidos</p>
          </div>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={summary.categories} layout="vertical" margin={{ top: 4, right: 22, left: 10, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#eaf5f1" strokeDasharray="4 4" />
              <XAxis type="number" {...AXIS_PROPS} tickFormatter={compactNumber} />
              <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={132} interval={0} />
              <Tooltip cursor={{ fill: "#eaf5f1" }} content={<CategoryTooltip />} />
              <Bar dataKey="count" radius={[0, 5, 5, 0]} isAnimationActive animationDuration={900}>
                {summary.categories.map((row, index) => <Cell key={row.value} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#c5ddd6] bg-white shadow-sm">
          <div className="border-b border-[#e3f0ec] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#182230]">Tabela de frequências</h3>
            <p className="mt-1 text-[11px] text-[#667085]">Valores ignorados permanecem como categoria quando codificados.</p>
          </div>
          <div className="max-h-[760px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#f7faf9] text-[10px] uppercase tracking-wider text-[#667085]">
                <tr><th className="px-4 py-3 text-left">Categoria</th><th className="px-3 py-3 text-right">N</th><th className="px-3 py-3 text-right">% válidos</th><th className="px-4 py-3 text-right">% população</th></tr>
              </thead>
              <tbody className="divide-y divide-[#edf4f1]">
                {summary.categories.map((row, index) => (
                  <tr key={row.value} className="hover:bg-[#f7fbf9]">
                    <td className="px-4 py-3"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><span className="font-medium text-[#344054]">{row.label}</span></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1a3a30]">{row.count.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#667085]">{row.pctValid.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#667085]">{row.pctPopulation.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
