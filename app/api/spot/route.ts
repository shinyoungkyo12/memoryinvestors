import { NextResponse } from "next/server";

/**
 * GET /api/spot
 *
 * Supabase dram_spot 테이블에서 전체 시계열을 읽어 품목별로 그룹화해 반환.
 * 10분 인메모리 캐시 (현물가는 하루 수회만 갱신됨).
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
    const res = await fetch(
      `${url}/rest/v1/dram_spot?select=captured_date,item,price,change_pct&order=captured_date.asc&limit=20000`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Supabase 조회 실패: HTTP ${res.status}` },
        { status: 502 },
      );
    }
    rows = (await res.json()) as SpotRow[];
  } catch {
    return NextResponse.json(
      { error: "Supabase 요청 중 네트워크 오류가 발생했습니다." },
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
