/**
 * 메모리 인덱스 구성종목 상수
 *
 * ⚠️ 발행주식수(sharesOutstanding)와 기준일 종가(baseClose)는
 *    공개 자료 기반 값이며, 분기 보고서 발표 시 갱신 필요(검증 주석 참조).
 *    지수 계산은 "기준일 대비 수익률 가중" 방식이 기본이라
 *    발행주식수 절대값 오차에 강건하지만, 시총가중 모드에서는 영향이 있음.
 *
 * 기준일(BASE_DATE): 지수 = 1000 으로 시작하는 날짜.
 * ETF(442580, 0181B0)는 지수에서 제외 — 구성종목에 포함하지 않음.
 */

export interface IndexConstituent {
  ticker: string;
  nameKo: string;
  market: "US" | "KR";
  currency: "USD" | "KRW";
  /** 발행주식수 (백만 주). 출처: 각 사 분기보고서/공시 — 검증 필요 */
  sharesOutMillion: number;
  /** 발행주식수 출처 메모 */
  sharesSource: string;
}

/** 지수 기준일 — 이 날짜의 지수를 1000으로 정규화 */
export const BASE_DATE = "2025-01-02";

/** 기준 지수값 */
export const BASE_INDEX = 1000;

/**
 * 구성종목 6개 (ETF 제외)
 * sharesOutMillion은 시총가중 모드에서만 사용. 수익률가중 모드에선 불필요.
 */
export const INDEX_CONSTITUENTS: IndexConstituent[] = [
  {
    ticker: "005930",
    nameKo: "삼성전자",
    market: "KR",
    currency: "KRW",
    sharesOutMillion: 5969, // 보통주 약 59.69억 주
    sharesSource: "삼성전자 분기보고서 보통주 발행주식총수(약 59.69억) — 검증 필요",
  },
  {
    ticker: "000660",
    nameKo: "SK하이닉스",
    market: "KR",
    currency: "KRW",
    sharesOutMillion: 728,
    sharesSource: "SK하이닉스 발행주식총수(약 7.28억) — 검증 필요",
  },
  {
    ticker: "MU",
    nameKo: "마이크론",
    market: "US",
    currency: "USD",
    sharesOutMillion: 1120,
    sharesSource: "Micron 10-Q shares outstanding(약 11.2억) — 검증 필요",
  },
  {
    ticker: "SNDK",
    nameKo: "샌디스크",
    market: "US",
    currency: "USD",
    sharesOutMillion: 145,
    sharesSource: "SanDisk 분리상장 후 발행주식수(약 1.45억) — 검증 필요",
  },
  {
    ticker: "STX",
    nameKo: "씨게이트",
    market: "US",
    currency: "USD",
    sharesOutMillion: 213,
    sharesSource: "Seagate 10-Q shares outstanding(약 2.13억) — 검증 필요",
  },
  {
    ticker: "WDC",
    nameKo: "웨스턴디지털",
    market: "US",
    currency: "USD",
    sharesOutMillion: 349,
    sharesSource: "Western Digital 10-Q shares outstanding(약 3.49억) — 검증 필요",
  },
];

export const INDEX_TICKERS = INDEX_CONSTITUENTS.map((c) => c.ticker);

/** 종목당 비중 상한 (하이브리드 가중 — 나스닥100 방식) */
export const WEIGHT_CAP = 0.3;
