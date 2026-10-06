"use client";

import ProvenanceNotice from "./ProvenanceNotice";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FiltrosSRAG } from "@/lib/filter-utils";
import { VALIDATION_COHORTS } from "@/lib/scientific-validation";
import { buildInterpretacao, referenceSummary, type LinhaResultado, type RegressaoResponse } from "@/lib/regression-interpretation";
import { downloadCSV, downloadJSON, csvNum, csvPValue } from "@/lib/export-csv";
import { regressionSettingsKey, sexPredictorConflict } from "@/lib/regression-config";

// ── Constantes de faixa etária (mirror da route) ──────────────────────────────

const FAIXA_LEVELS = [
  "0-4", "5-11", "12-17", "18-29", "30-39",
  "40-49", "50-59", "60-69", "70-79", "80+",
] as const;
type FaixaLevel = (typeof FAIXA_LEVELS)[number];

// ── Tipos de resposta (mirror do route, sem importar código server) ───────────

// ── Catálogos de display ──────────────────────────────────────────────────────

const PRED_GRUPOS = [
  {
    categoria: "Demográfico",
    preditores: [
      { campo: "faixa_etaria", label: "Faixa etária" },
      { campo: "cs_sexo",      label: "Sexo" },
    ],
  },
  {
    categoria: "Comorbidades",
    preditores: [
      { campo: "diabetes",   label: "Diabetes mellitus" },
      { campo: "obesidade",  label: "Obesidade" },
      { campo: "cardiopati", label: "Cardiopatia crônica" },
      { campo: "imunodepre", label: "Imunodepressão" },
      { campo: "renal",      label: "Doença renal crônica" },
      { campo: "asma",       label: "Asma" },
      { campo: "pneumopati", label: "Pneumopatia crônica" },
      { campo: "neurologic", label: "Doença neurológica" },
      { campo: "sind_down",  label: "Síndrome de Down" },
      { campo: "hematologi", label: "Hematopatia" },
      { campo: "hepatica",   label: "Hepatopatia" },
      { campo: "puerpera",   label: "Puerpério" },
    ],
  },
  {
    categoria: "Vacinação",
    preditores: [
      { campo: "vacina_cov", label: "Vacinado COVID-19" },
      { campo: "vacina",     label: "Vacinado Influenza" },
    ],
  },
  {
    categoria: "Etiologia laboratorial",
    preditores: [
      { campo: "pcr_para4", label: "Parainfluenza 4 por RT-PCR" },
      { campo: "pcr_sars2", label: "SARS-CoV-2 por RT-PCR" },
      { campo: "pcr_vsr",   label: "VSR por RT-PCR" },
    ],
  },
  {
    categoria: "Sintomas",
    preditores: [
      { campo: "dispneia",  label: "Dispneia" },
      { campo: "saturacao", label: "Saturação O₂ < 95%" },
      { campo: "febre",     label: "Febre" },
      { campo: "tosse",     label: "Tosse" },
      { campo: "desc_resp", label: "Desconforto respiratório" },
      { campo: "garganta",  label: "Dor de garganta" },
      { campo: "fadiga",    label: "Fadiga" },
      { campo: "diarreia",  label: "Diarreia" },
    ],
  },
] as const;

const OUTCOMES_DISPLAY = [
  { campo: "evolucao_bin",   label: "Óbito por SRAG (vs Cura)" },
  { campo: "uti",            label: "Internação em UTI" },
  { campo: "suport_ven_bin", label: "Ventilação mecânica invasiva" },
  { campo: "hospital",       label: "Hospitalização" },
] as const;

const DEFAULT_PREDS = new Set([
  "faixa_etaria", "cs_sexo",
  "diabetes", "obesidade", "cardiopati", "imunodepre",
  "dispneia", "saturacao",
]);

// Modelos prontos — perguntas multivariadas clássicas em SRAG
const PRESETS_REG: { label: string; outcome: string; preds: string[]; missing?: boolean }[] = [
  { label: "Artigo pediátrico 2024", outcome: "evolucao_bin", missing: true, preds: ["pcr_para4", "renal", "imunodepre", "sind_down", "cardiopati", "neurologic", "saturacao", "pcr_sars2", "desc_resp", "pcr_vsr", "tosse"] },
  { label: "Risco de óbito (clássico)", outcome: "evolucao_bin",  preds: ["faixa_etaria", "cs_sexo", "diabetes", "obesidade", "cardiopati", "imunodepre", "dispneia", "saturacao"] },
  { label: "Risco de UTI",              outcome: "uti",            preds: ["faixa_etaria", "cs_sexo", "diabetes", "obesidade", "imunodepre", "dispneia", "saturacao"] },
  { label: "Ventilação invasiva",       outcome: "suport_ven_bin", preds: ["faixa_etaria", "cs_sexo", "obesidade", "cardiopati", "imunodepre", "saturacao"] },
  { label: "Vacina COVID e óbito",      outcome: "evolucao_bin",   preds: ["faixa_etaria", "cs_sexo", "vacina_cov", "diabetes", "imunodepre"] },
];

// ── Formatação ────────────────────────────────────────────────────────────────

function fmt2(n: number): string {
  if (!Number.isFinite(n) || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtP(p: number): string {
  if (!Number.isFinite(p) || isNaN(p)) return "—";
  if (p < 0.001) return "< 0,001";
  return p.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function pBadge(p: number): { text: string; cls: string } | null {
  if (!Number.isFinite(p) || isNaN(p)) return null;
  if (p < 0.001) return { text: "***", cls: "bg-red-100 text-red-700 border-red-200" };
  if (p < 0.01)  return { text: "**",  cls: "bg-orange-100 text-orange-700 border-orange-200" };
  if (p < 0.05)  return { text: "*",   cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  return { text: "ns", cls: "bg-gray-100 text-gray-500 border-gray-200" };
}

function filtrosLabel(filtros: FiltrosSRAG): string {
  const parts: string[] = [];
  if (filtros.ano_epi)            parts.push(String(filtros.ano_epi));
  if (filtros.anos_epi?.length)   parts.push(filtros.anos_epi.join(", "));
  if (filtros.semana_epi)         parts.push(`Semana ${filtros.semana_epi}`);
  if (filtros.sg_uf?.length)      parts.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.co_mun_res?.length) parts.push(`Mun.: ${filtros.co_mun_res.join(", ")}`);
  if (filtros.cs_sexo)            parts.push(`Sexo: ${filtros.cs_sexo}`);
  if (filtros.faixa_etaria)       parts.push(`Faixa: ${filtros.faixa_etaria}`);
  if (filtros.classi_fin?.length) parts.push(`Classi: ${filtros.classi_fin.join(",")}`);
  if (filtros.coorte_validacao)   parts.push(`Coorte: ${VALIDATION_COHORTS[filtros.coorte_validacao].label}`);
  return parts.length ? parts.join(" · ") : "Todos os dados";
}

// ── Interpretação automática ──────────────────────────────────────────────────

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#E4E7EC] px-3 py-3">
      <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-0.5 leading-tight">{label}</div>
      <div className="text-sm font-bold text-[#1C1C1C] leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── ColTip — cabeçalho de coluna com tooltip (fixed para escapar overflow) ────

function ColTip({ children, tip }: {
  children: React.ReactNode;
  tip: React.ReactNode;
  align?: string;
}) {
  const [show, setShow] = useState(false);
  const [pos,  setPos]  = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const open = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
    setShow(true);
  };

  return (
    <span
      ref={ref}
      className="inline-flex items-center gap-1 cursor-default select-none"
      onMouseEnter={open}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <span className="text-[#94A3B8] text-[9px] leading-none">ⓘ</span>
      {show && (
        <span
          className="pointer-events-none w-64 rounded-xl bg-[#1C1C1C] text-white text-[11px] leading-relaxed px-3 py-2.5 shadow-xl whitespace-normal text-left font-normal normal-case tracking-normal"
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999 }}
        >
          {tip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1C1C1C]" />
        </span>
      )}
    </span>
  );
}

// ── CoefTable ─────────────────────────────────────────────────────────────────

function CoefTable({ linhas }: { linhas: LinhaResultado[] }) {
  const rows = linhas.filter((l) => !l.isIntercept);
  return (
    <div className="space-y-3">

      {/* Legenda de cores */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="font-semibold text-[#555770]">Como ler:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-red-700 font-medium">Maiores odds</span>
          <span className="text-[#94A3B8]">— aOR &gt; 1 e p &lt; 0,05</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-emerald-700 font-medium">Menores odds</span>
          <span className="text-[#94A3B8]">— aOR &lt; 1 e p &lt; 0,05</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#CBD5E1]" />
          <span className="text-[#555770]">Não significativo</span>
          <span className="text-[#94A3B8]">— p ≥ 0,05</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-[#E4E7EC]">
              <th className="text-left py-2 pr-4 font-bold text-[#555770] uppercase tracking-wider text-[10px]">Variável</th>
              <th className="text-right py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">
                <ColTip align="right" tip={
                  <>
                    <strong>aOR — Odds Ratio Ajustado</strong><br />
                    Quanto maior a chance do desfecho em relação à categoria de referência, <em>controlando</em> pelos demais preditores.<br /><br />
                    <span className="text-red-300">aOR &gt; 1 → mais risco</span><br />
                    <span className="text-emerald-300">aOR &lt; 1 → protetor</span><br />
                    <span className="text-[#94A3B8]">aOR = 1 → sem efeito</span><br /><br />
                    Ex: aOR = 2,50 significa 2,5× mais chances do desfecho.
                  </>
                }>aOR</ColTip>
              </th>
              <th className="text-right py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">
                <ColTip align="right" tip={
                  <>
                    <strong>IC 95% — Intervalo de Confiança</strong><br />
                    Faixa provável para o aOR real. Se o intervalo <strong>não contém 1</strong>, o resultado é estatisticamente significativo.<br /><br />
                    Ex: 1,20 – 3,80 → significativo (não passa pelo 1).<br />
                    Ex: 0,80 – 1,40 → não significativo (inclui 1).
                  </>
                }>IC 95%</ColTip>
              </th>
              <th className="text-right py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">
                <ColTip align="right" tip={
                  <>
                    <strong>Estatística z (Wald)</strong><br />
                    Mede em quantos desvios-padrão o coeficiente está de zero. Quanto maior o valor absoluto, mais forte a evidência contra a hipótese nula.<br /><br />
                    Regra prática: |z| &gt; 1,96 → p &lt; 0,05.
                  </>
                }>z</ColTip>
              </th>
              <th className="text-right py-2 px-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">
                <ColTip align="right" tip={
                  <>
                    <strong>p-valor</strong><br />
                    Probabilidade de observar este resultado por acaso, supondo que não há efeito real.<br /><br />
                    <span className="text-red-300">p &lt; 0,05 → significativo</span><br />
                    <span className="text-[#94A3B8]">p ≥ 0,05 → não significativo</span><br /><br />
                    Não confunda com tamanho do efeito: um p muito baixo pode vir de um efeito pequeno em amostras grandes.
                  </>
                }>p-valor</ColTip>
              </th>
              <th className="text-center py-2 pl-2 font-bold text-[#555770] uppercase tracking-wider text-[10px]">
                <ColTip align="right" tip={
                  <>
                    <strong>Significância estatística</strong><br />
                    <span className="text-red-300">*** p &lt; 0,001</span><br />
                    <span className="text-orange-300">** p &lt; 0,01</span><br />
                    <span className="text-yellow-300">* p &lt; 0,05</span><br />
                    <span className="text-[#94A3B8]">ns = não significativo (p ≥ 0,05)</span>
                  </>
                }>Sig.</ColTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              if (l.isReferencia) {
                return (
                  <tr key={i} className="border-b border-[#eaf5f1]">
                    <td className="py-2 pr-4 text-[#94A3B8] italic pl-3">{l.nome}</td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">1,00</td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">referência</td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">—</td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">—</td>
                    <td className="py-2 pl-2 text-center text-[#94A3B8]">—</td>
                  </tr>
                );
              }

              const sig        = Number.isFinite(l.pValue) && l.pValue < 0.05;
              const protective = Number.isFinite(l.aOR) && l.aOR < 1;
              const textColor  = sig
                ? (protective ? "text-emerald-700" : "text-red-700")
                : "text-[#1C1C1C]";
              const badge = pBadge(l.pValue);

              return (
                <tr key={i} className={`border-b border-[#eaf5f1] ${i % 2 !== 0 ? "bg-[#FAFBFF]" : ""}`}>
                  <td className={`py-2 pr-4 font-medium ${textColor}`}>{l.nome}</td>
                  <td className={`py-2 px-2 text-right font-bold tabular-nums ${textColor}`}>{fmt2(l.aOR)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${textColor}`}>
                    {fmt2(l.ci95Low)} – {fmt2(l.ci95High)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[#555770]">
                    {Number.isFinite(l.z) ? fmt2(l.z) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[#555770]">{fmtP(l.pValue)}</td>
                  <td className="py-2 pl-2 text-center">
                    {badge && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.cls}`}>
                        {badge.text}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MultiForestPlot ───────────────────────────────────────────────────────────

function MultiForestPlot({ linhas }: { linhas: LinhaResultado[] }) {
  const displayRows = linhas.filter((l) => !l.isIntercept);
  const dataRows    = displayRows.filter((l) => !l.isReferencia && Number.isFinite(l.aOR));

  if (dataRows.length === 0) return null;

  // ── Dimensões ───────────────────────────────────────────────────────────────
  const svgW  = 700;
  const labW  = 195;   // left labels
  const ciW   = 285;   // CI plot area
  const statW = 220;   // right stats (aOR + CI text + p)
  const padL  = 8;
  const rowH  = 28;
  const hdrH  = 32;
  const ftrH  = 28;
  const svgH  = hdrH + displayRows.length * rowH + ftrH;

  // ── Escala log ──────────────────────────────────────────────────────────────
  const validLow  = dataRows.map((r) => r.ci95Low ).filter((v) => Number.isFinite(v) && v > 0);
  const validHigh = dataRows.map((r) => r.ci95High).filter((v) => Number.isFinite(v) && v > 0);
  const validOR   = dataRows.map((r) => r.aOR      ).filter((v) => Number.isFinite(v) && v > 0);

  const rawMin = Math.min(...validLow,  ...validOR);
  const rawMax = Math.max(...validHigh, ...validOR);

  const logMin = Math.log10(Math.max(rawMin / 1.8, 0.05));
  const logMax = Math.log10(Math.min(rawMax * 1.8, 200));

  const toX = (v: number) => {
    const capped = Math.max(Math.pow(10, logMin), Math.min(Math.pow(10, logMax), v));
    return ((Math.log10(capped) - logMin) / (logMax - logMin)) * ciW;
  };

  const refX = toX(1.0);

  const ALL_TICKS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const ticks = ALL_TICKS.filter((t) => {
    const lv = Math.log10(t);
    return lv >= logMin - 0.05 && lv <= logMax + 0.05;
  });

  const plotOriginX = padL + labW;

  return (
    <div className="overflow-x-auto -mx-1">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: "100%", minWidth: svgW, height: svgH }}
        aria-label="Forest plot de Odds Ratios ajustados"
      >
        {/* ── Cabeçalho de colunas ───────────────────────────────────────── */}
        <text x={padL + 4}                          y={20} fontSize={9} fontWeight="600" fill="#555770">VARIÁVEL</text>
        <text x={plotOriginX + ciW / 2}             y={20} fontSize={9} fontWeight="600" fill="#555770" textAnchor="middle">aOR (ajustado)</text>
        <text x={plotOriginX + ciW + statW * 0.38}  y={20} fontSize={9} fontWeight="600" fill="#555770" textAnchor="middle">aOR (IC 95%)</text>
        <text x={plotOriginX + ciW + statW * 0.82}  y={20} fontSize={9} fontWeight="600" fill="#555770" textAnchor="middle">p-valor</text>
        <line x1={padL} y1={24} x2={svgW - 4} y2={24} stroke="#E4E7EC" strokeWidth={1} />

        {/* ── Linha de referência OR=1 ──────────────────────────────────── */}
        <line
          x1={plotOriginX + refX} y1={hdrH}
          x2={plotOriginX + refX} y2={svgH - ftrH}
          stroke="#64748B" strokeWidth={1} strokeDasharray="4 3"
        />

        {/* ── Linhas de dados ───────────────────────────────────────────── */}
        {displayRows.map((linha, i) => {
          const y    = hdrH + i * rowH;
          const midY = y + rowH / 2;

          /* fundo alternado */
          const bg = i % 2 === 0
            ? <rect key={`bg-${i}`} x={padL} y={y} width={svgW - padL - 4} height={rowH} fill="#f4fbf8" />
            : null;

          /* linha de referência */
          if (linha.isReferencia) {
            return (
              <g key={i}>
                {bg}
                <text x={padL + 12} y={midY + 4} fontSize={10} fill="#94A3B8" fontStyle="italic">
                  {linha.nome}
                </text>
                {/* pequeno ponto em OR=1 */}
                <circle cx={plotOriginX + refX} cy={midY} r={3} fill="#CBD5E1" />
                <text x={plotOriginX + ciW + statW * 0.38} y={midY + 4} fontSize={9} fill="#94A3B8" textAnchor="middle">
                  1,00 (referência)
                </text>
              </g>
            );
          }

          /* linha com estimativa indisponível */
          if (!Number.isFinite(linha.aOR) || !Number.isFinite(linha.ci95Low) || !Number.isFinite(linha.ci95High)) {
            return (
              <g key={i}>
                {bg}
                <text x={padL + 4} y={midY + 4} fontSize={10} fill="#1C1C1C">{linha.nome}</text>
                <text x={plotOriginX + 4} y={midY + 4} fontSize={9} fill="#94A3B8">estimativa indisponível</text>
              </g>
            );
          }

          const xOR   = toX(linha.aOR);
          const xLow  = toX(linha.ci95Low);
          const xHigh = toX(linha.ci95High);

          const truncatedLow  = linha.ci95Low  < Math.pow(10, logMin);
          const truncatedHigh = linha.ci95High > Math.pow(10, logMax);

          const sig        = Number.isFinite(linha.pValue) && linha.pValue < 0.05;
          const protective = linha.aOR < 1;
          const accent  = sig ? (protective ? "#059669" : "#DC2626") : "#94A3B8";
          const ciColor = sig ? (protective ? "#86EFAC" : "#FCA5A5") : "#D1D5DB";

          const dSz = 5;
          const diamond = [
            `${plotOriginX + xOR},${midY - dSz}`,
            `${plotOriginX + xOR + dSz},${midY}`,
            `${plotOriginX + xOR},${midY + dSz}`,
            `${plotOriginX + xOR - dSz},${midY}`,
          ].join(" ");

          return (
            <g key={i}>
              {bg}

              {/* Rótulo da variável */}
              <text
                x={padL + 4} y={midY + 4}
                fontSize={10}
                fontWeight={sig ? "600" : "400"}
                fill={sig ? "#1C1C1C" : "#555770"}
              >
                {linha.nome}
              </text>

              {/* Barra do IC */}
              <line
                x1={plotOriginX + xLow}  y1={midY}
                x2={plotOriginX + xHigh} y2={midY}
                stroke={ciColor} strokeWidth={8} strokeLinecap="round"
              />

              {/* Whiskers (pontas do IC) — só quando não truncado */}
              {!truncatedLow && (
                <line x1={plotOriginX + xLow} y1={midY - 6} x2={plotOriginX + xLow} y2={midY + 6} stroke={accent} strokeWidth={1.5} />
              )}
              {!truncatedHigh && (
                <line x1={plotOriginX + xHigh} y1={midY - 6} x2={plotOriginX + xHigh} y2={midY + 6} stroke={accent} strokeWidth={1.5} />
              )}

              {/* Setas quando IC truncado */}
              {truncatedLow && (
                <polygon
                  points={`${plotOriginX + 2},${midY} ${plotOriginX + 10},${midY - 5} ${plotOriginX + 10},${midY + 5}`}
                  fill={accent}
                />
              )}
              {truncatedHigh && (
                <polygon
                  points={`${plotOriginX + ciW - 2},${midY} ${plotOriginX + ciW - 10},${midY - 5} ${plotOriginX + ciW - 10},${midY + 5}`}
                  fill={accent}
                />
              )}

              {/* Diamante (estimativa pontual) */}
              <polygon points={diamond} fill={accent} />

              {/* Texto: aOR (IC low – IC high) */}
              <text
                x={plotOriginX + ciW + statW * 0.38} y={midY + 4}
                textAnchor="middle" fontSize={10}
                fontWeight={sig ? "600" : "400"}
                fill={accent}
              >
                {fmt2(linha.aOR)} ({fmt2(linha.ci95Low)}–{fmt2(linha.ci95High)})
              </text>

              {/* p-valor */}
              <text
                x={plotOriginX + ciW + statW * 0.82} y={midY + 4}
                textAnchor="middle" fontSize={10}
                fill={sig ? accent : "#64748B"}
                fontWeight={sig ? "600" : "400"}
              >
                {fmtP(linha.pValue)}
              </text>
            </g>
          );
        })}

        {/* ── Eixo inferior ─────────────────────────────────────────────── */}
        <line
          x1={plotOriginX} y1={svgH - ftrH}
          x2={plotOriginX + ciW} y2={svgH - ftrH}
          stroke="#CBD5E1" strokeWidth={1}
        />
        {ticks.map((t) => {
          const tx     = toX(t);
          const isMaj  = [0.1, 0.5, 1, 2, 5, 10].includes(t);
          return (
            <g key={t}>
              <line
                x1={plotOriginX + tx} y1={svgH - ftrH}
                x2={plotOriginX + tx} y2={svgH - ftrH + (isMaj ? 5 : 3)}
                stroke="#CBD5E1" strokeWidth={1}
              />
              {isMaj && (
                <text
                  x={plotOriginX + tx} y={svgH - ftrH + 14}
                  textAnchor="middle" fontSize={9} fill="#94A3B8"
                >
                  {t < 1 ? t.toString() : t}
                </text>
              )}
            </g>
          );
        })}

        {/* Rótulos protetor / risco */}
        <text x={plotOriginX + 4}       y={svgH - 4} fontSize={8} fill="#059669" fontWeight="600">◀ Menores odds</text>
        <text x={plotOriginX + ciW - 4} y={svgH - 4} fontSize={8} fill="#DC2626" fontWeight="600" textAnchor="end">Maiores odds ▶</text>
      </svg>
    </div>
  );
}

// ── AttritionFunnel ───────────────────────────────────────────────────────────

function AttritionFunnel({
  nRaw, nExcluded, nModel,
}: {
  nRaw: number; nExcluded: number; nModel: number;
}) {
  if (nRaw === 0 || nExcluded === 0) return null;

  const pct      = (nExcluded / nRaw) * 100;
  const modelPct = 100 - pct;

  const severity =
    pct >= 50 ? "red" :
    pct >= 20 ? "amber" :
    "blue";

  const colors = {
    red:   { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",   bar: "bg-red-400",   barBg: "bg-red-100"   },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "bg-amber-400", barBg: "bg-amber-100" },
    blue:  { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-700",  bar: "bg-blue-400",  barBg: "bg-blue-100"  },
  }[severity];

  return (
    <div className={`rounded-xl border px-4 py-3 ${colors.bg} ${colors.border}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${colors.text}`}>
        Atrito amostral — dados ausentes / ignorados
      </div>

      {/* Fluxo */}
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <span className="font-medium text-[#1C1C1C]">
          {nRaw.toLocaleString("pt-BR")} elegíveis
        </span>
        <span className="text-[#94A3B8]">→</span>
        <span className={`font-bold ${colors.text}`}>
          −{nExcluded.toLocaleString("pt-BR")} excluídos ({pct.toFixed(1)}%)
        </span>
        <span className="text-[#94A3B8]">→</span>
        <span className="font-bold text-emerald-700">
          {nModel.toLocaleString("pt-BR")} no modelo
        </span>
      </div>

      {/* Barra de atrito */}
      <div className={`mt-2 h-2 rounded-full ${colors.barBg} overflow-hidden`}>
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${modelPct.toFixed(1)}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#94A3B8] mt-0.5">
        <span>{modelPct.toFixed(1)}% no modelo</span>
        <span>{pct.toFixed(1)}% excluídos</span>
      </div>

      {/* Aviso contextual */}
      {pct >= 20 && (
        <p className={`text-[10px] mt-2 leading-relaxed ${colors.text}`}>
          {pct >= 50
            ? "⚠ Mais da metade dos casos foi excluída. Os resultados representam uma subpopulação com preenchimento completo — interprete com cautela."
            : "⚠ Exclusão substancial por dados ausentes. Resultados podem não ser generalizáveis para todos os casos."}
          {" "}Considere ativar &quot;Incluir Ignorado como categoria&quot; para aumentar o N.
        </p>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  filtros: FiltrosSRAG;
}

export default function RegressaoClient({ filtros }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [outcome,         setOutcome]         = useState<string>(() => searchParams.get("out") ?? "evolucao_bin");
  const [preds,           setPreds]           = useState<Set<string>>(() => {
    const fromUrl = searchParams.get("preds");
    return new Set(fromUrl ? fromUrl.split(",").filter(Boolean) : DEFAULT_PREDS);
  });
  const [incluirIgnorado, setIncluirIgnorado] = useState(() => searchParams.get("ign") === "1");
  const [ausenteComoAusencia, setAusenteComoAusencia] = useState(() => searchParams.get("missing") === "absence");
  const [refFaixa,        setRefFaixa]        = useState<FaixaLevel>(() => (searchParams.get("ref_faixa") as FaixaLevel | null) ?? "0-4");
  const [refSexo,         setRefSexo]         = useState<"M" | "F">(() => (searchParams.get("ref_sexo") as "M" | "F" | null) ?? "F");
  const [isLoading,       setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [result,          setResult]          = useState<RegressaoResponse | null>(null);
  const [tab,             setTab]             = useState<"tabela" | "forest">("tabela");
  const [linkCopied,      setLinkCopied]      = useState(false);
  const [executedKey, setExecutedKey] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const filterKey = regressionSettingsKey(filtros);
  const draftKey = regressionSettingsKey({ outcome, preditores: [...preds].sort(), filtros, incluirIgnorado, ausenteComoAusencia, refFaixa, refSexo });
  const resultOutdated = result !== null && executedKey !== draftKey;
  const sexConflict = sexPredictorConflict([...preds], filtros);

  // A response for an old population must not overwrite newer URL filters.
  useEffect(() => () => { requestRef.current?.abort(); }, [filterKey]);

  // Grava o modelo executado na URL (preserva filtros do FilterBar) → link compartilhável
  const syncUrl = useCallback((oc: string, pr: string[], ign: boolean, missing: boolean, rf: FaixaLevel, rs: "M" | "F") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("out", oc);
    params.set("preds", pr.join(","));
    if (ign) params.set("ign", "1"); else params.delete("ign");
    if (missing) params.set("missing", "absence"); else params.delete("missing");
    if (rf !== "0-4") params.set("ref_faixa", rf); else params.delete("ref_faixa");
    if (rs !== "F")   params.set("ref_sexo",  rs); else params.delete("ref_sexo");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const copiarLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); })
      .catch(() => {});
  }, []);

  // ── Toggle individual preditor ────────────────────────────────────────────
  const togglePred = (campo: string) => {
    setPreds((prev) => {
      const next = new Set(prev);
      if (next.has(campo)) next.delete(campo);
      else next.add(campo);
      return next;
    });
  };

  // ── Toggle grupo inteiro ──────────────────────────────────────────────────
  const toggleGrupo = (campos: readonly string[]) => {
    const allSel = campos.every((c) => preds.has(c));
    setPreds((prev) => {
      const next = new Set(prev);
      if (allSel) campos.forEach((c) => next.delete(c));
      else campos.forEach((c) => next.add(c));
      return next;
    });
  };

  // ── Executar análise ──────────────────────────────────────────────────────
  const executar = useCallback(async (override?: { outcome?: string; preds?: string[]; ign?: boolean; missing?: boolean; refFaixa?: FaixaLevel; refSexo?: "M" | "F" }) => {
    const oc  = override?.outcome   ?? outcome;
    const pr  = override?.preds     ?? Array.from(preds);
    const ign = override?.ign       ?? incluirIgnorado;
    const missing = override?.missing ?? ausenteComoAusencia;
    const rf  = override?.refFaixa  ?? refFaixa;
    const rs  = override?.refSexo   ?? refSexo;
    if (override?.outcome)              setOutcome(override.outcome);
    if (override?.preds)                setPreds(new Set(override.preds));
    if (override?.ign !== undefined)    setIncluirIgnorado(override.ign);
    if (override?.missing !== undefined) setAusenteComoAusencia(override.missing);
    if (override?.refFaixa)             setRefFaixa(override.refFaixa);
    if (override?.refSexo)              setRefSexo(override.refSexo);
    if (pr.length === 0) return;

    const conflict = sexPredictorConflict(pr, filtros);
    if (conflict) { setError(conflict); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analise/regressao", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ outcome: oc, preditores: pr, filtros, incluirIgnorado: ign, ausenteComoAusencia: missing, refFaixa: rf, refSexo: rs }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as RegressaoResponse;
      if (controller.signal.aborted) return;
      setResult(data);
      setExecutedKey(regressionSettingsKey({ outcome: oc, preditores: [...pr].sort(), filtros, incluirIgnorado: ign, ausenteComoAusencia: missing, refFaixa: rf, refSexo: rs }));
      setTab("tabela");
      syncUrl(oc, pr, ign, missing, rf, rs);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [outcome, preds, filtros, incluirIgnorado, ausenteComoAusencia, refFaixa, refSexo, syncUrl]);

  // Auto-executa ao montar se a URL já traz um modelo (link compartilhado)
  const didAutoRun = useRef(false);
  useEffect(() => {
    if (didAutoRun.current && !requestRef.current?.signal.aborted) return;
    didAutoRun.current = true;
    if (searchParams.get("out") && preds.size > 0) executar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!result) return;

    const rows: (string | number | null)[][] = [];

    // Metadados
    rows.push(["SivepLens — Regressão Logística Multivariada"]);
    rows.push(["Gerado em", new Date().toLocaleString("pt-BR")]);
    rows.push([]);
    rows.push(["Desfecho", result.outcome.label]);
    rows.push(["Evento", result.outcome.eventLabel]);
    rows.push(["Filtros", filtrosLabel(result.manifest.filters)]);
    rows.push([]);

    // Métricas do modelo
    rows.push(["MÉTRICAS DO MODELO"]);
    rows.push(["N (casos no modelo)", result.meta.n]);
    rows.push(["N elegíveis (antes de excluir ausentes)", result.meta.nRaw]);
    rows.push(["N excluídos (dados ausentes / ignorados)", result.meta.nExcluded]);
    rows.push(["Eventos", result.meta.events]);
    rows.push(["Taxa de eventos", csvNum(result.meta.taxaEventos, 4)]);
    rows.push(["AIC", csvNum(result.meta.aic, 2)]);
    rows.push(["Deviance nula", csvNum(result.meta.devianceNull, 2)]);
    rows.push(["Deviance ajustada", csvNum(result.meta.deviance, 2)]);
    rows.push(["R² de McFadden", csvNum(result.meta.r2McFadden, 4)]);
    rows.push(["Teste Omnibus (χ²)", csvNum(result.meta.omnibusChi2, 4)]);
    rows.push(["Teste Omnibus (gl)", result.meta.omnibusDf]);
    rows.push(["Teste Omnibus (p)", csvPValue(result.meta.omnibusPValue)]);
    rows.push(["AUC", csvNum(result.meta.auc, 4)]);
    rows.push(["Hosmer–Lemeshow (χ²)", csvNum(result.meta.hosmerLemeshowChi2, 4)]);
    rows.push(["Hosmer–Lemeshow (gl)", result.meta.hosmerLemeshowDf]);
    rows.push(["Hosmer–Lemeshow (p)", csvPValue(result.meta.hosmerLemeshowPValue)]);
    rows.push(["Convergência", result.meta.converged ? "Sim" : "Não"]);
    rows.push(["Iterações (IRLS)", result.meta.iteracoes]);
    rows.push(["Ignorado como categoria", result.incluirIgnorado ? "Sim" : "Não"]);
    rows.push(["Ausente tratado como ausência", result.ausenteComoAusencia ? "Sim" : "Não"]);
    rows.push([]);

    // Tabela de coeficientes
    rows.push(["COEFICIENTES"]);
    rows.push(["Variável", "aOR", "IC 95% Inferior", "IC 95% Superior", "z", "p-valor", "Significância"]);

    for (const l of result.coeficientes) {
      if (l.isIntercept) continue;
      if (l.isReferencia) {
        rows.push([l.nome, "1.0000", "referência", "", "", "", "ref."]);
        continue;
      }
      const sig = !result.meta.converged || !Number.isFinite(l.pValue) ? "indisponível" :
        Number.isFinite(l.pValue) && l.pValue < 0.001 ? "***" :
        Number.isFinite(l.pValue) && l.pValue < 0.01  ? "**"  :
        Number.isFinite(l.pValue) && l.pValue < 0.05  ? "*"   :
        "ns";
      rows.push([
        l.nome,
        csvNum(l.aOR),
        csvNum(l.ci95Low),
        csvNum(l.ci95High),
        Number.isFinite(l.z) ? csvNum(l.z) : "",
        csvPValue(l.pValue),
        sig,
      ]);
    }

    rows.push([]);
    rows.push(["ID da análise", result.manifest.analysisId]);
    rows.push(["Referências", referenceSummary(result.coeficientes)]);
    for (const warning of result.manifest.disclosureControl.warnings) rows.push(["AVISO", warning]);
    rows.push(["NOTA", "aOR = Odds Ratio ajustado. IC 95% método de Wald. Análise via SivepLens / SIVEP-Gripe / OpenDataSUS."]);
    rows.push(["AVISO MISSING", result.ausenteComoAusencia
      ? "Reprodução publicada: somente código 1 é presença; código 2, 9, NULL e demais valores são ausência não registrada."
      : result.incluirIgnorado
        ? "Código 9 / NULL tratados como dummy separada ('Ignorado/ausente')."
        : "Complete Case Analysis (CCA): registros com dados ausentes ou Ignorado excluídos."]);

    const ano = result.manifest.filters.ano_epi ?? result.manifest.filters.anos_epi?.join("-") ?? "todos";
    downloadCSV(`regressao-logistica-${result.outcome.campo}-${ano}`, rows);
  }, [result]);

  const handleExportManifest = useCallback(() => {
    if (!result) return;
    downloadJSON(`siveplens-regressao-${result.manifest.analysisId}`, result);
  }, [result]);

  const canRun = preds.size > 0 && !isLoading && !sexConflict;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ── Painel de configuração ────────────────────────────────────────── */}
      <div className="w-full lg:w-72 xl:w-80 shrink-0">
        <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5 space-y-5">

          <h2 className="text-sm font-bold text-[#1C1C1C]">Configurar análise</h2>

          {/* ── Modelos prontos ─────────────────────────────────────────── */}
          <div>
            <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-2">Modelos prontos</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS_REG.map((p) => (
                <button
                  key={p.label}
                  type="button"
                    onClick={() => executar({ outcome: p.outcome, preds: p.preds, ign: false, missing: p.missing ?? false })}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Outcome ─────────────────────────────────────────────────── */}
          <div>
            <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-2">
              Desfecho (outcome)
            </div>
            <div className="space-y-2">
              {OUTCOMES_DISPLAY.map((o) => (
                <label key={o.campo} className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="outcome"
                    value={o.campo}
                    checked={outcome === o.campo}
                    onChange={() => setOutcome(o.campo)}
                    className="accent-[#1a3a30] mt-0.5 shrink-0"
                  />
                  <span className="text-xs text-[#1C1C1C]">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Preditores ──────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest">
                Preditores
              </div>
              <span className="text-[10px] text-[#94A3B8]">
                {preds.size} selecionado{preds.size !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3">
              {PRED_GRUPOS.map((grupo) => {
                const campos    = grupo.preditores.map((p) => p.campo);
                const allSel    = campos.every((c) => preds.has(c));
                const someSel   = campos.some((c)  => preds.has(c));

                return (
                  <div key={grupo.categoria}>
                    {/* Cabeçalho do grupo com checkbox select-all */}
                    <button
                      type="button"
                      onClick={() => toggleGrupo(campos)}
                      className="flex items-center gap-1.5 w-full text-left mb-1.5"
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        allSel  ? "bg-[#1a3a30] border-[#1a3a30]" :
                        someSel ? "bg-[#C7D7F9] border-[#1a3a30]" :
                        "border-[#c5ddd6] bg-white"
                      }`}>
                        {allSel && (
                          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.8">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {someSel && !allSel && (
                          <div className="w-1.5 h-0.5 bg-[#1a3a30]" />
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-[#555770]">{grupo.categoria}</span>
                    </button>

                    {/* Checkboxes individuais */}
                    <div className="ml-4 space-y-1.5">
                      {grupo.preditores.map((pred) => (
                        <label key={pred.campo} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={preds.has(pred.campo)}
                            onChange={() => togglePred(pred.campo)}
                            className="accent-[#1a3a30] shrink-0"
                          />
                          <span className="text-xs text-[#1C1C1C]">{pred.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Opções avançadas ─────────────────────────────────────────── */}
          <div className="border-t border-[#eaf5f1] pt-4">
            <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-2.5">
              Dados ausentes
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={incluirIgnorado}
                onChange={(e) => {
                  setIncluirIgnorado(e.target.checked);
                  if (e.target.checked) setAusenteComoAusencia(false);
                }}
                className="accent-[#1a3a30] mt-0.5 shrink-0"
              />
              <div>
                <div className="text-xs font-semibold text-[#1C1C1C]">
                  Incluir &quot;Ignorado&quot; como categoria
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5 leading-relaxed">
                  Código 9 e NULL viram uma dummy separada (aOR vs. Não).
                  Pode aumentar o N efetivo; não identifica o mecanismo de ausência.
                  Não se aplica a Sexo e Faixa etária.
                </div>
              </div>
            </label>
            <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ausenteComoAusencia}
                onChange={(e) => {
                  setAusenteComoAusencia(e.target.checked);
                  if (e.target.checked) setIncluirIgnorado(false);
                }}
                className="accent-[#1a3a30] mt-0.5 shrink-0"
              />
              <div>
                <div className="text-xs font-semibold text-[#1C1C1C]">
                  Presença versus ausência não registrada
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5 leading-relaxed">
                  Somente código 1 vira presença; 2, 9 e vazio viram ausência.
                  Use apenas para reproduzir estudos com essa dicotomização.
                </div>
              </div>
            </label>
          </div>

          {/* ── Categoria de referência ──────────────────────────────────── */}
          {(preds.has("faixa_etaria") || preds.has("cs_sexo")) && (
            <div className="border-t border-[#eaf5f1] pt-4">
              <div className="text-[11px] font-bold text-[#555770] uppercase tracking-widest mb-2.5">
                Categoria de referência
              </div>
              <div className="space-y-3">
                {preds.has("faixa_etaria") && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#555770] mb-1.5">Faixa etária (ref.)</div>
                    <div className="flex flex-wrap gap-1">
                      {FAIXA_LEVELS.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setRefFaixa(level)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            refFaixa === level
                              ? "bg-[#1a3a30] border-[#1a3a30] text-white font-bold"
                              : "border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {preds.has("cs_sexo") && (
                  <div>
                    <div className="text-[10px] font-semibold text-[#555770] mb-1.5">Sexo (ref.)</div>
                    <div className="flex gap-1">
                      {(["F", "M"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRefSexo(s)}
                          className={`text-[10px] px-3 py-0.5 rounded-full border transition-colors ${
                            refSexo === s
                              ? "bg-[#1a3a30] border-[#1a3a30] text-white font-bold"
                              : "border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
                          }`}
                        >
                          {s === "F" ? "Feminino" : "Masculino"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-[10px] text-[#94A3B8] mt-2 leading-relaxed">
                As outras categorias serão comparadas à referência escolhida.
                {" "}Isso não filtra a população. Após mudar a referência, clique em Executar regressão.
              </div>
            </div>
          )}

          {/* ── Filtros ativos ───────────────────────────────────────────── */}
          <div className="bg-[#eaf5f1] border border-[#C7D7F9] rounded-lg px-3 py-2">
            <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">Filtros ativos</div>
            <div className="text-[11px] text-[#1a3a30] font-medium">{filtrosLabel(filtros)}</div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">Herdados do painel principal</div>
          </div>

          {/* ── Botão executar ───────────────────────────────────────────── */}
          {sexConflict && <p role="alert" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{sexConflict}</p>}
          <button
            type="button"
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ajustando modelo…
              </span>
            ) : "Executar regressão ▶"}
          </button>

        </div>
      </div>

      {/* ── Área de resultados ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {resultOutdated && !isLoading && (
          <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Os filtros ou a configuração mudaram. Clique em Executar regressão para atualizar.
            Os resultados e downloads abaixo ainda correspondem à execução anterior, identificada no cabeçalho.
          </div>
        )}

        {/* Estado vazio */}
        {!result && !isLoading && !error && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-12 text-center">
            <div className="text-5xl mb-3 opacity-20 font-serif">β</div>
            <div className="text-sm font-medium text-[#555770]">
              Selecione um desfecho e preditores para ajustar o modelo
            </div>
            <div className="text-xs text-[#94A3B8] mt-2">
              Regressão logística multivariada via IRLS · aOR com IC 95% · p-valor (z-test)
            </div>
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-base shrink-0">✕</span>
              <div>
                <div className="text-sm font-semibold text-red-700 mb-1">Erro na análise</div>
                <div className="text-sm text-red-600">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-4 animate-pulse">
            <div className="h-5 w-72 bg-[#E4E7EC] rounded" />
            <div className="h-3 w-48 bg-[#E4E7EC] rounded" />
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[...Array(8)].map((_, i) => <div key={i} className="h-16 bg-[#E4E7EC] rounded-lg" />)}
            </div>
            <div className="h-64 bg-[#E4E7EC] rounded-xl mt-2" />
          </div>
        )}

        {/* Resultados */}
        {result && !isLoading && (
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-6 space-y-6">

            {/* Cabeçalho */}
            <div>
              <h3 className="text-base font-bold text-[#1C1C1C]">
                Regressão Logística Multivariada
              </h3>
              <p className="text-xs text-[#555770] mt-0.5">
                Desfecho: <strong>{result.outcome.label}</strong>
                {" · "}
                {filtrosLabel(result.manifest.filters)}
              </p>
            </div>

            {/* ── Métricas do modelo ───────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="N (casos)" value={result.meta.n.toLocaleString("pt-BR")} />
              <StatCard
                label={result.outcome.eventLabel}
                value={result.meta.events.toLocaleString("pt-BR")}
                sub={`${(result.meta.taxaEventos * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`}
              />
              <StatCard label="R² McFadden" value={fmt2(result.meta.r2McFadden)} sub="ajuste global do modelo" />
              <StatCard label="AUC" value={fmt2(result.meta.auc)} sub="discriminação" />
              <StatCard
                label="Hosmer–Lemeshow"
                value={result.meta.hosmerLemeshowDf > 0 ? `p ${fmtP(result.meta.hosmerLemeshowPValue)}` : "Indisponível"}
                sub={result.meta.hosmerLemeshowDf > 0 ? "calibração por grupos" : "grupos insuficientes para o teste"}
              />
              <StatCard
                label="Teste Omnibus"
                value={`p ${fmtP(result.meta.omnibusPValue)}`}
                sub={`χ² ${fmt2(result.meta.omnibusChi2)} · ${result.meta.omnibusDf} gl`}
              />
              <StatCard
                label="AIC"
                value={result.meta.aic.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                sub="menor = melhor"
              />
              <StatCard
                label="Deviance nula"
                value={result.meta.devianceNull.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              />
              <StatCard
                label="Deviance ajustada"
                value={result.meta.deviance.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              />
              <StatCard
                label="Redução da deviance"
                value={`${(((result.meta.devianceNull - result.meta.deviance) / result.meta.devianceNull) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
              />
              <StatCard
                label="Convergência"
                value={result.meta.converged ? `Sim (${result.meta.iteracoes} iter.)` : `Não (${result.meta.iteracoes})`}
                sub={result.meta.converged ? undefined : "⚠ resultados instáveis"}
              />
            </div>

            {/* ── Funil de atrito ──────────────────────────────────────── */}
            <AttritionFunnel
              nRaw={result.meta.nRaw}
              nExcluded={result.meta.nExcluded}
              nModel={result.meta.n}
            />

            {/* ── Avisos do modelo ─────────────────────────────────────── */}
            {result.avisos.length > 0 && (
              <div className="space-y-2">
                {result.avisos.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                    <span className="text-xs text-amber-700">{a}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Resultados: tabela + forest plot ─────────────────────── */}
            <div className="border-t border-[#eaf5f1] pt-5">
              {/* Tabs + botão exportar */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h4 className="text-sm font-bold text-[#1C1C1C]">Resultados</h4>
                <div className="flex gap-1 bg-[#eaf5f1] rounded-lg p-0.5">
                  {(["tabela", "forest"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        tab === t
                          ? "bg-white text-[#1a3a30] shadow-sm border border-[#c5ddd6]"
                          : "text-[#555770] hover:text-[#1a3a30]"
                      }`}
                    >
                      {t === "tabela" ? "Tabela de coeficientes" : "Forest Plot"}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copiarLink}
                    disabled={resultOutdated}
                    title={resultOutdated ? "Execute novamente para compartilhar a configuração atual" : "Copiar link deste modelo"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                  >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6.5 9.5l3-3M7 4.3l.9-.9a2.4 2.4 0 0 1 3.4 3.4l-.9.9M9 11.7l-.9.9a2.4 2.4 0 0 1-3.4-3.4l.9-.9" />
                    </svg>
                    {linkCopied ? "Copiado!" : "Copiar link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    title="Exportar modelo e coeficientes como CSV"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                  >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v8M5 7l3 3 3-3" />
                      <path d="M3 12h10" />
                    </svg>
                    Exportar CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportManifest}
                    title="Exportar modelo e manifesto auditável"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1a3a30] bg-[#eaf5f1] border border-[#c5ddd6] hover:bg-[#dceee8] transition-colors"
                  >
                    JSON + manifesto
                  </button>
                </div>
              </div>

              <div className="bg-[#f4fbf8] rounded-xl border border-[#E4E7EC] px-5 py-5">
                {tab === "tabela" && <CoefTable linhas={result.coeficientes} />}
                {tab === "forest" && <MultiForestPlot linhas={result.coeficientes} />}
              </div>
            </div>

            <ProvenanceNotice manifest={result.manifest} />
            <details className="rounded-xl border border-[#c5ddd6] bg-[#f4fbf8] px-4 py-3 text-xs text-[#315e50]">
              <summary className="cursor-pointer font-bold">Manifesto auditável · {result.manifest.analysisId}</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed">{JSON.stringify(result.manifest, null, 2)}</pre>
            </details>

            {/* ── Interpretação automática ─────────────────────────────── */}
            {(() => {
              const { paragrafos, notaMetodos } = buildInterpretacao(result);
              const temSig = result.meta.converged && result.avisos.length === 0 && result.coeficientes.some(
                (l) => !l.isIntercept && !l.isReferencia && Number.isFinite(l.pValue) && l.pValue < 0.05
              );
              return (
                <div className="space-y-3">
                  <div className={`rounded-xl border px-5 py-4 text-sm leading-relaxed ${
                    temSig
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-[#f4fbf8] border-[#c5ddd6] text-[#555770]"
                  }`}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-3 opacity-60">
                      Interpretação automática
                    </div>
                    <div className="space-y-3">
                      {paragrafos.map((p, i) => (
                        <p key={i} className="whitespace-pre-line">{p}</p>
                      ))}
                    </div>
                  </div>
                  <details>
                    <summary className="text-[11px] text-[#1a3a30] cursor-pointer hover:underline select-none">
                      Nota para seção de métodos (expandir)
                    </summary>
                    <div className="mt-2 bg-[#f4fbf8] border border-[#E4E7EC] rounded-lg p-3 text-[11px] text-[#555770] leading-relaxed font-mono select-all">
                      {notaMetodos}
                    </div>
                  </details>
                </div>
              );
            })()}

            {/* ── Rodapé de notas ──────────────────────────────────────── */}
            <div className="text-[10px] text-[#94A3B8] space-y-0.5 border-t border-[#eaf5f1] pt-4">
              <p>* p &lt; 0,05 · ** p &lt; 0,01 · *** p &lt; 0,001 · ns = não significativo</p>
              <p>
                aOR = Odds Ratio ajustado · IC 95% = intervalo de confiança 95% (Wald) ·
                {referenceSummary(result.coeficientes).replace(/\.$/, "")}
                {result.ausenteComoAusencia
                  ? "; código 1 como presença e todos os demais valores como ausência não registrada"
                  : result.incluirIgnorado ? "; código 9 / NULL como categoria 'Ignorado/ausente'" : ""}.
              </p>
              <p>
                A regressão multivariada utilizou{" "}
                {result.ausenteComoAusencia
                  ? "dicotomização de reprodução (presença = código 1; ausência não registrada = qualquer outro valor)"
                  : result.incluirIgnorado
                    ? "análise com categoria 'Ignorado' explícita (código 9 e NULL tratados como dummy separada)"
                    : "Complete Case Analysis (CCA), excluindo registros com dados ausentes ou codificados como 'Ignorado' em qualquer preditor selecionado"}.
                {" "}Resultados devem ser interpretados considerando o potencial viés de exclusão inerente às
                falhas de preenchimento do SIVEP-Gripe.
                Dados: SIVEP-Gripe/OpenDataSUS.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
