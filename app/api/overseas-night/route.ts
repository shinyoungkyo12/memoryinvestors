import { NextRequest, NextResponse } from "next/server";
import { fetchYahooCandles, fetchYahooQuote } from "@/lib/yahoo";
import type { Candle } from "@/lib/types";

/**
 * GET /api/overseas-night?ticker=000660&interval=1day|1h|15min
 *
 * 독일 프랑크푸르트 GDR 해외 야간시세 — 삼성전자·SK하이닉스 한정.
 *
 * 단순 원칙:
 *  - 독일 GDR(EUR) 데이터를 "그대로" 파싱
 *  - 사람들이 직관적으로 보도록 EUR → KRW 환산값을 함께 제공
 *
 * 환산: GDR 1주가 한국 보통주 N주를 대표(ratio)하므로,
 *   원화값 = GDR가격(EUR) × EURKRW환율 × ratio
 *   ratio는 "한국 현재가 ÷ (GDR현재가 × EURKRW)"로 자동 산출 →
 *   환율·주당비율이 한 번에 반영되어 한국 시세 스케일과 일치.
 *   (GDR이 독자적으로 움직이면 그 변동이 원화값에 그대로 반영됨)
 *
 * 데이터: Yahoo Finance. EUR 원본값과 KRW 환산값을 모두 반환.
 * 1분 캐시.
 */

const GDR_MAP: Record<
  string,
  { krYahoo: string; gdrYahoo: string; nameKo: string }
> = {
  "000660": { krYahoo: "000660.KS", gdrYahoo: "HY9H.F", nameKo: "SK하이닉스" },
  "005930": { krYahoo: "005930.KS", gdrYahoo: "SSU.F", nameKo: "삼성전자" },
};

type NightInterval = "15min" | "1h" | "1day";

/** 원화 환산 봉 (EUR 원본 + KRW 환산) */
export interface NightCandle extends Candle {
  /** EUR 원본 종가 */
  eurClose: number;
}

export interface OverseasNightResponse {
  ticker: string;
  nameKo: string;
  available: boolean;
  /** KRW 환산 봉 (open/high/low/close = 원화) */
  candles: NightCandle[];
  /** GDR 현재가 (EUR 원본) */
  eurPrice: number | null;
  /** GDR 현재가 원화 환산 */
  krwPrice: number | null;
  /** GDR 전일 종가 대비 등락률(%) — GDR 자체 기준, 원본 그대로 */
  changePct: number | null;
  /** EUR/KRW 환율 */
  eurKrw: number | null;
  error?: string;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; data: OverseasNightResponse }>();

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const rawIv = req.nextUrl.searchParams.get("interval") ?? "1day";
  const interval: NightInterval =
    rawIv === "15min" || rawIv === "1h" ? rawIv : "1day";

  const map = GDR_MAP[ticker];
  const fail = (msg: string, status = 200): NextResponse => {
    const body: OverseasNightResponse = {
      ticker,
      nameKo: map?.nameKo ?? "",
      available: false,
      candles: [],
      eurPrice: null,
      krwPrice: null,
      changePct: null,
      eurKrw: null,
      error: msg,
    };
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  };

  if (!map) return fail("해외 야간시세는 삼성전자·SK하이닉스만 지원합니다.", 400);

  const cacheKey = `${ticker}:${interval}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 병렬: GDR 봉(EUR), GDR 현재가(EUR), 한국 현재가(KRW), EUR/KRW 환율
  const [gdrCandles, gdrQuote, krQuote, fx] = await Promise.all([
    fetchYahooCandles(map.gdrYahoo, interval),
    fetchYahooQuote(map.gdrYahoo),
    fetchYahooQuote(map.krYahoo),
    fetchYahooQuote("EURKRW=X"),
  ]);

  if (!gdrCandles || gdrCandles.length === 0) {
    return fail("독일 GDR 시세를 불러오지 못했습니다.");
  }
  if (!gdrQuote || gdrQuote.price <= 0) {
    return fail("GDR 현재가를 가져오지 못했습니다.");
  }

  const eurKrw = fx?.price && fx.price > 0 ? fx.price : null;

  // GDR ratio: 한국 현재가 ÷ (GDR현재가 × EURKRW)
  //  = GDR 1주가 대표하는 한국 보통주 수 (환율 반영 후)
  // 한국 현재가나 환율이 없으면 ratio=1 (EUR×환율만, 또는 EUR 원본)
  let ratio = 1;
  if (krQuote?.price && eurKrw) {
    ratio = krQuote.price / (gdrQuote.price * eurKrw);
  }

  // 원화 환산 = EUR × EURKRW × ratio
  const toKrw = (eur: number): number => {
    if (eurKrw) return Math.round(eur * eurKrw * ratio);
    return Math.round(eur); // 환율 없으면 EUR 원본값(폴백)
  };

  const candles: NightCandle[] = gdrCandles.map((c) => ({
    time: c.time,
    open: toKrw(c.open),
    high: toKrw(c.high),
    low: toKrw(c.low),
    close: toKrw(c.close),
    volume: c.volume,
    eurClose: c.close,
  }));

  const data: OverseasNightResponse = {
    ticker,
    nameKo: map.nameKo,
    available: true,
    candles,
    eurPrice: Math.round(gdrQuote.price * 100) / 100,
    krwPrice: toKrw(gdrQuote.price),
    changePct: Math.round(gdrQuote.changePct * 100) / 100, // GDR 자체 등락 원본
    eurKrw: eurKrw ? Math.round(eurKrw * 100) / 100 : null,
  };

  cache.set(cacheKey, { at: Date.now(), data });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
