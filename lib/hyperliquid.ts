/**
 * Hyperliquid 시세 유틸 (서버 전용).
 *
 * 삼성/하이닉스는 Hyperliquid 빌더 배포 perp(HIP-3)로, 트레이드 URL이
 * `xyz:SAMSUNG` / `xyz:SKHYNIX` 형태다 → dex="xyz", coin="SAMSUNG"/"SKHYNIX".
 * allMids/candleSnapshot 호출 시 dex 파라미터 + "dex:coin" 코인 키를 함께 시도해
 * 메인 perp dex / 빌더 dex 어느 쪽이든 데이터를 잡도록 한다.
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";

export interface HlTarget {
  yahoo: string;
  nameKo: string;
  /** 기본 심볼 (env 미설정 시). "xyz:SKHYNIX" 처럼 dex 접두사 포함 가능 */
  raw: string;
  envKey: string;
}

export const HL_TARGETS: Record<string, HlTarget> = {
  "005930": {
    yahoo: "005930.KS",
    nameKo: "삼성전자",
    raw: "xyz:SAMSUNG",
    envKey: "HL_SYMBOL_005930",
  },
  "000660": {
    yahoo: "000660.KS",
    nameKo: "SK하이닉스",
    raw: "xyz:SKHYNIX",
    envKey: "HL_SYMBOL_000660",
  },
};

export interface HlSymbol {
  /** 빌더 perp dex 이름 (메인 dex면 null) */
  dex: string | null;
  /** 코인 이름 (dex 접두사 제외) */
  coin: string;
  /** 표시용 원본 심볼 */
  display: string;
}

/** env 우선 → 기본값. "dex:coin" 형태면 분리. */
export function resolveHlSymbol(ticker: string): HlSymbol | null {
  const t = HL_TARGETS[ticker];
  if (!t) return null;
  const raw = (process.env[t.envKey] ?? t.raw).trim();
  if (raw.includes(":")) {
    const [dex, coin] = raw.split(":");
    return { dex: dex || null, coin, display: coin };
  }
  return { dex: null, coin: raw, display: raw };
}

async function postMids(
  body: Record<string, unknown>,
): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    // allMids 응답: 평탄 객체 또는 { mids: {...} }
    if (json && typeof json === "object") {
      if ("mids" in json && json.mids) return json.mids as Record<string, string>;
      return json as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

/** 하이퍼리퀴드 현재 mid 가격. dex/coin 변형을 모두 시도. */
export async function fetchHlMid(sym: HlSymbol): Promise<number | null> {
  const bodies: Record<string, unknown>[] = sym.dex
    ? [{ type: "allMids", dex: sym.dex }, { type: "allMids" }]
    : [{ type: "allMids" }];
  const keys = sym.dex
    ? [sym.coin, `${sym.dex}:${sym.coin}`]
    : [sym.coin];

  for (const body of bodies) {
    const mids = await postMids(body);
    if (!mids) continue;
    for (const k of keys) {
      const v = Number(mids[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

async function candleSnapshot(
  coin: string,
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
        req: { coin, interval: "1d", startTime: start, endTime: end },
      }),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const candles = await res.json();
    if (!Array.isArray(candles)) return out;
    for (const c of candles as { t: number; c: string }[]) {
      const date = new Date(c.t).toISOString().slice(0, 10);
      const close = Number(c.c);
      if (Number.isFinite(close) && close > 0) out.set(date, close);
    }
  } catch {
    /* 무시 */
  }
  return out;
}

/** 하이퍼리퀴드 일봉 종가 시계열. "dex:coin" → "coin" 순으로 시도. */
export async function fetchHlDailyCloses(
  sym: HlSymbol,
  days: number,
): Promise<Map<string, number>> {
  const candidates = sym.dex
    ? [`${sym.dex}:${sym.coin}`, sym.coin]
    : [sym.coin];
  for (const coin of candidates) {
    const m = await candleSnapshot(coin, days);
    if (m.size > 0) return m;
  }
  return new Map();
}

/**
 * KOSPI 정규장 진행 여부 — KST 평일 09:00~15:30.
 * (공휴일은 미반영: 평일 장중이면 open 으로 간주)
 */
export function isKospiOpen(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const wd = parts.find((p) => p.type === "weekday")?.value;
  let hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (hh === 24) hh = 0; // 일부 환경 자정 표기 보정

  if (wd === "Sat" || wd === "Sun") return false;
  const mins = hh * 60 + mm;
  return mins >= 9 * 60 && mins < 15 * 60 + 30; // 09:00 ~ 15:30
}
