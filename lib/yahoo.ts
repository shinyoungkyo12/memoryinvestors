/**
 * Yahoo Finance 차트 API 클라이언트 — 서버 전용
 *
 * 한국 종목(KRX)의 과거 봉 + KIS 미설정 시 시세 폴백용.
 * 비공식 엔드포인트이므로 User-Agent 필수, 구조 변경 가능성 있음.
 * KRX 시세는 약 15~20분 지연될 수 있습니다.
 */

import type { Interval } from "@/lib/symbols";
import type { Candle } from "@/lib/types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 내부 인터벌 → Yahoo (interval, range) 매핑 */
const YAHOO_PARAMS: Record<Interval, { interval: string; range: string }> = {
  "15min": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "6mo" },
  "1day": { interval: "1d", range: "2y" },
  "1week": { interval: "1wk", range: "5y" },
};

interface YahooChartResponse {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        regularMarketPreviousClose?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { description?: string } | null;
  };
}

async function fetchChart(
  yahooTicker: string,
  interval: string,
  range: string,
): Promise<YahooChartResponse | null> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}`,
  );
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as YahooChartResponse;
  } catch {
    return null;
  }
}

/** 과거 봉 조회 */
export async function fetchYahooCandles(
  yahooTicker: string,
  interval: Interval,
): Promise<Candle[] | null> {
  const p = YAHOO_PARAMS[interval];
  const json = await fetchChart(yahooTicker, p.interval, p.range);
  const result = json?.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!ts || !q?.close) return null;

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // 휴장/결측 봉 제외
    candles.push({
      time: ts[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return candles.length > 0 ? candles : null;
}

export interface YahooQuote {
  price: number;
  prevClose: number;
  changePct: number;
}

/** 폴백 시세 — 반드시 "전일 종가" 대비로 계산 (range=1d → chartPreviousClose=전일 종가) */
export async function fetchYahooQuote(
  yahooTicker: string,
): Promise<YahooQuote | null> {
  const json = await fetchChart(yahooTicker, "1d", "1d");
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prevClose =
    meta?.regularMarketPreviousClose ??
    meta?.previousClose ??
    meta?.chartPreviousClose;
  if (!price || !prevClose) return null;
  return {
    price,
    prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
  };
}
