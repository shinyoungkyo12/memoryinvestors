import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { getSymbol } from "@/lib/symbols";

/**
 * GET /api/stock-news?ticker=005930
 *
 * 종목별 관련 기사 — Google News RSS에 해당 종목명으로 검색.
 * 종목 풀네임 매칭이 너무 엄격한 문제를 해결: 검색 자체를 종목명으로 수행.
 * 종목당 30분 캐시.
 */

/** 종목 검색 별칭 (풀네임 외 흔한 표기) */
const ALIASES: Record<string, string[]> = {
  "005930": ["삼성전자"],
  "000660": ["SK하이닉스", "하이닉스"],
  "442580": ["HBM 반도체 ETF"],
  "0181B0": ["AI 메모리 반도체 ETF"],
  MU: ["마이크론", "Micron"],
  SNDK: ["샌디스크", "SanDisk"],
  STX: ["씨게이트", "Seagate"],
  WDC: ["웨스턴디지털", "Western Digital"],
  DRAM: ["DRAM ETF", "메모리 반도체"],
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface StockNewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

const CACHE_TTL = 1_800_000;
const cache = new Map<string, { at: number; data: StockNewsItem[] }>();

function toKst(pubDate: string): string {
  const t = Date.parse(pubDate);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const info = getSymbol(ticker);
  if (!info) {
    return NextResponse.json(
      { items: [], error: "알 수 없는 종목" },
      { status: 400 },
    );
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(
      { items: hit.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const terms = ALIASES[ticker] ?? [info.nameKo];
  // 종목명 + 메모리 맥락으로 검색 (관련성 ↑)
  const query = `(${terms.join(" OR ")}) (반도체 OR 메모리 OR HBM OR 실적 OR 주가)`;
  const rssUrl =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=ko&gl=KR&ceid=KR:ko";

  let xml: string;
  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { items: hit?.data ?? [], error: `뉴스 요청 실패 HTTP ${res.status}` },
        { status: 502 },
      );
    }
    xml = await res.text();
  } catch {
    return NextResponse.json(
      { items: hit?.data ?? [], error: "뉴스 네트워크 오류" },
      { status: 502 },
    );
  }

  const $ = cheerio.load(xml, { xmlMode: true });
  const items: StockNewsItem[] = [];
  $("item").each((_, el) => {
    if (items.length >= 12) return;
    const $el = $(el);
    const rawTitle = $el.find("title").first().text().trim();
    const link = $el.find("link").first().text().trim();
    const source = $el.find("source").first().text().trim();
    const pubDate = $el.find("pubDate").first().text().trim();
    if (!rawTitle || !link) return;
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;
    items.push({ title, link, source, publishedAt: toKst(pubDate) });
  });

  if (items.length > 0) cache.set(ticker, { at: Date.now(), data: items });

  return NextResponse.json(
    { items, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
