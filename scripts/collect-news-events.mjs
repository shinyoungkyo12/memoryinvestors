/**
 * 수주 이벤트 자동 수집기
 *
 * Google News RSS에서 메모리 수주/공급계약 관련 기사를 골라
 * Supabase `news_events` 테이블에 영구 저장합니다 (url 기준 중복 방지).
 * → 사이트의 HBM 수주 타임라인에 "자동" 배지로 표시됩니다.
 *
 * 분류 기준 (둘 다 만족해야 저장 — 노이즈 차단):
 *  - 기술 키워드: HBM / HBF / DRAM·D램 / 낸드·NAND / (AI )메모리
 *  - 수주 키워드: 수주 / 공급계약 / 완판 / sold out / 장기계약 / LTA / 납품 / 매진 / 공급 확정
 *
 * 실행:
 *   node --env-file=.env.local scripts/collect-news-events.mjs --dry-run
 *   node --env-file=.env.local scripts/collect-news-events.mjs
 *   (npm run news / news:dry)
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as cheerio from "cheerio";

const QUERY =
  '(HBM OR HBF OR DRAM OR D램 OR "AI 메모리" OR 메모리반도체) (수주 OR 공급계약 OR 완판 OR "sold out" OR 장기계약 OR 납품 OR 매진)';

const RSS_URL =
  "https://news.google.com/rss/search?q=" +
  encodeURIComponent(QUERY) +
  "&hl=ko&gl=KR&ceid=KR:ko";

const TECH_PATTERN = /HBM|HBF|DRAM|D램|디램|낸드|NAND|AI\s?메모리|메모리/i;
const ORDER_PATTERN =
  /수주|공급\s?계약|완판|sold[\s-]?out|장기\s?계약|LTA|납품|매진|공급\s?확정/i;

/** 타임라인 회사 칩 추출 */
const COMPANY_PATTERNS = [
  { name: "삼성전자", re: /삼성전자|삼성/ },
  { name: "SK하이닉스", re: /SK\s?하이닉스|하이닉스/ },
  { name: "마이크론", re: /마이크론|Micron/i },
  { name: "엔비디아", re: /엔비디아|NVIDIA/i },
  { name: "샌디스크", re: /샌디스크|SanDisk/i },
  { name: "키옥시아", re: /키옥시아|Kioxia/i },
];

const TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** RSS XML → 수주 이벤트 후보 (export: 픽스처 테스트용) */
export function parseEvents(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const events = [];

  $("item").each((_, el) => {
    const $el = $(el);
    const rawTitle = $el.find("title").first().text().trim();
    const url = $el.find("link").first().text().trim();
    const source = $el.find("source").first().text().trim();
    const pubDate = $el.find("pubDate").first().text().trim();
    if (!rawTitle || !url) return;

    // 분류: 기술 키워드 + 수주 키워드 모두 포함된 제목만
    if (!TECH_PATTERN.test(rawTitle) || !ORDER_PATTERN.test(rawTitle)) return;

    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;

    const t = Date.parse(pubDate);
    const eventDate = Number.isFinite(t)
      ? new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) // KST
      : new Date().toISOString().slice(0, 10);

    const companies = COMPANY_PATTERNS.filter((c) => c.re.test(title)).map(
      (c) => c.name,
    );

    events.push({
      event_date: eventDate,
      title,
      source: source || null,
      url,
      companies,
    });
  });

  // url 중복 제거
  const seen = new Set();
  return events.filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

async function fetchRss() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" },
      signal: controller.signal,
    });
    console.log(`[news-events] 응답: HTTP ${res.status}`);
    if (!res.ok) throw new Error(`RSS 요청 실패: HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`${TIMEOUT_MS / 1000}초 내 응답 없음`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertEvents(events) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }
  const res = await fetch(`${url}/rest/v1/news_events?on_conflict=url`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates", // 기존 기사 보존, 신규만 삽입
    },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    throw new Error(
      `Supabase upsert 실패: HTTP ${res.status} ${await res.text()}`,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("[news-events] 수주 이벤트 뉴스 수집 시작");

  const xml = await fetchRss();
  const events = parseEvents(xml);

  console.log(`[news-events] 수주 이벤트 후보 ${events.length}건:`);
  console.table(
    events.map((e) => ({
      date: e.event_date,
      title: e.title.slice(0, 50),
      companies: e.companies.join(","),
    })),
  );

  if (dryRun) {
    console.log("[news-events] --dry-run: DB 저장 생략");
    return;
  }
  if (events.length === 0) {
    console.log("[news-events] 저장할 이벤트 없음 (정상 — 수주 뉴스가 없는 날)");
    return;
  }

  await upsertEvents(events);
  console.log(`[news-events] Supabase 저장 완료 (신규분만 삽입)`);

  await cleanupOldEvents();
}

/** 30일 경과한 자동 수집 이벤트 삭제 (검증 항목은 JSON에 있어 영향 없음) */
async function cleanupOldEvents() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const cutoff = new Date(Date.now() - 30 * 86_400_000 + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  try {
    const res = await fetch(
      `${url}/rest/v1/news_events?event_date=lt.${cutoff}`,
      {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      },
    );
    console.log(
      `[news-events] ${cutoff} 이전 자동 이벤트 정리: HTTP ${res.status}`,
    );
  } catch (e) {
    console.warn("[news-events] 정리 실패(다음 실행에서 재시도):", e.message);
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href.replace(
      /\/{3,}/,
      "///",
    )
) {
  main().catch((e) => {
    console.error("[news-events] 오류:", e.message);
    process.exit(1);
  });
}
