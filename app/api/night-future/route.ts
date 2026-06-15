import { NextResponse } from "next/server";

/**
 * GET /api/night-future — 코스피200 야간선물(CME 연계) 현재가
 *
 * Yahoo Finance KM=F (CME Mini KOSPI200 Futures).
 * v7/quote → v8/chart, query1 → query2 순으로 재시도.
 * 별도 API 키 불필요. 캐시 30초.
 */

export interface NightFutureResponse {
  available: boolean;
  sessionOpen: boolean;
  price: number | null;
  diff: number | null;
  changePct: number | null;
  code: string | null;
  error?: string;
}

const CACHE_TTL = 30_000;
let cache: { at: number; data: NightFutureResponse } | null = null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** KST 기준 야간선물 세션(18:00~익일 05:00) 여부 */
function isNightSession(): boolean {
  const kstHour = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
  return kstHour >= 18 || kstHour < 5;
}

interface QuoteResult {
  price: number;
  diff: number;
  changePct: number;
}

/** Yahoo Finance v7/quote 엔드포인트 시도 */
async function tryV7Quote(host: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://${host}/v7/finance/quote?symbols=KM%3DF&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://finance.yahoo.com/",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      quoteResponse?: {
        result?: {
          regularMarketPrice?: number;
          regularMarketPreviousClose?: number;
          regularMarketChange?: number;
          regularMarketChangePercent?: number;
        }[];
      };
    };
    const q = j.quoteResponse?.result?.[0];
    const price = q?.regularMarketPrice;
    if (!price || price <= 0) return null;
    const prevClose = q.regularMarketPreviousClose ?? price;
    const diff = q.regularMarketChange ?? price - prevClose;
    const changePct = q.regularMarketChangePercent ?? (diff / prevClose) * 100;
    return { price, diff, changePct };
  } catch {
    return null;
  }
}

/** Yahoo Finance v8/chart 엔드포인트 시도 (range=5d로 데이터 보장) */
async function tryV8Chart(host: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://${host}/v8/finance/chart/KM%3DF?interval=1d&range=5d`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://finance.yahoo.com/",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            regularMarketPreviousClose?: number;
            chartPreviousClose?: number;
          };
        }[];
      };
    };
    const meta = j.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prevClose =
      meta?.regularMarketPreviousClose ?? meta?.chartPreviousClose;
    if (!price || price <= 0 || !prevClose) return null;
    const diff = price - prevClose;
    return { price, diff, changePct: (diff / prevClose) * 100 };
  } catch {
    return null;
  }
}

async function fetchKMF(): Promise<QuoteResult | null> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  // v7/quote 우선 (futures에 더 안정적), 실패 시 v8/chart 폴백
  for (const host of hosts) {
    const r = await tryV7Quote(host);
    if (r) return r;
  }
  for (const host of hosts) {
    const r = await tryV8Chart(host);
    if (r) return r;
  }
  return null;
}

export async function GET() {
  const sessionOpen = isNightSession();

  if (!sessionOpen) {
    return NextResponse.json(
      {
        available: false,
        sessionOpen: false,
        price: null,
        diff: null,
        changePct: null,
        code: null,
      } satisfies NightFutureResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const quote = await fetchKMF();

  const data: NightFutureResponse = quote
    ? {
        available: true,
        sessionOpen: true,
        price: quote.price,
        diff: quote.diff,
        changePct: quote.changePct,
        code: "KM=F",
      }
    : {
        available: false,
        sessionOpen: true,
        price: null,
        diff: null,
        changePct: null,
        code: null,
        error: "CME 선물 시세 조회 실패 (Yahoo Finance)",
      };

  if (data.available) cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
