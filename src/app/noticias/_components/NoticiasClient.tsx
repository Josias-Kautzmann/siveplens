"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { NewsItem, NewsCategoryId } from "@/services/news";
import { NEWS_CATEGORIES } from "@/services/news";
import type { ArticlesData } from "@/services/articles";
import ArtigosSection from "./ArtigosSection";

// ── Helpers ──────────────────────────────────────────────────────────────────

function relDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const diffH = (Date.now() - d.getTime()) / 3_600_000;
    if (diffH < 1)   return "agora";
    if (diffH < 24)  return `há ${Math.floor(diffH)}h`;
    if (diffH < 48)  return "ontem";
    if (diffH < 168) return `há ${Math.floor(diffH / 24)} dias`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

// ── Imagem com fallback ──────────────────────────────────────────────────────

function NewsImage({ src, alt, className, source }: {
  src: string; alt: string; className?: string; source?: string;
}) {
  if (!src) return (
    <div className={`relative bg-gradient-to-br from-[#1a3a30] to-[#2a6b55] flex items-center justify-center overflow-hidden ${className}`}>
      {source && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/20 font-black text-2xl tracking-widest uppercase select-none text-center px-4 leading-tight">
            {source}
          </span>
        </span>
      )}
    </div>
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── Chip de categoria ─────────────────────────────────────────────────────────

function CategoryChip({ id, label }: { id: string; label: string }) {
  const colors: Record<string, string> = {
    srag:      "bg-[#1a3a30] text-[#dff0ea]",
    influenza: "bg-[#7c3aed]/10 text-[#7c3aed]",
    covid:     "bg-[#dc2626]/10 text-[#dc2626]",
    vsr:       "bg-[#0369a1]/10 text-[#0369a1]",
    epidemia:  "bg-[#d97706]/10 text-[#d97706]",
    geral:     "bg-[#6b7280]/10 text-[#6b7280]",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors[id] ?? colors.geral}`}>
      {label}
    </span>
  );
}

// ── Hero card — Fiocruz / InfoGripe ──────────────────────────────────────────

function HeroCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col md:flex-row overflow-hidden rounded-2xl border border-[#c5ddd6] bg-white hover:border-[#2a6b55] hover:shadow-lg transition-all duration-300"
    >
      {/* Imagem — lado esquerdo */}
      <div className="relative w-full md:w-2/5 h-56 md:h-auto shrink-0 bg-white p-3">
        <div className="w-full h-full transition-transform duration-500 group-hover:scale-[1.05] origin-center">
          <NewsImage src={item.imageUrl} alt={item.title} className="w-full h-full" source={item.source} />
        </div>
      </div>

      {/* Conteúdo — lado direito */}
      <div className="flex flex-col p-6 md:p-8 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-[#2a6b55] uppercase tracking-widest">
            Fiocruz · InfoGripe
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.categories.map(c => {
            const cat = NEWS_CATEGORIES.find(x => x.id === c);
            return cat ? <CategoryChip key={c} id={c} label={cat.label} /> : null;
          })}
        </div>

        <h2 className="text-[#0f2820] font-semibold text-lg md:text-xl leading-snug group-hover:text-[#1a3a30] transition-colors mb-3 line-clamp-3">
          {item.title.trim()}
        </h2>

        {item.description && (
          <p className="text-[#4a5568] text-sm leading-relaxed line-clamp-4 mb-4 flex-1">
            {item.description}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-auto pt-4 border-t border-[#eaf5f1]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#2a6b55]">{item.source}</span>
            <span className="text-[#94A3B8] text-[10px]">·</span>
            <span className="text-[#94A3B8] text-[10px] tabular-nums">{relDate(item.pubDate)}</span>
          </div>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1a3a30] group-hover:text-[#2a6b55] transition-colors shrink-0">
            Ler boletim
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 10L10 2M10 2H4M10 2v6" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}

// ── Featured card (grande) ────────────────────────────────────────────────────

function FeaturedCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-2xl min-h-[300px] bg-[#0f2820]"
    >
      <div className="absolute inset-0">
        <NewsImage src={item.imageUrl} alt={item.title} className="w-full h-full opacity-60 group-hover:opacity-70 transition-opacity duration-300" source={item.source} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      <div className="relative mt-auto p-5">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.categories.map(c => {
            const cat = NEWS_CATEGORIES.find(x => x.id === c);
            return cat ? (
              <span key={c} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-white/90 backdrop-blur-sm">
                {cat.label}
              </span>
            ) : null;
          })}
        </div>
        <h2 className="text-white font-semibold text-[15px] leading-snug line-clamp-3 group-hover:text-[#c2e8df] transition-colors">
          {item.title}
        </h2>
        <div className="flex items-center gap-2 mt-3">
          {item.source && <span className="text-[11px] font-semibold text-[#a8d5c7]">{item.source}</span>}
          <span className="text-white/40 text-[10px]">·</span>
          <span className="text-white/50 text-[10px] tabular-nums">{relDate(item.pubDate)}</span>
          <svg className="w-3 h-3 text-white/30 ml-auto group-hover:text-[#a8d5c7] transition-colors" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 10L10 2M10 2H4M10 2v6" />
          </svg>
        </div>
      </div>
    </a>
  );
}

// ── Card normal (grid) ────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-[#c5ddd6] bg-white hover:border-[#1a3a30] hover:shadow-md transition-all duration-200"
    >
      <div className="relative h-40 bg-[#f4fbf8] overflow-hidden shrink-0">
        <NewsImage src={item.imageUrl} alt={item.title} className="w-full h-full group-hover:scale-105 transition-transform duration-300" source={item.source} />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.categories.slice(0, 2).map(c => {
            const cat = NEWS_CATEGORIES.find(x => x.id === c);
            return cat ? <CategoryChip key={c} id={c} label={cat.label} /> : null;
          })}
        </div>
      </div>
      <div className="p-3.5 flex flex-col flex-1">
        <p className="text-[13px] font-semibold text-[#1C1C1C] leading-snug line-clamp-3 group-hover:text-[#1a3a30] transition-colors flex-1">
          {item.title}
        </p>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#eaf5f1]">
          <span className="text-[10px] font-semibold text-[#2a6b55] truncate max-w-[65%]">{item.source}</span>
          <span className="text-[10px] text-[#94A3B8] tabular-nums shrink-0">{relDate(item.pubDate)}</span>
        </div>
      </div>
    </a>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────

type MainTab = "noticias" | "artigos";

const MAIN_TABS: { id: MainTab; label: string; sublabel: string }[] = [
  { id: "noticias", label: "Notícias",            sublabel: "Boletins e cobertura de mídia" },
  { id: "artigos",  label: "Artigos Científicos", sublabel: "Estudos, citações e pesquisadores" },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function NoticiasClient({
  items,
  fetchedAt,
  articles,
}: {
  items: NewsItem[];
  fetchedAt: string;
  articles: ArticlesData | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mainTab: MainTab = searchParams.get("tab") === "artigos" ? "artigos" : "noticias";
  const [activeTag, setActiveTag] = useState<NewsCategoryId | "todos">("todos");
  function setMainTab(tab: MainTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  const filtered = activeTag === "todos"
    ? items
    : items.filter(i => i.categories.includes(activeTag));

  const heroItem = filtered.find(i => i.source === "Fiocruz") ?? null;
  const rest     = filtered.filter(i => i !== heroItem);
  const featured = rest.slice(0, 2);
  const grid     = rest.slice(2);

  const fetchTime = (() => {
    try { return new Date(fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  })();

  return (
    <div className="max-w-7xl mx-auto px-5 py-10 pb-16">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2a6b55] mb-1">
          Notícias &amp; Pesquisa
        </p>

        {/* Tabs principais */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-3">
          <div className="flex gap-1 p-1 bg-white border border-[#c5ddd6] rounded-xl">
            {MAIN_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setMainTab(t.id)}
                className={`flex flex-col px-5 py-2.5 rounded-lg text-left transition-all duration-200 ${
                  mainTab === t.id
                    ? "bg-[#1a3a30] text-white shadow-sm"
                    : "text-[#4a5568] hover:bg-[#f4fbf8]"
                }`}
              >
                <span className="text-[13px] font-semibold leading-tight">{t.label}</span>
                <span className={`text-[10px] leading-tight mt-0.5 ${mainTab === t.id ? "text-[#a8d5c7]" : "text-[#94A3B8]"}`}>
                  {t.sublabel}
                </span>
              </button>
            ))}
          </div>

          {mainTab === "noticias" && (
            <span className="text-[11px] text-[#94A3B8]">
              atualizado às {fetchTime}
            </span>
          )}
        </div>
      </div>

      {/* ── Aba: Notícias ─────────────────────────────────────────────── */}
      {mainTab === "noticias" && (
        <>
          {/* Sub-filtro por categoria */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveTag("todos")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTag === "todos"
                  ? "bg-[#1a3a30] text-white"
                  : "bg-white border border-[#c5ddd6] text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              Todos
            </button>
            {NEWS_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTag(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeTag === cat.id
                    ? "bg-[#1a3a30] text-white"
                    : "bg-white border border-[#c5ddd6] text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="flex items-center justify-center min-h-[40vh] text-[#94A3B8] text-sm">
              Não foi possível carregar as notícias no momento.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-[#94A3B8] text-sm">
              Nenhuma notícia encontrada para este filtro.
            </div>
          ) : (
            <>
              {heroItem && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#2a6b55]">
                      Artigo em destaque
                    </p>
                    <div className="flex-1 h-px bg-[#c5ddd6]" />
                  </div>
                  <HeroCard item={heroItem} />
                </div>
              )}

              {featured.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">
                      Últimas notícias
                    </p>
                    <div className="flex-1 h-px bg-[#c5ddd6]" />
                  </div>
                  <div className={`grid gap-4 ${featured.length === 1 ? "" : "grid-cols-1 md:grid-cols-2"}`}>
                    {featured.map(item => <FeaturedCard key={item.id} item={item} />)}
                  </div>
                </div>
              )}

              {grid.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">
                      Mais recentes
                    </p>
                    <div className="flex-1 h-px bg-[#c5ddd6]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {grid.map(item => <NewsCard key={item.id} item={item} />)}
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-[10px] text-[#C0C7D4] mt-8 text-right">
            Fontes: Fiocruz · Veja Saúde · G1 · Saúde Business · Ministério da Saúde · atualiza a cada 2h
          </p>
        </>
      )}

      {/* ── Aba: Artigos Científicos ──────────────────────────────────── */}
      {mainTab === "artigos" && (
        <>
          {articles ? (
            <ArtigosSection data={articles} />
          ) : (
            <div className="flex items-center justify-center min-h-[40vh] text-[#94A3B8] text-sm">
              Não foi possível carregar os artigos no momento.
            </div>
          )}
        </>
      )}
    </div>
  );
}
