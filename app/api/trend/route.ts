import { NextResponse } from "next/server";
import { fetchYahooCandles } from "@/lib/yahoo";
import { computeTrend, type TrendResult } from "@/lib/trend";

/**
 * GET /api/trend — 개별주(ETF 제외) 추세 강도 랭킹
 *
 * 6종목(삼성·하이닉스·마이크론·샌디스크·씨게이트·웨스턴디지털)의 일봉으로
 * 추세 강도(0~7점)를 계산해 점수 내림차순 정렬. 1시간 캐시.
 */

const TARGETS: { ticker: string; nameKo: string; yahoo: string }[] = [
  { ticker: "005930", nameKo: "삼성전자", yahoo: "005930.KS" },
  { ticker: "000660", nameKo: "SK하이닉스", yahoo: "000660.KS" },
  { ticker: "MU", nameKo: "마이크론", yahoo: "MU" },
  { ticker: "SNDK", nameKo: "샌디스크", yahoo: "SNDK" },
  { ticker: "STX", nameKo: "씨게이트", yahoo: "STX" },
  { ticker: "WDC", nameKo: "웨스턴디지털", yahoo: "WDC" },
];

export interface TrendRankItem extends TrendResult {
  ticker: string;
  nameKo: string;
}

export interface TrendResponse {
  items: TrendRankItem[];
  updatedAt: string;
  missing: string[];
}

const CACHE_TTL = 3_600_000;
let cache: { at: number; data: TrendResponse } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const results = await Promise.all(
    TARGETS.map(async (t) => {
      try {
        const candles = await fetchYahooCandles(t.yahoo, "1day");
        if (!candles || candles.length < 60) return { t, trend: null };
        const closes = candles.map((c) => c.close).filter((c) => c > 0);
        return { t, trend: computeTrend(closes) };
      } catch {
        return { t, trend: null };
      }
    }),
  );

  const items: TrendRankItem[] = [];
  const missing: string[] = [];
  for (const { t, trend } of results) {
    if (trend) items.push({ ticker: t.ticker, nameKo: t.nameKo, ...trend });
    else missing.push(t.ticker);
  }
  // 점수 내림차순, 동점이면 RSI 통과 등 안정 정렬 위해 이름순
  items.sort((a, b) => b.score - a.score || a.nameKo.localeCompare(b.nameKo));

  const data: TrendResponse = {
    items,
    updatedAt: new Date().toISOString(),
    missing,
  };
  if (items.length > 0) cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
