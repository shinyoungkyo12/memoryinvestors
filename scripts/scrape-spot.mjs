/**
 * DRAM 현물가격 스크래퍼 (v2 — 타임아웃 + 진단 강화)
 *
 * DRAMeXchange 메인페이지의 일별 현물가 테이블 + DXI 지수를 수집해
 * Supabase `dram_spot` 테이블에 upsert 합니다. (item + captured_date 기준 중복 방지)
 *
 * 실행:
 *   node scripts/scrape-spot.mjs --dry-run   # DB 저장 없이 파싱 결과만 출력 (구조 검증용)
 *   node scripts/scrape-spot.mjs             # 수집 + Supabase 저장
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * v2 변경사항:
 *  - 요청 타임아웃 20초 (무한 대기 방지)
 *  - HTTP 상태/리다이렉트/응답 크기 진단 로그
 *  - 파싱 0건 시 HTML 일부를 출력해 구조 진단 가능
 */

import * as cheerio from "cheerio";

const SOURCE_URL = "https://www.dramexchange.com/";
const TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 품목명으로 인정할 패턴 (DRAM 칩/모듈 표기 휴리스틱) */
const ITEM_PATTERN = /(DDR\d|LPDDR|GDDR|DXI|eTT|\d+\s*G[bB]?\s*\(?\d*Gx\d+\)?)/;

/** 숫자 추출: "3.125", "1,234.5", "-0.83%" 모두 대응 */
function toNumber(text) {
  const m = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * HTML에서 현물가 행 추출 (export: 테스트 가능하도록 분리)
 * 행 인식 기준:
 *  - 첫 셀이 ITEM_PATTERN과 일치
 *  - 숫자 셀이 2개 이상
 * 가격 = % 없는 마지막 숫자 셀 (관례상 Session Average가 마지막 가격 컬럼)
 * 변동률 = % 포함 마지막 셀
 */
export function parseSpotRows(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .map((_, td) => $(td).text().trim())
      .get();
    if (cells.length < 3) return;

    const item = cells[0];
    if (!ITEM_PATTERN.test(item) || item.length > 80) return;

    let price = null;
    let changePct = null;
    for (let i = cells.length - 1; i >= 1; i--) {
      const cell = cells[i];
      const num = toNumber(cell);
      if (num === null) continue;
      if (cell.includes("%")) {
        if (changePct === null) changePct = num;
      } else if (price === null) {
        price = num;
      }
      if (price !== null && changePct !== null) break;
    }

    if (price !== null && price > 0) {
      rows.push({ item, price, change_pct: changePct });
    }
  });

  // DXI 지수: 테이블 밖 텍스트에 있을 수 있어 별도 탐색
  if (!rows.some((r) => r.item.includes("DXI"))) {
    const bodyText = $("body").text();
    const m = bodyText.match(/DXI[^0-9-]{0,40}([\d,]+\.?\d*)/);
    if (m) {
      const v = toNumber(m[1]);
      if (v && v > 1000) rows.push({ item: "DXI", price: v, change_pct: null });
    }
  }

  // 동일 품목 중복 제거 (첫 항목 유지)
  const seen = new Set();
  return rows.filter((r) => {
    const key = r.item.replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHtml() {
  console.log(`[scrape-spot] 요청 중… (타임아웃 ${TIMEOUT_MS / 1000}초)`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    console.log(
      `[scrape-spot] 응답: HTTP ${res.status} · 최종 URL: ${res.url}`,
    );
    if (!res.ok) throw new Error(`페이지 요청 실패: HTTP ${res.status}`);
    const html = await res.text();
    console.log(`[scrape-spot] HTML 수신: ${html.length.toLocaleString()} bytes`);
    return html;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        `${TIMEOUT_MS / 1000}초 내 응답 없음 — 사이트가 차단했거나 네트워크 문제입니다.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertToSupabase(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }

  // KST 기준 수집일
  const capturedDate = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const payload = rows.map((r) => ({ ...r, captured_date: capturedDate }));

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
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase upsert 실패: HTTP ${res.status} ${await res.text()}`);
  }
  return payload.length;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[scrape-spot] ${SOURCE_URL} 수집 시작`);
  const html = await fetchHtml();
  const rows = parseSpotRows(html);

  if (rows.length === 0) {
    console.error(
      "[scrape-spot] 파싱된 행이 0건입니다. 사이트 구조가 변경됐거나 봇 차단 페이지일 수 있습니다.",
    );
    console.error("─── 진단용 HTML 미리보기 (앞 1,500자) ───");
    console.error(html.slice(0, 1500));
    console.error("─── 끝 ───");
    process.exit(1);
  }

  console.log(`[scrape-spot] ${rows.length}건 파싱:`);
  console.table(rows);

  if (dryRun) {
    console.log("[scrape-spot] --dry-run: DB 저장 생략");
    return;
  }

  const n = await upsertToSupabase(rows);
  console.log(`[scrape-spot] Supabase 저장 완료: ${n}건`);
}

// 직접 실행 시에만 main 구동 (테스트에서 import 가능하도록)
if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href.replace(/\/{3,}/, "///")
) {
  main().catch((e) => {
    console.error("[scrape-spot] 오류:", e.message);
    process.exit(1);
  });
}
