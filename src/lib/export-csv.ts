/**
 * export-csv.ts
 * Utilitário para exportar tabelas como CSV (separador ponto-e-vírgula, BOM UTF-8).
 * O BOM garante que o Excel brasileiro abra o arquivo com encoding correto.
 */

type Cell = string | number | null | undefined;

function escapeCell(cell: Cell): string {
  const s = cell == null ? "" : String(cell);
  // RFC 4180: qualquer campo com delimitador, aspas ou quebra de linha deve ser
  // envolto em aspas duplas; aspas internas são duplicadas.
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r"))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Converte uma matriz de células em CSV e dispara o download no browser.
 * @param filename Nome do arquivo (sem extensão ou com ".csv")
 * @param rows     Array de linhas; cada linha é um array de células
 */
export function downloadCSV(filename: string, rows: Cell[][]): void {
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const content = rows.map((r) => r.map(escapeCell).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename: string, value: unknown): void {
  const name = filename.endsWith(".json") ? filename : `${filename}.json`;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Formata número com N casas decimais usando ponto como separador (seguro para CSV). */
export function csvNum(n: number | null | undefined, dec = 4): string {
  if (n == null || !isFinite(n) || isNaN(n)) return "";
  return n.toFixed(dec);
}

/** Keep very small positive probabilities distinct from zero in exported results. */
export function csvPValue(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n > 0 && n < 0.000001 ? n.toExponential(6) : n.toFixed(6);
}
