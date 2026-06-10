/**
 * 종목 유니버스 정의
 * Phase 1: 미국 상장 메모리 종목 (Finnhub WS + Twelve Data 백필)
 * Phase 2: 한국 종목 (KIS API) — market: "KR" 로 확장 예정
 */

export type Market = "US" | "KR";

export interface SymbolInfo {
  /** 데이터 소스용 티커 */
  ticker: string;
  /** 화면 표시 이름 (한글) */
  nameKo: string;
  /** 영문 이름 */
  nameEn: string;
  market: Market;
  /** 종목 분류 */
  category: "DRAM/HBM" | "NAND/Storage" | "HDD" | "ETF";
}

export const SYMBOLS: SymbolInfo[] = [
  {
    ticker: "MU",
    nameKo: "마이크론",
    nameEn: "Micron Technology",
    market: "US",
    category: "DRAM/HBM",
  },
  {
    ticker: "SNDK",
    nameKo: "샌디스크",
    nameEn: "SanDisk",
    market: "US",
    category: "NAND/Storage",
  },
  {
    ticker: "STX",
    nameKo: "씨게이트",
    nameEn: "Seagate Technology",
    market: "US",
    category: "HDD",
  },
  {
    ticker: "WDC",
    nameKo: "웨스턴디지털",
    nameEn: "Western Digital",
    market: "US",
    category: "HDD",
  },
  {
    ticker: "DRAM",
    nameKo: "라운드힐 메모리 ETF",
    nameEn: "Roundhill Memory ETF",
    market: "US",
    category: "ETF",
  },
];

export const DEFAULT_TICKER = "MU";

export function getSymbol(ticker: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.ticker === ticker);
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
