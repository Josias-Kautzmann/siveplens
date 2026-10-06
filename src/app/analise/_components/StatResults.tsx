"use client";

import type { VariableInfo } from "@/lib/variable-catalog";
import {
  type ChiSquareResult,
  type OddsRatioResult,
  type RiscoRelativoResult,
  type FisherResult,
  formatPValue,
  formatNumber,
  interpretCramersV,
} from "@/lib/stat-utils";

interface Props {
  chi2Result:   ChiSquareResult;
  orResult:     OddsRatioResult    | null;
  rrResult:     RiscoRelativoResult | null;
  fisherResult: FisherResult        | null;
  cramersV:     number;
  varXInfo:     VariableInfo;
  varYInfo:     VariableInfo;
  xCasoLabel:   string;
  xRefLabel:    string;
  yCasoLabel:   string;
  yRefLabel:    string;
  totalN:       number;
  excludedN:    number;
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-center ${highlight ? "bg-[#EEF3FF] border-[#C7D7F9]" : "bg-[#f4fbf8] border-[#E4E7EC]"}`}>
      <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-[#1a3a30]" : "text-[#1C1C1C]"}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  );
}

function PValueBadge({ p, label }: { p: number; label?: string }) {
  const sig = p < 0.05;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
      sig ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-[#555770] bg-slate-50 border-slate-200"
    }`}>
      {label && <span className="opacity-60">{label}</span>}
      p {p < 0.001 ? "< 0,001" : `= ${formatPValue(p)}`}
    </span>
  );
}

function buildInterpretation(
  chi2:    ChiSquareResult,
  fisher:  FisherResult | null,
  or:      OddsRatioResult | null,
  rr:      RiscoRelativoResult | null,
  cramersV: number,
  varXInfo: VariableInfo,
  varYInfo: VariableInfo,
  xCasoLabel: string, xRefLabel: string,
  yCasoLabel: string,
  n: number,
): string {
  // Usa Fisher quando esperados baixos, caso contrário χ²
  const pRef     = fisher && chi2.lowExpectedWarning ? fisher.pValue : chi2.pValue;
  const sig      = pRef < 0.05;
  const testName = fisher && chi2.lowExpectedWarning
    ? "Teste Exato de Fisher"
    : "teste qui-quadrado de Pearson";
  const pStr     = pRef < 0.001 ? "p < 0,001" : `p = ${formatPValue(pRef)}`;

  if (or && rr) {
    const direcaoOR = or.or < 1
      ? `${Math.round((1 - or.or) * 100)}% menores`
      : `${Math.round((or.or - 1) * 100)}% maiores`;
    const direcaoRR = rr.rr < 1
      ? `${Math.round((1 - rr.rr) * 100)}% menor`
      : `${Math.round((rr.rr - 1) * 100)}% maior`;

    if (sig) {
      return (
        `A associação entre ${varXInfo.label} e ${varYInfo.label} foi estatisticamente significativa ` +
        `(${testName}: ${pStr}; N = ${n.toLocaleString("pt-BR")}). ` +
        `Nos registros analisados, o grupo ${varXInfo.label} = ${xCasoLabel} apresentou odds de ${yCasoLabel} ${direcaoOR} ` +
        `em relação ao grupo ${xRefLabel} (OR = ${formatNumber(or.or)}; IC 95%: ${formatNumber(or.ci95Low)} – ${formatNumber(or.ci95High)}). ` +
        `O risco relativo foi de ${formatNumber(rr.rr)} ` +
        `(IC 95%: ${formatNumber(rr.ci95Low)} – ${formatNumber(rr.ci95High)}), ` +
        `A proporção observada do desfecho ${yCasoLabel} foi ${direcaoRR} no grupo ${xCasoLabel}, comparado ao grupo ${xRefLabel}.`
      );
    }
    return (
      `Não houve associação estatisticamente significativa entre ${varXInfo.label} e ${varYInfo.label} ` +
      `(${testName}: ${pStr}; N = ${n.toLocaleString("pt-BR")}). ` +
      `OR = ${formatNumber(or.or)} (IC 95%: ${formatNumber(or.ci95Low)} – ${formatNumber(or.ci95High)}); ` +
      `RR = ${formatNumber(rr.rr)} (IC 95%: ${formatNumber(rr.ci95Low)} – ${formatNumber(rr.ci95High)}).`
    );
  }

  // NxM — sem OR/RR
  const efeitoStr = interpretCramersV(cramersV);
  const chi2Str = `(χ² = ${formatNumber(chi2.chi2)}, gl = ${chi2.df}, p = ${formatPValue(chi2.pValue)}; N = ${n.toLocaleString("pt-BR")})`;
  if (sig) {
    return (
      `O ${testName} indicou associação estatisticamente significativa entre ` +
      `${varXInfo.label} e ${varYInfo.label} ${chi2Str}. ` +
      `O V de Cramér indica efeito ${efeitoStr} (V = ${formatNumber(cramersV, 3)}).`
    );
  }
  return (
    `O ${testName} não encontrou associação estatisticamente significativa entre ` +
    `${varXInfo.label} e ${varYInfo.label} ${chi2Str}. ` +
    `V de Cramér = ${formatNumber(cramersV, 3)} (efeito ${efeitoStr}).`
  );
}

export default function StatResults({
  chi2Result, orResult, rrResult, fisherResult, cramersV,
  varXInfo, varYInfo,
  xCasoLabel, xRefLabel, yCasoLabel,
  totalN, excludedN,
}: Props) {
  const is2x2 = !!orResult;
  const pPreferred = fisherResult && chi2Result.lowExpectedWarning
    ? fisherResult.pValue
    : chi2Result.pValue;
  const sig = pPreferred < 0.05;

  const interpretation = buildInterpretation(
    chi2Result, fisherResult, orResult, rrResult, cramersV,
    varXInfo, varYInfo,
    xCasoLabel, xRefLabel, yCasoLabel, totalN,
  );

  return (
    <div className="space-y-4">

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      {is2x2 ? (
        /* Tabela 2×2: 6 cards em 2 linhas de 3 */
        <div className="grid grid-cols-3 gap-3">
          {/* Linha 1 — estatísticas do teste */}
          <Kpi
            label="χ² de Pearson"
            value={formatNumber(chi2Result.chi2)}
            sub={`gl = ${chi2Result.df}`}
          />
          <Kpi
            label="p-valor (χ²)"
            value={formatPValue(chi2Result.pValue)}
            sub={chi2Result.pValue < 0.05 ? "significativo" : "n.s."}
          />
          <Kpi
            label="p-valor (Fisher)"
            value={formatPValue(fisherResult!.pValue)}
            sub={chi2Result.lowExpectedWarning ? "⚠ usar este" : "bilateral"}
            highlight={chi2Result.lowExpectedWarning}
          />
          {/* Linha 2 — medidas de associação */}
          <Kpi
            label="V de Cramér"
            value={formatNumber(cramersV, 3)}
            sub={interpretCramersV(cramersV)}
          />
          <Kpi
            label="Odds Ratio"
            value={formatNumber(orResult!.or)}
            sub={`IC 95%: ${formatNumber(orResult!.ci95Low)} – ${formatNumber(orResult!.ci95High)}`}
          />
          <Kpi
            label="Risco Relativo"
            value={formatNumber(rrResult!.rr)}
            sub={`IC 95%: ${formatNumber(rrResult!.ci95Low)} – ${formatNumber(rrResult!.ci95High)}`}
          />
        </div>
      ) : (
        /* NxM: 3 cards */
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi
            label="χ² de Pearson"
            value={formatNumber(chi2Result.chi2)}
            sub={`gl = ${chi2Result.df}`}
          />
          <Kpi
            label="P-valor"
            value={formatPValue(chi2Result.pValue)}
            sub={chi2Result.pValue < 0.05 ? "significativo (α = 0,05)" : "não significativo"}
          />
          <Kpi
            label="V de Cramér"
            value={formatNumber(cramersV, 3)}
            sub={interpretCramersV(cramersV)}
          />
        </div>
      )}

      {/* ── Resultado resumido ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#555770]">Resultado:</span>
        <PValueBadge p={chi2Result.pValue} label="χ²" />
        {fisherResult && <PValueBadge p={fisherResult.pValue} label="Fisher" />}
        {sig ? (
          <span className="text-xs text-emerald-700 font-medium">associação estatisticamente significativa</span>
        ) : (
          <span className="text-xs text-[#555770]">sem associação significativa ao nível α = 0,05</span>
        )}
      </div>

      {/* ── Interpretação automática ───────────────────────────────────────── */}
      <div className={`rounded-xl border px-5 py-4 text-sm leading-relaxed ${
        sig
          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
          : "bg-[#f4fbf8] border-[#c5ddd6] text-[#555770]"
      }`}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60">Interpretação automática</div>
        {interpretation}
        <p className="mt-2 text-xs">Esta é uma associação bruta, sem ajuste por idade ou outros fatores. Refere-se aos registros com dados disponíveis no recorte selecionado; não demonstra causalidade nem estima o risco na população geral.</p>
      </div>

      {/* ── Avisos ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {chi2Result.lowExpectedWarning && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            <strong>⚠ Frequência esperada baixa:</strong> uma ou mais células têm frequência esperada &lt; 5.
            {fisherResult
              ? " O teste exato de Fisher foi calculado e é mais adequado — use o p-valor Fisher."
              : " Considere usar o teste exato de Fisher para tabelas 2×2."}
          </div>
        )}
        {orResult?.continuity && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <strong>⚠ Correção de continuidade (OR/RR):</strong> célula com valor zero — foi adicionado 0,5 para o cálculo.
          </div>
        )}
        {excludedN > 0 && (
          <div className="text-[11px] text-[#555770] bg-[#f4fbf8] border border-[#c5ddd6] rounded-lg px-3 py-2">
            <strong>{excludedN.toLocaleString("pt-BR")}</strong> registro{excludedN !== 1 ? "s" : ""} excluído{excludedN !== 1 ? "s" : ""} da análise
            (NULL ou valor Ignorado nas variáveis selecionadas).
            N efetivo = {totalN.toLocaleString("pt-BR")}.
            {" "}Exclusões: {formatNumber(100 * excludedN / (totalN + excludedN), 1)}% dos registros elegíveis. Os registros restantes podem diferir dos excluídos.
          </div>
        )}
        {!is2x2 && chi2Result.df > 0 && (
          <div className="text-[11px] text-[#555770] bg-[#f4fbf8] border border-[#c5ddd6] rounded-lg px-3 py-2">
            OR, RR e Fisher não calculados: tabela {chi2Result.expectedCounts.length}×{chi2Result.expectedCounts[0]?.length ?? "?"} — essas medidas requerem tabela 2×2.
            Use o V de Cramér como medida de efeito.
          </div>
        )}
      </div>

      {/* ── Tabela de comparação OR vs RR (só 2×2) ─────────────────────────── */}
      {is2x2 && orResult && rrResult && (
        <details className="group">
          <summary className="text-[11px] text-[#1a3a30] cursor-pointer hover:underline select-none">
            OR vs. RR — quando usar cada um? (expandir)
          </summary>
          <div className="mt-2 bg-[#eaf5f1] border border-[#C7D7F9] rounded-lg p-3 text-[11px] text-[#555770] leading-relaxed space-y-1.5">
            <p>
              <strong className="text-[#1a3a30]">Odds Ratio (OR = {formatNumber(orResult.or)})</strong> — mede a razão de chances.
              Adequado para estudos caso-controle ou quando o desfecho é raro (&lt; 10%). Em desfechos comuns, superestima o risco real.
            </p>
            <p>
              <strong className="text-[#1a3a30]">Risco Relativo (RR = {formatNumber(rrResult.rr)})</strong> — mede a razão de probabilidades.
              Preferido em estudos de coorte e transversais. Mais intuitivo para comunicação de resultados.
              {Math.abs(orResult.or - rrResult.rr) > 0.1 * rrResult.rr &&
                " ⚠ OR e RR diferem significativamente — o desfecho provavelmente não é raro nesta amostra; prefira o RR."}
            </p>
            <p>
              <strong className="text-[#1a3a30]">Banco SIVEP-Gripe</strong> — estudo transversal de base hospitalar;
              o <strong>RR é geralmente mais adequado</strong> para a maioria dos cruzamentos deste conjunto de dados.
            </p>
          </div>
        </details>
      )}

      {/* ── Nota metodológica ──────────────────────────────────────────────── */}
      <details className="group">
        <summary className="text-[11px] text-[#1a3a30] cursor-pointer hover:underline select-none">
          Nota para seção de métodos (expandir)
        </summary>
        <div className="mt-2 bg-[#f4fbf8] border border-[#E4E7EC] rounded-lg p-3 text-[11px] text-[#555770] leading-relaxed font-mono select-all">
          {is2x2
            ? `A associação entre ${varXInfo.label} e ${varYInfo.label} foi avaliada pelo teste qui-quadrado de Pearson e pelo teste exato de Fisher (α = 0,05). ` +
              `O Odds Ratio e o Risco Relativo, com respectivos intervalos de confiança de 95% (método de Wald), foram calculados para a tabela 2×2. ` +
              `O V de Cramér foi calculado como medida de tamanho de efeito. ` +
              `${chi2Result.lowExpectedWarning ? "Uma ou mais células apresentaram frequência esperada < 5; o p-valor do Fisher foi utilizado como referência. " : ""}` +
              `Registros com valores ausentes ou ignorados foram excluídos (N excluídos = ${excludedN.toLocaleString("pt-BR")}). ` +
              `Análise realizada sobre dados SIVEP-Gripe/OpenDataSUS via SivepLens (N efetivo = ${totalN.toLocaleString("pt-BR")}).`
            : `A associação entre ${varXInfo.label} e ${varYInfo.label} foi avaliada pelo teste qui-quadrado de Pearson (α = 0,05). ` +
              `O V de Cramér foi calculado como medida de tamanho de efeito. ` +
              `Registros com valores ausentes ou ignorados foram excluídos (N excluídos = ${excludedN.toLocaleString("pt-BR")}). ` +
              `Análise realizada sobre dados SIVEP-Gripe/OpenDataSUS via SivepLens (N efetivo = ${totalN.toLocaleString("pt-BR")}).`
          }
        </div>
      </details>
    </div>
  );
}
