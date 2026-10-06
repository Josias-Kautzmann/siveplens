import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  CalendarClock,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  GitCompareArrows,
  Info,
  Sigma,
} from "lucide-react";
import SiteHeader from "../../_components/SiteHeader";
import ProjectResources from "../../_components/ProjectResources";
import { getEramia2026ArticleArtifact, type Eramia2026ArticleArtifact } from "@/dal/eramia-2026-artifact";

export const revalidate = 3600;

type Metric = Eramia2026ArticleArtifact["metrics"][number];

function formatDate(value: string | null) {
  if (!value) return "não registrado";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function LayerIcon({ layer }: { layer: Metric["layer"] }) {
  if (layer === "Exploração descritiva") return <Database className="h-4 w-4" />;
  if (layer === "Análise bivariada") return <GitCompareArrows className="h-4 w-4" />;
  return <Sigma className="h-4 w-4" />;
}

function MetricRow({ metric }: { metric: Metric }) {
  const historical = metric.frozenSource === "authors-xlsx-2025-03-29";
  return (
    <article id={metric.id} className="scroll-mt-36 overflow-hidden rounded-3xl border border-[#cbded7] bg-white shadow-[0_10px_34px_rgba(25,58,48,0.06)]">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.35fr_repeat(3,minmax(0,0.62fr))] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f4f0] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#245c49]">
              <LayerIcon layer={metric.layer} /> {metric.layer}
            </span>
            <a href={metric.studyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-[#245c49] hover:underline">
              {metric.study} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <h2 className="mt-3 text-lg font-bold leading-snug text-[#16382e]">{metric.tableOrder}. {metric.label}</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{metric.frozenInterpretation}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Artigo publicado</div>
          <div className="mt-2 break-words text-xl font-bold tabular-nums text-slate-800">{metric.publishedDisplay}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-700"><FileCheck2 className="h-3 w-3" /> Usado no artigo</div>
          <div className="mt-2 break-words text-xl font-bold tabular-nums text-emerald-950">{metric.frozenDisplay}</div>
          <div className="mt-1 text-[9px] leading-relaxed text-emerald-800/75">{historical ? "Motor SivepLens no XLSX dos autores" : "Artefato SivepLens de 27/08/2026"}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-sky-700">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3 w-3" /> SivepLens hoje</span>
            <span className={`rounded-full px-1.5 py-0.5 ${metric.status === "stable" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{metric.driftDisplay}</span>
          </div>
          <div className="mt-2 break-words text-xl font-bold tabular-nums text-sky-950">{metric.current.display}</div>
          <div className="mt-1 text-[9px] leading-relaxed text-sky-900/65">{metric.current.context}</div>
        </div>
      </div>

      <details className="group border-t border-[#dce9e4] bg-[#f9fcfb]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-xs font-bold text-[#245c49] sm:px-6">
          Conferir cálculo, coorte e campos utilizados
          <span className="text-xl font-normal text-slate-400 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="grid gap-5 border-t border-[#e2ece8] px-5 py-5 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400">Fórmula</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">{metric.formula}</p>
            {(metric.numerator || metric.denominator) && (
              <dl className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-[11px] leading-relaxed">
                {metric.numerator && <div><dt className="font-bold text-slate-500">Numerador</dt><dd className="text-slate-700">{metric.numerator}</dd></div>}
                {metric.denominator && <div><dt className="font-bold text-slate-500">Denominador/coorte</dt><dd className="text-slate-700">{metric.denominator}</dd></div>}
              </dl>
            )}
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400">Filtros exatos</div>
            <ul className="mt-2 space-y-1.5 text-[11px] text-slate-700">
              {metric.filters.map((filter) => <li key={filter} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{filter}</li>)}
            </ul>
            <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.17em] text-slate-400">Campos</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metric.fields.map((field) => <code key={field} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600">{field}</code>)}
            </div>
          </div>
          {metric.limitation && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-relaxed text-amber-900 lg:col-span-2">
              <strong>Limite:</strong> {metric.limitation}
            </div>
          )}
          {(metric.analysisHref || metric.secondaryHref || metric.validationHref) && (
            <div className="flex flex-wrap gap-2 lg:col-span-2">
              {metric.analysisHref && <Link href={metric.analysisHref} className="inline-flex items-center gap-2 rounded-full bg-[#173d32] px-4 py-2 text-[10px] font-bold text-white hover:bg-[#245c49]">{metric.analysisLabel}<ArrowRight className="h-3.5 w-3.5" /></Link>}
              {metric.secondaryHref && <Link href={metric.secondaryHref} className="inline-flex items-center gap-2 rounded-full border border-[#bfd8cf] bg-white px-4 py-2 text-[10px] font-bold text-[#245c49] hover:border-[#173d32]">{metric.secondaryLabel}<ExternalLink className="h-3.5 w-3.5" /></Link>}
              {metric.validationHref && <a href={metric.validationHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-[10px] font-bold text-violet-800 hover:border-violet-500">{metric.validationLabel}<Braces className="h-3.5 w-3.5" /></a>}
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

export default async function Eramia2026ArticlePage() {
  const artifact = await getEramia2026ArticleArtifact();
  const changed = artifact.metrics.filter((metric) => metric.status === "changed").length;
  const currentManifest = artifact.currentProvenance.sourceManifest;

  return (
    <div className="min-h-screen bg-[#edf7f3] text-slate-900">
      <SiteHeader right="Artefato científico · Tabela 1 auditável" />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/docs/validacao" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2a6b55] hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Validação científica completa</Link>

        <section className="relative mt-4 overflow-hidden rounded-[2rem] bg-[#15392f] px-6 py-8 text-white shadow-[0_28px_75px_rgba(21,57,47,0.22)] sm:px-10 sm:py-11">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border-[46px] border-[#2e6a59]/55" />
          <div className="relative grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c7e9df]"><BookOpen className="h-3.5 w-3.5" /> Apêndice auditável do artigo</div>
              <h1 className="mt-5 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">Indicadores publicados,<br /><span className="text-[#bde6d9]">reproduzidos e recalculados.</span></h1>
              <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#d8ece6] sm:text-base">Esta página é a evidência associada à Tabela 1 do artigo do SivepLens. Ela distingue o artefato usado no texto, o teste controlado do motor sobre dados externos e o recálculo na base atualmente implantada.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><div className="text-2xl font-bold">{artifact.metrics.length}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-[#bdd8d0]">indicadores documentados</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><div className="text-2xl font-bold">{changed}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-[#bdd8d0]">mudaram desde o corte</div></div>
              <a href="/api/artigo/eramia-2026" target="_blank" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-[#173d32] hover:bg-[#eaf5f1]"><Braces className="h-4 w-4" /> Abrir evidências em JSON</a>
            </div>
          </div>
        </section>

        <ProjectResources />

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900"><FileCheck2 className="h-4 w-4" /> Resultado do artefato</div>
            <p className="mt-3 text-[11px] leading-relaxed text-emerald-900/75">É o valor citado no PDF, preservado com data, protocolo e identidade da fonte correspondente.</p>
          </div>
          <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-900"><CalendarClock className="h-4 w-4" /> SivepLens hoje</div>
            <p className="mt-3 text-[11px] leading-relaxed text-sky-900/75">É recalculado no carregamento atual. A diferença mostrada no selo usa o resultado congelado como referência.</p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900"><Info className="h-4 w-4" /> Interpretação correta</div>
            <p className="mt-3 text-[11px] leading-relaxed text-amber-900/75">Mudança entre snapshots não é automaticamente erro. O cálculo, a coorte e a proveniência precisam ser avaliados em conjunto.</p>
          </div>
        </section>

        <nav className="no-scrollbar sticky top-14 z-30 -mx-4 mt-6 flex gap-2 overflow-x-auto border-y border-[#cfdfda] bg-[#edf7f3]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          {artifact.metrics.map((metric) => <a key={metric.id} href={`#${metric.id}`} className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[10px] font-bold text-[#315e50] hover:border-[#173d32]">{metric.tableOrder}. {metric.label}</a>)}
          <a href="#proveniencia" className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[10px] font-bold text-[#315e50] hover:border-[#173d32]">Proveniência</a>
        </nav>

        <div className="mt-6 space-y-5">
          {artifact.metrics.map((metric) => <MetricRow key={metric.id} metric={metric} />)}
        </div>

        <section id="proveniencia" className="mt-8 scroll-mt-36 overflow-hidden rounded-3xl border border-[#cbded7] bg-white">
          <div className="border-b border-[#dce9e4] bg-[#173d32] px-6 py-6 text-white sm:px-8">
            <div className="flex items-start gap-3"><Fingerprint className="mt-0.5 h-5 w-5 text-[#bde6d9]" /><div><h2 className="text-xl font-bold">Proveniência e identidade dos snapshots</h2><p className="mt-2 text-xs leading-relaxed text-[#d8ece6]">As impressões digitais abaixo permitem distinguir o artefato citado no artigo do banco consultado hoje.</p></div></div>
          </div>
          <div className="grid gap-5 p-6 lg:grid-cols-2 sm:p-8">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-emerald-700">Artefato do SivepLens usado no artigo</div>
              <dl className="mt-4 space-y-3 text-[11px]">
                <div><dt className="font-bold text-emerald-900">Congelado em</dt><dd>{formatDate(artifact.frozenAt)}</dd></div>
                <div><dt className="font-bold text-emerald-900">Registros de 2024</dt><dd>{artifact.frozenProvenance.sivepLensSnapshot.records.toLocaleString("pt-BR")}</dd></div>
                <div><dt className="font-bold text-emerald-900">ID da validação</dt><dd className="font-mono">{artifact.frozenProvenance.sivepLensSnapshot.analysisId}</dd></div>
                <div><dt className="font-bold text-emerald-900">SHA-256 do artefato</dt><dd className="break-all font-mono text-[9px]">{artifact.frozenProvenance.sivepLensSnapshot.validationArtifactSha256}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-sky-700">Snapshot atual do SivepLens</div>
              <dl className="mt-4 space-y-3 text-[11px]">
                <div><dt className="font-bold text-sky-900">Página calculada em</dt><dd>{formatDate(artifact.generatedAt)}</dd></div>
                <div><dt className="font-bold text-sky-900">Registros de 2024</dt><dd>{artifact.currentProvenance.records2024.toLocaleString("pt-BR")}</dd></div>
                <div><dt className="font-bold text-sky-900">Última carga</dt><dd>{formatDate(artifact.currentProvenance.latestLoadAt)}</dd></div>
                <div><dt className="font-bold text-sky-900">Arquivo</dt><dd className="break-words">{currentManifest?.fileName ?? "manifesto ainda não registrado"}</dd></div>
                <div><dt className="font-bold text-sky-900">SHA-256 da fonte</dt><dd className="break-all font-mono text-[9px]">{currentManifest?.sha256 ?? "indisponível"}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 lg:col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-violet-700">Teste controlado do motor · Rezende et al.</div>
              <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-3">
                <div><strong>Coorte:</strong> {artifact.frozenProvenance.authorsVaccinationSnapshot.cohort} registros</div>
                <div><strong>Óbitos:</strong> {artifact.frozenProvenance.authorsVaccinationSnapshot.deaths}</div>
                <div><strong>Sobreviventes:</strong> {artifact.frozenProvenance.authorsVaccinationSnapshot.survivors}</div>
              </div>
              <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-3">
                <div><strong>Coeficientes:</strong> {artifact.frozenProvenance.engineValidation.coefficientsMatched}/12 coincidentes</div>
                <div><strong>Erros-padrão:</strong> {artifact.frozenProvenance.engineValidation.standardErrorsMatched}/12 coincidentes</div>
                <div><strong>Convergência:</strong> {artifact.frozenProvenance.engineValidation.iterations} iterações</div>
              </div>
              <div className="mt-3 break-all font-mono text-[9px] text-violet-900">SHA-256: {artifact.frozenProvenance.authorsVaccinationSnapshot.sha256}</div>
              <p className="mt-3 text-[10px] leading-relaxed text-violet-900/75">O mesmo núcleo <code>fitLogistic</code> usado pelo SivepLens foi executado sobre o XLSX público. A maior diferença absoluta foi {artifact.frozenProvenance.engineValidation.maxBetaDifference.toExponential(2)} nos coeficientes e {artifact.frozenProvenance.engineValidation.maxStandardErrorDifference.toExponential(2)} nos erros-padrão, abaixo da tolerância de {artifact.frozenProvenance.engineValidation.tolerance}. Isso valida o cálculo do motor nesse teste; não torna o arquivo histórico parte do banco de produção.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={artifact.frozenProvenance.engineValidation.artifactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-violet-700 px-4 py-2 text-[10px] font-bold text-white hover:bg-violet-800"><Braces className="h-3.5 w-3.5" /> Abrir resultado completo</a>
                <a href="https://joaofelipe.github.io/COVID-Study/analysis.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-[10px] font-bold text-violet-800 hover:border-violet-500">Análise dos autores <ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-[#dce9e4] bg-slate-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="max-w-3xl text-[10px] leading-relaxed text-slate-500">{artifact.interpretation.boundary}</p>
            <a href="/api/artigo/eramia-2026?download=1" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#173d32] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#245c49]"><Download className="h-3.5 w-3.5" /> Baixar JSON auditável</a>
          </div>
        </section>
      </main>
    </div>
  );
}
