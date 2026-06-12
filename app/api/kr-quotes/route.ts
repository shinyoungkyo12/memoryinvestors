import { NextResponse } from "next/server";
import { KR_SYMBOLS } from "@/lib/symbols";
import { fetchKisPrice, kisConfigured } from "@/lib/kis";
import { fetchYahooQuote } from "@/lib/yahoo";
import type { QuoteSnapshot } from "@/lib/types";

/**
 * GET /api/kr-quotes
 *
 * 한국 종목 전체 시세 스냅샷.
 * - KIS 앱키 설정 시: 실시간 현재가 (FHKST01010100)
 * - 미설정/실패 시: Yahoo Finance 폴백 (약 15~20분 지연)
 *
 * 클라이언트 다중 접속 시 KIS 호출량 보호를 위해 3초 인메모리 캐시.
 */

const CACHE_TTL = 3_000;
let cache: { at: number; data: QuoteSnapshot[] } | null = null;

/** 환율(USD/KRW)은 60초 캐시 — Yahoo KRW=X */
const FX_TTL = 60_000;
let fxCache: { at: number; data: QuoteSnapshot } | null = null;

async function getFxQuote(): Promise<QuoteSnapshot | null> {
  if (fxCache && Date.now() - fxCache.at < FX_TTL) return fxCache.data;
  const y = await fetchYahooQuote("KRW=X");
  if (!y) return fxCache?.data ?? null;
  const snap: QuoteSnapshot = {
    ticker: "USDKRW",
    price: y.price,
    prevClose: y.prevClose,
    changePct: y.changePct,
    provider: "yahoo",
  };
  fxCache = { at: Date.now(), data: snap };
  return snap;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { quotes: cache.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const useKis = kisConfigured();

  const quotes = await Promise.all(
    KR_SYMBOLS.map(async (s): Promise<QuoteSnapshot | null> => {
      if (useKis) {
        const kis = await fetchKisPrice(s.ticker);
        if (kis) {
          return {
            ticker: s.ticker,
            price: kis.price,
            prevClose: kis.prevClose,
            changePct: kis.changePct,
            provider: "kis",
          };
        }
      }
      // KIS 미설정 또는 개별 종목 실패 → Yahoo 폴백
      const y = s.yahooTicker ? await fetchYahooQuote(s.yahooTicker) : null;
      if (!y) return null;
      return {
        ticker: s.ticker,
        price: y.price,
        prevClose: y.prevClose,
        changePct: y.changePct,
        provider: "yahoo",
      };
    }),
  );

  const fx = await getFxQuote();
  const data = quotes.filter((q): q is QuoteSnapshot => q !== null);
  if (fx) data.push(fx);
  if (data.length > 0) {
    cache = { at: Date.now(), data };
  }

  return NextResponse.json(
    { quotes: data, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
