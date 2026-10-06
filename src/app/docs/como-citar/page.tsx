import Link from "next/link";
import { getUltimaCarga } from "@/dal/casos.repo";
import { getDbSummary } from "@/dal/docs.repo";
import SiteHeader from "../../_components/SiteHeader";

export const revalidate = 3600;

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.includes("T") ? d : d + "T12:00:00") : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function RefBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] p-4 text-xs text-[#1C1C1C] leading-relaxed font-mono select-all">
      {children}
    </div>
  );
}

export default async function ComoCitarPage() {
  const [ultimaCarga, summary] = await Promise.all([
    getUltimaCarga(),
    getDbSummary(),
  ]);

  const anoEpiMax = summary.porAno.length
    ? Math.max(...summary.porAno.map((r) => Number(r.ano_epi)))
    : new Date().getFullYear();

  const dataCorte   = fmtDate(ultimaCarga?.dt_fim_busca);
  const dataImport  = fmtDate(ultimaCarga?.concluido_em);
  const arquivos    = summary.porAno.map((r) => `INFLUD${String(r.ano_epi).slice(-2)}`).join(", ");

  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">

      {/* Header */}
      <SiteHeader />

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-10 space-y-8">

        {/* Breadcrumb + título */}
        <div>
          <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2a6b55] hover:text-[#1a3a30] transition-colors">
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 1L3 6l5 5"/></svg>
            Documentação
          </Link>
          <h1 className="text-xl font-bold text-[#1C1C1C] mt-2">Como Citar</h1>
          <p className="text-xs text-[#555770] mt-0.5">Referências ABNT para uso acadêmico dos dados SRAG / SIVEP-Gripe</p>
        </div>

        {/* Aviso de uso */}
        <div className="bg-[#EEF3FF] border border-[#C7D7F9] rounded-xl p-5 text-xs text-[#1a3a30] leading-relaxed">
          <strong>Orientação geral:</strong> Para publicações científicas e trabalhos acadêmicos, cite sempre a{" "}
          <strong>fonte primária</strong> (microdados SIVEP-Gripe do OpenDataSUS). Este painel é uma ferramenta de
          exploração derivada — pode ser mencionado como instrumento de consulta inicial, mas não substitui
          a citação dos dados brutos originais.
        </div>

        {/* ── Bloco 1: Fonte primária ── */}
        <section className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#eaf5f1] flex items-center gap-3">
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Recomendado para publicações
            </span>
            <h2 className="text-sm font-bold text-[#1C1C1C]">Fonte Primária — Microdados SIVEP-Gripe</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-[#555770]">
              Use esta referência ao analisar os microdados INFLUD diretamente (via download do OpenDataSUS, R, Python, etc.).
              Selecione o formato conforme as normas da sua instituição.
            </p>

            <div>
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-2">ABNT NBR 6023:2018</div>
              <RefBox>
                BRASIL. Ministério da Saúde. Secretaria de Vigilância em Saúde.{" "}
                <strong>SIVEP-Gripe: microdados de Síndrome Respiratória Aguda Grave (SRAG) hospitalizados.</strong>{" "}
                Brasília: Ministério da Saúde, {anoEpiMax}. Arquivos {arquivos}.
                Disponível em: https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024.
                Acesso em: [data de acesso].
              </RefBox>
            </div>

            <div>
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-2">Vancouver (ICMJE)</div>
              <RefBox>
                Ministério da Saúde (BR), Secretaria de Vigilância em Saúde.
                SIVEP-Gripe: microdados de SRAG hospitalizados [{anoEpiMax}].
                Brasília: Ministério da Saúde; {anoEpiMax}.
                Disponível em: https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024
              </RefBox>
            </div>

            <div>
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-2">APA 7ª edição</div>
              <RefBox>
                Ministério da Saúde, Secretaria de Vigilância em Saúde. ({anoEpiMax}).{" "}
                <em>SIVEP-Gripe: microdados de Síndrome Respiratória Aguda Grave (SRAG) hospitalizados</em>{" "}
                [{arquivos}]. OpenDataSUS.
                https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024
              </RefBox>
            </div>

            <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] p-4 text-xs text-[#555770] space-y-1">
              <div className="font-semibold text-[#1C1C1C] mb-2">Metadados da versão atual neste painel</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <span className="text-[#94A3B8]">Arquivos carregados</span>
                <span className="font-mono">{arquivos}</span>
                <span className="text-[#94A3B8]">Dados até</span>
                <span className="font-mono">{dataCorte}</span>
                <span className="text-[#94A3B8]">Importado em</span>
                <span className="font-mono">{dataImport}</span>
                <span className="text-[#94A3B8]">Portal</span>
                <span className="font-mono break-all">opendatasus.saude.gov.br</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bloco 2: Este painel ── */}
        <section className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#eaf5f1] flex items-center gap-3">
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Ferramenta derivada
            </span>
            <h2 className="text-sm font-bold text-[#1C1C1C]">SivepLens</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-[#555770]">
              Use esta referência quando quiser citar o painel como ferramenta de consulta ou visualização inicial,
              complementando (não substituindo) a citação dos microdados originais.
            </p>

            <div>
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-2">ABNT NBR 6023:2018</div>
              <RefBox>
                SivepLens.{" "}
                <strong>Painel Epidemiológico de Síndrome Respiratória Aguda Grave.</strong>{" "}
                Dados: SIVEP-Gripe/OpenDataSUS, Ministério da Saúde do Brasil.
                Dados até: {dataCorte}; importado em: {dataImport}.
                Disponível em: [URL do painel]. Acesso em: [data de acesso].
              </RefBox>
            </div>

            <div>
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-2">APA 7ª edição</div>
              <RefBox>
                SivepLens. ({anoEpiMax}).{" "}
                <em>Painel Epidemiológico de Síndrome Respiratória Aguda Grave</em>{" "}
                [Ferramenta de visualização online]. Dados: SIVEP-Gripe/OpenDataSUS.
                [URL do painel]
              </RefBox>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 leading-relaxed">
              <strong>Importante:</strong> Ao usar resultados deste painel em publicações,
              descreva no método que os dados foram previamente explorados via SivepLens e
              confirmados/analisados nos microdados originais do OpenDataSUS (arquivos {arquivos}).
              Isso garante reprodutibilidade independente da disponibilidade deste painel.
            </div>
          </div>
        </section>

        {/* ── Bloco 3: Nota metodológica ── */}
        <section className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#eaf5f1]">
            <h2 className="text-sm font-bold text-[#1C1C1C]">Nota Metodológica para Seção de Métodos</h2>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-xs text-[#555770]">
              Sugestão de texto para a seção de Métodos de artigos e relatórios:
            </p>
            <RefBox>
              Os dados utilizados são provenientes do SIVEP-Gripe (Sistema de Informação de Vigilância
              Epidemiológica da Gripe), disponibilizados pelo Ministério da Saúde do Brasil via OpenDataSUS
              (https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024), arquivos {arquivos},
              com dados até {dataCorte} (importação em {dataImport}).
              A base compreende notificações de Síndrome Respiratória Aguda Grave (SRAG) hospitalizados,
              codificadas conforme o sistema SINAN (1=Sim, 2=Não, 9=Ignorado).
              Nenhuma imputação de dados faltantes foi realizada; campos sem preenchimento na ficha
              original são representados como valores nulos.
            </RefBox>
            <p className="text-[11px] text-[#94A3B8]">
              Ajuste conforme o período e os arquivos específicos utilizados na sua análise.
            </p>
          </div>
        </section>

        {/* Footer links */}
        <div className="flex items-center gap-6 pt-2 pb-8 text-xs text-[#555770]">
          <Link href="/docs" className="text-[#1a3a30] hover:underline font-medium">
            ← Voltar à Documentação
          </Link>
          <a
            href="https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1a3a30] hover:underline font-medium"
          >
            OpenDataSUS — fonte original ↗
          </a>
        </div>

      </main>
    </div>
  );
}
