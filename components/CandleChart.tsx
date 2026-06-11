"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  getSymbol,
  INTERVAL_SECONDS,
  MA_COLORS,
  MA_PERIODS,
  type Interval,
} from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";
import type { Candle } from "@/lib/types";

/** 한국 시장 관례 색상: 상승=적색, 하락=청색 */
const UP = "#f0445280";
const UP_SOLID = "#F04452";
const DOWN = "#3182f680";
const DOWN_SOLID = "#3182F6";

interface Props {
  ticker: string;
  interval: Interval;
}

/** 단순이동평균 (확정 봉 종가 기준) */
function sma(candles: Candle[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      out.push({
        time: candles[i].time as UTCTimestamp,
        value: sum / period,
      });
    }
  }
  return out;
}

export default function CandleChart({ ticker, interval }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const lastCandleRef = useRef<Candle | null>(null);
  const { onTrade, quotes } = useMarketFeed();

  const symbol = getSymbol(ticker);
  const isKRW = symbol?.currency === "KRW";

  /** 로드 상태: 현재 키와 일치하는 결과가 없으면 loading으로 파생 */
  const loadKey = `${ticker}:${interval}`;
  const [loadResult, setLoadResult] = useState<{
    key: string;
    status: "ready" | "error";
    msg?: string;
  } | null>(null);
  const status: "loading" | "ready" | "error" =
    loadResult?.key === loadKey ? loadResult.status : "loading";
  const errorMsg = loadResult?.key === loadKey ? (loadResult.msg ?? "") : "";

  /** 차트 생성 (1회) */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a93a5",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#1a212e" },
        horzLines: { color: "#1a212e" },
      },
      crosshair: {
        vertLine: { color: "#475063", labelBackgroundColor: "#2b3445" },
        horzLine: { color: "#475063", labelBackgroundColor: "#2b3445" },
      },
      rightPriceScale: { borderColor: "#1e2530" },
      timeScale: {
        borderColor: "#1e2530",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP_SOLID,
      downColor: DOWN_SOLID,
      borderUpColor: UP_SOLID,
      borderDownColor: DOWN_SOLID,
      wickUpColor: UP_SOLID,
      wickDownColor: DOWN_SOLID,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // 이동평균선 5/10/20/60/120
    for (const p of MA_PERIODS) {
      maSeriesRef.current.set(
        p,
        chart.addSeries(LineSeries, {
          color: MA_COLORS[p],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        }),
      );
    }

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    const maMap = maSeriesRef.current;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      maMap.clear();
    };
  }, []);

  /** 통화별 가격 표기 (원화: 정수, 달러: 소수 2자리) */
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({
      priceFormat: isKRW
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
    });
  }, [isKRW, ticker]);

  /** 과거 캔들 로드 (종목/인터벌 변경 시) */
  useEffect(() => {
    let cancelled = false;
    lastCandleRef.current = null;
    const key = `${ticker}:${interval}`;

    (async () => {
      try {
        const res = await fetch(`/api/candles?ticker=${ticker}&interval=${interval}`);
        const json = (await res.json()) as { candles?: Candle[]; error?: string };
        if (cancelled) return;
        if (!json.candles) {
          setLoadResult({
            key,
            status: "error",
            msg: json.error ?? "데이터를 불러오지 못했습니다.",
          });
          return;
        }
        candleSeriesRef.current?.setData(
          json.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        volumeSeriesRef.current?.setData(
          json.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? UP : DOWN,
          })),
        );
        for (const p of MA_PERIODS) {
          maSeriesRef.current.get(p)?.setData(sma(json.candles, p));
        }
        lastCandleRef.current = json.candles.at(-1) ?? null;
        chartRef.current?.timeScale().fitContent();
        setLoadResult({ key, status: "ready" });
      } catch {
        if (!cancelled) {
          setLoadResult({
            key,
            status: "error",
            msg: "네트워크 오류가 발생했습니다.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker, interval]);

  /** 공통: 신규 가격 1건을 현재 봉에 반영 */
  function applyTick(price: number, volume: number, timeMs: number) {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    const bucketSec = INTERVAL_SECONDS[interval];
    const tSec = Math.floor(timeMs / 1000);
    const last = lastCandleRef.current;
    // 주봉: 거래소 주 시작(월요일)이 Unix 주 경계(목요일)와 달라
    // 마지막 봉 시작 +7일 이내면 해당 봉에 병합
    const bucket =
      interval === "1week" && last && tSec < last.time + bucketSec
        ? last.time
        : Math.floor(tSec / bucketSec) * bucketSec;

    let next: Candle;
    if (last && bucket === last.time) {
      next = {
        ...last,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
        volume: last.volume + volume,
      };
    } else if (!last || bucket > last.time) {
      next = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
      };
    } else {
      return; // 과거 버킷(지연 도착)은 무시
    }

    lastCandleRef.current = next;
    candleSeries.update({
      time: next.time as UTCTimestamp,
      open: next.open,
      high: next.high,
      low: next.low,
      close: next.close,
    });
    volumeSeries.update({
      time: next.time as UTCTimestamp,
      value: next.volume,
      color: next.close >= next.open ? UP : DOWN,
    });
  }

  /** 미국: 실시간 체결 → 현재 봉 집계 */
  useEffect(() => {
    if (symbol?.market !== "US") return;
    const unsubscribe = onTrade(ticker, (trade) => {
      applyTick(trade.price, trade.volume, trade.time);
    });
    return unsubscribe;
    // applyTick은 ref 기반이라 의존성 제외 안전
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, interval, onTrade, symbol?.market]);

  /** 한국: 5초 폴링 시세 → 현재 봉 갱신 (거래량은 시세 API에 없어 0 가산) */
  const krQuote = symbol?.market === "KR" ? quotes[ticker] : undefined;
  useEffect(() => {
    if (symbol?.market !== "KR" || !krQuote || status !== "ready") return;
    applyTick(krQuote.price, 0, krQuote.updatedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [krQuote?.price, krQuote?.updatedAt, symbol?.market, status]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px]">
        {MA_PERIODS.map((p) => (
          <span key={p} style={{ color: MA_COLORS[p] }}>
            MA{p}
          </span>
        ))}
      </div>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
          차트 데이터 불러오는 중…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm">
          <span className="text-[var(--muted)]">{errorMsg}</span>
          <span className="text-xs text-[var(--muted)]">
            잠시 후 다른 인터벌을 눌러 다시 시도해 보세요.
          </span>
        </div>
      )}
    </div>
  );
}
