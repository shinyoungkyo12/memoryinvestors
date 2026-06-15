import { NextResponse } from "next/server";
import { fetchKisNightFuture, kisConfigured } from "@/lib/kis";

/**
 * GET /api/night-future — 코스피200 야간선물(CME 연계) 현재가
 *
 * - 야간선물은 CME 연계 글로벌 시장(KST 18:00~익일 05:00)에만 체결
 * - 그 외 시간엔 sessionOpen=false 반환 → 클라이언트가 영역 숨김
 * - KIS 앱키 필요. 미설정/실패 시 available=false
 * - 10초 캐시
 */

export interface NightFutureResponse {
  available: boolean;
  /** 야간선물 세션 시간대인지 (KST 18:00~05:00) */
  sessionOpen: boolean;
  price: number | null;
  diff: number | null;
  changePct: number | null;
  code: string | null;
  error?: string;
}

const CACHE_TTL = 10_000;
let cache: { at: number; data: NightFutureResponse } | null = null;

/** KST 기준 야간선물 세션(18:00~익일 05:00) 여부 */
function isNightSession(): boolean {
  const kstHour = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
  // 18,19,...,23,0,1,2,3,4 → 세션. 5~17 → 닫힘
  return kstHour >= 18 || kstHour < 5;
}

export async function GET() {
  const sessionOpen = isNightSession();

  // 세션 시간이 아니면 KIS 호출 자체를 생략 (불필요한 API 소모 방지)
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

  if (!kisConfigured()) {
    return NextResponse.json(
      {
        available: false,
        sessionOpen: true,
        price: null,
        diff: null,
        changePct: null,
        code: null,
        error: "KIS 앱키 미설정",
      } satisfies NightFutureResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let fut = null;
  let fetchError = "";
  try {
    fut = await fetchKisNightFuture();
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "알 수 없는 오류";
  }

  const data: NightFutureResponse = fut
    ? {
        available: true,
        sessionOpen: true,
        price: fut.price,
        diff: fut.diff,
        changePct: fut.changePct,
        code: fut.code,
      }
    : {
        available: false,
        sessionOpen: true,
        price: null,
        diff: null,
        changePct: null,
        code: null,
        error: fetchError || "야간선물 시세 조회 실패",
      };

  if (fut) cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
