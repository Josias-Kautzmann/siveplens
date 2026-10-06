"use client";

import type { VariableInfo } from "@/lib/variable-catalog";
import { getValueLabel } from "@/lib/variable-catalog";
import type { ContingenciaCell } from "@/app/api/analise/contingencia/route";

type DisplayMode = "n" | "pct_row" | "pct_col";

interface Props {
  cells:       ContingenciaCell[];
  varXInfo:    VariableInfo;
  varYInfo:    VariableInfo;
  mode:        DisplayMode;
  onModeChange: (m: DisplayMode) => void;
  expectedCounts?: number[][];  // [rowIdx][colIdx]
  showExpected:    boolean;
  onShowExpectedChange: (v: boolean) => void;
}

export default function ContingencyTable({
  cells, varXInfo, varYInfo, mode, onModeChange,
  expectedCounts, showExpected, onShowExpectedChange,
}: Props) {
  // Determine row/col value sets (preserving catalog order)
  const catalogXCodes = varXInfo.valores.map((v) => v.codigo);
  const catalogYCodes = varYInfo.valores.map((v) => v.codigo);

  const presentX = new Set(cells.map((c) => c.vx));
  const presentY = new Set(cells.map((c) => c.vy));

  const xValues = catalogXCodes.filter((c) => presentX.has(c));
  const yValues = catalogYCodes.filter((c) => presentY.has(c));

  // Build matrix[xi][yi]
  const matrix: number[][] = xValues.map(() => yValues.map(() => 0));
  for (const cell of cells) {
    const xi = xValues.indexOf(cell.vx);
    const yi = yValues.indexOf(cell.vy);
    if (xi >= 0 && yi >= 0) matrix[xi][yi] = cell.n;
  }

  const rowTotals = matrix.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = yValues.map((_, j) => matrix.reduce((s, r) => s + r[j], 0));
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);

  function cellValue(xi: number, yi: number): string {
    const n = matrix[xi][yi];
    if (mode === "n") return n.toLocaleString("pt-BR");
    if (mode === "pct_row") {
      const pct = rowTotals[xi] > 0 ? (n / rowTotals[xi]) * 100 : 0;
      return `${pct.toFixed(1).replace(".", ",")}%`;
    }
    const pct = colTotals[yi] > 0 ? (n / colTotals[yi]) * 100 : 0;
    return `${pct.toFixed(1).replace(".", ",")}%`;
  }

  const btnBase = "px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors";
  const btnActive = "bg-[#1a3a30] text-white border-[#1a3a30]";
  const btnInactive = "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30]";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {(["n", "pct_row", "pct_col"] as DisplayMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`${btnBase} ${mode === m ? btnActive : btnInactive}`}
            >
              {m === "n" ? "N" : m === "pct_row" ? "% linha" : "% coluna"}
            </button>
          ))}
        </div>
        {expectedCounts && (
          <label className="flex items-center gap-1.5 text-[11px] text-[#555770] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showExpected}
              onChange={(e) => onShowExpectedChange(e.target.checked)}
              className="accent-[#1a3a30]"
            />
            Mostrar frequências esperadas
          </label>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#c5ddd6]">
        <table className="w-full text-xs">
          <thead>
            {/* Y header */}
            <tr className="bg-[#f4fbf8] border-b border-[#c5ddd6]">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#555770] uppercase tracking-wide whitespace-nowrap" rowSpan={2}>
                {varXInfo.labelCurto}
                <span className="mx-1 text-[#94A3B8]">/</span>
                {varYInfo.labelCurto}
              </th>
              <th
                colSpan={yValues.length}
                className="px-4 py-2 text-center text-[10px] font-bold text-[#1a3a30] uppercase tracking-wide border-b border-[#c5ddd6]"
              >
                {varYInfo.label}
              </th>
              <th className="px-4 py-2 text-center text-[10px] font-bold text-[#555770] uppercase tracking-wide" rowSpan={2}>
                Total
              </th>
            </tr>
            <tr className="bg-[#f4fbf8] border-b border-[#c5ddd6]">
              {yValues.map((vy) => (
                <th key={vy} className="px-4 py-2 text-center font-semibold text-[#1C1C1C] whitespace-nowrap">
                  {getValueLabel(varYInfo, vy)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eaf5f1] bg-white">
            {xValues.map((vx, xi) => (
              <tr key={vx} className="hover:bg-[#f4fbf8]">
                <td className="px-4 py-2.5 font-semibold text-[#1C1C1C] whitespace-nowrap border-r border-[#eaf5f1]">
                  {getValueLabel(varXInfo, vx)}
                </td>
                {yValues.map((_, yi) => {
                  const exp = expectedCounts?.[xi]?.[yi];
                  const isLow = exp !== undefined && exp < 5;
                  return (
                    <td
                      key={yi}
                      className={`px-4 py-2.5 text-center tabular-nums ${isLow && showExpected ? "bg-amber-50" : ""}`}
                    >
                      <div className="font-medium">{cellValue(xi, yi)}</div>
                      {showExpected && exp !== undefined && (
                        <div className={`text-[10px] mt-0.5 ${isLow ? "text-amber-600 font-semibold" : "text-[#94A3B8]"}`}>
                          esp: {exp.toFixed(1).replace(".", ",")}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center font-bold text-[#1a3a30] tabular-nums border-l border-[#eaf5f1]">
                  {mode === "n"
                    ? rowTotals[xi].toLocaleString("pt-BR")
                    : grandTotal > 0
                      ? `${((rowTotals[xi] / grandTotal) * 100).toFixed(1).replace(".", ",")}%`
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#f4fbf8] border-t border-[#c5ddd6] font-bold">
              <td className="px-4 py-2.5 text-[#555770] text-[11px] uppercase tracking-wide">Total</td>
              {colTotals.map((ct, j) => (
                <td key={j} className="px-4 py-2.5 text-center tabular-nums text-[#1a3a30]">
                  {mode === "n"
                    ? ct.toLocaleString("pt-BR")
                    : mode === "pct_col"
                      ? "100,0%"
                      : grandTotal > 0
                        ? `${((ct / grandTotal) * 100).toFixed(1).replace(".", ",")}%`
                        : "—"}
                </td>
              ))}
              <td className="px-4 py-2.5 text-center tabular-nums text-[#1a3a30]">
                {grandTotal.toLocaleString("pt-BR")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-[#94A3B8]">
        Linhas = {varXInfo.label} · Colunas = {varYInfo.label}
      </p>
    </div>
  );
}
