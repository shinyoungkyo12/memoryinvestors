import { NextResponse } from "next/server";
import { fetchYahooCandles } from "@/lib/yahoo";
import { INDEX_CONSTITUENTS, BASE_INDEX } from "@/lib/index-constituents";

/**
 * GET /api/index-history
 *
 * 메모리 반도체 지수 일봉 시계열 — 구성 6종목(ETF 제외) Yahoo 일봉을
 * "기준일 대비 수익률 동일가중" 방식으로 합성.
 *
 * - 모든 종목 일봉으로 통일 → 환율/통화 무관(수익률만 사용)
 * - 공통 거래일(교집합) 첫 봉을 기준(=1000)으로 정규화
 * - 각 시점마다 구성종목별 종가 + 전일 대비 등락률(members) 동봉 → 호버용
 * - 1시간 캐시
 */

const YAHOO_MAP: Record<string, string> = {
  "005930": "005930.KS",
  "000660": "000660.KS",
  MU: "MU",
  SNDK: "SNDK",
  STX: "STX",
  WDC: "WDC",
};

const NAME_MAP: Record<string, string> = Object.fromEntries(
  INDEX_CONSTITUENTS.map((c) => [c.ticker, c.nameKo]),
);
const CCY_MAP: Record<string, "USD" | "KRW"> = Object.fromEntries(
  INDEX_CONSTITUENTS.map((c) => [c.ticker, c.currency]),
);

/** 구성종목 한 시점의 종가 + 등락 (호버용) */
export interface MemberPoint {
  ticker: string;
  nameKo: string;
  currency: "USD" | "KRW";
  /** 해당 시점 종가(현지 통화) */
  close: number;
  /** 전일 대비 등락률 % (기준일은 null) */
  changePct: number | null;
}

export interface IndexHistoryPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
  /** 이 시점 구성종목별 종가/등락 (있는 종목만) */
  members: MemberPoint[];
}

export interface IndexHistoryResponse {
  points: IndexHistoryPoint[];
  constituents: number;
  missing: string[];
}

const CACHE_TTL = 3_600_000;
let cache: { at: number; data: IndexHistoryResponse } | null = null;

function toDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const results = await Promise.all(
    INDEX_CONSTITUENTS.map(async (c) => {
      const yt = YAHOO_MAP[c.ticker];
      if (!yt) return { ticker: c.ticker, byDate: null };
      try {
        const candles = await fetchYahooCandles(yt, "1day");
        if (!candles) return { ticker: c.ticker, byDate: null };
        const byDate = new Map<string, number>();
        for (const k of candles) {
          if (k.close > 0) byDate.set(toDate(k.time), k.close);
        }
        return { ticker: c.ticker, byDate };
      } catch {
        return { ticker: c.ticker, byDate: null };
      }
    }),
  );

  const valid = results.filter(
    (r): r is { ticker: string; byDate: Map<string, number> } =>
      r.byDate !== null && r.byDate.size > 0,
  );
  const missing = results
    .filter((r) => r.byDate === null || r.byDate.size === 0)
    .map((r) => r.ticker);

  const emptyResp = (): IndexHistoryResponse => ({
    points: [],
    constituents: valid.length,
    missing,
  });

  if (valid.length === 0) {
    return NextResponse.json(emptyResp(), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const dateSets = valid.map((v) => new Set(v.byDate.keys()));
  const allDates = [...dateSets[0]]
    .filter((d) => dateSets.every((s) => s.has(d)))
    .sort();

  if (allDates.length === 0) {
    return NextResponse.json(emptyResp(), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const baseDate = allDates[0];
  const baseClose: Record<string, number> = {};
  for (const v of valid) baseClose[v.ticker] = v.byDate.get(baseDate)!;

  const points: IndexHistoryPoint[] = allDates.map((date, i) => {
    let acc = 0;
    const members: MemberPoint[] = [];
    const prevDate = i > 0 ? allDates[i - 1] : null;
    for (const v of valid) {
      const price = v.byDate.get(date)!;
      acc += price / baseClose[v.ticker];
      let changePct: number | null = null;
      if (prevDate) {
        const prev = v.byDate.get(prevDate)!;
        if (prev > 0) changePct = Math.round(((price - prev) / prev) * 10000) / 100;
      }
      members.push({
        ticker: v.ticker,
        nameKo: NAME_MAP[v.ticker] ?? v.ticker,
        currency: CCY_MAP[v.ticker] ?? "USD",
        close: price,
        changePct,
      });
    }
    members.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
    return {
      date,
      value: Math.round((acc / valid.length) * BASE_INDEX * 100) / 100,
      members,
    };
  });

  const data: IndexHistoryResponse = {
    points,
    constituents: valid.length,
    missing,
  };
  cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
