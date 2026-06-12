/**
 * 펀더멘털 수집기 — SEC EDGAR (키 불필요) + DART (선택, DART_API_KEY)
 *
 * 수집 내용:
 *  - MU/SNDK/STX/WDC: 재고자산(InventoryNet) + 분기 매출원가(COGS) → DIO(재고일수)
 *  - 삼성전자/SK하이닉스: DART 전체 재무제표에서 재고자산·매출원가 → DIO (KRW)
 *  - NVDA: 분기 매출 (가이던스 비교용 실적)
 *
 * 실행:
 *   node --env-file=.env.local scripts/collect-fundamentals.mjs --dry-run
 *   node --env-file=.env.local scripts/collect-fundamentals.mjs
 *   (npm run fundamentals / fundamentals:dry)
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 참고:
 *  - CIK는 SEC company_tickers.json에서 동적 조회 (하드코딩 없음)
 *  - 10-K는 연간 COGS만 보고하는 경우가 많아 Q4 = 연간 − (Q1+Q2+Q3) 로 도출
 *  - SEC 요청 정책상 식별 가능한 User-Agent 필수
 */

const INVENTORY_TICKERS = ["MU", "SNDK", "STX", "WDC"];
const REVENUE_TICKER = "NVDA";

const INVENTORY_CONCEPTS = ["InventoryNet"];
const COGS_CONCEPTS = [
  "CostOfGoodsAndServicesSold",
  "CostOfRevenue",
  "CostOfGoodsSold",
];
const REVENUE_CONCEPTS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
];

// SEC 정책: "회사명 연락이메일" 형식의 User-Agent 필수 (없으면 403)
// .env.local에 SEC_CONTACT=본인이메일 을 넣으면 그 값을 사용합니다.
const SEC_CONTACT =
  process.env.SEC_CONTACT ?? "contact@memoryinvestors.vercel.app";
const SEC_UA = `MemoryInvestors ${SEC_CONTACT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function secFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
  });
  await sleep(150); // SEC 속도 제한(초당 10회) 보호
  if (!res.ok) throw new Error(`SEC 요청 실패 ${res.status}: ${url}`);
  return res.json();
}

/** 티커 → CIK (10자리 0패딩) */
async function resolveCiks(tickers) {
  const json = await secFetch("https://www.sec.gov/files/company_tickers.json");
  const map = {};
  for (const entry of Object.values(json)) {
    map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
  }
  const out = {};
  for (const t of tickers) {
    if (!map[t]) throw new Error(`CIK를 찾을 수 없습니다: ${t}`);
    out[t] = map[t];
  }
  return out;
}

/** 후보 concept 중 첫 번째로 존재하는 데이터 반환 */
async function fetchConcept(cik, concepts) {
  for (const concept of concepts) {
    try {
      const json = await secFetch(
        `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`,
      );
      const usd = json?.units?.USD;
      if (usd?.length) return { concept, entries: usd };
    } catch {
      // 해당 concept 없음 → 다음 후보
    }
  }
  return null;
}

const dayDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** instant 항목(재고): end 기준 중복 제거(최신 filed 우선) */
function latestInstants(entries) {
  const byEnd = new Map();
  for (const e of entries) {
    if (!e.end || !Number.isFinite(e.val)) continue;
    const prev = byEnd.get(e.end);
    if (!prev || (e.filed ?? "") > (prev.filed ?? "")) byEnd.set(e.end, e);
  }
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/**
 * duration 항목(COGS/매출)을 분기 시계열로 정규화.
 * - 80~100일 항목 = 분기 값
 * - 350~380일 항목 = 연간 값 → 해당 연도 분기 3개가 있으면 Q4 도출
 */
function quarterlyDurations(entries) {
  const quarters = new Map(); // end → {start,end,val}
  const annuals = [];
  for (const e of entries) {
    if (!e.start || !e.end || !Number.isFinite(e.val)) continue;
    const d = dayDiff(e.start, e.end);
    if (d >= 80 && d <= 100) {
      const prev = quarters.get(e.end);
      if (!prev || (e.filed ?? "") > (prev.filed ?? "")) quarters.set(e.end, e);
    } else if (d >= 350 && d <= 380) {
      annuals.push(e);
    }
  }
  // Q4 도출: 연간 기간 내 분기 3개 합을 빼서 마지막 분기 생성
  for (const a of annuals) {
    if (quarters.has(a.end)) continue;
    const inside = [...quarters.values()].filter(
      (q) => q.start >= a.start && q.end < a.end,
    );
    if (inside.length === 3) {
      const sum = inside.reduce((s, q) => s + q.val, 0);
      const q4start = inside.map((q) => q.end).sort().at(-1);
      quarters.set(a.end, {
        start: q4start,
        end: a.end,
        val: a.val - sum,
        derived: true,
      });
    }
  }
  return [...quarters.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/** 재고 종료일과 가장 가까운(±20일) 분기 COGS 매칭 */
function matchCogs(invEnd, cogsQuarters) {
  let best = null;
  for (const q of cogsQuarters) {
    const gap = Math.abs(dayDiff(q.end, invEnd));
    if (gap <= 20 && (!best || gap < best.gap)) best = { ...q, gap };
  }
  return best;
}

async function collectInventory(ticker, cik) {
  const inv = await fetchConcept(cik, INVENTORY_CONCEPTS);
  const cogs = await fetchConcept(cik, COGS_CONCEPTS);
  if (!inv) {
    console.warn(`[${ticker}] 재고 concept 없음 — 건너뜀`);
    return [];
  }
  const invSeries = latestInstants(inv.entries);
  const cogsQuarters = cogs ? quarterlyDurations(cogs.entries) : [];

  return invSeries.map((e) => {
    const q = matchCogs(e.end, cogsQuarters);
    const dio = q && q.val > 0 ? (e.val / q.val) * 91.25 : null;
    return {
      ticker,
      fiscal_end: e.end,
      inventory_usd: e.val,
      cogs_usd: q?.val ?? null,
      dio: dio !== null ? Math.round(dio * 10) / 10 : null,
    };
  });
}

async function collectRevenue(ticker, cik) {
  const rev = await fetchConcept(cik, REVENUE_CONCEPTS);
  if (!rev) {
    console.warn(`[${ticker}] 매출 concept 없음 — 건너뜀`);
    return [];
  }
  return quarterlyDurations(rev.entries).map((q) => ({
    fiscal_end: q.end,
    revenue_usd: q.val,
  }));
}

/* ─────────────── DART (삼성전자·SK하이닉스) ───────────────
 * corp_code는 금감원이 부여하는 고정 식별자 (티커처럼 불변의 공개 상수)
 * 검증: opendart.fss.or.kr 공시정보 → 고유번호 조회                    */
const DART_COMPANIES = [
  { ticker: "005930", corpCode: "00126380", nameKo: "삼성전자" },
  { ticker: "000660", corpCode: "00164779", nameKo: "SK하이닉스" },
];

/** 보고서 코드 → 분기말 일자 */
const DART_REPORTS = [
  { code: "11013", end: "-03-31", q: 1 },
  { code: "11012", end: "-06-30", q: 2 },
  { code: "11014", end: "-09-30", q: 3 },
  { code: "11011", end: "-12-31", q: 4 }, // 사업보고서(연간)
];

const dartNum = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** DART 전체 재무제표 list → {inventory, cogs} (export: 픽스처 테스트용) */
export function parseDartReport(list) {
  const norm = (t) => String(t ?? "").replace(/\s/g, "");
  const inv = list.find(
    (a) =>
      a.sj_div === "BS" &&
      (a.account_id === "ifrs-full_Inventories" ||
        norm(a.account_nm) === "재고자산"),
  );
  const cogs = list.find(
    (a) =>
      a.sj_div === "IS" &&
      (a.account_id === "ifrs-full_CostOfSales" ||
        norm(a.account_nm) === "매출원가"),
  );
  return {
    inventory: dartNum(inv?.thstrm_amount),
    cogs: dartNum(cogs?.thstrm_amount), // 분기보고서=3개월, 사업보고서=연간
  };
}

async function fetchDartReport(corpCode, year, reprtCode) {
  const key = process.env.DART_API_KEY;
  const url =
    `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json` +
    `?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}` +
    `&reprt_code=${reprtCode}&fs_div=CFS`;
  try {
    const res = await fetch(url);
    await sleep(120);
    const json = await res.json();
    if (json.status !== "000" || !Array.isArray(json.list)) return null;
    return json.list;
  } catch {
    return null;
  }
}

async function collectDartCompany(company) {
  const thisYear = new Date().getFullYear();
  const rows = []; // {fiscal_end, inventory, cogs3m}
  const annualCogs = new Map(); // year → 연간 매출원가

  for (let year = thisYear - 3; year <= thisYear; year++) {
    for (const rep of DART_REPORTS) {
      const list = await fetchDartReport(company.corpCode, year, rep.code);
      if (!list) continue;
      const { inventory, cogs } = parseDartReport(list);
      const fiscal_end = `${year}${rep.end}`;
      if (rep.code === "11011") {
        if (cogs) annualCogs.set(year, cogs);
        if (inventory) rows.push({ fiscal_end, inventory, cogs3m: null, year, q: 4 });
      } else if (inventory) {
        rows.push({ fiscal_end, inventory, cogs3m: cogs, year, q: rep.q });
      }
    }
  }

  // Q4 매출원가 도출: 연간 − (Q1+Q2+Q3)
  for (const r of rows) {
    if (r.q === 4 && r.cogs3m === null && annualCogs.has(r.year)) {
      const qs = rows.filter(
        (x) => x.year === r.year && x.q < 4 && x.cogs3m !== null,
      );
      if (qs.length === 3) {
        r.cogs3m = annualCogs.get(r.year) - qs.reduce((s, x) => s + x.cogs3m, 0);
      }
    }
  }

  return rows.map((r) => ({
    ticker: company.ticker,
    fiscal_end: r.fiscal_end,
    inventory_usd: r.inventory, // KRW 원 단위 그대로 저장 (currency로 구분)
    cogs_usd: r.cogs3m,
    dio:
      r.cogs3m && r.cogs3m > 0
        ? Math.round((r.inventory / r.cogs3m) * 91.25 * 10) / 10
        : null,
    currency: "KRW",
  }));
}

async function upsert(table, rows, conflictCols) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }
  const res = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${conflictCols}`,
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
  if (!res.ok) {
    throw new Error(
      `Supabase upsert 실패(${table}): HTTP ${res.status} ${await res.text()}`,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("[fundamentals] SEC EDGAR 수집 시작");

  const ciks = await resolveCiks([...INVENTORY_TICKERS, REVENUE_TICKER]);
  console.log("[fundamentals] CIK 조회 완료:", ciks);

  const allInventory = [];
  for (const t of INVENTORY_TICKERS) {
    const rows = await collectInventory(t, ciks[t]);
    console.log(`[fundamentals] ${t}: 재고 ${rows.length}개 분기`);
    allInventory.push(...rows.map((r) => ({ ...r, currency: "USD" })));
  }

  if (process.env.DART_API_KEY) {
    for (const company of DART_COMPANIES) {
      const rows = await collectDartCompany(company);
      console.log(
        `[fundamentals] ${company.nameKo}(${company.ticker}): 재고 ${rows.length}개 분기 (DART)`,
      );
      allInventory.push(...rows);
    }
  } else {
    console.log(
      "[fundamentals] DART_API_KEY 미설정 — 삼성전자/SK하이닉스 재고 수집 건너뜀",
    );
  }

  const nvdaRevenue = await collectRevenue(REVENUE_TICKER, ciks[REVENUE_TICKER]);
  console.log(`[fundamentals] NVDA: 매출 ${nvdaRevenue.length}개 분기`);

  // 최근 5개 분기 미리보기
  console.log("─── 재고/DIO 최근 데이터 (종목별 마지막 분기) ───");
  const allTickers = [
    ...INVENTORY_TICKERS,
    ...DART_COMPANIES.map((c) => c.ticker),
  ];
  console.table(
    allTickers.map(
      (t) => allInventory.filter((r) => r.ticker === t).at(-1) ?? { ticker: t },
    ),
  );
  console.log("─── NVDA 매출 최근 4개 분기 ($B) ───");
  console.table(
    nvdaRevenue.slice(-4).map((r) => ({
      fiscal_end: r.fiscal_end,
      revenue_B: Math.round(r.revenue_usd / 1e8) / 10,
    })),
  );

  if (dryRun) {
    console.log("[fundamentals] --dry-run: DB 저장 생략");
    return;
  }

  await upsert("inventory", allInventory, "ticker,fiscal_end");
  await upsert("nvda_revenue", nvdaRevenue, "fiscal_end");
  console.log(
    `[fundamentals] 저장 완료: 재고 ${allInventory.length}건, NVDA 매출 ${nvdaRevenue.length}건`,
  );
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
    console.error("[fundamentals] 오류:", e.message);
    process.exit(1);
  });
}

export { quarterlyDurations, latestInstants, matchCogs };
// parseDartReport는 위에서 export
