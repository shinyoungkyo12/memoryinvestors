/**
 * 목표가 컨센서스 수집기 (최고 / 평균 / 최저)
 *
 * 소스: Yahoo Finance quoteSummary(financialData) — 한국(.KS)·미국 종목 모두
 *   targetHighPrice / targetMeanPrice / targetLowPrice / numberOfAnalystOpinions /
 *   recommendationKey / currentPrice 를 한 번에 제공.
 *   네이버는 평균 목표가만 주고 미국 종목 미지원이라 Yahoo 단일 소스로 통합.
 *
 * 빈도: 애널리스트 목표가는 리포트 발간 시(분기 단위)에만 바뀌므로 주 2회면 충분.
 *   (GitHub Actions cron 월·목 — collect-consensus.yml)
 *
 * 실행:
 *   node --env-file=.env.local scripts/collect-consensus.mjs --dry-run
 *   node --env-file=.env.local scripts/collect-consensus.mjs
 *   (npm run consensus / consensus:dry)
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 주의:
 *  - Yahoo 비공식 API라 crumb(쿠키+토큰) 인증 필요 → getYahooSession() 으로 획득.
 *  - 컨테이너망에서는 Yahoo 접근이 차단될 수 있음. GitHub Actions/로컬에서 동작.
 *  - ETF는 애널리스트 목표가 개념이 없어 제외(개별주 6종목만).
 */

/** 비ETF 개별주 — { ticker(내부), yahoo(야후심볼), nameKo } */
const TARGETS = [
  { ticker: "005930", yahoo: "005930.KS", nameKo: "삼성전자" },
  { ticker: "000660", yahoo: "000660.KS", nameKo: "SK하이닉스" },
  { ticker: "MU", yahoo: "MU", nameKo: "마이크론" },
  { ticker: "SNDK", yahoo: "SNDK", nameKo: "샌디스크" },
  { ticker: "STX", yahoo: "STX", nameKo: "씨게이트" },
  { ticker: "WDC", yahoo: "WDC", nameKo: "웨스턴디지털" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;

/** Yahoo recommendationKey → 한글 투자의견 */
const OPINION_KO = {
  strong_buy: "적극매수",
  buy: "매수",
  hold: "보유",
  underperform: "비중축소",
  sell: "매도",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Yahoo crumb 세션 획득 — 쿠키 받고 getcrumb 호출.
 * quoteSummary v10 은 crumb 없으면 401 "Invalid Crumb" 반환.
 */
async function getYahooSession() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r1 = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    const setCookies = r1.headers.getSetCookie?.() ?? [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

    const r2 = await fetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" },
        signal: ctrl.signal,
      },
    );
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.length > 40) {
      console.warn("[consensus] crumb 획득 실패 — 응답:", crumb.slice(0, 60));
      return null;
    }
    return { cookie, crumb };
  } catch (e) {
    console.warn(`[consensus] Yahoo 세션 실패: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** financialData 모듈에서 목표가 추출 */
async function fetchTargets(yahooSymbol, session) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}`,
  );
  url.searchParams.set("modules", "financialData");
  url.searchParams.set("crumb", session.crumb);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Cookie: session.cookie,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    console.log(`[consensus] ${yahooSymbol} 응답: HTTP ${res.status}`);
    if (!res.ok) return null;
    const json = await res.json();
    const fd = json?.quoteSummary?.result?.[0]?.financialData;
    if (!fd) return null;
    return {
      high: num(fd.targetHighPrice?.raw),
      low: num(fd.targetLowPrice?.raw),
      mean: num(fd.targetMeanPrice?.raw),
      current: num(fd.currentPrice?.raw),
      count: num(fd.numberOfAnalystOpinions?.raw),
      recommendation: fd.recommendationKey ?? null,
    };
  } catch (e) {
    console.warn(`[consensus] ${yahooSymbol} 요청 실패: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildRow({ ticker, nameKo }, t) {
  const upside =
    t.mean && t.current && t.current > 0
      ? Math.round(((t.mean - t.current) / t.current) * 10000) / 100
      : null;
  return {
    ticker,
    name_ko: nameKo,
    target_high: t.high,
    target_low: t.low,
    target_mean: t.mean,
    target_price: t.mean, // 하위호환
    current_price: t.current,
    analyst_count: t.count,
    opinion: t.recommendation ? (OPINION_KO[t.recommendation] ?? t.recommendation) : null,
    upside_pct: upside,
    source: "yahoo",
    captured_at: new Date().toISOString(),
  };
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
  console.log("[consensus] 목표가 컨센서스 수집 시작 (Yahoo, 최고/평균/최저)");

  const session = await getYahooSession();
  if (!session) {
    console.error("[consensus] Yahoo 세션 획득 실패 — 중단");
    process.exit(1);
  }

  const rows = [];
  for (const sym of TARGETS) {
    const t = await fetchTargets(sym.yahoo, session);
    if (!t || t.mean == null) {
      console.warn(`[consensus] ${sym.nameKo}(${sym.ticker}) 목표가 없음 — 스킵`);
      continue;
    }
    rows.push(buildRow(sym, t));
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`[consensus] 수집 ${rows.length}건:`);
  console.table(
    rows.map((r) => ({
      종목: r.name_ko,
      최저: r.target_low,
      평균: r.target_mean,
      최고: r.target_high,
      현재가: r.current_price,
      상승여력: r.upside_pct != null ? `${r.upside_pct}%` : "-",
      애널: r.analyst_count ?? "-",
      의견: r.opinion ?? "-",
    })),
  );

  if (dryRun) {
    console.log("[consensus] --dry-run: DB 저장 생략");
    return;
  }
  if (rows.length === 0) {
    console.log("[consensus] 저장할 유효 데이터 없음");
    return;
  }
  await upsert(rows);
  console.log(`[consensus] Supabase 저장 완료 (${rows.length}건)`);
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
