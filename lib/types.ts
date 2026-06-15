/** 공용 데이터 타입 */

export interface Candle {
  /** Unix seconds (UTC) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteSnapshot {
  ticker: string;
  price: number;
  prevClose: number;
  changePct: number;
  provider: "yahoo";
}
