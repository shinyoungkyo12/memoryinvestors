import { NextRequest, NextResponse } from "next/server";
import { getSymbol, INTERVALS, type Interval } from "@/lib/symbols";
import { fetchYahooCandles } from "@/lib/yahoo";
import type { Candle } from "@/lib/types";

/**
 * GET /api/candles?ticker=MU&interval=1min
 *
 * 시장별 과거 봉 라우팅:
 * - US → Twelve Data (서버 키, 무료 8 req/min → 인메모리 캐시)
 * - KR → Yahoo Finance (키 불필요, 약 15~20분 지연 가능)
 */

interface TwelveDataBar {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TwelveDataResponse {
  status?: string;
  message?: string;
  values?: TwelveDataBar[];
}

/** 인터벌별 캐시 TTL(ms) */
const CACHE_TTL: Record<Interval, number> = {
  "15min": 450_000,
  "1h": 1_800_000,
  "1day": 3_600_000,
  "1week": 21_600_000,
};

/** US: 인터벌별 요청 봉 개수 (정규장 1일 = 390분 기준) */
const OUTPUT_SIZE: Record<Interval, number> = {
  "15min": 700, // MA120 산출 여유 포함
  "1h": 700,
  "1day": 750, // 약 3년
  "1week": 300, // 약 6년
};

const cache = new Map<string, { at: number; data: Candle[] }>();

function isInterval(v: string): v is Interval {
  return (INTERVALS as readonly string[]).includes(v);
}

function ok(candles: Candle[], extra?: Record<string, unknown>) {
  return NextResponse.json(
    { candles, ...extra },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function fetchTwelveData(
  ticker: string,
  interval: Interval,
): Promise<{ candles?: Candle[]; error?: string }> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return { error: "TWELVE_DATA_API_KEY 환경변수가 설정되지 않았습니다." };
  }

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(OUTPUT_SIZE[interval]));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", apiKey);

  let json: TwelveDataResponse;
  try {
    const res = await fetch(url, { cache: "no-store" });
    json = (await res.json()) as TwelveDataResponse;
  } catch {
    return { error: "Twelve Data 요청에 실패했습니다. 네트워크를 확인하세요." };
  }

  if (json.status === "error" || !json.values) {
    return { error: json.message ?? "Twelve Data 응답 오류" };
  }

  const candles: Candle[] = json.values
    .map((b) => ({
      time: Math.floor(Date.parse(`${b.datetime.replace(" ", "T")}Z`) / 1000),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume) || 0,
    }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  return { candles };
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1min";

  const symbol = getSymbol(ticker);
  if (!symbol) {
    return NextResponse.json(
      { error: `지원하지 않는 종목입니다: ${ticker}` },
      { status: 400 },
    );
  }
  if (!isInterval(interval)) {
    return NextResponse.json(
      { error: `지원하지 않는 인터벌입니다: ${interval}` },
      { status: 400 },
    );
  }

  const cacheKey = `${ticker}:${interval}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL[interval]) {
    return ok(hit.data, { cached: true });
  }

  let result: { candles?: Candle[]; error?: string };

  if (symbol.market === "US") {
    result = await fetchTwelveData(ticker, interval);
  } else {
    const candles = await fetchYahooCandles(symbol.yahooTicker ?? "", interval);
    result = candles
      ? { candles }
      : {
          error:
            "Yahoo Finance에서 데이터를 가져오지 못했습니다. 신규 상장 종목은 데이터가 없을 수 있습니다.",
        };
  }

  if (!result.candles) {
    // 실패 시: 만료된 캐시라도 있으면 반환 (graceful degradation)
    if (hit) return ok(hit.data, { cached: true, stale: true });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  cache.set(cacheKey, { at: Date.now(), data: result.candles });
  return ok(result.candles, { cached: false });
}
