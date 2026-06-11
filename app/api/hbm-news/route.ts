import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

/**
 * GET /api/hbm-news
 *
 * Google News RSS에서 HBM 수주/공급 관련 최신 기사 자동 수집 (키 불필요).
 * 30분 캐시. 타임라인(수동 큐레이션)을 보조하는 자동 피드.
 */

const RSS_URL =
  "https://news.google.com/rss/search?q=" +
  encodeURIComponent('HBM OR DRAM OR D램 OR HBF OR "AI 메모리" OR 메모리반도체') +
  "&hl=ko&gl=KR&ceid=KR:ko";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  /** YYYY-MM-DD HH:mm (KST) */
  publishedAt: string;
}

const CACHE_TTL = 1_800_000;
let cache: { at: number; data: NewsItem[] } | null = null;

function toKst(pubDate: string): string {
  const t = Date.parse(pubDate);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { items: cache.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let xml: string;
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `뉴스 피드 요청 실패: HTTP ${res.status}` },
        { status: 502 },
      );
    }
    xml = await res.text();
  } catch {
    if (cache) {
      return NextResponse.json(
        { items: cache.data, cached: true, stale: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "뉴스 피드 요청 중 네트워크 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const $ = cheerio.load(xml, { xmlMode: true });
  const items: NewsItem[] = [];
  $("item").each((_, el) => {
    if (items.length >= 15) return;
    const $el = $(el);
    const rawTitle = $el.find("title").first().text().trim();
    const link = $el.find("link").first().text().trim();
    const source = $el.find("source").first().text().trim();
    const pubDate = $el.find("pubDate").first().text().trim();
    if (!rawTitle || !link) return;
    // Google News 제목은 "제목 - 언론사" 형식 → 언론사 중복 제거
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;
    items.push({ title, link, source, publishedAt: toKst(pubDate) });
  });

  if (items.length > 0) cache = { at: Date.now(), data: items };

  return NextResponse.json(
    { items, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
