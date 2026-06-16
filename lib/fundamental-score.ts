/**
 * 업황(펀더멘탈) 스코어 — 메모리 사이클 관점의 순수함수.
 *
 * 기술적 추세(lib/trend.ts)와 분리된 "업황 축". 종목별로 수집된 데이터가
 * 다르므로(미국 4종목은 재고/DIO, 한국 2종목은 컨센서스도) 데이터가 있는
 * 항목만 분모(maxScore)에 포함해 KR/US를 공정하게 비교한다.
 *
 * 기준(각 1점):
 *  1. 재고일수(DIO) 개선   — 최신 DIO < 직전 분기 DIO  (둘 다 있을 때만 채점)
 *  2. 재고자산 감소        — 최신 재고 < 직전 분기 재고 (분기 ≥2개일 때만 채점)
 *  3. 컨센서스 상승여력 +  — upside_pct > 0            (컨센서스 있을 때 = KR)
 *
 * 등급: ratio=score/max → ≥0.67 개선 / 0.34~0.66 중립 / <0.34 둔화.
 *       max=0(채점 가능 항목 없음)이면 "데이터 부족".
 */

export interface FundamentalCriterion {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface FundamentalResult {
  score: number;
  maxScore: number;
  grade: "개선" | "중립" | "둔화" | "데이터 부족";
  criteria: FundamentalCriterion[];
  highlights: string[];
}

/** 재고 시계열 1개 분기점 (fundamentals API의 inventory[ticker] 요소) */
export interface InventoryPoint {
  fiscalEnd: string;
  inventoryB: number;
  dio: number | null;
}

export function computeFundamental(
  inventory: InventoryPoint[],
  upsidePct: number | null,
  /** 재고 표시 단위 ($B / 조원) — detail 표기용 */
  unit = "$B",
): FundamentalResult {
  const criteria: FundamentalCriterion[] = [];

  const latest = inventory.at(-1) ?? null;
  const prev = inventory.length >= 2 ? inventory[inventory.length - 2] : null;

  // 1. DIO 개선 (둘 다 존재할 때만 채점)
  if (latest?.dio != null && prev?.dio != null) {
    const passed = latest.dio < prev.dio;
    criteria.push({
      key: "dio_down",
      label: "재고일수(DIO) 개선",
      passed,
      detail: `${prev.dio} → ${latest.dio}일`,
    });
  }

  // 2. 재고자산 감소 (분기 2개 이상일 때만 채점)
  if (latest && prev) {
    const passed = latest.inventoryB < prev.inventoryB;
    criteria.push({
      key: "inv_down",
      label: "재고자산 감소",
      passed,
      detail: `${prev.inventoryB.toLocaleString("ko-KR")} → ${latest.inventoryB.toLocaleString("ko-KR")} ${unit}`,
    });
  }

  // 3. 컨센서스 상승여력 + (컨센서스가 있을 때만 = KR)
  if (upsidePct != null) {
    criteria.push({
      key: "upside_pos",
      label: "컨센서스 상승여력 +",
      passed: upsidePct > 0,
      detail: `${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(1)}%`,
    });
  }

  const score = criteria.filter((c) => c.passed).length;
  const maxScore = criteria.length;

  let grade: FundamentalResult["grade"];
  if (maxScore === 0) {
    grade = "데이터 부족";
  } else {
    const ratio = score / maxScore;
    grade = ratio >= 0.67 ? "개선" : ratio >= 0.34 ? "중립" : "둔화";
  }

  const highlights: string[] = [];
  for (const c of criteria) if (c.passed) highlights.push(c.label);

  return { score, maxScore, grade, criteria, highlights };
}
