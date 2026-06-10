"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { INTERVAL_SECONDS, type Interval } from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";
import type { Candle } from "@/app/api/candles/route";

/** 한국 시장 관례 색상: 상승=적색, 하락=청색 */
const UP = "#f0445280";
const UP_SOLID = "#F04452";
const DOWN = "#3182f680";
const DOWN_SOLID = "#3182F6";

interface Props {
  ticker: string;
  interval: Interval;
}

export default function CandleChart({ ticker, interval }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const { onTrade } = useMarketFeed();

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

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

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

  /** 실시간 체결 → 현재 봉 집계 */
  useEffect(() => {
    const bucketSec = INTERVAL_SECONDS[interval];

    const unsubscribe = onTrade(ticker, (trade) => {
      const candleSeries = candleSeriesRef.current;
      const volumeSeries = volumeSeriesRef.current;
      if (!candleSeries || !volumeSeries) return;

      const bucket = Math.floor(trade.time / 1000 / bucketSec) * bucketSec;
      const last = lastCandleRef.current;

      let next: Candle;
      if (last && bucket === last.time) {
        next = {
          ...last,
          high: Math.max(last.high, trade.price),
          low: Math.min(last.low, trade.price),
          close: trade.price,
          volume: last.volume + trade.volume,
        };
      } else if (!last || bucket > last.time) {
        next = {
          time: bucket,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.volume,
        };
      } else {
        return; // 과거 버킷 체결(지연 도착)은 무시
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
    });

    return unsubscribe;
  }, [ticker, interval, onTrade]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
          차트 데이터 불러오는 중…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm">
          <span className="text-[var(--muted)]">{errorMsg}</span>
          <span className="text-xs text-[var(--muted)]">
            .env.local의 API 키와 Twelve Data 호출 한도(분당 8회)를 확인하세요.
          </span>
        </div>
      )}
    </div>
  );
}
