import { NextRequest, NextResponse } from "next/server";
import { fetchYahooCandles } from "@/lib/yahoo";
import { fitAndPredict, type PredictSample } from "@/lib/predict";

/**
 * GET /api/hl-predict?ticker=005930|000660
 *
 * 삼성전자·SK하이닉스의 하이퍼리퀴드(Hyperliquid) 거래가 + 다음날 시초가 예측.
 *
 * 모델: DRAM 현물(DXI) 수익률·하이퍼리퀴드 수익률 → 다음날 KRX 시초가 갭(다중 선형회귀).
 *       인샘플 방향 적중률을 신뢰도(%)로 표기. 참고용(투자권유 아님).
 *
 * 하이퍼리퀴드 심볼은 환경변수로 주입:
 *   HL_SYMBOL_005930 (삼성전자), HL_SYMBOL_000660 (SK하이닉스)
 * 미설정 시 available=false (심볼 미설정 안내).
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";

const TARGET: Record<
  string,
  { yahoo: string; nameKo: string; hlSymbol: string; envKey: string }
> = {
  "005930": {
    yahoo: "005930.KS",
    nameKo: "삼성전자",
    hlSymbol: "SAMSUNG",
    envKey: "HL_SYMBOL_005930",
  },
  "000660": {
    yahoo: "000660.KS",
    nameKo: "SK하이닉스",
    hlSymbol: "SKHYNIX",
    envKey: "HL_SYMBOL_000660",
  },
};

export interface HlPredictResponse {
  ticker: string;
  nameKo: string;
  available: boolean;
  /** 하이퍼리퀴드 심볼(coin) */
  hlSymbol: string | null;
  /** 하이퍼리퀴드 현재가 (USD) */
  hlPrice: number | null;
  /** KRX 최근 종가 (KRW) */
  lastClose: number | null;
  /** 예측 다음날 시초가 (KRW) */
  predictedOpen: number | null;
  /** 예측 시초가 갭(%) */
  predictedGapPct: number | null;
  /** 방향 적중률 신뢰도(%) */
  confidence: number | null;
  /** 학습 표본 수 */
  samples: number | null;
  /** 하이퍼리퀴드 수익률 ↔ 시초가 갭 상관계수 */
  corrHl: number | null;
  /** 현물 수익률 ↔ 시초가 갭 상관계수 */
  corrSpot: number | null;
  error?: string;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; data: HlPredictResponse }>();

/** 하이퍼리퀴드 현재 mid 가격 */
async function fetchHlMid(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const mids = (await res.json()) as Record<string, string>;
    const v = Number(mids[symbol]);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 하이퍼리퀴드 일봉 종가 시계열 (date → close) */
async function fetchHlDailyCloses(
  symbol: string,
  days: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const end = Date.now();
    const start = end - days * 86_400_000;
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin: symbol, interval: "1d", startTime: start, endTime: end },
      }),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const candles = (await res.json()) as { t: number; c: string }[];
    for (const c of candles) {
      const date = new Date(c.t).toISOString().slice(0, 10);
      const close = Number(c.c);
      if (Number.isFinite(close) && close > 0) out.set(date, close);
    }
  } catch {
    /* 무시 */
  }
  return out;
}

/** DRAM 현물 DXI 종가 시계열 (date → price) */
async function fetchSpotDxi(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return out;
  try {
    const res = await fetch(
      `${url}/rest/v1/dram_spot?item=eq.DXI&select=captured_date,price&order=captured_date.asc&limit=1000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return out;
    const rows = (await res.json()) as { captured_date: string; price: number }[];
    for (const r of rows) {
      const p = Number(r.price);
      if (Number.isFinite(p) && p > 0) out.set(r.captured_date, p);
    }
  } catch {
    /* 무시 */
  }
  return out;
}

/** 정렬된 날짜 배열에서 target 이하(on-or-before) 가장 가까운 값 */
function nearestOnOrBefore(
  sortedDates: string[],
  map: Map<string, number>,
  target: string,
): number | null {
  let best: number | null = null;
  for (const d of sortedDates) {
    if (d > target) break;
    best = map.get(d) ?? best;
  }
  return best;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const t = TARGET[ticker];

  const fail = (msg: string, status = 200): NextResponse => {
    const body: HlPredictResponse = {
      ticker,
      nameKo: t?.nameKo ?? "",
      available: false,
      hlSymbol: null,
      hlPrice: null,
      lastClose: null,
      predictedOpen: null,
      predictedGapPct: null,
      confidence: null,
      samples: null,
      corrHl: null,
      corrSpot: null,
      error: msg,
    };
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  };

  if (!t) return fail("하이퍼리퀴드 예측은 삼성전자·SK하이닉스만 지원합니다.", 400);

  const hlSymbol = process.env[t.envKey] ?? t.hlSymbol;

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 병렬 수집: 하이퍼리퀴드 현재가/일봉, KRX 일봉, DRAM 현물
  const [hlMid, hlCloses, krCandles, spot] = await Promise.all([
    fetchHlMid(hlSymbol),
    fetchHlDailyCloses(hlSymbol, 150),
    fetchYahooCandles(t.yahoo, "1day"),
    fetchSpotDxi(),
  ]);

  if (!krCandles || krCandles.length < 10) {
    return fail("KRX 시세 데이터가 부족합니다.");
  }
  if (hlCloses.size < 10) {
    return fail("하이퍼리퀴드 일봉 데이터가 부족합니다 (심볼 확인 필요).");
  }

  // 날짜 정렬 키
  const hlDates = [...hlCloses.keys()].sort();
  const spotDates = [...spot.keys()].sort();

  // KRX 일봉을 날짜별 open/close 로 변환
  const kr = krCandles
    .map((c) => ({
      date: new Date(c.time * 1000).toISOString().slice(0, 10),
      open: c.open,
      close: c.close,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 표본 구성: i>=2, target=(open[i]-close[i-1])/close[i-1]
  //   hlRet = (HL[d_i]-HL[d_{i-1}])/HL[d_{i-1}] (같은 구간 근사 — 참고용)
  //   spotRet 동일 구간, 없으면 0
  const samples: PredictSample[] = [];
  for (let i = 1; i < kr.length; i++) {
    const prev = kr[i - 1];
    const cur = kr[i];
    if (!(prev.close > 0)) continue;
    const openGap = (cur.open - prev.close) / prev.close;

    const hlCur = nearestOnOrBefore(hlDates, hlCloses, cur.date);
    const hlPrev = nearestOnOrBefore(hlDates, hlCloses, prev.date);
    if (hlCur == null || hlPrev == null || hlPrev <= 0) continue;
    const hlRet = (hlCur - hlPrev) / hlPrev;

    const spCur = nearestOnOrBefore(spotDates, spot, cur.date);
    const spPrev = nearestOnOrBefore(spotDates, spot, prev.date);
    const spotRet =
      spCur != null && spPrev != null && spPrev > 0
        ? (spCur - spPrev) / spPrev
        : 0;

    samples.push({ openGap, hlRet, spotRet });
  }

  // 최신 입력: 현재 HL mid vs 마지막 KRX 거래일의 HL 종가
  const lastKr = kr[kr.length - 1];
  const hlAtLast = nearestOnOrBefore(hlDates, hlCloses, lastKr.date);
  const latestHlRet =
    hlMid != null && hlAtLast != null && hlAtLast > 0
      ? (hlMid - hlAtLast) / hlAtLast
      : 0;
  // 최신 현물 수익률: 마지막 두 현물 포인트
  const latestSpotRet =
    spotDates.length >= 2
      ? (() => {
          const a = spot.get(spotDates[spotDates.length - 2])!;
          const b = spot.get(spotDates[spotDates.length - 1])!;
          return a > 0 ? (b - a) / a : 0;
        })()
      : 0;

  const pred = fitAndPredict(samples, {
    hlRet: latestHlRet,
    spotRet: latestSpotRet,
  });
  if (!pred) {
    return fail("예측에 필요한 표본이 부족합니다.");
  }

  const predictedOpen = Math.round(lastKr.close * (1 + pred.predictedGap));

  const data: HlPredictResponse = {
    ticker,
    nameKo: t.nameKo,
    available: true,
    hlSymbol,
    hlPrice: hlMid,
    lastClose: lastKr.close,
    predictedOpen,
    predictedGapPct: Math.round(pred.predictedGap * 10000) / 100,
    confidence: Math.round(pred.confidence * 10) / 10,
    samples: pred.samples,
    corrHl: Math.round(pred.corrHl * 100) / 100,
    corrSpot: Math.round(pred.corrSpot * 100) / 100,
  };

  cache.set(ticker, { at: Date.now(), data });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
