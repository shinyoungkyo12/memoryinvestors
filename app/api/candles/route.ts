import { NextRequest, NextResponse } from "next/server";
import { getSymbol, INTERVALS, type Interval } from "@/lib/symbols";

/**
 * GET /api/candles?ticker=MU&interval=1min
 *
 * Twelve Data time_series 프록시.
 * - API 키는 서버 환경변수(TWELVE_DATA_API_KEY)로만 사용 → 클라이언트 노출 없음
 * - 무료 티어(8 req/min, 800 req/day) 보호를 위해 인메모리 캐시 적용
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

export interface Candle {
  time: number; // Unix seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 인터벌별 캐시 TTL(ms) — 봉 길이의 절반, 최소 30초 */
const CACHE_TTL: Record<Interval, number> = {
  "1min": 30_000,
  "5min": 150_000,
  "15min": 450_000,
  "1h": 1_800_000,
  "1day": 3_600_000,
};

/** 인터벌별 요청 봉 개수 (정규장 1일 = 390분 기준) */
const OUTPUT_SIZE: Record<Interval, number> = {
  "1min": 780, // 2거래일
  "5min": 780, // 약 10거래일
  "15min": 520, // 약 20거래일
  "1h": 500,
  "1day": 500, // 약 2년
};

const cache = new Map<string, { at: number; data: Candle[] }>();

function isInterval(v: string): v is Interval {
  return (INTERVALS as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1min";

  if (!getSymbol(ticker)) {
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

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TWELVE_DATA_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const cacheKey = `${ticker}:${interval}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL[interval]) {
    return NextResponse.json(
      { candles: hit.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
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
    return NextResponse.json(
      { error: "Twelve Data 요청에 실패했습니다. 네트워크를 확인하세요." },
      { status: 502 },
    );
  }

  if (json.status === "error" || !json.values) {
    // 무료 티어 분당 한도 초과 시: 만료된 캐시라도 있으면 그것을 반환 (graceful degradation)
    if (hit) {
      return NextResponse.json(
        { candles: hit.data, cached: true, stale: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: json.message ?? "Twelve Data 응답 오류" },
      { status: 502 },
    );
  }

  // Twelve Data는 최신순으로 반환 → 차트용 오름차순으로 변환
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

  cache.set(cacheKey, { at: Date.now(), data: candles });

  return NextResponse.json(
    { candles, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
