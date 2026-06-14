/**
 * 추세 강도(Trend Strength) 계산 — 기술적 분석 기반 순수함수.
 *
 * 7개 조건을 각 1점으로 채점 (최대 7점):
 *  1. 5MA > 20MA       (단기 정배열)
 *  2. 20MA > 60MA      (중기 정배열)
 *  3. 60MA > 200MA     (장기 정배열)
 *  4. 현재가 > 60MA    (중기 추세 유지)
 *  5. 현재가 > 200MA   (장기 추세 유지)
 *  6. RSI(14) >= 60    (강한 모멘텀)
 *  7. 52주 고점 -10% 이내 (신고가권)
 *
 * 등급: 5+ 강세 / 3~4 중립 / 0~2 약세
 *
 * 일봉 종가 배열만 있으면 계산 가능. 데이터 부족 시 해당 조건은 false.
 */

export interface TrendCriterion {
  key: string;
  label: string;
  passed: boolean;
  /** 근거 상세 (값 표시용) */
  detail: string;
}

export interface TrendResult {
  score: number;
  maxScore: number;
  grade: "강세" | "중립" | "약세";
  criteria: TrendCriterion[];
  /** 요약 칩 (통과한 핵심 근거) */
  highlights: string[];
}

/** 단순이동평균 — 마지막 값 (period개 부족하면 null) */
function smaLast(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/** RSI(14) — Wilder 평활 */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  // 초기 평균
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // 평활
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeTrend(closes: number[]): TrendResult {
  const price = closes.at(-1) ?? 0;
  const ma5 = smaLast(closes, 5);
  const ma20 = smaLast(closes, 20);
  const ma60 = smaLast(closes, 60);
  const ma200 = smaLast(closes, 200);
  const r = rsi(closes, 14);
  // 52주(약 252거래일) 고점
  const yearSlice = closes.slice(-252);
  const yearHigh = yearSlice.length > 0 ? Math.max(...yearSlice) : null;
  const fromHighPct =
    yearHigh && yearHigh > 0 ? ((price - yearHigh) / yearHigh) * 100 : null;

  const criteria: TrendCriterion[] = [
    {
      key: "ma5_20",
      label: "5일선 > 20일선",
      passed: ma5 != null && ma20 != null && ma5 > ma20,
      detail:
        ma5 != null && ma20 != null
          ? `5MA ${Math.round(ma5).toLocaleString()} vs 20MA ${Math.round(ma20).toLocaleString()}`
          : "데이터 부족",
    },
    {
      key: "ma20_60",
      label: "20일선 > 60일선",
      passed: ma20 != null && ma60 != null && ma20 > ma60,
      detail:
        ma20 != null && ma60 != null
          ? `20MA ${Math.round(ma20).toLocaleString()} vs 60MA ${Math.round(ma60).toLocaleString()}`
          : "데이터 부족",
    },
    {
      key: "ma60_200",
      label: "60일선 > 200일선",
      passed: ma60 != null && ma200 != null && ma60 > ma200,
      detail:
        ma60 != null && ma200 != null
          ? `60MA ${Math.round(ma60).toLocaleString()} vs 200MA ${Math.round(ma200).toLocaleString()}`
          : "데이터 부족",
    },
    {
      key: "price_60",
      label: "현재가 > 60일선",
      passed: ma60 != null && price > ma60,
      detail:
        ma60 != null
          ? `현재가 ${Math.round(price).toLocaleString()} vs 60MA ${Math.round(ma60).toLocaleString()}`
          : "데이터 부족",
    },
    {
      key: "price_200",
      label: "현재가 > 200일선",
      passed: ma200 != null && price > ma200,
      detail:
        ma200 != null
          ? `현재가 ${Math.round(price).toLocaleString()} vs 200MA ${Math.round(ma200).toLocaleString()}`
          : "데이터 부족",
    },
    {
      key: "rsi",
      label: "RSI(14) ≥ 60",
      passed: r != null && r >= 60,
      detail: r != null ? `RSI ${r.toFixed(0)}` : "데이터 부족",
    },
    {
      key: "near_high",
      label: "52주 고점 -10% 이내",
      passed: fromHighPct != null && fromHighPct >= -10,
      detail:
        fromHighPct != null
          ? `고점 대비 ${fromHighPct >= 0 ? "+" : ""}${fromHighPct.toFixed(1)}%`
          : "데이터 부족",
    },
  ];

  const score = criteria.filter((c) => c.passed).length;
  const grade: TrendResult["grade"] =
    score >= 5 ? "강세" : score >= 3 ? "중립" : "약세";

  // 요약 칩: 통과한 것 중 대표 근거
  const highlights: string[] = [];
  if (
    criteria[0].passed &&
    criteria[1].passed &&
    criteria[2].passed
  )
    highlights.push("정배열");
  else if (criteria[2].passed) highlights.push("장기 상승");
  if (criteria[4].passed) highlights.push("200일선 위");
  if (criteria[5].passed) highlights.push("RSI 양호");
  if (criteria[6].passed) highlights.push("신고가권");

  return { score, maxScore: 7, grade, criteria, highlights };
}
