import { NextRequest, NextResponse } from "next/server";
import etfJson from "@/data/etf-holdings.json";

/**
 * GET /api/etf-holdings?ticker=442580
 *
 * ETF 월별 구성종목·비중. 현재 월(YYYY-MM) 데이터를 우선,
 * 없으면 가장 최근 월로 폴백(기준일 함께 반환).
 * 데이터는 data/etf-holdings.json에서 월 1회 수동 갱신.
 */

interface Holding {
  name: string;
  weight: number;
}
interface MonthData {
  asOf: string;
  note: string;
  holdings: Holding[];
}
interface EtfData {
  nameKo: string;
  issuer: string;
  baseIndex: string;
  rebalance: string;
  months: Record<string, MonthData>;
}

export interface EtfHoldingsResponse {
  ticker: string;
  nameKo: string;
  issuer: string;
  baseIndex: string;
  rebalance: string;
  /** 표시 중인 월 (YYYY-MM) */
  month: string;
  /** 요청 월에 데이터가 없어 과거 월로 폴백했는지 */
  fallback: boolean;
  asOf: string;
  note: string;
  holdings: Holding[];
}

function currentMonth(): string {
  // KST 기준 YYYY-MM
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const etfs = etfJson.etfs as Record<string, EtfData>;
  const etf = etfs[ticker];

  if (!etf) {
    return NextResponse.json(
      { error: "ETF 구성종목 데이터가 없는 종목입니다." },
      { status: 404 },
    );
  }

  const reqMonth = currentMonth();
  const available = Object.keys(etf.months).sort(); // 오름차순
  let month = reqMonth;
  let fallback = false;

  if (!etf.months[reqMonth]) {
    // 현재 월 데이터 없음 → 현재 월 이하 중 가장 최근 월
    const past = available.filter((m) => m <= reqMonth);
    month = past.length > 0 ? past[past.length - 1] : available[available.length - 1];
    fallback = true;
  }

  const md = etf.months[month];
  const data: EtfHoldingsResponse = {
    ticker,
    nameKo: etf.nameKo,
    issuer: etf.issuer,
    baseIndex: etf.baseIndex,
    rebalance: etf.rebalance,
    month,
    fallback,
    asOf: md.asOf,
    note: md.note,
    holdings: [...md.holdings].sort((a, b) => {
      // "기타 구성종목"은 항상 맨 뒤로
      const aEtc = a.name.includes("기타");
      const bEtc = b.name.includes("기타");
      if (aEtc !== bEtc) return aEtc ? 1 : -1;
      return b.weight - a.weight;
    }),
  };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
