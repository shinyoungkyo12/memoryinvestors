/**
 * 상관분석 통계 유틸 — 외부 의존성 없음
 */

/** 피어슨 상관계수. 표본 < 3 또는 분산 0이면 null */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0,
    vx = 0,
    vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number;
}

/** 가격 시계열 → 일별 수익률(%) (연속 관측치 기준, 수익률 날짜 = 뒤쪽 날짜) */
export function toReturns(series: DatedValue[]): DatedValue[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const out: DatedValue[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value;
    if (prev > 0 && sorted[i].value > 0) {
      out.push({
        date: sorted[i].date,
        value: ((sorted[i].value - prev) / prev) * 100,
      });
    }
  }
  return out;
}

/** 공통 날짜 inner join → [xVals, yVals] 페어 */
export function alignByDate(
  a: DatedValue[],
  b: DatedValue[],
): { x: number[]; y: number[]; dates: string[] } {
  const bMap = new Map(b.map((p) => [p.date, p.value]));
  const x: number[] = [];
  const y: number[] = [];
  const dates: string[] = [];
  for (const p of [...a].sort((u, v) => u.date.localeCompare(v.date))) {
    const bv = bMap.get(p.date);
    if (bv !== undefined) {
      x.push(p.value);
      y.push(bv);
      dates.push(p.date);
    }
  }
  return { x, y, dates };
}

export interface LagPoint {
  lag: number;
  corr: number | null;
  n: number;
}

/**
 * Lead-Lag 분석 (공통 거래일 시퀀스 기준 시프트)
 * lag > 0: 현물가(x)가 주가(y)를 lag 거래일 선행한다고 가정
 *          → corr(x[0..n-lag], y[lag..n])
 * lag < 0: 주가가 현물가를 선행
 */
export function leadLag(x: number[], y: number[], maxLag: number): LagPoint[] {
  const n = Math.min(x.length, y.length);
  const out: LagPoint[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let xs: number[], ys: number[];
    if (lag >= 0) {
      xs = x.slice(0, n - lag);
      ys = y.slice(lag, n);
    } else {
      xs = x.slice(-lag, n);
      ys = y.slice(0, n + lag);
    }
    out.push({ lag, corr: pearson(xs, ys), n: xs.length });
  }
  return out;
}

/** 절대값 최대 상관 lag 반환 */
export function bestLag(points: LagPoint[]): LagPoint | null {
  let best: LagPoint | null = null;
  for (const p of points) {
    if (p.corr === null) continue;
    if (!best || Math.abs(p.corr) > Math.abs(best.corr!)) best = p;
  }
  return best;
}
