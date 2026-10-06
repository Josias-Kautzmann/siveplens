"use client";

import { useState } from "react";
import type { ArticlesData, ScientificArticle, Researcher } from "@/services/articles";

const PER_PAGE_ARTICLES     = 4;
const PER_PAGE_RESEARCHERS  = 6;

// ── Foto banner do pesquisador ────────────────────────────────────────────────

function ResearcherPhoto({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const hue = 150 + (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 30);

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="w-full h-full object-cover object-top"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, hsl(${hue},38%,18%), hsl(${hue},38%,28%))` }}>
      <span className="text-5xl font-black text-white/30 select-none">{initials}</span>
    </div>
  );
}

// ── Article card ─────────────────────────────────────────────────────────────

function ArticleCard({ article }: { article: ScientificArticle }) {
  const href = article.doi ?? article.url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 p-4 rounded-xl border border-[#c5ddd6] bg-white hover:border-[#2a6b55] hover:shadow-md transition-all duration-200"
    >
      {/* Linha 1: ano · tipo · citações · OA */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-[#94A3B8] tabular-nums">{article.year}</span>
        {article.type && (
          <span className="text-[10px] font-semibold text-[#555770] bg-[#f4fbf8] border border-[#c5ddd6] px-2 py-0.5 rounded-full">
            {article.type}
          </span>
        )}
        <span className="flex items-center gap-1 bg-[#1a3a30] text-[#c2e8df] text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto">
          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 1l1.2 2.5L9 4l-2 2 .5 2.8L5 7.5 2.5 8.8 3 6 1 4l2.8-.5z"/>
          </svg>
          {article.citedBy.toLocaleString("pt-BR")} cit.
        </span>
        {article.isOA && (
          <span className="text-[10px] font-bold text-[#059669] bg-[#d1fae5] px-2 py-0.5 rounded-full">
            OA
          </span>
        )}
      </div>

      {/* Título */}
      <p className="text-[13px] font-semibold text-[#0f2820] leading-snug line-clamp-2 group-hover:text-[#1a3a30] transition-colors">
        {article.title}
      </p>

      {/* Abstract */}
      {article.abstract
        ? <p className="text-[11px] text-[#555770] leading-relaxed line-clamp-3">{article.abstract}</p>
        : <p className="text-[11px] text-[#94A3B8] italic">Resumo não disponível nesta fonte.</p>
      }

      {/* Topics */}
      {article.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {article.topics.map(t => (
            <span key={t} className="text-[9px] font-semibold text-[#2a6b55] bg-[#eaf5f1] px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Rodapé: autor · instituição · journal */}
      <div className="flex flex-col gap-0.5 mt-auto pt-2 border-t border-[#eaf5f1]">
        <span className="text-[11px] text-[#4a5568]">
          {article.firstAuthor}
          {article.extraAuthors > 0 && (
            <span className="text-[#94A3B8]"> +{article.extraAuthors}</span>
          )}
        </span>
        {article.institution && (
          <span className="text-[10px] text-[#94A3B8] truncate">{article.institution}</span>
        )}
        {article.journal && (
          <span className="text-[10px] text-[#94A3B8] italic truncate">{article.journal}</span>
        )}
      </div>
    </a>
  );
}

// ── Researcher card ───────────────────────────────────────────────────────────

function ResearcherCard({ researcher }: { researcher: Researcher }) {
  const profileUrl = researcher.url.startsWith("http")
    ? researcher.url
    : `https://openalex.org/${researcher.id}`;

  return (
    <div className="flex rounded-xl border border-[#c5ddd6] bg-white hover:border-[#2a6b55] hover:shadow-md transition-all duration-200 overflow-hidden">

      {/* Foto vertical esquerda */}
      <div className="relative w-28 shrink-0 bg-[#1a3a30]">
        <ResearcherPhoto name={researcher.name} photoUrl={researcher.photoUrl} />
      </div>

      {/* Conteúdo direita */}
      <div className="flex flex-col gap-2 p-4 flex-1 min-w-0">

        {/* Nome + instituição */}
        <div>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-semibold text-[#0f2820] leading-snug hover:text-[#2a6b55] transition-colors"
          >
            {researcher.name}
          </a>
          {researcher.institution && (
            <p className="text-[10px] text-[#94A3B8] mt-0.5 line-clamp-2">{researcher.institution}</p>
          )}
        </div>

        {/* Artigo mais citado */}
        {researcher.topArticle && (
          <a
            href={researcher.topArticle.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/art flex flex-col gap-0.5 flex-1"
          >
            <span className="text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">
              Artigo mais citado
            </span>
            <span className="text-[11px] text-[#1a3a30] leading-snug line-clamp-3 group-hover/art:text-[#2a6b55] transition-colors">
              {researcher.topArticle.title}
            </span>
            <span className="text-[10px] text-[#94A3B8] tabular-nums mt-0.5">
              {researcher.topArticle.citedBy.toLocaleString("pt-BR")} citações
            </span>
          </a>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#eaf5f1] mt-auto">
          <div className="flex flex-col items-center flex-1">
            <span className="text-[13px] font-bold text-[#1a3a30] tabular-nums">
              {researcher.citedBy.toLocaleString("pt-BR")}
            </span>
            <span className="text-[9px] text-[#94A3B8] uppercase tracking-wide">citações</span>
          </div>
          <div className="w-px h-5 bg-[#eaf5f1]" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-[13px] font-bold text-[#1a3a30] tabular-nums">
              {researcher.hIndex}
            </span>
            <span className="text-[9px] text-[#94A3B8] uppercase tracking-wide">h-index</span>
          </div>
          <div className="w-px h-5 bg-[#eaf5f1]" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-[13px] font-bold text-[#1a3a30] tabular-nums">
              {researcher.works.toLocaleString("pt-BR")}
            </span>
            <span className="text-[9px] text-[#94A3B8] uppercase tracking-wide">publicações</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Paginação ─────────────────────────────────────────────────────────────────

function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#c5ddd6]">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2a6b55] disabled:text-[#c5ddd6] disabled:cursor-not-allowed hover:text-[#1a3a30] transition-colors"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 1L3 6l5 5" />
        </svg>
        Anterior
      </button>
      <span className="text-[11px] text-[#94A3B8] tabular-nums">
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2a6b55] disabled:text-[#c5ddd6] disabled:cursor-not-allowed hover:text-[#1a3a30] transition-colors"
      >
        Próxima
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 1l5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}

// ── Botões de ordenação ───────────────────────────────────────────────────────

function SortBar<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { id: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-[#94A3B8] mr-1">Ordenar:</span>
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all ${
            active === o.id
              ? "bg-[#1a3a30] text-white"
              : "bg-white border border-[#c5ddd6] text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

type Tab = "sivep" | "srag" | "pesquisadores";
type ArticleSort = "cited" | "recent";
type ResearcherSort = "cited" | "hindex" | "works";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "sivep",         label: "Usando SIVEP-Gripe",   desc: "Artigos que utilizam a base de dados da vigilância epidemiológica da gripe" },
  { id: "srag",          label: "SRAG & Respiratórias", desc: "Artigos sobre SRAG e doenças respiratórias em português" },
  { id: "pesquisadores", label: "Pesquisadores",         desc: "Pesquisadores identificados nos estudos com SIVEP-Gripe" },
];

const ARTICLE_SORT_OPTIONS: { id: ArticleSort; label: string }[] = [
  { id: "cited",  label: "Mais citados" },
  { id: "recent", label: "Mais recentes" },
];

const RESEARCHER_SORT_OPTIONS: { id: ResearcherSort; label: string }[] = [
  { id: "cited",  label: "Citações" },
  { id: "hindex", label: "H-index" },
  { id: "works",  label: "Publicações" },
];

export default function ArtigosSection({ data }: { data: ArticlesData }) {
  const [tab, setTab]                   = useState<Tab>("sivep");
  const [articleSort, setArticleSort]   = useState<ArticleSort>("cited");
  const [researcherSort, setResearcherSort] = useState<ResearcherSort>("cited");
  const [page, setPage]                 = useState(0);

  const changeTab = (t: Tab) => { setTab(t); setPage(0); };
  const changeArticleSort = (s: ArticleSort) => { setArticleSort(s); setPage(0); };
  const changeResearcherSort = (s: ResearcherSort) => { setResearcherSort(s); setPage(0); };

  // Lista de artigos conforme tab + sort
  const articleList: ScientificArticle[] = (() => {
    if (tab === "pesquisadores") return [];
    if (tab === "sivep") {
      return articleSort === "cited"
        ? data.sivep
        : (data.sivepRecent?.length ? data.sivepRecent : [...data.sivep].sort((a, b) => b.year - a.year));
    }
    // srag
    return articleSort === "cited"
      ? data.srag
      : (data.sragRecent?.length ? data.sragRecent : [...data.srag].sort((a, b) => b.year - a.year));
  })();

  // Lista de pesquisadores conforme sort
  const researcherList: Researcher[] = [...data.researchers].sort((a, b) => {
    if (researcherSort === "hindex") return b.hIndex - a.hIndex;
    if (researcherSort === "works")  return b.works - a.works;
    return b.citedBy - a.citedBy;
  });

  const activeList = tab === "pesquisadores" ? researcherList : articleList;
  const totalItems = activeList.length;
  const perPage    = tab === "pesquisadores" ? PER_PAGE_RESEARCHERS : PER_PAGE_ARTICLES;
  const pageSlice  = activeList.slice(page * perPage, (page + 1) * perPage);

  const active = TABS.find(t => t.id === tab)!;

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-[#1a3a30] text-white"
                : "bg-white border border-[#c5ddd6] text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Descrição + ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[11px] text-[#94A3B8]">{active.desc}</p>
        {tab !== "pesquisadores" && (
          <SortBar options={ARTICLE_SORT_OPTIONS} active={articleSort} onChange={changeArticleSort} />
        )}
        {tab === "pesquisadores" && (
          <SortBar options={RESEARCHER_SORT_OPTIONS} active={researcherSort} onChange={changeResearcherSort} />
        )}
      </div>

      {/* Grid */}
      {tab !== "pesquisadores" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(pageSlice as ScientificArticle[]).map(a => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
      {tab === "pesquisadores" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(pageSlice as Researcher[]).map(r => (
            <ResearcherCard key={r.id} researcher={r} />
          ))}
        </div>
      )}

      <Pagination page={page} total={totalItems} perPage={perPage} onChange={setPage} />

      <p className="text-[10px] text-[#C0C7D4] mt-5 text-right">
        Dados:{" "}
        <a href="https://openalex.org" target="_blank" rel="noopener noreferrer" className="hover:text-[#94A3B8]">
          OpenAlex
        </a>{" "}
        · atualiza a cada 24h
      </p>
    </div>
  );
}
