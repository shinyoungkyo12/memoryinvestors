/**
 * DRAM 현물가 과거 데이터 백필 — Wayback Machine 활용
 *
 * Wayback Machine CDX API로 DRAMeXchange 과거 스냅샷을 주 1회씩 수집해
 * Supabase dram_spot 테이블에 백필합니다.
 *
 * 실행:
 *   node --env-file=.env.local scripts/backfill-spot.mjs --dry-run
 *   node --env-file=.env.local scripts/backfill-spot.mjs
 *   node --env-file=.env.local scripts/backfill-spot.mjs --start 2024-01-01 --end 2025-01-01
 *
 * 기본값: 1년 전 ~ 오늘, 매주 금요일 스냅샷
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as cheerio from "cheerio";
import { parseSpotRows } from "./scrape-spot.mjs";

const SOURCE_URL = "https://www.dramexchange.com/";
const CDX_API = "https://web.archive.org/cdx/search/cdx";
const WB_BASE = "https://web.archive.org/web/";
const TIMEOUT_MS = 30_000;
const DELAY_MS = 2_500; // Wayback Machine 과부하 방지

/**
 * 지정한 날짜(YYYY-MM-DD)에 가장 가까운 Wayback Machine 스냅샷 타임스탬프 반환.
 * 그날 스냅샷이 없으면 ±3일 범위로 재탐색.
 */
async function findSnapshot(date) {
  const yyyymmdd = date.replace(/-/g, "");
  // 당일 → ±3일 순으로 탐색
  const ranges = [
    [yyyymmdd + "000000", yyyymmdd + "235959"],
    [
      fmtDate(addDays(date, -3)).replace(/-/g, "") + "000000",
      fmtDate(addDays(date, 3)).replace(/-/g, "") + "235959",
    ],
  ];

  for (const [from, to] of ranges) {
    const url = new URL(CDX_API);
    url.searchParams.set("url", SOURCE_URL);
    url.searchParams.set("output", "json");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("limit", "1");
    url.searchParams.set("fl", "timestamp,statuscode");
    url.searchParams.set("filter", "statuscode:200");
    url.searchParams.set("collapse", "day");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json) && json.length >= 2) {
        return { ts: json[1][0], capturedDate: date };
      }
    } catch {
      // 다음 범위 시도
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

/** Wayback Machine에서 스냅샷 HTML 다운로드 */
async function fetchSnapshot(ts) {
  const wbUrl = `${WB_BASE}${ts}/${SOURCE_URL}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(wbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; memory-investors-backfill/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr) + n * 86400000);
}
function fmtDate(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

/** startDate ~ endDate 범위에서 매주 금요일 날짜 목록 생성 */
function weeklyDates(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const dates = [];
  // 첫 금요일로 이동
  const dow = start.getDay(); // 0=Sun, 5=Fri
  const toFri = dow <= 5 ? 5 - dow : 6;
  start.setDate(start.getDate() + toFri);
  let cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 7 * 86400_000);
  }
  return dates;
}

async function upsertRows(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  const res = await fetch(
    `${url}/rest/v1/dram_spot?on_conflict=item,captured_date`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) throw new Error(`upsert 실패: HTTP ${res.status} ${await res.text()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const dryRun = args.includes("--dry-run");

  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const startDate = getArg("--start") ?? oneYearAgo;
  const endDate = getArg("--end") ?? today;

  const dates = weeklyDates(startDate, endDate);
  console.log(
    `[backfill] ${startDate} ~ ${endDate} | 대상 ${dates.length}주 (매주 금요일 스냅샷)`,
  );
  if (dryRun) console.log("[backfill] --dry-run 모드: DB 저장 생략");

  let saved = 0;
  let skipped = 0;

  for (const date of dates) {
    process.stdout.write(`[backfill] ${date} … `);
    const snap = await findSnapshot(date);
    if (!snap) {
      console.log("스냅샷 없음 — 스킵");
      skipped++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const html = await fetchSnapshot(snap.ts);
    if (!html) {
      console.log(`다운로드 실패 (ts=${snap.ts}) — 스킵`);
      skipped++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const spotRows = parseSpotRows(html);
    if (spotRows.length === 0) {
      console.log("파싱 0건 — 스킵 (구조 변경 또는 봇 차단 페이지)");
      skipped++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const payload = spotRows.map((r) => ({ ...r, captured_date: date }));
    console.log(`${spotRows.length}건`);

    if (!dryRun) {
      await upsertRows(payload);
      saved += payload.length;
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\n[backfill] 완료 — 저장 ${saved}건, 스킵 ${skipped}주`,
  );
}

main().catch((e) => {
  console.error("[backfill] 오류:", e.message);
  process.exit(1);
});
