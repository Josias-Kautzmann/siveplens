import { unstable_cache } from "next/cache";

export interface NewsItem {
  id:          string;
  title:       string;
  link:        string;
  source:      string;
  pubDate:     string;
  description: string;
  imageUrl:    string;
  categories:  string[];
}

export const NEWS_CATEGORIES = [
  { id: "srag",      label: "SRAG"      },
  { id: "influenza", label: "Influenza" },
  { id: "covid",     label: "COVID-19"  },
  { id: "vsr",       label: "VSR"       },
  { id: "epidemia",  label: "Epidemia"  },
  { id: "geral",     label: "Geral"     },
] as const;

export type NewsCategoryId = typeof NEWS_CATEGORIES[number]["id"];

const FEEDS: Array<{ url: string; sourceName: string; isGoogleNews?: boolean }> = [
  // Feeds diretos — fornecem imagens via media:content / enclosure
  { url: "https://agencia.fiocruz.br/rss.xml",                          sourceName: "Fiocruz"        },
  { url: "https://veja.abril.com.br/saude/feed/",                       sourceName: "Veja Saúde"     },
  { url: "https://g1.globo.com/rss/g1/ciencia-e-saude/",               sourceName: "G1 Saúde"       },
  { url: "https://www.saudebusiness.com/feed",                          sourceName: "Saúde Business"  },
  { url: "https://www.gov.br/saude/pt-br/assuntos/noticias/@@rss.xml", sourceName: "MS"              },
  // Google News — sem imagem, mais volume (usam placeholder gradiente)
  {
    url: "https://news.google.com/rss/search?q=SRAG+s%C3%ADndrome+respirat%C3%B3ria+aguda+grave+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
    sourceName: "Google News", isGoogleNews: true,
  },
  {
    url: "https://news.google.com/rss/search?q=influenza+gripe+sazonal+surto+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
    sourceName: "Google News", isGoogleNews: true,
  },
  {
    url: "https://news.google.com/rss/search?q=covid+coronav%C3%ADrus+pneumonia+respira%C3%A7%C3%A3o+brasil&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
    sourceName: "Google News", isGoogleNews: true,
  },
];

// ── Relevância e categorização ───────────────────────────────────────────────

// Filtro estrito para feeds diretos — apenas doenças respiratórias agudas.
// Feeds Google News são pré-filtrados pela busca, passam sem este filtro.
const RELEVANCE_RE = /\bsrag\b|síndrome\s+respira[tóç]|influenza|\bgripe\b|\bcovid[-\s]?\d*\b|sars(?:-cov)?|\bcoronav[íi]?rus\b|\bvsr\b|vírus\s+sincicial|sincicial\s+respira|pneumonia|bronquit[ei]|infec[çc][aã][oa]?\s+respira[tóç]|doença[s]?\s+respira[tóç]|\bsivep\b|síndrome\s+gripal|gripe\s+(?:sazonal|avi[aá]ria)|h[1-9]n\d/i;

function isRelevant(title: string, desc: string): boolean {
  return RELEVANCE_RE.test(`${title} ${desc}`);
}

function categorize(title: string, desc: string): string[] {
  const text = `${title} ${desc}`.toLowerCase();
  const cats: string[] = [];
  if (/\bsrag\b|síndrome respirat/.test(text))                   cats.push("srag");
  if (/influenza|gripe\b/.test(text))                            cats.push("influenza");
  if (/\bcovid\b|sars-cov|coronav/.test(text))                  cats.push("covid");
  if (/\bvsr\b|vírus sincicial|sincicial respirat/.test(text))  cats.push("vsr");
  if (/surto\b|epidemia\b|epid[eê]mico/.test(text))             cats.push("epidemia");
  return cats.length ? cats : ["geral"];
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractTag(xml: string, tag: string): string {
  const cdata = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"
  ).exec(xml);
  if (cdata) return decodeEntities(cdata[1].trim());
  const plain = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i").exec(xml);
  return plain ? decodeEntities(plain[1].trim()) : "";
}

function extractLink(xml: string): string {
  return (
    /<link>([^<]+)<\/link>/i.exec(xml)?.[1]?.trim() ??
    /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/i.exec(xml)?.[1]?.trim() ??
    ""
  );
}

function extractSource(xml: string, fallback: string): string {
  const fromTag = /<source[^>]*>([^<]*)<\/source>/i.exec(xml)?.[1]?.trim();
  return decodeEntities(fromTag || fallback);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function extractRssImage(itemXml: string, rawDesc: string): string {
  const media =
    /media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i.exec(itemXml)?.[1];
  if (media) return media;

  const encl =
    /enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i.exec(itemXml)?.[1] ??
    /enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i.exec(itemXml)?.[1];
  if (encl) return encl;

  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(rawDesc)?.[1];
  if (img && !img.includes("pixel") && !img.includes("tracking")) return img;

  return "";
}

// ── Parser de itens ──────────────────────────────────────────────────────────

type RawItem = Omit<NewsItem, "categories">;

function parseItems(xml: string, sourceName: string, isGoogleNews = false): RawItem[] {
  const items: RawItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const body       = m[1];
    const rawTitle   = extractTag(body, "title");
    const link       = extractLink(body);
    const pubDateRaw = extractTag(body, "pubDate");
    const rawDesc    = extractTag(body, "description");
    const imageUrl   = isGoogleNews ? "" : extractRssImage(body, rawDesc);
    const description = isGoogleNews ? "" : stripHtml(rawDesc).substring(0, 160);

    if (!rawTitle || !link) continue;

    // Google News: título vem como "Texto do artigo - Nome do Veículo"
    let title: string;
    let source: string;
    if (isGoogleNews) {
      const dashIdx = rawTitle.lastIndexOf(" - ");
      if (dashIdx > 20) {
        title  = rawTitle.slice(0, dashIdx).trim();
        source = rawTitle.slice(dashIdx + 3).trim();
      } else {
        title  = rawTitle;
        source = sourceName;
      }
    } else {
      source = extractSource(body, sourceName);
      title  = source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3)).trim()
        : rawTitle;
    }

    let pubDate: string;
    try { pubDate = new Date(pubDateRaw).toISOString(); }
    catch { pubDate = new Date().toISOString(); }

    items.push({ id: link, title, link, source, pubDate, description, imageUrl });
  }

  return items;
}

// ── Meta fetch (só para feeds diretos sem imagem/descrição) ─────────────────

async function fetchArticleMeta(url: string): Promise<{ imageUrl: string; description: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });
    if (!res.ok) return { imageUrl: "", description: "" };
    const html = await res.text();
    const imageUrl =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1] ??
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
      "";
    const description =
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']{20,})["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
      "";
    return { imageUrl, description: description.substring(0, 280) };
  } catch {
    return { imageUrl: "", description: "" };
  }
}

// ── Fetch individual feed ────────────────────────────────────────────────────

async function fetchFeed(
  feed: { url: string; sourceName: string; isGoogleNews?: boolean }
): Promise<RawItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseItems(await res.text(), feed.sourceName, feed.isGoogleNews);
  } catch {
    return [];
  }
}

// ── Agregador ────────────────────────────────────────────────────────────────

async function fetchAllNews(): Promise<{ items: NewsItem[]; fetchedAt: string }> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const base: RawItem[] = [];
  const seenTitles = new Set<string>();
  const seenLinks  = new Set<string>();

  for (let fi = 0; fi < results.length; fi++) {
    const r = results[fi];
    if (r.status !== "fulfilled") continue;
    const isGN = FEEDS[fi].isGoogleNews ?? false;

    for (const item of r.value) {
      // Feeds diretos precisam passar o filtro de relevância.
      // Google News já é pré-filtrado pela query de busca.
      if (!isGN && !isRelevant(item.title, item.description)) continue;

      const titleKey = item.title.toLowerCase().slice(0, 70);
      if (seenLinks.has(item.link) || seenTitles.has(titleKey)) continue;
      seenLinks.add(item.link);
      seenTitles.add(titleKey);
      base.push(item);
    }
  }

  // Fiocruz primeiro, depois por data decrescente
  base.sort((a, b) => {
    if (a.source === "Fiocruz" && b.source !== "Fiocruz") return -1;
    if (b.source === "Fiocruz" && a.source !== "Fiocruz") return 1;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
  const top = base.slice(0, 24);

  // Para feeds diretos sem imagem/descrição: busca og:image + description.
  // Google News: links são news.google.com — não fazemos fetch (não resolve server-side).
  const withMeta = await Promise.allSettled(
    top.map(item => {
      const isGN = item.link.includes("news.google.com");
      if (isGN || (item.imageUrl && item.description.length > 50)) {
        return Promise.resolve({ imageUrl: item.imageUrl, description: item.description });
      }
      return fetchArticleMeta(item.link);
    })
  );

  const items: NewsItem[] = top.map((item, i) => {
    const meta = withMeta[i].status === "fulfilled"
      ? withMeta[i].value
      : { imageUrl: "", description: "" };
    return {
      ...item,
      imageUrl:    meta.imageUrl    || item.imageUrl,
      description: item.description.length > 50 ? item.description : (meta.description || item.description),
      categories:  categorize(item.title, item.description),
    };
  });

  return { items, fetchedAt: new Date().toISOString() };
}

// ── Cache 2h ─────────────────────────────────────────────────────────────────

export const getHealthNews = unstable_cache(
  fetchAllNews,
  ["health-news-v10"],
  { revalidate: 2 * 60 * 60 }
);
