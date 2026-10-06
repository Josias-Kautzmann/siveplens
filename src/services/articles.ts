import { unstable_cache } from "next/cache";
import { RESEARCHER_PHOTOS } from "./researcherPhotos";

export interface ScientificArticle {
  id:           string;
  title:        string;
  doi:          string | null;
  year:         number;
  citedBy:      number;
  isOA:         boolean;
  type:         string | null;
  firstAuthor:  string;
  extraAuthors: number;
  institution:  string | null;
  journal:      string | null;
  topics:       string[];
  abstract:     string | null;
  url:          string;
}

export interface Researcher {
  id:          string;
  name:        string;
  institution: string;
  citedBy:     number;
  hIndex:      number;
  works:       number;
  url:         string;
  orcid:       string | null;
  photoUrl:    string | null;
  topArticle:  { title: string; url: string; citedBy: number } | null;
}

export interface ArticlesData {
  sivep:       ScientificArticle[];
  sivepRecent: ScientificArticle[];
  srag:        ScientificArticle[];
  sragRecent:  ScientificArticle[];
  researchers: Researcher[];
}

const BASE   = "https://api.openalex.org";
const OA_HDR = { "User-Agent": "SRAG-DATASUS/1.0 (mailto:josiaskautzmann@gmail.com)" };
const SEL    = "id,title,doi,publication_year,cited_by_count,authorships,primary_location,open_access,type,topics,abstract_inverted_index";

const TYPE_PT: Record<string, string> = {
  article:        "Artigo",
  review:         "Revisão",
  preprint:       "Preprint",
  "book-chapter": "Capítulo",
  dataset:        "Dataset",
  editorial:      "Editorial",
  letter:         "Carta",
  erratum:        "Errata",
};

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string | null {
  if (!inv) return null;
  const entries: [number, string][] = [];
  for (const [word, positions] of Object.entries(inv))
    for (const pos of positions) entries.push([pos, word]);
  const text = entries.sort((a, b) => a[0] - b[0]).map(e => e[1]).join(" ");
  return text.length > 280 ? text.slice(0, 280).trimEnd() + "…" : text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArticle(w: any): ScientificArticle {
  return {
    id:           w.id,
    title:        w.title ?? "",
    doi:          w.doi ?? null,
    year:         w.publication_year,
    citedBy:      w.cited_by_count ?? 0,
    isOA:         w.open_access?.is_oa ?? false,
    type:         TYPE_PT[w.type as string] ?? null,
    firstAuthor:  w.authorships?.[0]?.author?.display_name ?? "",
    extraAuthors: Math.max(0, (w.authorships?.length ?? 1) - 1),
    institution:  w.authorships?.[0]?.institutions?.[0]?.display_name ?? null,
    journal:      w.primary_location?.source?.display_name ?? null,
    topics:       (w.topics ?? []).slice(0, 3).map((t: { display_name: string }) => t.display_name),
    abstract:     reconstructAbstract(w.abstract_inverted_index),
    url:          w.doi ?? w.id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function oaGet(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: OA_HDR });
    if (!res.ok) return [];
    return (await res.json()).results ?? [];
  } catch { return []; }
}

async function fetchAllArticles(): Promise<ArticlesData> {
  const [sivepRaw, sivepRecentRaw, sragCitedRaw, sragRecentRaw] = await Promise.all([
    oaGet(`/works?search=%22SIVEP-Gripe%22+OR+%22SIVEP+Gripe%22&sort=cited_by_count:desc&per-page=30&select=${SEL}`),
    oaGet(`/works?search=%22SIVEP-Gripe%22+OR+%22SIVEP+Gripe%22&filter=from_publication_date:2020-01-01&sort=publication_date:desc&per-page=18&select=${SEL}`),
    oaGet(
      `/works?search=%22s%C3%ADndrome+respirat%C3%B3ria+aguda+grave%22+OR+%22SRAG%22+OR+%22influenza%22` +
      `&filter=language:pt,from_publication_date:2010-01-01&sort=cited_by_count:desc&per-page=18&select=${SEL}`
    ),
    oaGet(
      `/works?search=%22s%C3%ADndrome+respirat%C3%B3ria+aguda+grave%22+OR+%22influenza%22` +
      `&filter=language:pt,from_publication_date:2022-01-01&sort=publication_date:desc&per-page=18&select=${SEL}`
    ),
  ]);

  // Mapeia autor → artigo SIVEP mais citado (reutiliza dados já buscados)
  const authorTopPaper = new Map<string, { title: string; url: string; citedBy: number }>();
  for (const w of sivepRaw) {
    const paper = { title: w.title ?? "", url: w.doi ?? w.id, citedBy: w.cited_by_count ?? 0 };
    for (const a of w.authorships ?? []) {
      const aid: string = a.author?.id;
      if (!aid) continue;
      const prev = authorTopPaper.get(aid);
      if (!prev || paper.citedBy > prev.citedBy) authorTopPaper.set(aid, paper);
    }
  }

  // Coleta IDs únicos dos autores dos 30 artigos SIVEP
  const seenIds = new Set<string>(authorTopPaper.keys());

  const authorIds = [...seenIds].slice(0, 25).join("|");
  const authorsRaw = authorIds
    ? await oaGet(
        `/authors?filter=ids.openalex:${authorIds}` +
        `&select=id,display_name,cited_by_count,works_count,last_known_institutions,summary_stats,ids`
      )
    : [];

  const researchers: Researcher[] = authorsRaw
    .sort((a: { cited_by_count?: number }, b: { cited_by_count?: number }) =>
      (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0)
    )
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => ({
      id:          a.id,
      name:        a.display_name,
      institution: a.last_known_institutions?.[0]?.display_name ?? "",
      citedBy:     a.cited_by_count ?? 0,
      hIndex:      a.summary_stats?.h_index ?? 0,
      works:       a.works_count ?? 0,
      url:         a.id,
      orcid:       a.ids?.orcid ?? null,
      photoUrl:    RESEARCHER_PHOTOS[a.id as string] ?? null,
      topArticle:  authorTopPaper.get(a.id as string) ?? null,
    }));

  const citedIds = new Set(sragCitedRaw.map((w: { id: string }) => w.id));
  const sragRecentDeduped = sragRecentRaw.filter((w: { id: string }) => !citedIds.has(w.id));

  const sivepCitedIds = new Set(sivepRaw.map((w: { id: string }) => w.id));
  const sivepRecentDeduped = sivepRecentRaw.filter((w: { id: string }) => !sivepCitedIds.has(w.id));

  return {
    sivep:       sivepRaw.slice(0, 24).map(toArticle),
    sivepRecent: sivepRecentDeduped.map(toArticle),
    srag:        sragCitedRaw.map(toArticle),
    sragRecent:  sragRecentDeduped.map(toArticle),
    researchers,
  };
}

export const getScientificArticles = unstable_cache(
  fetchAllArticles,
  ["scientific-articles-v8"],
  { revalidate: 24 * 60 * 60 }
);
