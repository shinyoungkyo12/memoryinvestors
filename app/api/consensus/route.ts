import { NextResponse } from "next/server";

/**
 * GET /api/consensus — 종목별 목표가 컨센서스
 * Supabase consensus 테이블에서 전체 조회. 10분 캐시.
 * 데이터 없으면 빈 배열 (크래시 없음).
 */

export interface ConsensusRow {
  ticker: string;
  name_ko: string | null;
  target_price: number | null;
  target_high: number | null;
  target_low: number | null;
  target_mean: number | null;
  current_price: number | null;
  analyst_count: number | null;
  opinion: string | null;
  upside_pct: number | null;
  source: string | null;
  captured_at: string;
}

const CACHE_TTL = 600_000;
let cache: { at: number; data: ConsensusRow[] } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { rows: cache.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { rows: [], error: "Supabase 미설정" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/consensus?select=*&order=upside_pct.desc`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { rows: [], error: `조회 실패 HTTP ${res.status}` },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const rows = (await res.json()) as ConsensusRow[];
    cache = { at: Date.now(), data: rows };
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { rows: [], error: "네트워크 오류" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
