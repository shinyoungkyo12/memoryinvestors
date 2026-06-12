import { NextResponse } from "next/server";
import hbmJson from "@/data/hbm-events.json";

/**
 * GET /api/summary — 오늘의 메모리 요약 (SummaryBar 데이터)
 * - 현물가: 헤드라인 품목(DDR5 우선) 전일 대비 + 품목 상승/하락 수 + 최신 수집일
 * - 수주이슈: 최근 7일 이벤트 수 (자동수집 + 검증 합산)
 * 10분 캐시. 주가는 클라이언트의 실시간 피드를 그대로 사용.
 */

interface SpotRow {
  captured_date: string;
  item: string;
  price: number;
}

export interface SummaryData {
  spot: {
    lastDate: string;
    headlineItem: string;
    headlineChangePct: number;
    upCount: number;
    downCount: number;
  } | null;
  eventsThisWeek: number;
}

const CACHE_TTL = 600_000;
let cache: { at: number; data: SummaryData } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = key
    ? { apikey: key, Authorization: `Bearer ${key}` }
    : undefined;

  // ── 현물가 요약 ──
  let spot: SummaryData["spot"] = null;
  if (url && headers) {
    try {
      const res = await fetch(
        `${url}/rest/v1/dram_spot?select=captured_date,item,price&order=captured_date.desc&limit=400`,
        { headers, cache: "no-store" },
      );
      if (res.ok) {
        const rows = (await res.json()) as SpotRow[];
        const dates = [...new Set(rows.map((r) => r.captured_date))].sort(
          (a, b) => b.localeCompare(a),
        );
        if (dates.length >= 2) {
          const [d0, d1] = dates;
          const latest = new Map(
            rows.filter((r) => r.captured_date === d0).map((r) => [r.item, r.price]),
          );
          const prev = new Map(
            rows.filter((r) => r.captured_date === d1).map((r) => [r.item, r.price]),
          );
          let up = 0,
            down = 0;
          const changes: { item: string; pct: number }[] = [];
          for (const [item, p0] of latest) {
            const p1 = prev.get(item);
            if (!p1 || p1 <= 0) continue;
            const pct = ((p0 - p1) / p1) * 100;
            changes.push({ item, pct });
            if (pct > 0) up++;
            else if (pct < 0) down++;
          }
          // 헤드라인: DDR5 메인 칩 우선, 없으면 변동폭 최대 품목
          const headline =
            changes.find((c) => /^DDR5 16Gb \(2Gx8\) 4800/.test(c.item)) ??
            changes.find((c) => /^DDR5/.test(c.item)) ??
            [...changes].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
          if (headline) {
            spot = {
              lastDate: d0,
              headlineItem: headline.item,
              headlineChangePct: Math.round(headline.pct * 100) / 100,
              upCount: up,
              downCount: down,
            };
          }
        } else if (dates.length === 1) {
          spot = {
            lastDate: dates[0],
            headlineItem: "",
            headlineChangePct: 0,
            upCount: 0,
            downCount: 0,
          };
        }
      }
    } catch {
      // 요약은 보조 정보 — 실패해도 빈 값으로 응답
    }
  }

  // ── 최근 7일 수주이슈 수 ──
  const weekAgo = new Date(Date.now() - 7 * 86_400_000 + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  let eventsThisWeek = hbmJson.events.filter((e) => e.date >= weekAgo).length;
  if (url && headers) {
    try {
      const res = await fetch(
        `${url}/rest/v1/news_events?select=url&event_date=gte.${weekAgo}`,
        { headers, cache: "no-store" },
      );
      if (res.ok) {
        const rows = (await res.json()) as unknown[];
        eventsThisWeek += rows.length;
      }
    } catch {
      // 무시
    }
  }

  const data: SummaryData = { spot, eventsThisWeek };
  cache = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
