import { NextResponse } from "next/server";

/**
 * GET /api/spot
 *
 * Supabase dram_spot 테이블에서 전체 시계열을 읽어 품목별로 그룹화해 반환.
 * 10분 인메모리 캐시 (현물가는 하루 수회만 갱신됨).
 * 정적 spot-history.json 제거 — Supabase 스크랩 데이터만 사용.
 * Supabase max_rows(기본 1,000) 한도를 페이지네이션으로 우회.
 */

interface SpotRow {
  captured_date: string;
  item: string;
  price: number;
  change_pct: number | null;
}

export interface SpotSeries {
  item: string;
  points: { date: string; price: number; changePct: number | null }[];
  latest: { date: string; price: number; changePct: number | null };
}

const CACHE_TTL = 600_000;
let cache: { at: number; data: SpotSeries[] } | null = null;

/** Supabase max_rows(기본 1,000)를 1,000행씩 페이지네이션으로 전량 수집 */
async function fetchAllSpotRows(
  supabaseUrl: string,
  key: string,
): Promise<SpotRow[]> {
  const PAGE = 1000;
  const all: SpotRow[] = [];
  let offset = 0;

  while (true) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/dram_spot?select=captured_date,item,price,change_pct&order=captured_date.asc&limit=${PAGE}&offset=${offset}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(`Supabase 조회 실패: HTTP ${res.status}`);
    const rows = (await res.json()) as SpotRow[];
    all.push(...rows);
    if (rows.length < PAGE) break; // 마지막 페이지
    offset += PAGE;
  }

  return all;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(
      { series: cache.data, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.",
      },
      { status: 500 },
    );
  }

  let rows: SpotRow[];
  try {
    rows = await fetchAllSpotRows(url, key);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "데이터 수집 중 오류" },
      { status: 502 },
    );
  }

  // 품목별 그룹화
  const byItem = new Map<string, SpotSeries["points"]>();
  for (const r of rows) {
    if (!Number.isFinite(Number(r.price))) continue;
    if (!byItem.has(r.item)) byItem.set(r.item, []);
    byItem.get(r.item)!.push({
      date: r.captured_date,
      price: Number(r.price),
      changePct: r.change_pct === null ? null : Number(r.change_pct),
    });
  }

  const series: SpotSeries[] = [...byItem.entries()]
    .map(([item, points]) => ({
      item,
      points,
      latest: points[points.length - 1],
    }))
    // DXI를 맨 앞으로, 나머지는 이름순
    .sort((a, b) => {
      if (a.item === "DXI") return -1;
      if (b.item === "DXI") return 1;
      return a.item.localeCompare(b.item);
    });

  cache = { at: Date.now(), data: series };

  return NextResponse.json(
    { series, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
