/**
 * Retorna o domingo de início da semana epidemiológica N do ano Y.
 * Segue o padrão brasileiro/OMS: semana 1 é a que contém o dia 4 de janeiro.
 */
export function semNotToDate(year: number, semNot: number): Date {
  const jan4 = new Date(year, 0, 4);
  const weekOneStart = new Date(jan4);
  weekOneStart.setDate(jan4.getDate() - jan4.getDay()); // recua para o domingo
  const result = new Date(weekOneStart);
  result.setDate(weekOneStart.getDate() + (semNot - 1) * 7);
  return result;
}

/** Formata uma data como DD/MM */
export function fmtDDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Formata uma data como DD/MM/YY */
export function fmtDDMMYY(d: Date): string {
  return `${fmtDDMM(d)}/${String(d.getFullYear()).slice(2)}`;
}
