import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCode2,
  Fingerprint,
  FlaskConical,
  GitCompareArrows,
  Sigma,
  ShieldCheck,
} from "lucide-react";
import SiteHeader from "../../_components/SiteHeader";
import { getScientificValidationSnapshot } from "@/dal/scientific-validation.repo";
import { ERAMIA_FROZEN_PROVENANCE } from "@/lib/eramia-2026";
import {
  compareMetric,
  ETL_NORMALIZATION_VERSION,
  PEDIATRIC_REGRESSION_BENCHMARKS,
  SCIENTIFIC_VALIDATION_VERSION,
  STUDIES,
  VACCINATION_REGRESSION_BENCHMARKS,
  type ComparisonStatus,
  type MetricComparison,
  type PublishedStudy,
} from "@/lib/scientific-validation";

export const revalidate = 3600;

const STATUS_STYLE: Record<ComparisonStatus, { label: string; classes: string }> = {
  reproduzido: { label: "Reproduzido (≤ 1%)", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  compativel: { label: "Compatível (≤ 3%)", classes: "border-sky-200 bg-sky-50 text-sky-700" },
  divergente: { label: "Investigar", classes: "border-rose-200 bg-rose-50 text-rose-700" },
  parcial: { label: "Reprodução parcial", classes: "border-amber-200 bg-amber-50 text-amber-800" },
  bloqueado: { label: "Bloqueado", classes: "border-slate-200 bg-slate-50 text-slate-600" },
};

function formatNumber(value: number | null, unit: MetricComparison["unit"] = "count") {
  if (value === null) return "—";
  if (unit === "percent") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (unit === "years") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} anos`;
  if (unit === "ratio") return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatDate(value: string | null) {
  if (!value) return "não registrado";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function descriptiveHref(params: Record<string, string> = {}) {
  const query = new URLSearchParams({
    anos: "2024",
    modo: "numerica",
    variavel: "idade_anos",
    ...params,
  });
  return `/analise/descritiva?${query.toString()}`;
}

function associationHref(params: Record<string, string>) {
  return `/analise/associacao?${new URLSearchParams({ anos: "2024", ...params }).toString()}`;
}

function regressionHref(params: Record<string, string>) {
  return `/analise/regressao?${new URLSearchParams({ anos: "2024", ...params }).toString()}`;
}

function confidenceIntervalsOverlap(aLow: number, aHigh: number, bLow: number, bHigh: number) {
  return Math.max(aLow, bLow) <= Math.min(aHigh, bHigh);
}

function formatP(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value < 0.001 ? "< 0,001" : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function StatusBadge({ status, label }: { status: ComparisonStatus; label?: string }) {
  const style = STATUS_STYLE[status];
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${style.classes}`}>{label ?? style.label}</span>;
}

function MetricCard({ metric }: { metric: MetricComparison }) {
  const delta = metric.percentDifference;
  const width = delta === null ? 0 : Math.min(100, Math.abs(delta) * 12);
  const bar = metric.status === "reproduzido"
    ? "bg-emerald-500"
    : metric.status === "compativel"
      ? "bg-sky-500"
      : metric.status === "parcial"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="rounded-2xl border border-[#d8e8e2] bg-white p-4 shadow-[0_8px_30px_rgba(26,58,48,0.05)]">
      <div className="flex min-h-12 items-start justify-between gap-2">
        <div className="text-xs font-bold leading-snug text-[#1a3a30]">{metric.label}</div>
        <StatusBadge status={metric.status} label={metric.statusLabel} />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Artigo</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-slate-800">{formatNumber(metric.published, metric.unit)}</div>
        </div>
        <GitCompareArrows className="mb-1 h-4 w-4 text-slate-300" aria-hidden="true" />
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">SivepLens</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-[#1a3a30]">{formatNumber(metric.reproduced, metric.unit)}</div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-500">
        <span>diferença relativa</span>
        <span className="font-semibold tabular-nums">
          {delta === null ? "não calculada" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}%`}
        </span>
      </div>
      {metric.note && <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-500">{metric.note}</p>}
      {(metric.analysisHref || metric.secondaryAnalysisHref) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {metric.analysisHref && (
            <Link href={metric.analysisHref} className="inline-flex items-center gap-1.5 rounded-full border border-[#bfd8cf] bg-[#edf7f3] px-3 py-2 text-[10px] font-bold text-[#245c49] transition hover:border-[#1a3a30] hover:bg-[#e2f1ec]">
              {metric.analysisLabel ?? "Abrir análise"} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {metric.secondaryAnalysisHref && (
            <Link href={metric.secondaryAnalysisHref} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-[#1a3a30] hover:text-[#245c49]">
              {metric.secondaryAnalysisLabel ?? "Ver contexto"} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function StudySection({ study, metrics, method }: { study: PublishedStudy; metrics: MetricComparison[]; method: string[] }) {
  const comparable = metrics.filter((metric) => metric.status === "reproduzido" || metric.status === "compativel");
  const overall: ComparisonStatus = metrics.some((metric) => metric.status === "bloqueado")
    ? "bloqueado"
    : metrics.some((metric) => metric.status === "parcial")
      ? "parcial"
      : comparable.length === metrics.length
        ? "reproduzido"
        : "divergente";

  return (
    <article id={study.id} className="scroll-mt-36 overflow-hidden rounded-3xl border border-[#cfe2db] bg-[#f9fcfb]">
      <div className="border-b border-[#dcebe6] bg-white px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#1a3a30] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{study.shortTitle}</span>
              <span className="text-[11px] text-slate-500">{study.journal} · {study.publishedYear}</span>
              <StatusBadge status={overall} />
            </div>
            <h2 className="text-lg font-bold leading-snug text-slate-900">{study.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{study.authors}</p>
          </div>
          <a href={study.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#21634f] hover:underline">
            doi:{study.doi}<ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Desenho", study.design],
            ["População", study.population],
            ["Snapshot do artigo", study.dataAccess],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#dcebe6] bg-[#f4fbf8] px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
              <div className="mt-1 text-[11px] font-medium leading-relaxed text-slate-700">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}
        </div>
        <details className="group mt-5 rounded-2xl border border-[#d8e8e2] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-xs font-bold text-[#1a3a30]">
            Definição computacional da coorte
            <span className="text-lg font-normal text-slate-400 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-slate-100 px-4 py-4">
            <ol className="space-y-2 text-[11px] leading-relaxed text-slate-600">
              {method.map((item, index) => <li key={item}><span className="mr-2 font-mono font-bold text-[#2a6b55]">{index + 1}.</span>{item}</li>)}
            </ol>
          </div>
        </details>
      </div>
    </article>
  );
}

export default async function ScientificValidationPage() {
  const snapshot = await getScientificValidationSnapshot();
  const vaccinationExact = snapshot.vaccination.mode === "exact";

  const influenzaMetrics = [
    compareMetric({ key: "all", label: "Registros SRAG de 2024", published: 267880, reproduced: snapshot.influenza.allRecords, analysisHref: descriptiveHref() }),
    compareMetric({ key: "pcr", label: "Influenza confirmada por RT-PCR", published: 17145, reproduced: snapshot.influenza.pcrPositive, analysisHref: descriptiveHref({ coorte: "influenza-pcr" }) }),
    compareMetric({ key: "cohort", label: "Coorte com desfecho conhecido", published: 15995, reproduced: snapshot.influenza.cohort, analysisHref: descriptiveHref({ coorte: "influenza-known-outcome" }) }),
    compareMetric({ key: "deaths", label: "Óbitos", published: 1934, reproduced: snapshot.influenza.deaths, analysisHref: descriptiveHref({ coorte: "influenza-pcr", evolucao: "2" }) }),
    compareMetric({ key: "fatality", label: "Letalidade hospitalar", published: 12.1, reproduced: snapshot.influenza.fatality, unit: "percent", analysisHref: descriptiveHref({ coorte: "influenza-known-outcome", modo: "categorica", variavel: "evolucao" }) }),
    compareMetric({ key: "a", label: "Influenza A", published: 14077, reproduced: snapshot.influenza.influenzaA, analysisHref: descriptiveHref({ coorte: "influenza-known-outcome", etio: "flu_a" }) }),
    compareMetric({ key: "b", label: "Influenza B", published: 1918, reproduced: snapshot.influenza.influenzaB, analysisHref: descriptiveHref({ coorte: "influenza-known-outcome", etio: "flu_b" }) }),
  ];

  const pediatricMetrics = [
    compareMetric({ key: "total", label: "Menores de 1 ano", published: 66170, reproduced: snapshot.pediatric.total, analysisHref: descriptiveHref({ coorte: "infant-under-one" }) }),
    compareMetric({
      key: "week17",
      label: "Pico temporal na semana 17",
      published: 2742,
      reproduced: snapshot.pediatric.week17,
      analysisHref: descriptiveHref({ coorte: "infant-under-one", semana: "17" }),
      analysisLabel: "Abrir semana 17",
      secondaryAnalysisHref: "/analise/anomalias?anos=2024&coorte=infant-under-one",
      secondaryAnalysisLabel: "Ver série completa",
      note: "A primeira análise abre exatamente a contagem da semana 17; a segunda mostra as 52 semanas. O valor publicado identifica o máximo observado, não valida por si só os alertas por z-score.",
    }),
    compareMetric({ key: "influenza", label: "Classificação: influenza", published: 2560, reproduced: snapshot.pediatric.influenza, analysisHref: descriptiveHref({ coorte: "infant-under-one", classi: "1" }) }),
    compareMetric({ key: "other-virus", label: "Classificação: outro vírus", published: 32466, reproduced: snapshot.pediatric.otherVirus, analysisHref: descriptiveHref({ coorte: "infant-under-one", classi: "2" }) }),
    compareMetric({ key: "other-agent", label: "Classificação: outro agente", published: 741, reproduced: snapshot.pediatric.otherAgent, analysisHref: descriptiveHref({ coorte: "infant-under-one", classi: "3" }) }),
    compareMetric({ key: "unspecified", label: "SRAG não especificada", published: 24790, reproduced: snapshot.pediatric.unspecified, analysisHref: descriptiveHref({ coorte: "infant-under-one", classi: "4" }) }),
    compareMetric({ key: "covid", label: "Classificação: COVID-19", published: 3342, reproduced: snapshot.pediatric.covid, analysisHref: descriptiveHref({ coorte: "infant-under-one", classi: "5" }) }),
    compareMetric({ key: "blank", label: "Classificação em branco", published: 2271, reproduced: snapshot.pediatric.blank, analysisHref: descriptiveHref({ coorte: "infant-classification-missing" }) }),
    compareMetric({
      key: "virus", label: "Detecções virais com desfecho conhecido", published: 36009, reproduced: snapshot.pediatric.viralDetectionsKnownOutcome,
      note: `A tabela do artigo soma etiologias, portanto coinfecções aparecem mais de uma vez. O SivepLens encontrou ${snapshot.pediatric.uniqueVirusPatientsKnownOutcome.toLocaleString("pt-BR")} pacientes únicos e ${snapshot.pediatric.coinfectedPatientsKnownOutcome.toLocaleString("pt-BR")} com mais de um vírus.`,
      analysisHref: descriptiveHref({ coorte: "infant-virus-positive-known-outcome" }),
      analysisLabel: "Ver pacientes únicos",
    }),
  ];

  const vaccinationMetrics = [
    compareMetric({
      key: "cohort", label: "Coorte elegível", published: 474, reproduced: snapshot.vaccination.cohort,
      partial: !vaccinationExact,
      note: vaccinationExact ? undefined : "A reprodução atual inclui apenas PCR_SARS2. O artigo também aceita AN_SARS2=1.",
      analysisHref: descriptiveHref({ coorte: "vaccination-eligible" }),
    }),
    compareMetric({ key: "deaths", label: "Óbitos hospitalares", published: 171, reproduced: snapshot.vaccination.deaths, partial: !vaccinationExact, analysisHref: descriptiveHref({ coorte: "vaccination-eligible", evolucao: "2" }) }),
    compareMetric({ key: "survivors", label: "Sobreviventes", published: 303, reproduced: snapshot.vaccination.survivors, partial: !vaccinationExact, analysisHref: descriptiveHref({ coorte: "vaccination-eligible", evolucao: "1" }) }),
    compareMetric({ key: "fatality", label: "Letalidade hospitalar", published: 36, reproduced: snapshot.vaccination.fatality, unit: "percent", partial: !vaccinationExact, analysisHref: descriptiveHref({ coorte: "vaccination-eligible", modo: "categorica", variavel: "evolucao" }) }),
  ];

  const association = snapshot.inferential.vaccinationIcuMortality;
  const associationBase = compareMetric({
    key: "vaccination-icu-mortality-or",
    label: "UTI × óbito hospitalar (OR bruto)",
    published: 2.60,
    reproduced: association.oddsRatio,
    unit: "ratio",
    analysisHref: associationHref({ coorte: "vaccination-eligible", vx: "uti", vy: "evolucao_bin" }),
    analysisLabel: "Abrir associação",
    note: `IC 95% SivepLens ${association.ci95Low.toFixed(2)}–${association.ci95High.toFixed(2)} · χ² ${association.chiSquare.toFixed(2)} · p ${association.pValue < 0.001 ? "< 0,001" : association.pValue.toFixed(3)}.`,
  });
  const associationMetric: MetricComparison = confidenceIntervalsOverlap(1.76, 3.86, association.ci95Low, association.ci95High)
    ? { ...associationBase, status: "compativel", statusLabel: "Compatível por IC 95%" }
    : associationBase;

  const regression = snapshot.inferential.pediatricMortalityRegression;
  const pediatricRegressionHref = regressionHref({
    coorte: "infant-virus-positive-known-outcome",
    out: "evolucao_bin",
    missing: "absence",
    preds: PEDIATRIC_REGRESSION_BENCHMARKS.map((item) => item.key).join(","),
  });
  const regressionComparisons = PEDIATRIC_REGRESSION_BENCHMARKS.map((published) => {
    const reproduced = regression.coefficients[published.key];
    return {
      ...published,
      reproduced,
      compatible: confidenceIntervalsOverlap(
        published.ci95Low,
        published.ci95High,
        reproduced.ci95Low,
        reproduced.ci95High,
      ),
      relativeDifference: ((reproduced.adjustedOddsRatio - published.adjustedOddsRatio) / published.adjustedOddsRatio) * 100,
    };
  });
  const compatibleRegression = regressionComparisons.filter((item) => item.compatible).length;

  const vaccinationRegression = snapshot.inferential.vaccinationMortalityRegression;
  const vaccinationRegressionComparisons = VACCINATION_REGRESSION_BENCHMARKS.map((published) => {
    const reproduced = vaccinationRegression.coefficients[published.key];
    return {
      ...published,
      reproduced,
      compatible: confidenceIntervalsOverlap(published.ci95Low, published.ci95High, reproduced.ci95Low, reproduced.ci95High),
      relativeDifference: ((reproduced.adjustedOddsRatio - published.adjustedOddsRatio) / published.adjustedOddsRatio) * 100,
    };
  });
  const compatibleVaccinationRegression = vaccinationRegressionComparisons.filter((item) => item.compatible).length;
  const allMetrics = [...influenzaMetrics, ...pediatricMetrics, ...vaccinationMetrics, associationMetric];
  const confirmed = allMetrics.filter((metric) => metric.status === "reproduzido" || metric.status === "compativel");
  const evaluated = allMetrics.filter((metric) => metric.status !== "parcial" && metric.status !== "bloqueado");

  return (
    <div className="min-h-screen bg-[#edf7f3] text-slate-900">
      <SiteHeader right={`Validação gerada em ${formatDate(snapshot.generatedAt)}`} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2a6b55] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Documentação
        </Link>

        <section className="relative mt-4 overflow-hidden rounded-[2rem] bg-[#173d32] px-6 py-8 text-white shadow-[0_28px_70px_rgba(23,61,50,0.2)] sm:px-10 sm:py-10">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[42px] border-[#2d6958]/60" />
          <div className="absolute bottom-0 right-48 h-24 w-24 translate-y-1/2 rounded-full bg-[#acd8ca]/10" />
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c6ebe0]">
              <ShieldCheck className="h-3.5 w-3.5" /> Evidência de consistência externa
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Validação científica,<br /><span className="text-[#bfe8dc]">sem esconder as diferenças.</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#d9eee8] sm:text-base">
              Reproduzimos três estudos que usaram o mesmo SIVEP-Gripe em 2024. A comparação cobre coortes e estatísticas descritivas, além de uma associação bivariada e uma regressão logística publicadas; ela não transforma a ferramenta em evidência clínica nem prova causalidade.
            </p>
          </div>
          <div className="relative mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [String(STUDIES.length), "artigos auditados"],
              [`${confirmed.length}/${evaluated.length}`, "métricas até 3%"],
              [`${compatibleRegression}/11`, "aORs com IC sobreposto"],
              [`${compatibleVaccinationRegression}/11`, "aORs vacinais compatíveis"],
              [snapshot.database.records2024.toLocaleString("pt-BR"), "registros em 2024"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-4 backdrop-blur-sm">
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-[#b8d6cd]">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <nav className="no-scrollbar sticky top-14 z-30 -mx-4 mt-6 flex gap-2 overflow-x-auto border-y border-[#cfdfda] bg-[#edf7f3]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          {STUDIES.map((study, index) => (
            <a key={study.id} href={`#${study.id}`} className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[11px] font-bold text-[#315e50] hover:border-[#1a3a30]">
              {index + 1}. {study.shortTitle}
            </a>
          ))}
          <a href="#inferencial" className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[11px] font-bold text-[#315e50] hover:border-[#1a3a30]">Validação inferencial</a>
          <a href="#multivariada-vacinacao" className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[11px] font-bold text-[#315e50] hover:border-[#1a3a30]">Modelo vacinal</a>
          <a href="#manifesto" className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[11px] font-bold text-[#315e50] hover:border-[#1a3a30]">Manifesto do dado</a>
          <a href="#limites" className="whitespace-nowrap rounded-full border border-[#c9ddd6] bg-white px-3 py-2 text-[11px] font-bold text-[#315e50] hover:border-[#1a3a30]">O que isso prova</a>
        </nav>

        <section className="my-8 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-[#cfe2db] bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><FlaskConical className="h-5 w-5" /></div>
              <div><h2 className="text-sm font-bold">Critério de interpretação</h2><p className="text-[11px] text-slate-500">Diferença relativa entre o valor publicado e o reproduzido</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><strong>≤ 1%</strong><br />reprodução muito próxima</div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800"><strong>1–3%</strong><br />compatível com outro snapshot</div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><strong>&gt; 3%</strong><br />exige investigação metodológica</div>
            </div>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-center gap-3 text-amber-900"><AlertTriangle className="h-5 w-5" /><h2 className="text-sm font-bold">Snapshot vivo</h2></div>
            <p className="mt-3 text-xs leading-relaxed text-amber-900/80">Os artigos congelaram a base em datas diferentes. O OpenDataSUS recebe inclusões e correções posteriores; igualdade absoluta não é o critério correto.</p>
          </div>
        </section>

        <div className="space-y-8">
          <StudySection
            study={STUDIES[0]}
            metrics={influenzaMetrics}
            method={[
              "ano_epi = 2024, PCR_RESUL = 1 e POS_PCRFLU = 1. O SIVEP-Gripe hospitalar já define o universo de hospitalizações do estudo.",
              "EVOLUCAO em {1, 2} para restringir a desfechos conhecidos; óbito por SRAG é EVOLUCAO = 2.",
              "TP_FLU_PCR separa influenza A (=1) e B (=2). A letalidade usa óbitos / coorte elegível.",
            ]}
          />
          <StudySection
            study={STUDIES[1]}
            metrics={pediatricMetrics}
            method={[
              "ano_epi = 2024; idade registrada em dias ou meses (TP_IDADE em {1, 2}) define menor de 1 ano.",
              "CLASSI_FIN reproduz as seis categorias publicadas; SEM_NOT = 17 reproduz o pico semanal informado.",
              "A tabela etiológica soma uma detecção por vírus e exige evolução conhecida; coinfecções contam em mais de uma etiologia. O painel também preserva a contagem distinta de pacientes.",
              "A regressão usa o subgrupo RT-PCR viral positivo com desfecho conhecido. Essa população reproduz simultaneamente o intercepto, a deviance e os 11 coeficientes publicados.",
            ]}
          />
          <StudySection
            study={{ ...STUDIES[2], reproduction: vaccinationExact ? "complete" : "blocked" }}
            metrics={vaccinationMetrics}
            method={[
              "TP_IDADE = 3, NU_IDADE_N ≥ 60, IMUNODEPRE = 1, HOSPITAL = 1 e NOSOCOMIAL = 2.",
              "DT_INTERNA preenchida, CLASSI_FIN = 5, EVOLUCAO em {1, 2} e DT_EVOLUCA entre 31/12/2023 e 28/12/2024.",
              vaccinationExact ? "Confirmação por PCR_SARS2 = 1 ou AN_SARS2 = 1, como no código R publicado." : "Por enquanto só PCR_SARS2 = 1 está carregado; AN_SARS2 foi adicionado ao ETL, mas exige nova carga de 2024.",
              "UTI ignorada/ausente é recodificada como não; ventilação 3/9/ausente como não invasiva, exatamente como no script R público.",
              "O modelo ajustado conta apenas doses com data registrada e usa idade, sexo, escolaridade, UTI, ventilação e as categorias 0, 1–2, 3, 4 e 5–6 doses.",
            ]}
          />
        </div>

        <section id="inferencial" className="mt-8 scroll-mt-36 overflow-hidden rounded-3xl border border-[#cfe2db] bg-white">
          <div className="border-b border-[#dcebe6] bg-[#173d32] px-6 py-6 text-white sm:px-8">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2.5 text-[#bfe8dc]"><Sigma className="h-5 w-5" /></div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#bfe8dc]">Além das contagens</div>
                <h2 className="mt-1 text-xl font-bold">Validação inferencial</h2>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#d9eee8]">Reexecutamos a associação e o modelo multivariado do estudo vacinal e a regressão pediátrica com diagnóstico global. A compatibilidade considera população, ajuste global e intervalos de confiança — não apenas pontos estimados.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[0.8fr_1.2fr] sm:p-8">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1a3a30]"><GitCompareArrows className="h-4 w-4" /> Associação bivariada</div>
              <MetricCard metric={associationMetric} />
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">UTI</th><th className="px-3 py-2 text-right">Óbitos</th><th className="px-3 py-2 text-right">Curas</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr><td className="px-3 py-2 font-semibold">Sim</td><td className="px-3 py-2 text-right tabular-nums">{association.icuDeaths}</td><td className="px-3 py-2 text-right tabular-nums">{association.icuSurvivors}</td></tr>
                    <tr><td className="px-3 py-2 font-semibold">Não</td><td className="px-3 py-2 text-right tabular-nums">{association.noIcuDeaths}</td><td className="px-3 py-2 text-right tabular-nums">{association.noIcuSurvivors}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Tabela 2×2 com toda a coorte ({association.n.toLocaleString("pt-BR")} registros). Como no script R, UTI ignorada ou ausente é classificada como “não”. O artigo publicou OR bruto 2,60 (IC 95% 1,76–3,86).</p>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-[#1a3a30]"><BarChart3 className="h-4 w-4" /> Regressão logística pediátrica</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Óbito por SRAG versus cura em menores de um ano, usando os mesmos 11 preditores binários da Tabela 4 de Soares et al.</p>
                </div>
                <Link href={pediatricRegressionHref} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#bfd8cf] bg-[#edf7f3] px-3 py-2 text-[10px] font-bold text-[#245c49] hover:border-[#1a3a30]">
                  Abrir regressão <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">N elegível</div><div className="mt-1 text-lg font-bold tabular-nums">{regression.eligibleN.toLocaleString("pt-BR")}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">N no modelo</div><div className="mt-1 text-lg font-bold tabular-nums">{regression.n.toLocaleString("pt-BR")}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Óbitos</div><div className="mt-1 text-lg font-bold tabular-nums">{regression.events.toLocaleString("pt-BR")}</div></div>
                <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">IC sobreposto</div><div className="mt-1 text-lg font-bold tabular-nums text-emerald-800">{compatibleRegression}/11</div></div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Subgrupo de menores de um ano com RT-PCR positivo para ao menos um vírus e evolução conhecida. Código 1 = presença; qualquer outro valor = ausência não registrada. IRLS {regression.converged ? "convergiu" : "não convergiu completamente"} em {regression.iterations} iterações.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-slate-400">−2LL artigo / SivepLens</div><div className="mt-1 font-bold tabular-nums">4.071,57 / {regression.diagnostics.deviance.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-slate-400">Intercepto (odds)</div><div className="mt-1 font-bold tabular-nums">0,013 / {regression.diagnostics.interceptOdds.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-slate-400">Omnibus χ²</div><div className="mt-1 font-bold tabular-nums">235,21 / {regression.diagnostics.omnibusChi2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</div></div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="text-slate-400">AUC · H–L p</div><div className="mt-1 font-bold tabular-nums">{regression.diagnostics.auc.toFixed(3)} · {formatP(regression.diagnostics.hosmerLemeshowPValue)}</div></div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-[#dcebe6]">
            <table className="min-w-[820px] w-full text-[11px]">
              <thead className="bg-[#f4fbf8] text-slate-500">
                <tr><th className="px-5 py-3 text-left">Preditor</th><th className="px-4 py-3 text-right">Artigo aOR (IC 95%)</th><th className="px-4 py-3 text-right">SivepLens aOR (IC 95%)</th><th className="px-4 py-3 text-right">Diferença</th><th className="px-5 py-3 text-right">Leitura</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {regressionComparisons.map((item) => (
                  <tr key={item.key} className="text-slate-700">
                    <td className="px-5 py-3 font-semibold">{item.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.adjustedOddsRatio.toFixed(3)} <span className="text-slate-400">({item.ci95Low.toFixed(3)}–{item.ci95High.toFixed(3)})</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.reproduced.adjustedOddsRatio.toFixed(3)} <span className="text-slate-400">({item.reproduced.ci95Low.toFixed(3)}–{item.reproduced.ci95High.toFixed(3)})</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.relativeDifference > 0 ? "+" : ""}{item.relativeDifference.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${item.compatible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{item.compatible ? "ICs sobrepostos" : "Investigar"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#dcebe6] bg-amber-50 px-6 py-4 text-[10px] leading-relaxed text-amber-900 sm:px-8">Sobreposição de IC 95% é uma verificação de compatibilidade, não um teste formal de equivalência. Como análise de sensibilidade, o SivepLens também preserva “ignorado/ausente” como categoria separada para sintomas e comorbidades: AUC {regression.sensitivity.diagnostics.auc.toFixed(3)} e Hosmer–Lemeshow p {formatP(regression.sensitivity.diagnostics.hosmerLemeshowPValue)}. O resultado principal mantém a recodificação presença versus não registrada para reproduzir o artigo.</div>
        </section>

        <section id="multivariada-vacinacao" className="mt-8 scroll-mt-36 overflow-hidden rounded-3xl border border-[#cfe2db] bg-white">
          <div className="border-b border-[#dcebe6] px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2a6b55]">Modelo corrente e teste controlado</div>
                <h2 className="mt-1 text-xl font-bold text-[#173d32]">Modelo multivariado de vacinação</h2>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">O modelo corrente é recalculado na base implantada. Separadamente, o mesmo núcleo estatístico foi testado sobre o XLSX público dos autores para isolar e verificar o cálculo.</p>
              </div>
              <a href="https://joaofelipe.github.io/COVID-Study/analysis.Rmd" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#bfd8cf] bg-[#edf7f3] px-3 py-2 text-[10px] font-bold text-[#245c49] hover:border-[#1a3a30]">Abrir código dos autores <ExternalLink className="h-3 w-3" /></a>
            </div>
            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Teste controlado · XLSX dos autores</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-violet-900/80">Coorte N={ERAMIA_FROZEN_PROVENANCE.engineValidation.cohort}, com {ERAMIA_FROZEN_PROVENANCE.engineValidation.events} óbitos. O núcleo <code>fitLogistic</code> coincidiu com os {ERAMIA_FROZEN_PROVENANCE.engineValidation.coefficientsMatched} coeficientes e {ERAMIA_FROZEN_PROVENANCE.engineValidation.standardErrorsMatched} erros-padrão do <code>glm()</code> dos autores dentro da tolerância declarada. Convergência em {ERAMIA_FROZEN_PROVENANCE.engineValidation.iterations} iterações.</p>
                </div>
                <a href={ERAMIA_FROZEN_PROVENANCE.engineValidation.artifactUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-violet-700 px-4 py-2 text-[10px] font-bold text-white hover:bg-violet-800">Abrir evidência JSON <ExternalLink className="h-3 w-3" /></a>
              </div>
            </div>
            <div className="mt-5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Resultado na carga atual</div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase text-slate-400">N</div><div className="mt-1 text-lg font-bold">{vaccinationRegression.n.toLocaleString("pt-BR")}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase text-slate-400">Óbitos</div><div className="mt-1 text-lg font-bold">{vaccinationRegression.events.toLocaleString("pt-BR")}</div></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[9px] font-bold uppercase text-emerald-600">ICs sobrepostos</div><div className="mt-1 text-lg font-bold text-emerald-800">{compatibleVaccinationRegression}/11</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase text-slate-400">AUC</div><div className="mt-1 text-lg font-bold">{vaccinationRegression.diagnostics.auc.toFixed(3)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase text-slate-400">H–L p</div><div className="mt-1 text-lg font-bold">{formatP(vaccinationRegression.diagnostics.hosmerLemeshowPValue)}</div></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-[11px]">
              <thead className="bg-[#f4fbf8] text-slate-500"><tr><th className="px-5 py-3 text-left">Preditor</th><th className="px-4 py-3 text-right">Artigo aOR (IC 95%)</th><th className="px-4 py-3 text-right">SivepLens aOR (IC 95%)</th><th className="px-4 py-3 text-right">Diferença</th><th className="px-5 py-3 text-right">Leitura</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {vaccinationRegressionComparisons.map((item) => (
                  <tr key={item.key} className="text-slate-700">
                    <td className="px-5 py-3 font-semibold">{item.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.adjustedOddsRatio.toFixed(2)} <span className="text-slate-400">({item.ci95Low.toFixed(2)}–{item.ci95High.toFixed(2)})</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.reproduced.adjustedOddsRatio.toFixed(2)} <span className="text-slate-400">({item.reproduced.ci95Low.toFixed(2)}–{item.reproduced.ci95High.toFixed(2)})</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.relativeDifference > 0 ? "+" : ""}{item.relativeDifference.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${item.compatible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{item.compatible ? "ICs sobrepostos" : "Investigar"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#dcebe6] bg-slate-50 px-6 py-4 text-[10px] leading-relaxed text-slate-600 sm:px-8">{vaccinationRegression.doseDefinition} A comparação da carga atual com o arquivo histórico deve considerar em conjunto a coorte, as recodificações e a proveniência; a diferença não é atribuída automaticamente a correções retrospectivas.</div>
        </section>

        <section id="manifesto" className="mt-8 scroll-mt-36 rounded-3xl border border-[#cfe2db] bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#e5f3ee] p-2.5 text-[#28634f]"><Fingerprint className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-bold">Manifesto do dado</h2><p className="mt-1 text-xs text-slate-500">A “impressão digital” necessária para repetir a análise no mesmo snapshot.</p></div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Período observado", `${formatDate(snapshot.database.minNotificationDate)} – ${formatDate(snapshot.database.maxNotificationDate)}`],
              ["Última carga", formatDate(snapshot.database.latestLoadAt)],
              ["Arquivo 2024", snapshot.database.sourceManifest?.fileName ?? "manifesto disponível após a próxima carga"],
              ["Normalização", snapshot.database.sourceManifest?.normalizationVersion ?? ETL_NORMALIZATION_VERSION],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
                <div className="mt-2 break-words text-xs font-semibold text-slate-700">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 font-mono text-[10px] leading-relaxed text-slate-600">
            SHA-256: {snapshot.database.sourceManifest?.sha256 ?? "será calculado automaticamente na próxima execução do ETL"}<br />
            protocolo: {SCIENTIFIC_VALIDATION_VERSION} · fonte: {snapshot.database.latestLoadSource ?? "não registrada"}
          </div>
          <div className="mt-3 flex justify-end">
            <a href="/api/validacao" target="_blank" className="inline-flex items-center gap-2 rounded-full border border-[#bfd8cf] bg-[#edf7f3] px-4 py-2 text-[11px] font-bold text-[#245c49] hover:border-[#1a3a30]">
              Abrir manifesto JSON <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Campos já presentes no banco</div>
              <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/80">{snapshot.database.requiredFieldsPresent.length ? snapshot.database.requiredFieldsPresent.join(", ") : "Nenhum dos novos campos ainda foi migrado."}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900"><Clock3 className="h-4 w-4" /> Pendentes no banco implantado</div>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-900/80">{snapshot.database.requiredFieldsMissing.length ? snapshot.database.requiredFieldsMissing.join(", ") : "Nenhum: migração e recarga concluídas."}</p>
            </div>
          </div>
        </section>

        <section id="limites" className="mt-8 scroll-mt-36 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-7">
            <div className="flex items-center gap-2 text-emerald-900"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">O que esta validação sustenta</h2></div>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-emerald-950/80">
              <li>• Os filtros básicos e denominadores do SivepLens reproduzem três populações publicadas de 2024 com diferenças pequenas.</li>
              <li>• As codificações de classificação, desfecho, subtipo de influenza e idade estão coerentes com análises externas.</li>
              <li>• As divergências ficam auditáveis por artigo, métrica, snapshot e versão do ETL.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex items-center gap-2 text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-500" /><h2 className="font-bold">O que ela não sustenta</h2></div>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
              <li>• Não valida causalidade ou eficácia clínica e não generaliza os modelos reproduzidos para qualquer combinação livre de filtros do painel.</li>
              <li>• Não garante igualdade com snapshots antigos: o SIVEP-Gripe é corrigido retrospectivamente.</li>
              <li>• DT_DIGITA registra a inclusão inicial e DT_ENCERRA o encerramento; nenhuma delas é um histórico completo das correções.</li>
            </ul>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-[#173d32] px-6 py-6 text-white sm:flex sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-start gap-3"><FileCode2 className="mt-0.5 h-5 w-5 text-[#bfe8dc]" /><div><h2 className="text-sm font-bold">Pronto para entrar no artigo</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#cfe7df]">O snapshot, o protocolo, as três coortes e os dois modelos multivariados estão identificados. O passo editorial agora é selecionar os resultados essenciais para as quatro páginas da ERAMIA-RS.</p></div></div>
          <Link href="/analise/descritiva" className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#173d32] sm:mt-0">Explorar dados <Database className="h-3.5 w-3.5" /></Link>
        </section>
      </main>
    </div>
  );
}
