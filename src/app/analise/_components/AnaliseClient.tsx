"use client";

import ProvenanceNotice from "./ProvenanceNotice";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  VARIABLE_CATALOG,
  getVariableInfo,
  getValueLabel,
  type VariableInfo,
} from "@/lib/variable-catalog";
import {
  computeChiSquare,
  computeOR,
  computeRR,
  computeFisher,
  computeCramersV,
  type RiscoRelativoResult,
  type FisherResult,
} from "@/lib/stat-utils";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import { VALIDATION_COHORTS } from "@/lib/scientific-validation";
import type { ContingenciaCell, ContingenciaResponse } from "@/app/api/analise/contingencia/route";
import { downloadCSV, downloadJSON, csvNum, csvPValue } from "@/lib/export-csv";
import { regressionSettingsKey as settingsKey } from "@/lib/regression-config";
import type { AnalysisManifestBase } from "@/lib/analysis-manifest";
import ContingencyTable from "./ContingencyTable";
import StatResults from "./StatResults";
import ProportionChart from "./ProportionChart";
import ForestPlot from "./ForestPlot";

interface Props {
  filtros: FiltrosSRAG;
}

type DisplayMode = "n" | "pct_row" | "pct_col";

interface AnaliseState {
  cells:      ContingenciaCell[];
  totalN:     number;
  excludedN:  number;
  manifest: AnalysisManifestBase;
  varXInfo:   VariableInfo;
  varYInfo:   VariableInfo;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function filtrosLabel(filtros: FiltrosSRAG): string {
  const parts: string[] = [];
  if (filtros.ano_epi)               parts.push(String(filtros.ano_epi));
  if (filtros.anos_epi?.length)      parts.push(filtros.anos_epi.join(", "));
  if (filtros.semana_epi)            parts.push(`Semana ${filtros.semana_epi}`);
  if (filtros.sg_uf?.length)         parts.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.co_mun_res?.length)    parts.push(`Mun: ${filtros.co_mun_res.join(", ")}`);
  if (filtros.cs_sexo)   parts.push(`Sexo: ${filtros.cs_sexo}`);
  if (filtros.faixa_etaria) parts.push(`Idade: ${filtros.faixa_etaria}`);
  if (filtros.classi_fin?.length)  parts.push(`Classi: ${filtros.classi_fin.join(",")}`);
  if (filtros.evolucao?.length)    parts.push(`Desfecho: ${filtros.evolucao.join(",")}`);
  if (filtros.etiologia?.length)   parts.push(`Etio: ${filtros.etiologia.join(", ")}`);
  if (filtros.data_ini || filtros.data_fim)
    parts.push(`${filtros.data_ini?.replace("-", "/") ?? "??"} – ${filtros.data_fim?.replace("-", "/") ?? "??"}`);
  if (filtros.coorte_validacao) parts.push(`Coorte: ${VALIDATION_COHORTS[filtros.coorte_validacao].label}`);
  return parts.length ? parts.join(" · ") : "Brasil — todos os anos";
}

// Grouped variable options for <select>
const GRUPOS = [
  {
    label: "Desfecho",
    // Binárias primeiro (permitem OR/RR), completas depois
    campos: ["evolucao_bin", "uti", "suport_ven_bin", "evolucao", "suport_ven", "classi_fin"],
  },
  { label: "Demográfico",  campos: ["cs_sexo","cs_raca","cs_escol_n","cs_gestant"] },
  { label: "Vacinação",    campos: ["vacina_cov","vacina"] },
  { label: "Comorbidades", campos: ["diabetes","obesidade","cardiopati","imunodepre","renal","asma","pneumopati","neurologic","sind_down"] },
  { label: "Sintomas",     campos: ["febre","tosse","dispneia","saturacao"] },
  { label: "Geográfico",   campos: ["sg_uf"] },
];

// Exemplos de um clique — perguntas clássicas da epidemiologia de SRAG
const PRESETS: { label: string; vx: string; vy: string }[] = [
  { label: "Diabetes × Óbito",       vx: "diabetes",   vy: "evolucao_bin" },
  { label: "Obesidade × UTI",        vx: "obesidade",  vy: "uti" },
  { label: "Vacina COVID × Óbito",   vx: "vacina_cov", vy: "evolucao_bin" },
  { label: "Sexo × Óbito",           vx: "cs_sexo",    vy: "evolucao_bin" },
  { label: "Imunodepressão × UTI",   vx: "imunodepre", vy: "uti" },
];

function VariableSelect({
  id, label, value, onChange, exclude,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-1.5">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-[#c5ddd6] rounded-lg bg-white text-[#1C1C1C] focus:outline-none focus:ring-2 focus:ring-[#1a3a30] cursor-pointer"
      >
        <option value="">— selecione —</option>
        {GRUPOS.map((g) => {
          const opts = g.campos
            .filter((c) => c !== exclude)
            .map((c) => VARIABLE_CATALOG.find((v) => v.campo === c))
            .filter(Boolean) as VariableInfo[];
          if (!opts.length) return null;
          return (
            <optgroup key={g.label} label={g.label}>
              {opts.map((v) => (
                <option key={v.campo} value={v.campo}>{v.label}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AnaliseClient({ filtros }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [varY, setVarY] = useState(() => searchParams.get("vy") ?? "");
  const [varX, setVarX] = useState(() => searchParams.get("vx") ?? "");
  const [excluirIgnorado, setExcluirIgnorado] = useState(() => searchParams.get("excl") !== "0");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnaliseState | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("n");
  const [showExpected, setShowExpected] = useState(false);
  const [vizTab, setVizTab] = useState<"prop" | "forest">("prop");
  const [linkCopied, setLinkCopied] = useState(false);
  const [executedKey, setExecutedKey] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const filterKey = settingsKey(filtros);
  const resultOutdated = !!result && executedKey !== settingsKey({ varX, varY, excluirIgnorado, filtros });
  useEffect(() => () => { requestRef.current?.abort(); }, [filterKey]);

  // Grava a análise executada na URL (preservando os filtros do FilterBar) → link compartilhável
  const syncUrl = useCallback((vx: string, vy: string, excl: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vx", vx);
    params.set("vy", vy);
    if (excl) params.delete("excl"); else params.set("excl", "0");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const copiarLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); })
      .catch(() => {});
  }, []);

  const executar = useCallback(async (ovx?: string, ovy?: string, oexcl?: boolean) => {
    const vx   = ovx   ?? varX;
    const vy   = ovy   ?? varY;
    const excl = oexcl ?? excluirIgnorado;
    if (ovx   !== undefined) setVarX(ovx);
    if (ovy   !== undefined) setVarY(ovy);
    if (oexcl !== undefined) setExcluirIgnorado(oexcl);
    if (!vx || !vy) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setShowExpected(false);

    try {
      const res = await fetch("/api/analise/contingencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ varX: vx, varY: vy, filtros, excluirIgnorado: excl }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const data: ContingenciaResponse = await res.json();
      if (controller.signal.aborted) return;
      if (data.cells.length === 0) {
        setError("Nenhum dado encontrado para essa combinação de variáveis e filtros.");
        return;
      }
      setResult({
        cells:     data.cells,
        totalN:    data.totalN,
        excludedN: data.excludedN,
        manifest:  data.manifest,
        varXInfo:  getVariableInfo(vx)!,
        varYInfo:  getVariableInfo(vy)!,
      });
      syncUrl(vx, vy, excl);
      setExecutedKey(settingsKey({ varX: vx, varY: vy, excluirIgnorado: excl, filtros }));
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      if (requestRef.current === controller) setIsLoading(false);
    }
  }, [varX, varY, filtros, excluirIgnorado, syncUrl]);

  // Auto-executa ao montar se a URL já traz uma análise (link compartilhado)
  const didAutoRun = useRef(false);
  useEffect(() => {
    if (didAutoRun.current && !requestRef.current?.signal.aborted) return;
    didAutoRun.current = true;
    const vx = searchParams.get("vx");
    const vy = searchParams.get("vy");
    if (vx && vy) executar(vx, vy, searchParams.get("excl") !== "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute stats from result
  const stats = (() => {
    if (!result) return null;
    const { cells, varXInfo, varYInfo } = result;

    const catalogXCodes = varXInfo.valores.map((v) => v.codigo);
    const catalogYCodes = varYInfo.valores.map((v) => v.codigo);
    const presentX = new Set(cells.map((c) => c.vx));
    const presentY = new Set(cells.map((c) => c.vy));
    const xValues = catalogXCodes.filter((c) => presentX.has(c));
    const yValues = catalogYCodes.filter((c) => presentY.has(c));

    const matrix: number[][] = xValues.map(() => yValues.map(() => 0));
    for (const cell of cells) {
      const xi = xValues.indexOf(cell.vx);
      const yi = yValues.indexOf(cell.vy);
      if (xi >= 0 && yi >= 0) matrix[xi][yi] = cell.n;
    }

    const chi2Result = computeChiSquare(matrix);
    const cramersV   = computeCramersV(chi2Result.chi2, chi2Result.n, xValues.length, yValues.length);

    // OR / RR / Fisher apenas para tabelas 2×2 exatas
    let orResult:     ReturnType<typeof computeOR>     | null = null;
    let rrResult:     RiscoRelativoResult              | null = null;
    let fisherResult: FisherResult                     | null = null;
    let xCasoLabel = "", xRefLabel = "", yCasoLabel = "", yRefLabel = "";

    if (xValues.length === 2 && yValues.length === 2) {
      const a = matrix[0][0], b = matrix[0][1];
      const c = matrix[1][0], d = matrix[1][1];
      orResult     = computeOR(a, b, c, d);
      rrResult     = computeRR(a, b, c, d);
      fisherResult = computeFisher(a, b, c, d);
      xCasoLabel = getValueLabel(varXInfo, xValues[0]);
      xRefLabel  = getValueLabel(varXInfo, xValues[1]);
      yCasoLabel = getValueLabel(varYInfo, yValues[0]);
      yRefLabel  = getValueLabel(varYInfo, yValues[1]);
    }

    return { chi2Result, cramersV, orResult, rrResult, fisherResult, xCasoLabel, xRefLabel, yCasoLabel, yRefLabel, matrix, xValues, yValues };
  })();

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!result || !stats) return;

    const { varXInfo, varYInfo, totalN, excludedN } = result;
    const { matrix, xValues, yValues, chi2Result, cramersV, orResult, rrResult, fisherResult } = stats;

    const xLabels = xValues.map((v) => getValueLabel(varXInfo, v));
    const yLabels = yValues.map((v) => getValueLabel(varYInfo, v));

    const rowTotals  = matrix.map((row) => row.reduce((s, n) => s + n, 0));
    const colTotals  = yValues.map((_, j) => matrix.reduce((s, row) => s + row[j], 0));
    const grandTotal = rowTotals.reduce((s, n) => s + n, 0);

    const rows: (string | number | null)[][] = [];

    rows.push(["SivepLens — Análise Bivariada"]);
    rows.push(["Gerado em", new Date().toLocaleString("pt-BR")]);
    rows.push([]);
    rows.push(["Desfecho (Y)", varYInfo.label]);
    rows.push(["Exposição (X)", varXInfo.label]);
    rows.push(["Filtros", filtrosLabel(result.manifest.filters)]);
    rows.push(["N efetivo", totalN]);
    rows.push(["Registros excluídos (NULL / Ignorado)", excludedN]);
    rows.push([]);

    rows.push(["TABELA DE CONTINGÊNCIA"]);
    rows.push(["", ...yLabels, "Total"]);
    xValues.forEach((_, i) => {
      rows.push([xLabels[i], ...matrix[i], rowTotals[i]]);
    });
    rows.push(["Total", ...colTotals, grandTotal]);
    rows.push([]);

    rows.push(["ESTATÍSTICAS"]);
    rows.push(["Qui-quadrado (χ²)", csvNum(chi2Result.chi2)]);
    rows.push(["Graus de liberdade", chi2Result.df]);
    rows.push(["p-valor (χ²)", csvPValue(chi2Result.pValue)]);
    rows.push(["V de Cramér", csvNum(cramersV, 4)]);
    if (fisherResult) {
      rows.push(["p-valor (Fisher exato)", csvPValue(fisherResult.pValue)]);
    }
    if (orResult) {
      rows.push(["Odds Ratio (OR)", csvNum(orResult.or)]);
      rows.push(["IC 95% OR inferior", csvNum(orResult.ci95Low)]);
      rows.push(["IC 95% OR superior", csvNum(orResult.ci95High)]);
    }
    if (rrResult) {
      rows.push(["Risco Relativo (RR)", csvNum(rrResult.rr)]);
      rows.push(["IC 95% RR inferior", csvNum(rrResult.ci95Low)]);
      rows.push(["IC 95% RR superior", csvNum(rrResult.ci95High)]);
    }
    rows.push([]);
    rows.push(["ID da análise", result.manifest.analysisId]);
    for (const warning of result.manifest.disclosureControl.warnings) rows.push(["AVISO", warning]);
    rows.push(["LIMITAÇÃO", "Associação bruta nos registros analisados, sem ajuste por outros fatores; não demonstra causalidade nem risco na população geral."]);
    rows.push(["NOTA", "Análise realizada via SivepLens sobre dados SIVEP-Gripe/OpenDataSUS."]);

    const ano = result.manifest.filters.ano_epi ?? result.manifest.filters.anos_epi?.join("-") ?? "todos";
    downloadCSV(`bivariada-${result.manifest.configuration.varY}-x-${result.manifest.configuration.varX}-${ano}`, rows);
  }, [result, stats]);

  const handleExportManifest = useCallback(() => {
    if (!result) return;
    downloadJSON(`siveplens-bivariada-${result.manifest.analysisId}`, {
      manifest: result.manifest,
      result: { cells: result.cells, totalN: result.totalN, excludedN: result.excludedN },
    });
  }, [result]);

  const xInfo  = getVariableInfo(varX);
  const yInfo  = getVariableInfo(varY);
  const canRun = varX && varY && !isLoading;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ── Painel de configuração ── */}
      <div className="w-full lg:w-72 xl:w-80 shrink-0">
        <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5 space-y-5 sticky top-6">
          <h2 className="text-sm font-bold text-[#1C1C1C]">Configurar análise</h2>

          {/* Exemplos rápidos */}
          <div>
            <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-2">Exemplos</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => executar(p.vx, p.vy, true)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Variável Y */}
          <VariableSelect
            id="var-y"
            label="Desfecho (Y — linhas)"
            value={varY}
            onChange={setVarY}
            exclude={varX}
          />

          {/* Variável X */}
          <VariableSelect
            id="var-x"
            label="Exposição (X — colunas)"
            value={varX}
            onChange={setVarX}
            exclude={varY}
          />

          {/* Avisos das variáveis */}
          {(xInfo?.aviso || yInfo?.aviso) && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              {xInfo?.aviso && <p>⚠ <strong>{xInfo.labelCurto}:</strong> {xInfo.aviso}</p>}
              {yInfo?.aviso && <p>⚠ <strong>{yInfo.labelCurto}:</strong> {yInfo.aviso}</p>}
            </div>
          )}

          {/* Toggle Ignorado */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excluirIgnorado}
              onChange={(e) => setExcluirIgnorado(e.target.checked)}
              className="accent-[#1a3a30] mt-0.5 shrink-0"
            />
            <div>
              <div className="text-xs font-semibold text-[#1C1C1C]">Excluir valores Ignorado (9)</div>
              <div className="text-[10px] text-[#94A3B8] mt-0.5">
                Recomendado — a maioria dos artigos exclui registros com código 9 da análise bivariada.
              </div>
            </div>
          </label>

          {/* Filtros ativos */}
          <div className="bg-[#eaf5f1] border border-[#C7D7F9] rounded-lg px-3 py-2">
            <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Filtros ativos</div>
            <div className="text-[11px] text-[#1a3a30] font-medium">{filtrosLabel(filtros)}</div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">Herdados do painel principal</div>
          </div>

          {/* Botão executar */}
          <button
            onClick={() => executar()}
            disabled={!canRun}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
              canRun
                ? "bg-[#1a3a30] text-white hover:bg-[#0D3F8F] shadow-sm"
                : "bg-[#E4E7EC] text-[#94A3B8] cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Consultando banco…
              </span>
            ) : "Executar análise ▶"}
          </button>
        </div>
      </div>

      {/* ── Área de resultados ── */}
      <div className="flex-1 min-w-0">

        {resultOutdated && !isLoading && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os filtros ou variáveis mudaram. Execute a análise novamente para atualizar. Os resultados e downloads abaixo correspondem à execução anterior, identificada no cabeçalho.</div>}

        {/* Estado vazio */}
        {!result && !isLoading && !error && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-12 text-center">
            <div className="text-4xl mb-3 opacity-30">χ²</div>
            <div className="text-sm font-medium text-[#555770]">
              Selecione um desfecho e uma exposição para executar a análise
            </div>
            <div className="text-xs text-[#94A3B8] mt-2">
              Qui-quadrado de Pearson · Odds Ratio · V de Cramér · Interpretação em português
            </div>
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-4 animate-pulse">
            <div className="h-5 w-48 bg-[#E4E7EC] rounded" />
            <div className="h-40 bg-[#E4E7EC] rounded-xl" />
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[#E4E7EC] rounded-lg" />)}
            </div>
            <div className="h-24 bg-[#E4E7EC] rounded-xl" />
          </div>
        )}

        {/* Resultados */}
        {result && stats && !isLoading && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-6">

            {/* Cabeçalho do resultado */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-base font-bold text-[#1C1C1C]">
                  {result.varYInfo.label}
                  <span className="mx-2 text-[#94A3B8] font-normal">×</span>
                  {result.varXInfo.label}
                </h3>
                <p className="text-xs text-[#555770] mt-0.5">
                  N = {result.totalN.toLocaleString("pt-BR")} · {filtrosLabel(result.manifest.filters)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={copiarLink}
                  disabled={resultOutdated}
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
                  title="Exportar tabela e estatísticas como CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3" />
                    <path d="M3 12h10" />
                  </svg>
                  Exportar CSV
                </button>
                <button
                  onClick={handleExportManifest}
                  title="Exportar resultado e manifesto auditável"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                >
                  JSON + manifesto
                </button>
              </div>
            </div>

            <ProvenanceNotice manifest={result.manifest} />
            {result.manifest.disclosureControl.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                {result.manifest.disclosureControl.warnings.join(" ")}
              </div>
            )}

            {/* Tabela de contingência */}
            <ContingencyTable
              cells={result.cells}
              varXInfo={result.varXInfo}
              varYInfo={result.varYInfo}
              mode={displayMode}
              onModeChange={setDisplayMode}
              expectedCounts={stats.chi2Result.expectedCounts}
              showExpected={showExpected}
              onShowExpectedChange={setShowExpected}
            />

            {/* Resultados estatísticos */}
            <div className="border-t border-[#eaf5f1] pt-5">
              <h4 className="text-sm font-bold text-[#1C1C1C] mb-4">Resultados Estatísticos</h4>
              <StatResults
                chi2Result={stats.chi2Result}
                orResult={stats.orResult}
                rrResult={stats.rrResult}
                fisherResult={stats.fisherResult}
                cramersV={stats.cramersV}
                varXInfo={result.varXInfo}
                varYInfo={result.varYInfo}
                xCasoLabel={stats.xCasoLabel}
                xRefLabel={stats.xRefLabel}
                yCasoLabel={stats.yCasoLabel}
                yRefLabel={stats.yRefLabel}
                totalN={result.totalN}
                excludedN={result.excludedN}
              />
            </div>

            {/* Visualizações */}
            <div className="border-t border-[#eaf5f1] pt-5">
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-sm font-bold text-[#1C1C1C]">Visualizações</h4>
                {/* Tabs */}
                <div className="flex gap-1 bg-[#eaf5f1] rounded-lg p-0.5">
                  <button
                    onClick={() => setVizTab("prop")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      vizTab === "prop"
                        ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                        : "text-[#555770] hover:text-[#1a3a30]"
                    }`}
                  >
                    Distribuição proporcional
                  </button>
                  {stats.orResult && (
                    <button
                      onClick={() => setVizTab("forest")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        vizTab === "forest"
                          ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                          : "text-[#555770] hover:text-[#1a3a30]"
                      }`}
                    >
                      Forest Plot (OR)
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-[#f4fbf8] rounded-xl border border-[#E4E7EC] px-5 py-5">
                {vizTab === "prop" && (
                  <ProportionChart
                    cells={result.cells}
                    varXInfo={result.varXInfo}
                    varYInfo={result.varYInfo}
                  />
                )}
                {vizTab === "forest" && stats.orResult && (
                  <ForestPlot
                    orResult={stats.orResult}
                    xCasoLabel={stats.xCasoLabel}
                    xRefLabel={stats.xRefLabel}
                    yCasoLabel={stats.yCasoLabel}
                    yRefLabel={stats.yRefLabel}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
