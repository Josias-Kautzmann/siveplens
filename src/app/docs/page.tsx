import Link from "next/link";
import { getEtlHistory, getDbSummary, getFieldCoverage } from "@/dal/docs.repo";
import { getUltimaCarga } from "@/dal/casos.repo";
import SiteHeader from "../_components/SiteHeader";
import ProjectResources from "../_components/ProjectResources";

export const revalidate = 3600;

// ─── Dicionário estático ────────────────────────────────────────────────────

type Categoria =
  | "Identificação"
  | "Localização"
  | "Demográfico"
  | "Sintomas"
  | "Comorbidades"
  | "Hospitalização"
  | "Vacinação"
  | "Laboratório"
  | "Desfecho";

interface Campo {
  campo:     string;
  label:     string;
  categoria: Categoria;
  tipo:      string;
  descricao: string;
  dominio:   string;
}

const DICIONARIO: Campo[] = [
  // Identificação
  { campo:"nu_notific",  label:"Nº Notificação",       categoria:"Identificação",  tipo:"bigint",    descricao:"Número único da notificação no SIVEP-Gripe",                    dominio:"Inteiro único por caso" },
  { campo:"dt_notific",  label:"Data Notificação",      categoria:"Identificação",  tipo:"date",      descricao:"Data em que o caso foi notificado",                              dominio:"YYYY-MM-DD" },
  { campo:"sem_not",     label:"Semana Epidemiológica", categoria:"Identificação",  tipo:"smallint",  descricao:"Semana epidemiológica de notificação",                           dominio:"1 – 53" },
  { campo:"ano_epi",     label:"Ano Epidemiológico",    categoria:"Identificação",  tipo:"smallint",  descricao:"Ano epidemiológico derivado da data de notificação pelo ETL",   dominio:"2024 · 2025 · 2026" },
  // Localização
  { campo:"sg_uf",       label:"UF Notificação",        categoria:"Localização",    tipo:"char(2)",   descricao:"Sigla da UF onde o caso foi notificado",                        dominio:"SP · RJ · MG …" },
  { campo:"co_mun_res",  label:"Município Residência",  categoria:"Localização",    tipo:"char(6)",   descricao:"Código IBGE-6 do município de residência (FK dim_municipio)",   dominio:"Código IBGE" },
  // Demográfico
  { campo:"cs_sexo",     label:"Sexo Biológico",        categoria:"Demográfico",    tipo:"char(1)",   descricao:"Sexo biológico do paciente",                                    dominio:"F=Feminino · M=Masculino · I=Ignorado" },
  { campo:"nu_idade_n",  label:"Idade (valor)",         categoria:"Demográfico",    tipo:"smallint",  descricao:"Valor numérico da idade; unidade definida por tp_idade",        dominio:"Inteiro ≥ 0" },
  { campo:"tp_idade",    label:"Unidade da Idade",      categoria:"Demográfico",    tipo:"smallint",  descricao:"Unidade em que nu_idade_n está expressa",                       dominio:"1=Dias · 2=Meses · 3=Anos" },
  { campo:"cs_raca",     label:"Raça / Cor",            categoria:"Demográfico",    tipo:"smallint",  descricao:"Raça ou cor autodeclarada (classificação IBGE)",                dominio:"1=Branca · 2=Preta · 3=Amarela · 4=Parda · 5=Indígena" },
  { campo:"cs_gestant",  label:"Gestação",              categoria:"Demográfico",    tipo:"smallint",  descricao:"Status gestacional no momento da notificação",                  dominio:"1=1ºTrim · 2=2ºTrim · 3=3ºTrim · 5=N/A · 9=Ign" },
  { campo:"cs_escol_n",  label:"Escolaridade",          categoria:"Demográfico",    tipo:"smallint",  descricao:"Nível de escolaridade",                                         dominio:"0=Nenhuma · 1=Fund.1 · 2=Fund.2 · 3=Médio · 4=Superior" },
  // Sintomas
  { campo:"febre",       label:"Febre",                 categoria:"Sintomas",       tipo:"smallint",  descricao:"Presença de febre",                                             dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"tosse",       label:"Tosse",                 categoria:"Sintomas",       tipo:"smallint",  descricao:"Presença de tosse",                                             dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"dispneia",    label:"Dispneia",              categoria:"Sintomas",       tipo:"smallint",  descricao:"Presença de dispneia (falta de ar)",                            dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"saturacao",   label:"Saturação < 95%",       categoria:"Sintomas",       tipo:"smallint",  descricao:"Saturação de O₂ abaixo de 95%",                                dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"garganta",    label:"Dor de Garganta",       categoria:"Sintomas",       tipo:"smallint",  descricao:"Presença de dor de garganta",                                   dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"diarreia",    label:"Diarreia",              categoria:"Sintomas",       tipo:"smallint",  descricao:"Presença de diarreia",                                          dominio:"1=Sim · 2=Não · 9=Ign" },
  // Comorbidades
  { campo:"cardiopati",  label:"Cardiopatia",           categoria:"Comorbidades",   tipo:"smallint",  descricao:"Doença cardíaca crônica",                                       dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"diabetes",    label:"Diabetes",              categoria:"Comorbidades",   tipo:"smallint",  descricao:"Diabetes mellitus",                                             dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"obesidade",   label:"Obesidade",             categoria:"Comorbidades",   tipo:"smallint",  descricao:"Obesidade (IMC ≥ 30)",                                          dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"imunodepre",  label:"Imunodepressão",        categoria:"Comorbidades",   tipo:"smallint",  descricao:"Imunodeficiência ou imunossupressão",                           dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"renal",       label:"Doença Renal",          categoria:"Comorbidades",   tipo:"smallint",  descricao:"Doença renal crônica",                                          dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"asma",        label:"Asma",                  categoria:"Comorbidades",   tipo:"smallint",  descricao:"Diagnóstico de asma",                                           dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"neurologic",  label:"Doença Neurológica",    categoria:"Comorbidades",   tipo:"smallint",  descricao:"Doença neurológica crônica",                                    dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"pneumopati",  label:"Pneumopatia",           categoria:"Comorbidades",   tipo:"smallint",  descricao:"Doença pulmonar crônica (exceto asma)",                         dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"sind_down",   label:"Síndrome de Down",      categoria:"Comorbidades",   tipo:"smallint",  descricao:"Diagnóstico de síndrome de Down",                               dominio:"1=Sim · 2=Não · 9=Ign" },
  // Hospitalização
  { campo:"hospital",    label:"Hospitalização",        categoria:"Hospitalização", tipo:"smallint",  descricao:"Paciente foi hospitalizado",                                    dominio:"1=Sim · 2=Não" },
  { campo:"uti",         label:"UTI",                   categoria:"Hospitalização", tipo:"smallint",  descricao:"Internação em UTI",                                             dominio:"1=Sim · 2=Não" },
  { campo:"suport_ven",  label:"Suporte Ventilatório",  categoria:"Hospitalização", tipo:"smallint",  descricao:"Tipo de suporte ventilatório utilizado",                        dominio:"1=Invasivo · 2=Não-invasivo · 3=Nenhum" },
  { campo:"nosocomial",  label:"Nosocomial",            categoria:"Hospitalização", tipo:"smallint",  descricao:"Suspeita de infecção adquirida em ambiente hospitalar",         dominio:"1=Sim · 2=Não" },
  // Vacinação
  { campo:"vacina",      label:"Vacina Influenza",      categoria:"Vacinação",      tipo:"smallint",  descricao:"Vacinação contra Influenza na temporada vigente",               dominio:"1=Sim · 2=Não · 9=Ign" },
  { campo:"vacina_cov",  label:"Vacina COVID-19",       categoria:"Vacinação",      tipo:"smallint",  descricao:"Vacinação contra COVID-19",                                     dominio:"1=Sim · 2=Não · 9=Ign" },
  // Laboratório
  { campo:"amostra",     label:"Amostra Coletada",      categoria:"Laboratório",    tipo:"smallint",  descricao:"Se amostra para diagnóstico foi coletada",                      dominio:"1=Sim · 2=Não" },
  { campo:"pcr_resul",   label:"Resultado PCR",         categoria:"Laboratório",    tipo:"smallint",  descricao:"Resultado geral do painel de PCR respiratório",                 dominio:"1=Positivo · 2=Negativo · 3=Inconclusivo" },
  { campo:"pos_pcrflu",  label:"PCR Influenza +",       categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para Influenza",                                   dominio:"1=Sim" },
  { campo:"tp_flu_pcr",  label:"Tipo Influenza",        categoria:"Laboratório",    tipo:"smallint",  descricao:"Subtipo do vírus Influenza detectado",                          dominio:"1=A · 2=B" },
  { campo:"pcr_sars2",   label:"PCR SARS-CoV-2",        categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para SARS-CoV-2 (COVID-19)",                       dominio:"1=Sim" },
  { campo:"pcr_vsr",     label:"PCR VSR",               categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para Vírus Sincicial Respiratório",                dominio:"1=Sim" },
  { campo:"pcr_rino",    label:"PCR Rinovírus",         categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para Rinovírus",                                   dominio:"1=Sim" },
  { campo:"pcr_metap",   label:"PCR Metapneumovírus",   categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para Metapneumovírus humano",                      dominio:"1=Sim" },
  { campo:"pcr_adeno",   label:"PCR Adenovírus",        categoria:"Laboratório",    tipo:"smallint",  descricao:"PCR positivo para Adenovírus",                                  dominio:"1=Sim" },
  { campo:"antiviral",   label:"Uso de Antiviral",      categoria:"Laboratório",    tipo:"smallint",  descricao:"Uso de medicamento antiviral (Oseltamivir, etc.)",               dominio:"1=Sim · 2=Não · 9=Ign" },
  // Desfecho
  { campo:"classi_fin",  label:"Classificação Final",   categoria:"Desfecho",       tipo:"smallint",  descricao:"Classificação etiológica final do caso SRAG",                   dominio:"1=Influenza · 2=Outro vírus · 3=Outro agente · 4=SRAG NE · 5=COVID-19" },
  { campo:"criterio",    label:"Critério Diagnóstico",  categoria:"Desfecho",       tipo:"smallint",  descricao:"Critério utilizado para a classificação final",                  dominio:"1=Laboratorial · 2=Clínico-epi · 3=Clínico-imagem" },
  { campo:"evolucao",    label:"Desfecho",              categoria:"Desfecho",       tipo:"smallint",  descricao:"Desfecho clínico do caso",                                      dominio:"1=Cura · 2=Óbito SRAG · 3=Óbito outras causas · 9=Ign" },
];

const CATEGORIAS: Categoria[] = [
  "Identificação","Localização","Demográfico","Sintomas",
  "Comorbidades","Hospitalização","Vacinação","Laboratório","Desfecho",
];

const CAT_COLORS: Record<Categoria, string> = {
  "Identificação":  "bg-slate-100 text-slate-600",
  "Localização":    "bg-blue-50 text-blue-700",
  "Demográfico":    "bg-violet-50 text-violet-700",
  "Sintomas":       "bg-orange-50 text-orange-700",
  "Comorbidades":   "bg-red-50 text-red-700",
  "Hospitalização": "bg-cyan-50 text-cyan-700",
  "Vacinação":      "bg-green-50 text-green-700",
  "Laboratório":    "bg-amber-50 text-amber-700",
  "Desfecho":       "bg-pink-50 text-pink-700",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function pct(count: number, total: number) {
  if (!total) return 0;
  return Math.round((Number(count) / Number(total)) * 100);
}

function fmt(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("pt-BR");
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  // concluido_em vem como timestamp ISO; dt_fim_busca como date-only → só anexa hora se for date puro
  const dt = typeof d === "string" ? new Date(d.includes("T") ? d : d + "T12:00:00") : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function duracao(ini: Date | string | null, fim: Date | string | null): string {
  if (!ini || !fim) return "—";
  const ms = new Date(fim).getTime() - new Date(ini).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}min`;
}

function CoverageBar({ pct: p }: { pct: number }) {
  const color = p >= 80 ? "bg-emerald-500" : p >= 50 ? "bg-amber-400" : "bg-red-400";
  const text  = p >= 80 ? "text-emerald-700" : p >= 50 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#E4E7EC] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums w-8 text-right ${text}`}>{p}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sucesso: "bg-emerald-50 text-emerald-700 border-emerald-200",
    erro:    "bg-red-50 text-red-700 border-red-200",
    rodando: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status}
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function DocsPage() {
  const [history, summary, coverage, ultimaCarga] = await Promise.all([
    getEtlHistory(),
    getDbSummary(),
    getFieldCoverage(),
    getUltimaCarga(),
  ]);

  const total      = Number(coverage.total) || 1;
  const maxAno     = Math.max(...summary.porAno.map((r) => Number(r.total)));
  const anoEpiMax  = summary.porAno.length
    ? Math.max(...summary.porAno.map((r) => Number(r.ano_epi)))
    : new Date().getFullYear();
  const anosLabel  = summary.porAno.map((r) => r.ano_epi).join(", ");

  const coverageMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(coverage)) {
    if (k !== "total") coverageMap[k] = pct(v as number, total);
  }

  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">

      {/* Header */}
      <SiteHeader
        right={ultimaCarga ? `Dados até ${fmtDate(ultimaCarga.dt_fim_busca)} · importado ${fmtDate(ultimaCarga.concluido_em)}` : undefined}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-8 space-y-10">

        <ProjectResources />

        {/* Título + sub-navegação */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#1C1C1C]">Documentação da Base</h1>
            <p className="text-xs text-[#555770] mt-0.5">Proveniência, cobertura de campos, histórico ETL e dicionário de dados</p>
          </div>
          <div className="flex gap-2">
            <Link href="/docs/validacao" className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30] transition-colors">
              Validação Científica
            </Link>
            <Link href="/docs/como-citar" className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#c5ddd6] bg-white text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30] transition-colors">
              Como Citar
            </Link>
          </div>
        </div>

        {/* ── 0. Proveniência dos Dados ── */}
        <section className="bg-[#EEF3FF] border border-[#C7D7F9] rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h2 className="text-sm font-bold text-[#1a3a30] mb-1.5">Proveniência dos Dados</h2>
              <p className="text-xs text-[#1C1C1C] leading-relaxed max-w-2xl">
                Fonte primária:{" "}
                <strong>SIVEP-Gripe</strong> (Sistema de Informação de Vigilância Epidemiológica da Gripe),
                Secretaria de Vigilância em Saúde, Ministério da Saúde do Brasil.
                Distribuído via{" "}
                <a
                  href="https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1a3a30] underline font-medium"
                >
                  OpenDataSUS
                </a>
                {" "}sob dados públicos (Lei nº 12.527/2011).
                Este painel <strong>não modifica</strong> os dados originais — realiza apenas seleção de colunas, normalização de tipos e derivação de <code className="font-mono bg-white/70 px-1 rounded">ano_epi</code>.
              </p>
            </div>
            <div className="shrink-0 sm:text-right bg-white/60 rounded-lg border border-[#C7D7F9] px-4 py-3">
              <div className="text-[10px] font-bold text-[#555770] uppercase tracking-widest">Dados até</div>
              <div className="text-xl font-bold text-[#1a3a30] tabular-nums">{fmtDate(ultimaCarga?.dt_fim_busca)}</div>
              <div className="text-[11px] text-[#555770] mt-0.5">importado em {fmtDate(ultimaCarga?.concluido_em)}</div>
            </div>
          </div>

          {/* INFLUD cards por ano */}
          <div className="flex flex-wrap gap-3">
            {summary.porAno.map((row) => (
              <div key={String(row.ano_epi)} className="bg-white rounded-lg border border-[#C7D7F9] px-4 py-3 flex items-center gap-4 min-w-[160px]">
                <div>
                  <div className="text-xs font-bold text-[#1a3a30] font-mono">
                    INFLUD{String(row.ano_epi).slice(-2)}
                  </div>
                  <div className="text-[11px] text-[#555770]">Ano epi {row.ano_epi}</div>
                </div>
                <div className="text-right ml-auto">
                  <div className="text-sm font-bold text-[#1C1C1C] tabular-nums">{fmt(Number(row.total))}</div>
                  <div className="text-[11px] text-[#555770]">registros</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 1. Visão Geral ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-4">Visão Geral</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#1a3a30] text-white rounded-xl px-6 py-5 flex flex-col gap-1 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#a8d5c7]">Total de registros</span>
              <span className="text-3xl font-bold tabular-nums">{fmt(coverage.total)}</span>
              <span className="text-xs text-[#a8d5c7]">notificações SIVEP-Gripe</span>
            </div>
            <div className="bg-white rounded-xl border border-[#c5ddd6] px-6 py-5 flex flex-col gap-1 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#555770]">Anos disponíveis</span>
              <span className="text-3xl font-bold tabular-nums text-[#1a3a30]">{summary.porAno.length}</span>
              <span className="text-xs text-[#555770]">{anosLabel}</span>
            </div>
            <div className="bg-white rounded-xl border border-[#c5ddd6] px-6 py-5 flex flex-col gap-1 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#555770]">Com PCR registrado</span>
              <span className="text-3xl font-bold tabular-nums text-[#1a3a30]">
                {fmt(summary.porAno.reduce((s, r) => s + Number(r.com_pcr), 0))}
              </span>
              <span className="text-xs text-[#555770]">{pct(summary.porAno.reduce((s, r) => s + Number(r.com_pcr), 0), total)}% dos casos</span>
            </div>
            <div className="bg-white rounded-xl border border-[#c5ddd6] px-6 py-5 flex flex-col gap-1 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#555770]">Total de óbitos</span>
              <span className="text-3xl font-bold tabular-nums text-[#1a3a30]">
                {fmt(summary.porAno.reduce((s, r) => s + Number(r.obitos), 0))}
              </span>
              <span className="text-xs text-[#555770]">
                {pct(summary.porAno.reduce((s, r) => s + Number(r.obitos), 0), total)}% de letalidade geral
              </span>
            </div>
          </div>
        </section>

        {/* ── 2. Registros por Ano ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-4">Registros por Ano Epidemiológico</h2>
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f4fbf8] border-b border-[#c5ddd6]">
                <tr>
                  {["Ano","Arquivo fonte","Total","Óbitos","Letalidade","Com PCR","% do banco","Volume relativo"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-[#555770] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf5f1]">
                {summary.porAno.map((row) => {
                  const t = Number(row.total);
                  const o = Number(row.obitos);
                  const p = Number(row.com_pcr);
                  return (
                    <tr key={String(row.ano_epi)} className="hover:bg-[#f4fbf8]">
                      <td className="px-5 py-3 font-bold text-[#1a3a30]">{row.ano_epi}</td>
                      <td className="px-5 py-3 font-mono text-xs text-[#555770]">INFLUD{String(row.ano_epi).slice(-2)}</td>
                      <td className="px-5 py-3 tabular-nums font-medium">{fmt(t)}</td>
                      <td className="px-5 py-3 tabular-nums">{fmt(o)}</td>
                      <td className="px-5 py-3 tabular-nums">{t > 0 ? ((o/t)*100).toFixed(1) : "—"}%</td>
                      <td className="px-5 py-3 tabular-nums">{fmt(p)}</td>
                      <td className="px-5 py-3 tabular-nums text-[#555770]">{pct(t, total)}%</td>
                      <td className="px-5 py-3 w-40">
                        <div className="h-2 rounded-full bg-[#E4E7EC] overflow-hidden">
                          <div className="h-full rounded-full bg-[#1a3a30]" style={{ width: `${Math.round((t / maxAno) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 3. Fontes, Atribuição e Metodologia ETL ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-4">Fontes, Atribuição e Metodologia de Importação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Atribuição */}
            <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
              <h3 className="text-sm font-bold text-[#1C1C1C] mb-4">Atribuição da Fonte Primária</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Sistema</dt>
                  <dd className="text-xs text-[#1C1C1C]">SIVEP-Gripe — Sistema de Informação de Vigilância Epidemiológica da Gripe</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Órgão responsável</dt>
                  <dd className="text-xs text-[#1C1C1C]">Secretaria de Vigilância em Saúde (SVS), Ministério da Saúde do Brasil</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Portal de distribuição</dt>
                  <dd className="text-xs mt-0.5">
                    <a
                      href="https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a3a30] underline break-all"
                    >
                      opendatasus.saude.gov.br/dataset/srag-2021-a-2024
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Arquivos utilizados</dt>
                  <dd className="text-xs text-[#1C1C1C] font-mono">INFLUD24 · INFLUD25 · INFLUD26</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Base legal</dt>
                  <dd className="text-xs text-[#1C1C1C]">Dados públicos — Lei nº 12.527/2011 (Lei de Acesso à Informação)</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-[#555770] uppercase tracking-widest mb-0.5">Cobertura temporal</dt>
                  <dd className="text-xs text-[#1C1C1C]">Anos epidemiológicos {anosLabel} · dados até {fmtDate(ultimaCarga?.dt_fim_busca)}</dd>
                </div>
              </dl>
            </div>

            {/* Metodologia ETL */}
            <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
              <h3 className="text-sm font-bold text-[#1C1C1C] mb-4">O que o ETL faz (e não faz)</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1.5">Inclui / preserva</div>
                  <ul className="space-y-1.5 text-xs text-[#555770]">
                    <li className="flex gap-2"><span className="text-emerald-600 font-bold shrink-0">✓</span>Todos os casos SRAG hospitalizados — sem filtragem por classificação ou desfecho</li>
                    <li className="flex gap-2"><span className="text-emerald-600 font-bold shrink-0">✓</span>Codificação SINAN original preservada (1=Sim · 2=Não · 9=Ignorado)</li>
                    <li className="flex gap-2"><span className="text-emerald-600 font-bold shrink-0">✓</span>Valores NULL preservados como NULL (campo em branco na ficha do SIVEP)</li>
                    <li className="flex gap-2"><span className="text-emerald-600 font-bold shrink-0">✓</span>Campo <code className="font-mono bg-[#eaf5f1] px-1 rounded">ano_epi</code> derivado do ano calendário de <code className="font-mono bg-[#eaf5f1] px-1 rounded">dt_notific</code></li>
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1.5">Transformações aplicadas</div>
                  <ul className="space-y-1.5 text-xs text-[#555770]">
                    <li className="flex gap-2"><span className="text-amber-500 font-bold shrink-0">↻</span>Carga completa a cada execução (TRUNCATE + INSERT) — sem acumulação incremental</li>
                    <li className="flex gap-2"><span className="text-amber-500 font-bold shrink-0">↻</span>Tipos de dados normalizados para o schema PostgreSQL (datas, inteiros, chars)</li>
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Não realiza</div>
                  <ul className="space-y-1.5 text-xs text-[#555770]">
                    <li className="flex gap-2"><span className="text-slate-400 font-bold shrink-0">—</span>Nenhuma imputação de dados faltantes</li>
                    <li className="flex gap-2"><span className="text-slate-400 font-bold shrink-0">—</span>Nenhuma reclassificação de casos</li>
                    <li className="flex gap-2"><span className="text-slate-400 font-bold shrink-0">—</span>Colunas sem mapeamento no schema são descartadas (não armazenadas)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Cadeia ETL */}
          <div className="mt-4 bg-[#eaf5f1] border border-[#C7D7F9] rounded-xl p-5 text-xs text-[#1a3a30] leading-relaxed">
            <strong>Pipeline automatizado:</strong> GitHub Actions (todo sábado 01h UTC) →{" "}
            <code className="bg-white/70 px-1 rounded font-mono">update_csv.py</code> raspa o OpenDataSUS por regex de S3 →
            extrai a data do nome do arquivo{" "}
            <code className="bg-white/70 px-1 rounded font-mono">INFLUD26-DD-MM-YYYY.csv</code> →
            compara com <code className="bg-white/70 px-1 rounded font-mono">controle_carga</code> →
            se nova versão: TRUNCATE + COPY dos arquivos INFLUD24 + INFLUD25 + INFLUD26 →
            <code className="bg-white/70 px-1 rounded font-mono">CALL refresh_semana_mun()</code> →
            registra status em <code className="bg-white/70 px-1 rounded font-mono">controle_carga</code>.
            Também pode ser disparado manualmente via{" "}
            <code className="bg-white/70 px-1 rounded font-mono">POST /api/etl/trigger</code>.
          </div>
        </section>

        {/* ── 4. Cobertura dos Campos ── */}
        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#1C1C1C]">Cobertura dos Campos</h2>
              <p className="text-xs text-[#555770] mt-0.5">% de registros com valor não-nulo (Sim, Não ou Ignorado) · verde ≥ 80% · amarelo ≥ 50% · vermelho {"<"} 50%</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {CATEGORIAS.filter((cat) => DICIONARIO.some((d) => d.categoria === cat && d.campo in coverageMap)).map((cat) => {
              const campos = DICIONARIO.filter((d) => d.categoria === cat && d.campo in coverageMap);
              return (
                <div key={cat} className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
                  <div className={`px-4 py-2.5 border-b border-[#eaf5f1] ${CAT_COLORS[cat]}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">{cat}</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {campos.sort((a, b) => (coverageMap[b.campo] ?? 0) - (coverageMap[a.campo] ?? 0)).map((d) => (
                      <div key={d.campo}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#1C1C1C] font-medium">{d.label}</span>
                          <code className="text-[10px] text-[#94A3B8] font-mono">{d.campo}</code>
                        </div>
                        <CoverageBar pct={coverageMap[d.campo] ?? 0} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 5. Histórico ETL ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-4">Histórico de Cargas ETL</h2>
          <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f4fbf8] border-b border-[#c5ddd6]">
                <tr>
                  {["Iniciado em","Concluído em","Duração","Fonte","Status","Registros","Dados até"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-[#555770] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf5f1]">
                {history.map((run) => (
                  <tr key={run.id} className="hover:bg-[#f4fbf8]">
                    <td className="px-5 py-3 tabular-nums text-xs text-[#555770]">{fmtDateTime(run.iniciado_em)}</td>
                    <td className="px-5 py-3 tabular-nums text-xs text-[#555770]">{fmtDateTime(run.concluido_em)}</td>
                    <td className="px-5 py-3 tabular-nums text-xs">{duracao(run.iniciado_em, run.concluido_em)}</td>
                    <td className="px-5 py-3 text-xs font-mono text-[#555770]">{run.fonte}</td>
                    <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-5 py-3 tabular-nums font-medium">{run.total_inseridos ? fmt(run.total_inseridos) : "—"}</td>
                    <td className="px-5 py-3 tabular-nums text-xs">{fmtDate(run.dt_fim_busca)}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-[#555770]">Nenhuma carga registrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#555770] mt-2">Atualização automática: todo sábado às 01h UTC via GitHub Actions · fonte: OpenDataSUS/SIVEP-Gripe</p>
        </section>

        {/* ── 6. Dicionário de Dados ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-1">Dicionário de Dados</h2>
          <p className="text-xs text-[#555770] mb-4">Tabela <code className="font-mono bg-[#eaf5f1] px-1 rounded">fato_caso_srag</code> · {DICIONARIO.length} campos documentados · codificação SINAN: 1=Sim · 2=Não · 9=Ignorado</p>

          {CATEGORIAS.map((cat) => {
            const campos = DICIONARIO.filter((d) => d.categoria === cat);
            if (!campos.length) return null;
            return (
              <div key={cat} className="mb-6">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-3 ${CAT_COLORS[cat]}`}>
                  {cat}
                </div>
                <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f4fbf8] border-b border-[#c5ddd6]">
                      <tr>
                        {["Campo","Rótulo","Tipo","Cobertura","Descrição","Domínio dos valores"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#555770] uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eaf5f1]">
                      {campos.map((d) => {
                        const cov = coverageMap[d.campo];
                        return (
                          <tr key={d.campo} className="hover:bg-[#f4fbf8]">
                            <td className="px-4 py-2.5 font-mono text-xs text-[#1a3a30] whitespace-nowrap">{d.campo}</td>
                            <td className="px-4 py-2.5 font-medium text-xs whitespace-nowrap">{d.label}</td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-[#94A3B8]">{d.tipo}</td>
                            <td className="px-4 py-2.5 w-28">
                              {cov !== undefined
                                ? <CoverageBar pct={cov} />
                                : <span className="text-[11px] text-[#94A3B8]">—</span>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-xs text-[#555770]">{d.descricao}</td>
                            <td className="px-4 py-2.5 text-[11px] text-[#555770] max-w-xs">{d.dominio}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>

        {/* ── 7. Arquitetura ── */}
        <section>
          <h2 className="text-lg font-bold text-[#1C1C1C] mb-4">Arquitetura do Banco</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { nome:"fato_caso_srag",         tipo:"Fato — individual",     desc:"1 linha por notificação SIVEP-Gripe. Fonte primária de todas as análises. ~372k linhas." },
              { nome:"fato_casos_semana_mun",   tipo:"Fato — pré-agregado",   desc:"Casos por semana × município × classificação. Usada pelo mapa para evitar agregações custosas em tempo real." },
              { nome:"dim_municipio",           tipo:"Dimensão geográfica",   desc:"5.571 municípios com nome, UF, região de saúde e macrorregião. Seed estático do IBGE." },
              { nome:"controle_carga",          tipo:"Controle ETL",          desc:"Log de cada execução do pipeline: status, data dos dados, registros inseridos, erros." },
              { nome:"alertas",                 tipo:"Alertas de anomalia",   desc:"Anomalias detectadas pelo detector (z-score por semana/UF). Severidade 0–1." },
              { nome:"fato_casos_semana_uf",    tipo:"Fato — pré-agregado",   desc:"Agregação por semana × UF. Usada para visões nacionais sem scan da tabela principal." },
            ].map((t) => (
              <div key={t.nome} className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
                <code className="text-xs font-mono text-[#1a3a30] font-bold">{t.nome}</code>
                <span className="ml-2 text-[10px] bg-[#eaf5f1] text-[#1a3a30] px-2 py-0.5 rounded-full">{t.tipo}</span>
                <p className="text-xs text-[#555770] mt-2 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 8. Como Citar ── */}
        <section className="pb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#1C1C1C]">Como Citar</h2>
              <p className="text-xs text-[#555770] mt-0.5">Referências ABNT para uso acadêmico</p>
            </div>
            <Link
              href="/docs/como-citar"
              className="text-xs text-[#1a3a30] hover:underline font-semibold shrink-0"
            >
              Página completa →
            </Link>
          </div>

          <div className="space-y-4">
            {/* Fonte primária */}
            <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Recomendado para publicações</span>
                <span className="text-xs text-[#555770]">Fonte primária — microdados originais</span>
              </div>
              <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] p-4 text-xs text-[#1C1C1C] leading-relaxed font-mono">
                BRASIL. Ministério da Saúde. Secretaria de Vigilância em Saúde.{" "}
                <strong>SIVEP-Gripe: microdados de Síndrome Respiratória Aguda Grave (SRAG) hospitalizados.</strong>{" "}
                Brasília: Ministério da Saúde, {anoEpiMax}. Arquivos INFLUD24, INFLUD25, INFLUD26.
                Disponível em: https://opendatasus.saude.gov.br/dataset/srag-2021-a-2024. Acesso em: [data de acesso].
              </div>
            </div>

            {/* Este painel */}
            <div className="bg-white rounded-xl border border-[#c5ddd6] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Ferramenta de visualização</span>
                <span className="text-xs text-[#555770]">Para referenciar este painel</span>
              </div>
              <div className="bg-[#f4fbf8] rounded-lg border border-[#E4E7EC] p-4 text-xs text-[#1C1C1C] leading-relaxed font-mono">
                SivepLens.{" "}
                <strong>Painel Epidemiológico de Síndrome Respiratória Aguda Grave.</strong>{" "}
                Dados: SIVEP-Gripe/OpenDataSUS, Ministério da Saúde do Brasil.
                Disponível em: [URL do painel]. Acesso em: [data de acesso].
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
                <strong>Nota:</strong> Este painel é uma ferramenta de exploração derivada dos microdados originais.
                Para validação científica e publicações peer-reviewed, utilize os arquivos INFLUD diretamente do OpenDataSUS como fonte primária.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
