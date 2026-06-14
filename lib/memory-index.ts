/**
 * 메모리 인덱스 계산 엔진 (순수함수 — 단위 테스트 대상)
 *
 * 두 가지 가중 방식:
 *  - "return" (기본): 기준일 대비 각 종목 수익률을 비중 가중평균.
 *    발행주식수·환율 절대값 오차에 강건. S&P 가격지수와 유사 개념.
 *  - "mcap": 시가총액 가중 + 종목당 상한(WEIGHT_CAP). 환율로 통화 통일 필요.
 *
 * 핵심 규칙:
 *  - 기준일(BASE_DATE) 지수 = BASE_INDEX(1000)
 *  - 통화 혼합(KRW/USD): mcap 모드에서만 환율로 통일. return 모드는 통화 무관.
 *  - 결측 종목은 가중치에서 제외하고 나머지로 정규화(부분 데이터에도 동작).
 */

import {
  BASE_INDEX,
  WEIGHT_CAP,
  type IndexConstituent,
} from "./index-constituents";

export type WeightMode = "return" | "mcap";

export interface PricePoint {
  ticker: string;
  /** 해당 시점 종가(현지 통화) */
  price: number;
  /** 기준일 종가(현지 통화) — return 모드 필수 */
  baseClose: number;
  currency: "USD" | "KRW";
}

/** 비중 상한 적용 후 재정규화 (합이 1이 되도록, 나스닥100 캡 방식의 단순화) */
export function applyCap(
  weights: Record<string, number>,
  cap: number,
): Record<string, number> {
  const entries = Object.entries(weights);
  if (entries.length === 0) return {};
  // 1종목뿐이면 캡 적용 불가(=1.0)
  if (entries.length === 1) return { [entries[0][0]]: 1 };

  const capped: Record<string, number> = {};
  let remaining = 1;
  const uncapped: string[] = [];

  // 캡 초과분 고정, 나머지는 비례 재분배
  let sumUncapped = 0;
  for (const [t, w] of entries) {
    if (w > cap) {
      capped[t] = cap;
      remaining -= cap;
    } else {
      uncapped.push(t);
      sumUncapped += w;
    }
  }
  if (uncapped.length === 0 || sumUncapped === 0) {
    // 전부 캡에 걸림 → 균등 분배
    const eq = 1 / entries.length;
    return Object.fromEntries(entries.map(([t]) => [t, eq]));
  }
  for (const t of uncapped) {
    capped[t] = (weights[t] / sumUncapped) * remaining;
  }
  return capped;
}

/**
 * 수익률 가중 지수 (기본 모드)
 * 각 종목의 (현재가/기준가) 비율을 동일 가중으로 평균 → ×1000.
 * 동일가중이 기본이며, weights를 주면 가중평균.
 */
export function computeReturnIndex(
  points: PricePoint[],
  weights?: Record<string, number>,
): number | null {
  const valid = points.filter(
    (p) => p.baseClose > 0 && Number.isFinite(p.price) && p.price > 0,
  );
  if (valid.length === 0) return null;

  let w: Record<string, number>;
  if (weights) {
    // 유효 종목만 남기고 재정규화
    const sub: Record<string, number> = {};
    let sum = 0;
    for (const p of valid) {
      const wi = weights[p.ticker] ?? 0;
      sub[p.ticker] = wi;
      sum += wi;
    }
    w = sum > 0
      ? Object.fromEntries(Object.entries(sub).map(([t, v]) => [t, v / sum]))
      : Object.fromEntries(valid.map((p) => [p.ticker, 1 / valid.length]));
  } else {
    w = Object.fromEntries(valid.map((p) => [p.ticker, 1 / valid.length]));
  }

  let acc = 0;
  for (const p of valid) {
    acc += (p.price / p.baseClose) * (w[p.ticker] ?? 0);
  }
  return acc * BASE_INDEX;
}

/**
 * 시가총액 가중 지수 (옵션 모드)
 * 통화 통일을 위해 usdKrw 필요(USD→KRW). 상한 cap 적용.
 * 기준일 시총합 대비 현재 시총합 비율 × 1000 이 아니라,
 * "캡 적용된 비중 × 종목 수익률"의 합으로 계산해 캡 효과를 살림.
 */
export function computeMcapIndex(
  points: PricePoint[],
  constituents: IndexConstituent[],
  usdKrw: number,
  cap = WEIGHT_CAP,
): number | null {
  const bySymbol = new Map(constituents.map((c) => [c.ticker, c]));
  const valid = points.filter(
    (p) => p.baseClose > 0 && p.price > 0 && bySymbol.has(p.ticker),
  );
  if (valid.length === 0 || !(usdKrw > 0)) return null;

  // 기준일 시총(KRW 환산)으로 raw 비중 산출
  const toKrw = (v: number, cur: "USD" | "KRW") =>
    cur === "USD" ? v * usdKrw : v;

  const baseMcap: Record<string, number> = {};
  let totalBase = 0;
  for (const p of valid) {
    const c = bySymbol.get(p.ticker)!;
    const m = toKrw(p.baseClose, p.currency) * c.sharesOutMillion;
    baseMcap[p.ticker] = m;
    totalBase += m;
  }
  if (totalBase <= 0) return null;

  const rawWeights = Object.fromEntries(
    Object.entries(baseMcap).map(([t, m]) => [t, m / totalBase]),
  );
  const capped = applyCap(rawWeights, cap);

  let acc = 0;
  for (const p of valid) {
    acc += (p.price / p.baseClose) * (capped[p.ticker] ?? 0);
  }
  return acc * BASE_INDEX;
}

export interface ContributionItem {
  ticker: string;
  weight: number;
  /** 기준일 대비 수익률 % */
  returnPct: number;
  /** 지수 기여도(weight × dayChange 근사) */
}

/** 구성종목별 비중 + 수익률 (기여도 표시용) */
export function computeContributions(
  points: PricePoint[],
  weights?: Record<string, number>,
): ContributionItem[] {
  const valid = points.filter((p) => p.baseClose > 0 && p.price > 0);
  const w =
    weights ??
    Object.fromEntries(valid.map((p) => [p.ticker, 1 / valid.length]));
  return valid
    .map((p) => ({
      ticker: p.ticker,
      weight: w[p.ticker] ?? 0,
      returnPct: ((p.price - p.baseClose) / p.baseClose) * 100,
    }))
    .sort((a, b) => b.weight - a.weight);
}
