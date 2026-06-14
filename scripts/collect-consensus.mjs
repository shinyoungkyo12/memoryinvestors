/**
 * 목표가 컨센서스 수집기
 *
 * 한국 종목(삼성전자·SK하이닉스): 네이버 모바일 종목 API에서
 *   목표주가(목표주가 평균), 투자의견을 가져와 Supabase consensus 테이블에 저장.
 * 미국 종목: 네이버는 한국 종목 위주라, 미국 메모리주는 일단 한국 2사만 수집.
 *   (추후 별도 소스 확장 가능 — 현재는 한국 2사 컨센서스가 핵심)
 *
 * 실행:
 *   node --env-file=.env.local scripts/collect-consensus.mjs --dry-run
 *   node --env-file=.env.local scripts/collect-consensus.mjs
 *   (npm run consensus / consensus:dry)
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 주의:
 *  - 네이버 비공식 API라 응답 구조가 바뀔 수 있음 → 파서는 방어적으로 작성
 *  - 컨테이너망에서는 네이버 접근 불가. GitHub Actions/로컬에서 동작.
 */

const KR_TICKERS = [
  { ticker: "005930", nameKo: "삼성전자" },
  { ticker: "000660", nameKo: "SK하이닉스" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;

/** 숫자 문자열 → number (콤마/통화기호 제거) */
function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[,%원\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * 네이버 종목 통합 API 응답 → 컨센서스 추출 (export: 픽스처 테스트용)
 * 응답 위치는 버전에 따라 다를 수 있어 여러 후보 경로를 탐색.
 */
export function parseNaverConsensus(json, ticker, nameKo) {
  // 후보 경로들: totalInfos 배열(key/value), dealTrendInfos, consensus 등
  // 네이버 integration 응답의 totalInfos에 "목표주가"가 들어오는 경우가 많음
  let targetPrice = null;
  let currentPrice = null;
  let opinion = null;

  // totalInfos: [{ code, key, value, ... }]
  const totalInfos = json?.totalInfos ?? json?.stockInfos ?? [];
  if (Array.isArray(totalInfos)) {
    for (const it of totalInfos) {
      const key = String(it?.key ?? it?.code ?? "");
      const val = it?.value ?? it?.compareToPreviousClosePrice;
      if (/목표주가|targetPrice/i.test(key)) targetPrice = num(val);
      if (/현재가|closePrice|nowVal/i.test(key) && currentPrice == null)
        currentPrice = num(val);
      if (/투자의견|opinion/i.test(key)) opinion = String(val ?? "").trim();
    }
  }

  // 별도 필드 후보
  if (targetPrice == null) targetPrice = num(json?.consensusTargetPrice ?? json?.targetPrice);
  if (currentPrice == null)
    currentPrice = num(json?.closePrice ?? json?.dealTrendInfos?.[0]?.closePrice);
  if (!opinion) opinion = String(json?.investmentOpinion ?? "").trim() || null;

  const upside =
    targetPrice && currentPrice && currentPrice > 0
      ? Math.round(((targetPrice - currentPrice) / currentPrice) * 10000) / 100
      : null;

  return {
    ticker,
    nameKo,
    target_price: targetPrice,
    current_price: currentPrice,
    opinion,
    upside_pct: upside,
    captured_at: new Date().toISOString(),
  };
}

async function fetchNaver(ticker) {
  const url = `https://m.stock.naver.com/api/stock/${ticker}/integration`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://m.stock.naver.com/" },
      signal: controller.signal,
    });
    console.log(`[consensus] ${ticker} 응답: HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[consensus] ${ticker} 요청 실패: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function upsert(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  }
  const res = await fetch(`${url}/rest/v1/consensus?on_conflict=ticker`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert 실패: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("[consensus] 목표가 컨센서스 수집 시작");

  const rows = [];
  for (const { ticker, nameKo } of KR_TICKERS) {
    const json = await fetchNaver(ticker);
    if (!json) {
      console.warn(`[consensus] ${nameKo}(${ticker}) 데이터 없음 — 스킵`);
      continue;
    }
    const row = parseNaverConsensus(json, ticker, nameKo);
    rows.push(row);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[consensus] 수집 ${rows.length}건:`);
  console.table(
    rows.map((r) => ({
      종목: r.nameKo,
      목표가: r.target_price,
      현재가: r.current_price,
      상승여력: r.upside_pct != null ? `${r.upside_pct}%` : "-",
      투자의견: r.opinion ?? "-",
    })),
  );

  if (dryRun) {
    console.log("[consensus] --dry-run: DB 저장 생략");
    return;
  }
  const valid = rows.filter((r) => r.target_price != null);
  if (valid.length === 0) {
    console.log("[consensus] 저장할 유효 데이터 없음");
    return;
  }
  await upsert(valid);
  console.log(`[consensus] Supabase 저장 완료 (${valid.length}건)`);
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((e) => {
    console.error("[consensus] 오류:", e.message);
    process.exit(1);
  });
}
