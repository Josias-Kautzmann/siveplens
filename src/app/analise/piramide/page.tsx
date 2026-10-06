import { parseFilters } from "@/lib/filter-utils";
import { getPiramideEtaria } from "@/dal/casos.repo";
import PiramideClient from "../_components/PiramideClient";

function filtrosLabel(filtros: ReturnType<typeof parseFilters>): string {
  const parts: string[] = [];
  if (filtros.ano_epi)            parts.push(String(filtros.ano_epi));
  if (filtros.sg_uf?.length)      parts.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.co_mun_res?.length) parts.push(`Mun: ${filtros.co_mun_res.join(", ")}`);
  if (filtros.etiologia?.length)  parts.push(`Etio: ${filtros.etiologia.join(", ")}`);
  if (filtros.evolucao?.length)   parts.push(`Desfecho: ${filtros.evolucao.join(", ")}`);
  return parts.length ? parts.join(" · ") : "Brasil — todos os anos";
}

export default async function PiramidetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params  = await searchParams;
  const filtros = parseFilters(params);
  const dados   = await getPiramideEtaria(filtros);
  const totalN  = dados.reduce((s, d) => s + d.n, 0);

  return (
    <PiramideClient
      dados={dados}
      totalN={totalN}
      filtrosLabel={filtrosLabel(filtros)}
    />
  );
}
