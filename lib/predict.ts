/**
 * 다음날 시초가 예측용 다중 선형회귀 (순수함수, 의존성 없음)
 *
 * 모델: 다음날 시초가 갭(openGap) ~ b0 + b1·(하이퍼리퀴드 수익률) + b2·(DRAM 현물 수익률)
 * 검증: 인샘플 방향 적중률(예측 부호 == 실제 부호 비율)을 신뢰도(%)로 사용.
 */

/** 정규방정식 (XᵀX)b = Xᵀy 를 가우스-조던으로 풀어 회귀계수 반환. 실패 시 null. */
export function olsFit(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  if (n === 0) return null;
  const k = X[0].length; // 절편 포함 열 수
  // XtX (k×k), Xty (k)
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  // 가우스-조던 소거 (증분 행렬 [XtX | Xty])
  const M: number[][] = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < k; col++) {
    // 피벗 선택
    let piv = col;
    for (let r = col + 1; r < k; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null; // 특이행렬
    [M[col], M[piv]] = [M[piv], M[col]];
    const pivVal = M[col][col];
    for (let c = col; c <= k; c++) M[col][c] /= pivVal;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[k]);
}

/** 피어슨 상관계수 */
export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den < 1e-12 ? 0 : num / den;
}

export interface PredictSample {
  /** 다음날 시초가 갭 (target) */
  openGap: number;
  /** 하이퍼리퀴드 당일 수익률 */
  hlRet: number;
  /** DRAM 현물 수익률 (없으면 0) */
  spotRet: number;
}

export interface PredictResult {
  /** 예측 시초가 갭 (비율) */
  predictedGap: number;
  /** 방향 적중률 신뢰도(%) */
  confidence: number;
  /** 학습 표본 수 */
  samples: number;
  /** 하이퍼리퀴드 수익률 ↔ 시초가 갭 상관계수 */
  corrHl: number;
  /** 현물 수익률 ↔ 시초가 갭 상관계수 */
  corrSpot: number;
  /** 회귀계수 [절편, hl, spot] */
  coef: number[];
}

/**
 * 표본으로 회귀 적합 + 방향 적중률 산출 후, 최신 입력으로 다음날 갭 예측.
 * @param samples 과거 정렬 표본
 * @param latest  최신 입력(예측에 사용할 hlRet/spotRet)
 */
export function fitAndPredict(
  samples: PredictSample[],
  latest: { hlRet: number; spotRet: number },
): PredictResult | null {
  if (samples.length < 8) return null; // 표본 부족

  const useSpot = samples.some((s) => s.spotRet !== 0);
  const X = samples.map((s) =>
    useSpot ? [1, s.hlRet, s.spotRet] : [1, s.hlRet],
  );
  const y = samples.map((s) => s.openGap);
  const coef = olsFit(X, y);
  if (!coef) return null;

  // 인샘플 방향 적중률
  let hit = 0;
  let valid = 0;
  for (const s of samples) {
    const pred = useSpot
      ? coef[0] + coef[1] * s.hlRet + coef[2] * s.spotRet
      : coef[0] + coef[1] * s.hlRet;
    if (Math.abs(s.openGap) < 1e-9) continue; // 무방향 제외
    valid++;
    if (Math.sign(pred) === Math.sign(s.openGap)) hit++;
  }
  const confidence = valid > 0 ? (hit / valid) * 100 : 0;

  const predictedGap = useSpot
    ? coef[0] + coef[1] * latest.hlRet + coef[2] * latest.spotRet
    : coef[0] + coef[1] * latest.hlRet;

  // 절편 포함 3원소로 정규화(현물 미사용 시 spot 계수 0)
  const coef3 = useSpot ? coef : [coef[0], coef[1], 0];

  return {
    predictedGap,
    confidence,
    samples: samples.length,
    corrHl: pearson(
      samples.map((s) => s.hlRet),
      y,
    ),
    corrSpot: useSpot
      ? pearson(
          samples.map((s) => s.spotRet),
          y,
        )
      : 0,
    coef: coef3,
  };
}
