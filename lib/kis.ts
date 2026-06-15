/**
 * 한국투자증권(KIS) Open API 클라이언트 — 서버 전용
 *
 * - 접근토큰: 유효기간 24시간, 발급 1분당 1회 제한 → 모듈 레벨 캐시 + 만료 전 재사용
 * - 현재가: FHKST01010100 (국내주식/ETF 공통)
 *
 * 환경변수: KIS_APP_KEY, KIS_APP_SECRET (없으면 호출부에서 Yahoo 폴백)
 */

const KIS_BASE = "https://openapi.koreainvestment.com:9443";

interface TokenCache {
  token: string;
  /** Unix ms */
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let tokenIssuedAt = 0; // 1분당 1회 발급 제한 보호

export function kisConfigured(): boolean {
  return Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET);
}

async function getToken(): Promise<string | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  // 만료 5분 전까지 캐시 재사용
  if (tokenCache && Date.now() < tokenCache.expiresAt - 300_000) {
    return tokenCache.token;
  }

  // 발급 제한(1분 1회) 내 재시도 방지 — 직전 발급 실패/만료 직후 폭주 차단
  if (Date.now() - tokenIssuedAt < 65_000 && tokenCache) {
    return tokenCache.token; // 만료 임박 토큰이라도 일단 사용
  }

  try {
    tokenIssuedAt = Date.now();
    const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        appsecret: appSecret,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!json.access_token) {
      console.error("[KIS] 토큰 발급 실패:", json.error_description ?? json);
      return tokenCache?.token ?? null;
    }
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 86_400) * 1000,
    };
    return tokenCache.token;
  } catch (e) {
    console.error("[KIS] 토큰 요청 오류:", e);
    return tokenCache?.token ?? null;
  }
}

export interface KisPrice {
  /** 현재가 */
  price: number;
  /** 전일 종가 */
  prevClose: number;
  /** 전일 대비율(%) */
  changePct: number;
}

/** 국내주식/ETF 현재가 조회 */
export async function fetchKisPrice(code: string): Promise<KisPrice | null> {
  const token = await getToken();
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!token || !appKey || !appSecret) return null;

  const url = new URL(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`,
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01010100",
        custtype: "P",
      },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      rt_cd?: string;
      msg1?: string;
      output?: {
        stck_prpr: string; // 현재가
        prdy_vrss: string; // 전일 대비
        prdy_ctrt: string; // 전일 대비율
      };
    };
    if (json.rt_cd !== "0" || !json.output) {
      console.error(`[KIS] 현재가 조회 실패(${code}):`, json.msg1);
      return null;
    }
    const price = Number(json.output.stck_prpr);
    const diff = Number(json.output.prdy_vrss);
    const changePct = Number(json.output.prdy_ctrt);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, prevClose: price - diff, changePct };
  } catch (e) {
    console.error(`[KIS] 현재가 요청 오류(${code}):`, e);
    return null;
  }
}

/* ─────────────── 코스피200 야간선물 (CME 연계) ───────────────
 * 야간선물은 CME 연계 글로벌 시장(18:00~익일 05:00 KST)에만 체결.
 * KIS 지수선물 시세 조회: 선물옵션 시세 API.
 *  - tr_id: FHMIF10000000 (지수선물 현재가)
 *  - FID_COND_MRKT_DIV_CODE: "F" (지수선물)
 *  - 야간(CME) 선물 종목코드는 주간물과 다름 → KIS_NIGHT_FUTURES_CODE 로 주입.
 *    (운영 중 정확한 코드 확인 후 환경변수로 설정. 기본값은 근월물 추정코드)
 *
 * 주의: 선물 종목코드는 만기마다 바뀜(예: 101W12, 105V...). 정확한 야간선물
 *       종목코드는 KIS 종목마스터/문서에서 확인해 KIS_NIGHT_FUTURES_CODE 로 설정.
 */

export interface KisFuture {
  /** 현재가(지수 포인트) */
  price: number;
  /** 전일 대비 */
  diff: number;
  /** 전일 대비율(%) */
  changePct: number;
  /** 종목코드(디버깅용) */
  code: string;
}

/** 코스피200 야간선물 현재가 조회 (CME 연계) */
export async function fetchKisNightFuture(): Promise<KisFuture | null> {
  const token = await getToken();
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!token || !appKey || !appSecret) return null;

  // 야간선물 종목코드: 환경변수 우선. 기본값은 2026년 9월물 추정코드.
  // 만기 후 코드가 바뀌므로 Vercel 환경변수 KIS_NIGHT_FUTURES_CODE로 주입할 것.
  const code = process.env.KIS_NIGHT_FUTURES_CODE || "101V09";

  const url = new URL(
    `${KIS_BASE}/uapi/domestic-futureoption/v1/quotations/inquire-price`,
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "F");
  url.searchParams.set("FID_INPUT_ISCD", code);

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHMIF10000000",
        custtype: "P",
      },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      rt_cd?: string;
      msg1?: string;
      output?: {
        futs_prpr?: string; // 선물 현재가
        prpr?: string; // 현재가(대체 키)
        prdy_vrss?: string; // 전일 대비
        prdy_ctrt?: string; // 전일 대비율
      };
    };
    if (json.rt_cd !== "0" || !json.output) {
      console.error("[KIS] 야간선물 조회 실패:", json.msg1, "code:", code, "rt_cd:", json.rt_cd);
      throw new Error(`KIS 오류: ${json.msg1 ?? "알 수 없음"} (code=${code})`);
    }
    const o = json.output;
    const price = Number(o.futs_prpr ?? o.prpr);
    const diff = Number(o.prdy_vrss ?? 0);
    const changePct = Number(o.prdy_ctrt ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, diff, changePct, code };
  } catch (e) {
    console.error("[KIS] 야간선물 요청 오류:", e);
    return null;
  }
}
