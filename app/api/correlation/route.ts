import { NextResponse } from "next/server";
import { SYMBOLS } from "@/lib/symbols";
import { fetchYahooCandles } from "@/lib/yahoo";
import {
  alignByDate,
  bestLag,
  leadLag,
  pearson,
  toReturns,
  type DatedValue,
  type LagPoint,
} from "@/lib/stats";

/**
 * GET /api/correlation
 *
 * DRAM 현물가(품목별) × 종목(9개) 일별 수익률 상관분석.
 * - corr: 동시점 피어슨 상관
 * - bestLag: -10~+10 거래일 시프트 중 |상관| 최대 지점
 *   (lag > 0 = 현물가가 주가를 선행)
 *
 * 데이터 출처: 현물가 = Supabase(자체 수집), 주가 = Yahoo 일봉(키 불필요)
 * 1시간 캐시. 표본 부족 시 n과 함께 그대로 반환해 UI에서 신뢰도 표시.
 */

const MAX_LAG = 10;
const MIN_N = 5; // 이 미만이면 계산 자체를 생략

interface SpotRow {
  captured_date: string;
  item: string;
  price: number;
}

export interface CorrCell {
  item: string;
  ticker: string;
  corr: number | null;
  n: number;
  bestLag: number | null;
  bestLagCorr: number | null;
  lags: LagPoint[];
}

export interface CorrelationResponse {
  cells: CorrCell[];
  items: string[];
  tickers: string[];
  spotDays: number;
  generatedAt: string;
}

const CACHE_TTL = 3_600_000;
let cache: { at: number; data: CorrelationResponse } | null = null;

async function fetchSpotSeries(): Promise<Map<string, DatedValue[]> | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/dram_spot?select=captured_date,item,price&order=captured_date.asc&limit=20000`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SpotRow[];
    const map = new Map<string, DatedValue[]>();
    for (const r of rows) {
      const v = Number(r.price);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (!map.has(r.item)) map.set(r.item, []);
      map.get(r.item)!.push({ date: r.captured_date, value: v });
    }
    return map;
  } catch {
    return null;
  }
}

async function fetchStockReturns(): Promise<Map<string, DatedValue[]>> {
  const out = new Map<string, DatedValue[]>();
  // 순차 호출 (Yahoo 부하 완화). 9종목 × 1회, 1시간 캐시라 부담 없음
  for (const s of SYMBOLS) {
    const yahooTicker = s.yahooTicker ?? s.ticker;
    const candles = await fetchYahooCandles(yahooTicker, "1day");
    if (!candles) continue;
    const series: DatedValue[] = candles.map((c) => ({
      date: new Date(c.time * 1000).toISOString().slice(0, 10),
      value: c.close,
    }));
    out.set(s.ticker, toReturns(series));
  }
  return out;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { ...cache.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const spotMap = await fetchSpotSeries();
  if (!spotMap) {
    return NextResponse.json(
      { error: "Supabase에서 현물가 데이터를 가져오지 못했습니다." },
      { status: 502 },
    );
  }

  const stockReturns = await fetchStockReturns();

  // 현물가 수집 일수 (가장 긴 품목 기준)
  let spotDays = 0;
  for (const series of spotMap.values()) {
    spotDays = Math.max(spotDays, series.length);
  }

  const cells: CorrCell[] = [];
  const items = [...spotMap.keys()];
  const tickers = SYMBOLS.map((s) => s.ticker);

  for (const item of items) {
    const spotReturns = toReturns(spotMap.get(item)!);
    for (const ticker of tickers) {
      const stock = stockReturns.get(ticker);
      if (!stock) {
        cells.push({
          item,
          ticker,
          corr: null,
          n: 0,
          bestLag: null,
          bestLagCorr: null,
          lags: [],
        });
        continue;
      }
      const { x, y } = alignByDate(spotReturns, stock);
      if (x.length < MIN_N) {
        cells.push({
          item,
          ticker,
          corr: null,
          n: x.length,
          bestLag: null,
          bestLagCorr: null,
          lags: [],
        });
        continue;
      }
      const lags = leadLag(x, y, Math.min(MAX_LAG, Math.floor(x.length / 3)));
      const best = bestLag(lags);
      cells.push({
        item,
        ticker,
        corr: pearson(x, y),
        n: x.length,
        bestLag: best?.lag ?? null,
        bestLagCorr: best?.corr ?? null,
        lags,
      });
    }
  }

  const data: CorrelationResponse = {
    cells,
    items,
    tickers,
    spotDays,
    generatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };

  return NextResponse.json(
    { ...data, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
