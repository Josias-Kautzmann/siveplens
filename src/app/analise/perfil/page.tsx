import { parseFilters } from "@/lib/filter-utils";
import { getPerfilSintomatologico } from "@/dal/casos.repo";
import PerfilClient from "../_components/PerfilClient";

function filtrosLabel(filtros: ReturnType<typeof parseFilters>): string {
  const parts: string[] = [];
  if (filtros.ano_epi)            parts.push(String(filtros.ano_epi));
  if (filtros.sg_uf?.length)      parts.push(`UF: ${filtros.sg_uf.join(", ")}`);
  if (filtros.co_mun_res?.length) parts.push(`Mun: ${filtros.co_mun_res.join(", ")}`);
  if (filtros.etiologia?.length)  parts.push(`Etio: ${filtros.etiologia.join(", ")}`);
  if (filtros.evolucao?.length)   parts.push(`Desfecho: ${filtros.evolucao.join(", ")}`);
  return parts.length ? parts.join(" · ") : "Brasil — todos os anos";
}

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params    = await searchParams;
  const filtros   = parseFilters(params);
  const resultado = await getPerfilSintomatologico(filtros);

  return (
    <PerfilClient
      resultado={resultado}
      filtrosLabel={filtrosLabel(filtros)}
    />
  );
}
