/**
 * 종목 유니버스 정의
 * Phase 1: 미국 메모리 종목 (Finnhub WS + Twelve Data 백필)
 * Phase 2: 한국 종목 (KIS API 실시간 + Yahoo 폴백/과거봉)
 */

export type Market = "US" | "KR";
export type Currency = "USD" | "KRW";

export interface SymbolInfo {
  /** 내부 식별자 겸 표시 티커 (KR은 종목코드) */
  ticker: string;
  /** Yahoo Finance 심볼 (KR 과거봉/폴백 시세용) */
  yahooTicker?: string;
  /** 화면 표시 이름 (한글) */
  nameKo: string;
  /** 영문 이름 */
  nameEn: string;
  market: Market;
  currency: Currency;
  /** 종목 분류 */
  category: "DRAM/HBM" | "NAND/Storage" | "HDD" | "ETF";
}

export const SYMBOLS: SymbolInfo[] = [
  // ── 한국 (Phase 2) ──────────────────────────────
  {
    ticker: "005930",
    yahooTicker: "005930.KS",
    nameKo: "삼성전자",
    nameEn: "Samsung Electronics",
    market: "KR",
    currency: "KRW",
    category: "DRAM/HBM",
  },
  {
    ticker: "000660",
    yahooTicker: "000660.KS",
    nameKo: "SK하이닉스",
    nameEn: "SK hynix",
    market: "KR",
    currency: "KRW",
    category: "DRAM/HBM",
  },
  {
    ticker: "442580",
    yahooTicker: "442580.KS",
    nameKo: "PLUS 글로벌HBM반도체",
    nameEn: "PLUS Global HBM Semiconductor",
    market: "KR",
    currency: "KRW",
    category: "ETF",
  },
  {
    ticker: "0181B0",
    yahooTicker: "0181B0.KS",
    nameKo: "HANARO 미국AI메모리반도체TOP4+",
    nameEn: "HANARO US AI Memory Top4+",
    market: "KR",
    currency: "KRW",
    category: "ETF",
  },
  // ── 미국 (Phase 1) ──────────────────────────────
  {
    ticker: "MU",
    nameKo: "마이크론",
    nameEn: "Micron Technology",
    market: "US",
    currency: "USD",
    category: "DRAM/HBM",
  },
  {
    ticker: "SNDK",
    nameKo: "샌디스크",
    nameEn: "SanDisk",
    market: "US",
    currency: "USD",
    category: "NAND/Storage",
  },
  {
    ticker: "STX",
    nameKo: "씨게이트",
    nameEn: "Seagate Technology",
    market: "US",
    currency: "USD",
    category: "HDD",
  },
  {
    ticker: "WDC",
    nameKo: "웨스턴디지털",
    nameEn: "Western Digital",
    market: "US",
    currency: "USD",
    category: "HDD",
  },
  {
    ticker: "DRAM",
    nameKo: "라운드힐 메모리 ETF",
    nameEn: "Roundhill Memory ETF",
    market: "US",
    currency: "USD",
    category: "ETF",
  },
];

export const US_SYMBOLS = SYMBOLS.filter((s) => s.market === "US");
export const KR_SYMBOLS = SYMBOLS.filter((s) => s.market === "KR");

export const DEFAULT_TICKER = "000660";

export function getSymbol(ticker: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.ticker === ticker);
}

/** 통화별 가격 포맷 */
export function formatPrice(value: number, currency: Currency): string {
  if (currency === "KRW") return `₩${Math.round(value).toLocaleString("ko-KR")}`;
  return `$${value.toFixed(2)}`;
}

/** 차트 지원 인터벌 */
export const INTERVALS = ["1min", "5min", "15min", "1h", "1day"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_LABELS: Record<Interval, string> = {
  "1min": "1분",
  "5min": "5분",
  "15min": "15분",
  "1h": "1시간",
  "1day": "일봉",
};

/** 인터벌 → 초 단위 (실시간 캔들 집계용) */
export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1min": 60,
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "1day": 86400,
};
