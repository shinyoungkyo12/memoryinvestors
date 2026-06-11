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
