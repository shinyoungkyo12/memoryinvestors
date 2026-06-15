import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/yahoo";

/**
 * GET /api/night-future — 코스피200 야간선물(CME 연계) 현재가
 *
 * KIS 대신 Yahoo Finance KM=F (CME Mini KOSPI200 Futures) 사용.
 * 별도 API 키 불필요. 캐시 30초.
 */

export interface NightFutureResponse {
  available: boolean;
  /** KST 18:00~05:00 야간선물 세션 시간대 여부 */
  sessionOpen: boolean;
  price: number | null;
  diff: number | null;
  changePct: number | null;
  code: string | null;
  error?: string;
}

const CACHE_TTL = 30_000;
let cache: { at: number; data: NightFutureResponse } | null = null;

/** KST 기준 야간선물 세션(18:00~익일 05:00) 여부 */
function isNightSession(): boolean {
  const kstHour = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
  return kstHour >= 18 || kstHour < 5;
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

  const quote = await fetchYahooQuote("KM=F");

  const data: NightFutureResponse =
    quote && quote.price > 0
      ? {
          available: true,
          sessionOpen: true,
          price: quote.price,
          diff: quote.price - quote.prevClose,
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
          error: "CME 선물 시세 일시 불가",
        };

  if (data.available) cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
