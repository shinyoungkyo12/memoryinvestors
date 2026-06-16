import { NextRequest, NextResponse } from "next/server";
import { fetchYahooCandles } from "@/lib/yahoo";
import { fitAndPredict, type PredictSample } from "@/lib/predict";
import {
  HL_TARGETS,
  resolveHlSymbol,
  fetchHlMid,
  fetchHlDailyCloses,
  isKospiOpen,
} from "@/lib/hyperliquid";

/**
 * GET /api/hl-predict?ticker=005930|000660
 *
 * 삼성전자·SK하이닉스의 하이퍼리퀴드 거래가 + 다음날 시초가 예측.
 *
 * 예측가는 "코스피 정규장 마감(15:30 KST) 이후"에만 산출한다(marketOpen=false).
 * 장중에는 marketOpen=true 로 두고 예측을 비워 패널이 안내 문구를 띄운다.
 */

const TARGET = HL_TARGETS;

export interface HlPredictResponse {
  ticker: string;
  nameKo: string;
  available: boolean;
  hlSymbol: string | null;
  hlPrice: number | null;
  lastClose: number | null;
  predictedOpen: number | null;
  predictedGapPct: number | null;
  confidence: number | null;
  samples: number | null;
  corrHl: number | null;
  corrSpot: number | null;
  /** KOSPI 정규장 진행 중 여부 (true면 예측 보류) */
  marketOpen: boolean;
  error?: string;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; data: HlPredictResponse }>();

/** DRAM 현물 DXI 종가 시계열 */
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
  const sym = resolveHlSymbol(ticker);
  const marketOpen = isKospiOpen();

  const base = {
    ticker,
    nameKo: t?.nameKo ?? "",
    hlSymbol: sym?.display ?? null,
    marketOpen,
  };

  const fail = (msg: string, status = 200): NextResponse => {
    const body: HlPredictResponse = {
      ...base,
      available: false,
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
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  };

  if (!t || !sym) {
    return fail("하이퍼리퀴드 예측은 삼성전자·SK하이닉스만 지원합니다.", 400);
  }

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.data, { headers: { "Cache-Control": "no-store" } });
  }

  // 병렬 수집
  const [hlMid, hlCloses, krCandles, spot] = await Promise.all([
    fetchHlMid(sym),
    fetchHlDailyCloses(sym, 150),
    fetchYahooCandles(t.yahoo, "1day"),
    fetchSpotDxi(),
  ]);

  if (!krCandles || krCandles.length < 5) {
    return fail("KRX 시세 데이터가 부족합니다.");
  }

  const kr = krCandles
    .map((c) => ({
      date: new Date(c.time * 1000).toISOString().slice(0, 10),
      open: c.open,
      close: c.close,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lastKr = kr[kr.length - 1];

  // 예측 없이 현재가만 채운 응답 (장중 보류 / 데이터 부족 공통)
  const priceOnly = (msg: string): NextResponse => {
    const data: HlPredictResponse = {
      ...base,
      available: true,
      hlPrice: hlMid,
      lastClose: lastKr.close,
      predictedOpen: null,
      predictedGapPct: null,
      confidence: null,
      samples: null,
      corrHl: null,
      corrSpot: null,
      error: msg,
    };
    cache.set(ticker, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  };

  // 코스피 장중에는 예측 보류 (마감 이후에만 동작)
  if (marketOpen) {
    return priceOnly("코스피 정규장 마감(15:30 KST) 이후 다음날 시초가 예측이 제공됩니다.");
  }

  // HL 캔들 부족 시 현재가만
  if (hlCloses.size < 8) {
    return priceOnly("하이퍼리퀴드 상장 초기 — 예측 데이터 축적 중입니다.");
  }

  const hlDates = [...hlCloses.keys()].sort();
  const spotDates = [...spot.keys()].sort();

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

  const hlAtLast = nearestOnOrBefore(hlDates, hlCloses, lastKr.date);
  const latestHlRet =
    hlMid != null && hlAtLast != null && hlAtLast > 0
      ? (hlMid - hlAtLast) / hlAtLast
      : 0;
  const latestSpotRet =
    spotDates.length >= 2
      ? (() => {
          const a = spot.get(spotDates[spotDates.length - 2])!;
          const b = spot.get(spotDates[spotDates.length - 1])!;
          return a > 0 ? (b - a) / a : 0;
        })()
      : 0;

  const pred = fitAndPredict(samples, { hlRet: latestHlRet, spotRet: latestSpotRet });
  if (!pred) {
    return priceOnly("예측에 필요한 표본이 부족합니다 (데이터 축적 중).");
  }

  const predictedOpen = Math.round(lastKr.close * (1 + pred.predictedGap));

  const data: HlPredictResponse = {
    ...base,
    available: true,
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
