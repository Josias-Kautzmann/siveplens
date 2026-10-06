import { Suspense } from "react";
import { getHealthNews } from "@/services/news";
import { getScientificArticles } from "@/services/articles";
import NoticiasClient from "./_components/NoticiasClient";
import SiteHeader from "../_components/SiteHeader";

export const revalidate = 7200;

export default async function NoticiasPage() {
  const [newsResult, articlesResult] = await Promise.allSettled([
    getHealthNews(),
    getScientificArticles(),
  ]);

  const news = newsResult.status === "fulfilled"
    ? newsResult.value
    : { items: [], fetchedAt: new Date().toISOString() };

  const articles = articlesResult.status === "fulfilled"
    ? articlesResult.value
    : null;

  return (
    <div className="min-h-screen bg-[#f4fbf8] flex flex-col">

      <SiteHeader />

      <main className="flex-1">
        <Suspense>
          <NoticiasClient
            items={news.items}
            fetchedAt={news.fetchedAt}
            articles={articles}
          />
        </Suspense>
      </main>
    </div>
  );
}
