/**
 * 토스증권 Open API 클라이언트 — 서버 전용
 *
 * OAuth 2.0 Client Credentials Grant 방식으로 액세스 토큰 발급.
 * 토큰은 24시간 유효하며, 재발급 시 이전 토큰은 즉시 무효화됨.
 *
 * 환경변수: TOSS_CLIENT_ID, TOSS_CLIENT_SECRET
 * 계좌 관련 API에는 추가로 TOSS_ACCOUNT_SEQ 필요.
 */

const TOSS_BASE = "https://openapi.tossinvest.com";

// ── 타입 정의 ──────────────────────────────────────────────────

export type Currency = "KRW" | "USD";
export type MarketCountry = "KR" | "US";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type OrderStatus =
  | "PENDING"
  | "PENDING_CANCEL"
  | "PENDING_REPLACE"
  | "PARTIAL_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "CANCEL_REJECTED"
  | "REPLACE_REJECTED"
  | "REPLACED";

export interface TossPrice {
  symbol: string;
  lastPrice: number;
  currency: Currency;
  timestamp: string | null;
}

export interface TossCandle {
  timestamp: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  currency: Currency;
}

export interface TossOrderbookEntry {
  price: number;
  volume: number;
}

export interface TossOrderbook {
  timestamp: string | null;
  currency: Currency;
  asks: TossOrderbookEntry[];
  bids: TossOrderbookEntry[];
}

export interface TossStockInfo {
  symbol: string;
  name: string;
  englishName: string;
  isinCode: string;
  market: "KOSPI" | "KOSDAQ" | "NYSE" | "NASDAQ" | "AMEX" | "KR_ETC" | "US_ETC";
  securityType: string;
  isCommonShare: boolean;
  status: "SCHEDULED" | "ACTIVE" | "DELISTED";
  currency: Currency;
  listDate: string | null;
  delistDate: string | null;
  sharesOutstanding: string;
  leverageFactor: string | null;
}

export interface TossExchangeRate {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: number;
  midRate: number;
  rateChangeType: "UP" | "EQUAL" | "DOWN";
  validFrom: string;
  validUntil: string;
}

export interface TossAccount {
  accountNo: string;
  accountSeq: number;
  accountType: string;
}

export interface TossHoldingItem {
  symbol: string;
  name: string;
  marketCountry: MarketCountry;
  currency: Currency;
  quantity: number;
  lastPrice: number;
  averagePurchasePrice: number;
  profitLossRate: number;
  profitLossAmount: number;
  dailyProfitLossRate: number;
}

export interface TossOrder {
  orderId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  status: OrderStatus;
  price: number | null;
  quantity: number;
  currency: Currency;
  orderedAt: string;
  filledQuantity: number;
  averageFilledPrice: number | null;
  filledAmount: number | null;
}

export interface TossCreateOrderParams {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity?: string;
  price?: string;
  orderAmount?: string;
  timeInForce?: "DAY" | "CLS";
  clientOrderId?: string;
  confirmHighValueOrder?: boolean;
}

// ── 토큰 캐시 ──────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let lastIssuedAt = 0;

export function tossConfigured(): boolean {
  return Boolean(process.env.TOSS_CLIENT_ID && process.env.TOSS_CLIENT_SECRET);
}

async function getToken(): Promise<string | null> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // 만료 5분 전까지 캐시 재사용
  if (tokenCache && Date.now() < tokenCache.expiresAt - 300_000) {
    return tokenCache.token;
  }

  // 재발급 폭주 방지 (직전 발급 후 60초 이내)
  if (Date.now() - lastIssuedAt < 60_000 && tokenCache) {
    return tokenCache.token;
  }

  try {
    lastIssuedAt = Date.now();
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!json.access_token) {
      console.error("[Toss] 토큰 발급 실패:", json.error, json.error_description);
      return tokenCache?.token ?? null;
    }
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 86_400) * 1000,
    };
    return tokenCache.token;
  } catch (e) {
    console.error("[Toss] 토큰 요청 오류:", e);
    return tokenCache?.token ?? null;
  }
}

// ── 공통 fetch 헬퍼 ─────────────────────────────────────────────

async function tossGet<T>(
  path: string,
  params?: Record<string, string>,
  accountSeq?: number,
): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;

  const url = new URL(`${TOSS_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (accountSeq != null) {
    headers["X-Tossinvest-Account"] = String(accountSeq);
  }

  try {
    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    const json = (await res.json()) as { result?: T; error?: { code: string; message: string } };
    if (json.error) {
      console.error(`[Toss] GET ${path} 오류:`, json.error.code, json.error.message);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`[Toss] GET ${path} 요청 오류:`, e);
    return null;
  }
}

async function tossPost<T>(
  path: string,
  body: unknown,
  accountSeq?: number,
): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (accountSeq != null) {
    headers["X-Tossinvest-Account"] = String(accountSeq);
  }

  try {
    const res = await fetch(`${TOSS_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json()) as { result?: T; error?: { code: string; message: string } };
    if (json.error) {
      console.error(`[Toss] POST ${path} 오류:`, json.error.code, json.error.message);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`[Toss] POST ${path} 요청 오류:`, e);
    return null;
  }
}

// ── Market Data ─────────────────────────────────────────────────

/** 현재가 조회 (최대 200종목 comma 구분) */
export async function fetchTossPrices(symbols: string[]): Promise<TossPrice[]> {
  type RawPrice = { symbol: string; lastPrice: string; currency: Currency; timestamp: string | null };
  const result = await tossGet<RawPrice[]>("/api/v1/prices", {
    symbols: symbols.join(","),
  });
  if (!result) return [];
  return result.map((p) => ({
    symbol: p.symbol,
    lastPrice: parseFloat(p.lastPrice),
    currency: p.currency,
    timestamp: p.timestamp,
  }));
}

/** 단일 종목 현재가 */
export async function fetchTossPrice(symbol: string): Promise<TossPrice | null> {
  const prices = await fetchTossPrices([symbol]);
  return prices[0] ?? null;
}

/** 호가 조회 */
export async function fetchTossOrderbook(symbol: string): Promise<TossOrderbook | null> {
  type RawEntry = { price: string; volume: string };
  type RawBook = { timestamp: string | null; currency: Currency; asks: RawEntry[]; bids: RawEntry[] };
  const result = await tossGet<RawBook>("/api/v1/orderbook", { symbol });
  if (!result) return null;
  return {
    timestamp: result.timestamp,
    currency: result.currency,
    asks: result.asks.map((e) => ({ price: parseFloat(e.price), volume: parseFloat(e.volume) })),
    bids: result.bids.map((e) => ({ price: parseFloat(e.price), volume: parseFloat(e.volume) })),
  };
}

/** 캔들 차트 조회 */
export async function fetchTossCandles(
  symbol: string,
  interval: "1m" | "1d",
  count = 100,
  before?: string,
): Promise<TossCandle[]> {
  type RawCandle = { timestamp: string; openPrice: string; highPrice: string; lowPrice: string; closePrice: string; volume: string; currency: Currency };
  type RawPage = { candles: RawCandle[]; nextBefore: string | null };
  const params: Record<string, string> = { symbol, interval, count: String(count) };
  if (before) params.before = before;
  const result = await tossGet<RawPage>("/api/v1/candles", params);
  if (!result) return [];
  return result.candles.map((c) => ({
    timestamp: c.timestamp,
    openPrice: parseFloat(c.openPrice),
    highPrice: parseFloat(c.highPrice),
    lowPrice: parseFloat(c.lowPrice),
    closePrice: parseFloat(c.closePrice),
    volume: parseFloat(c.volume),
    currency: c.currency,
  }));
}

/** 상/하한가 조회 */
export async function fetchTossPriceLimit(symbol: string): Promise<{ upper: number | null; lower: number | null; currency: Currency } | null> {
  type Raw = { upperLimitPrice: string | null; lowerLimitPrice: string | null; currency: Currency };
  const result = await tossGet<Raw>("/api/v1/price-limits", { symbol });
  if (!result) return null;
  return {
    upper: result.upperLimitPrice ? parseFloat(result.upperLimitPrice) : null,
    lower: result.lowerLimitPrice ? parseFloat(result.lowerLimitPrice) : null,
    currency: result.currency,
  };
}

// ── Stock Info ──────────────────────────────────────────────────

/** 종목 기본 정보 조회 (최대 200종목) */
export async function fetchTossStocks(symbols: string[]): Promise<TossStockInfo[]> {
  const result = await tossGet<TossStockInfo[]>("/api/v1/stocks", {
    symbols: symbols.join(","),
  });
  return result ?? [];
}

// ── Market Info ─────────────────────────────────────────────────

/** USD/KRW 환율 조회 */
export async function fetchTossExchangeRate(): Promise<TossExchangeRate | null> {
  type Raw = { baseCurrency: Currency; quoteCurrency: Currency; rate: string; midRate: string; rateChangeType: "UP" | "EQUAL" | "DOWN"; validFrom: string; validUntil: string };
  const result = await tossGet<Raw>("/api/v1/exchange-rate", {
    baseCurrency: "USD",
    quoteCurrency: "KRW",
  });
  if (!result) return null;
  return {
    baseCurrency: result.baseCurrency,
    quoteCurrency: result.quoteCurrency,
    rate: parseFloat(result.rate),
    midRate: parseFloat(result.midRate),
    rateChangeType: result.rateChangeType,
    validFrom: result.validFrom,
    validUntil: result.validUntil,
  };
}

// ── Account ─────────────────────────────────────────────────────

/** 계좌 목록 조회 */
export async function fetchTossAccounts(): Promise<TossAccount[]> {
  const result = await tossGet<TossAccount[]>("/api/v1/accounts");
  return result ?? [];
}

/** 첫 번째 BROKERAGE 계좌의 accountSeq 반환 */
export async function getDefaultAccountSeq(): Promise<number | null> {
  const seq = process.env.TOSS_ACCOUNT_SEQ;
  if (seq) return parseInt(seq, 10);
  const accounts = await fetchTossAccounts();
  return accounts.find((a) => a.accountType === "BROKERAGE")?.accountSeq ?? null;
}

// ── Asset ───────────────────────────────────────────────────────

/** 보유 주식 조회 */
export async function fetchTossHoldings(accountSeq: number, symbol?: string): Promise<TossHoldingItem[]> {
  type RawItem = {
    symbol: string; name: string; marketCountry: MarketCountry; currency: Currency;
    quantity: string; lastPrice: string; averagePurchasePrice: string;
    profitLoss: { rate: string; amount: string };
    dailyProfitLoss: { rate: string };
  };
  type RawOverview = { items: RawItem[] };
  const params: Record<string, string> = {};
  if (symbol) params.symbol = symbol;
  const result = await tossGet<RawOverview>("/api/v1/holdings", params, accountSeq);
  if (!result) return [];
  return result.items.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    marketCountry: item.marketCountry,
    currency: item.currency,
    quantity: parseFloat(item.quantity),
    lastPrice: parseFloat(item.lastPrice),
    averagePurchasePrice: parseFloat(item.averagePurchasePrice),
    profitLossRate: parseFloat(item.profitLoss.rate),
    profitLossAmount: parseFloat(item.profitLoss.amount),
    dailyProfitLossRate: parseFloat(item.dailyProfitLoss.rate),
  }));
}

// ── Order Info ──────────────────────────────────────────────────

/** 매수 가능 금액 조회 */
export async function fetchTossBuyingPower(accountSeq: number, currency: Currency): Promise<number | null> {
  type Raw = { currency: Currency; cashBuyingPower: string };
  const result = await tossGet<Raw>("/api/v1/buying-power", { currency }, accountSeq);
  return result ? parseFloat(result.cashBuyingPower) : null;
}

/** 판매 가능 수량 조회 */
export async function fetchTossSellableQuantity(accountSeq: number, symbol: string): Promise<number | null> {
  type Raw = { sellableQuantity: string };
  const result = await tossGet<Raw>("/api/v1/sellable-quantity", { symbol }, accountSeq);
  return result ? parseFloat(result.sellableQuantity) : null;
}

// ── Order ───────────────────────────────────────────────────────

function parseOrder(raw: Record<string, unknown>): TossOrder {
  const exec = raw.execution as Record<string, string | null>;
  return {
    orderId: raw.orderId as string,
    symbol: raw.symbol as string,
    side: raw.side as OrderSide,
    orderType: raw.orderType as OrderType,
    status: raw.status as OrderStatus,
    price: raw.price ? parseFloat(raw.price as string) : null,
    quantity: parseFloat(raw.quantity as string),
    currency: raw.currency as Currency,
    orderedAt: raw.orderedAt as string,
    filledQuantity: parseFloat((exec.filledQuantity as string) ?? "0"),
    averageFilledPrice: exec.averageFilledPrice ? parseFloat(exec.averageFilledPrice) : null,
    filledAmount: exec.filledAmount ? parseFloat(exec.filledAmount) : null,
  };
}

/** 주문 생성 */
export async function createTossOrder(
  accountSeq: number,
  params: TossCreateOrderParams,
): Promise<{ orderId: string; clientOrderId: string | null } | null> {
  return tossPost("/api/v1/orders", params, accountSeq);
}

/** 미체결 주문 목록 조회 */
export async function fetchTossOpenOrders(accountSeq: number, symbol?: string): Promise<TossOrder[]> {
  const params: Record<string, string> = { status: "OPEN" };
  if (symbol) params.symbol = symbol;
  type Raw = { orders: Record<string, unknown>[] };
  const result = await tossGet<Raw>("/api/v1/orders", params, accountSeq);
  if (!result) return [];
  return result.orders.map(parseOrder);
}

/** 주문 상세 조회 */
export async function fetchTossOrder(accountSeq: number, orderId: string): Promise<TossOrder | null> {
  const result = await tossGet<Record<string, unknown>>(
    `/api/v1/orders/${encodeURIComponent(orderId)}`,
    undefined,
    accountSeq,
  );
  return result ? parseOrder(result) : null;
}

/** 주문 취소 */
export async function cancelTossOrder(
  accountSeq: number,
  orderId: string,
): Promise<{ orderId: string } | null> {
  return tossPost(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {}, accountSeq);
}

/** 주문 정정 */
export async function modifyTossOrder(
  accountSeq: number,
  orderId: string,
  params: { orderType: OrderType; quantity?: string; price?: string },
): Promise<{ orderId: string } | null> {
  return tossPost(`/api/v1/orders/${encodeURIComponent(orderId)}/modify`, params, accountSeq);
}
