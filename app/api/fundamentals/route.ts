import { NextResponse } from "next/server";
import guidanceJson from "@/data/nvda-guidance.json";
import hbmJson from "@/data/hbm-events.json";

/**
 * GET /api/fundamentals
 *
 * - inventory: Supabase (EDGAR 수집) — 종목별 재고/COGS/DIO 분기 시계열
 * - nvidia: Supabase 실적 + repo JSON 가이던스 병합
 * - hbmEvents: repo JSON (수동 큐레이션)
 */

interface InventoryRow {
  ticker: string;
  fiscal_end: string;
  inventory_usd: number;
  cogs_usd: number | null;
  dio: number | null;
}

interface RevenueRow {
  fiscal_end: string;
  revenue_usd: number;
}

export interface FundamentalsResponse {
  inventory: Record<
    string,
    { fiscalEnd: string; inventoryB: number; dio: number | null }[]
  >;
  nvidia: {
    fiscalEnd: string;
    actualB: number | null;
    guidanceB: number | null;
  }[];
  hbmEvents: {
    date: string;
    companies: string[];
    title: string;
    source: string;
    url: string;
    /** true = 수동 검증(큐레이션), false = 자동 수집 */
    verified: boolean;
  }[];
}

const CACHE_TTL = 3_600_000; // 1시간 (분기 데이터라 충분)
let cache: { at: number; data: FundamentalsResponse } | null = null;

async function supabaseSelect<T>(path: string): Promise<T[] | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { ...cache.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [invRows, revRows, autoEvents] = await Promise.all([
    supabaseSelect<InventoryRow>(
      "inventory?select=ticker,fiscal_end,inventory_usd,cogs_usd,dio&order=fiscal_end.asc&limit=2000",
    ),
    supabaseSelect<RevenueRow>(
      "nvda_revenue?select=fiscal_end,revenue_usd&order=fiscal_end.asc&limit=200",
    ),
    supabaseSelect<{
      event_date: string;
      title: string;
      source: string | null;
      url: string;
      companies: string[];
    }>(
      "news_events?select=event_date,title,source,url,companies&order=event_date.desc&limit=60",
    ),
  ]);

  // 재고: 종목별 그룹화 (최근 8년만)
  const inventory: FundamentalsResponse["inventory"] = {};
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 8);
  for (const r of invRows ?? []) {
    if (Date.parse(r.fiscal_end) < cutoff.getTime()) continue;
    if (!inventory[r.ticker]) inventory[r.ticker] = [];
    inventory[r.ticker].push({
      fiscalEnd: r.fiscal_end,
      inventoryB: Math.round((Number(r.inventory_usd) / 1e9) * 100) / 100,
      dio: r.dio === null ? null : Number(r.dio),
    });
  }

  // NVDA: 실적(YYYY-MM-DD) + 가이던스(YYYY-MM) — 월 기준 병합
  const byMonth = new Map<
    string,
    { fiscalEnd: string; actualB: number | null; guidanceB: number | null }
  >();
  for (const r of revRows ?? []) {
    const month = r.fiscal_end.slice(0, 7);
    byMonth.set(month, {
      fiscalEnd: r.fiscal_end,
      actualB: Math.round((Number(r.revenue_usd) / 1e9) * 10) / 10,
      guidanceB: null,
    });
  }
  for (const g of guidanceJson.guidance) {
    const cur = byMonth.get(g.fiscalEnd);
    if (cur) {
      cur.guidanceB = g.guidanceUsdB;
    } else {
      byMonth.set(g.fiscalEnd, {
        fiscalEnd: `${g.fiscalEnd}-28`,
        actualB: null,
        guidanceB: g.guidanceUsdB,
      });
    }
  }
  const nvidia = [...byMonth.values()]
    .sort((a, b) => a.fiscalEnd.localeCompare(b.fiscalEnd))
    .slice(-16); // 최근 4년

  // HBM 이벤트: 큐레이션(검증) + 자동 수집 병합, url 중복 제거, 최신순
  const curated = hbmJson.events.map((e) => ({ ...e, verified: true }));
  const seenUrls = new Set(curated.map((e) => e.url));
  const seenTitles = new Set(
    curated.map((e) => e.title.replace(/\s+/g, " ").trim()),
  );
  const auto: typeof curated = [];
  for (const e of autoEvents ?? []) {
    const titleKey = e.title.replace(/\s+/g, " ").trim();
    // url 또는 제목이 동일하면 같은 기사로 간주 (Google News 중복 반환 대응)
    if (seenUrls.has(e.url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(e.url);
    seenTitles.add(titleKey);
    auto.push({
      date: e.event_date,
      companies: e.companies ?? [],
      title: e.title,
      source: e.source ?? "",
      url: e.url,
      verified: false,
    });
  }
  // 동일 기사 중복 제거: 정규화 제목+날짜 기준 (검증 항목 우선, 그다음 먼저 온 것)
  const merged = [...curated, ...auto];
  const seenKeys = new Set<string>();
  const hbmEvents = merged
    .sort((a, b) => Number(b.verified) - Number(a.verified))
    .filter((e) => {
      const key = `${e.date}|${e.title.replace(/\s+/g, "").slice(0, 30)}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const data: FundamentalsResponse = { inventory, nvidia, hbmEvents };
  cache = { at: Date.now(), data };

  return NextResponse.json(
    { ...data, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
