"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  MA_COLORS,
  MA_PERIODS,
  INTERVAL_LABELS,
  type Interval,
} from "@/lib/symbols";
import type { OverseasNightResponse } from "@/app/api/overseas-night/route";
import type { Candle } from "@/lib/types";

/**
 * 해외 야간시세 차트 — 독일 프랑크푸르트 GDR(EUR)을 원화 환산해 표시.
 * 삼성전자·SK하이닉스 한정. 15분/1시간/일봉만(주봉 제외 — GDR 야간 흐름 목적).
 * 실거래가 아닌 추정값 명시.
 */

const NIGHT_INTERVALS: Interval[] = ["15min", "1h", "1day"];

function sma(candles: Candle[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1)
      out.push({ time: candles[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

export default function OverseasNightChart({ ticker }: { ticker: string }) {
  const [interval, setInterval] = useState<Interval>("1day");
  const [data, setData] = useState<OverseasNightResponse | null>(null);
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const maRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  /** 데이터 로드 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData(null);
      setError("");
      try {
        const res = await fetch(
          `/api/overseas-night?ticker=${ticker}&interval=${interval}`,
        );
        const json = (await res.json()) as OverseasNightResponse;
        if (cancelled) return;
        if (!json.available) {
          setError(json.error ?? "해외 야간시세를 불러오지 못했습니다.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, interval]);

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
      rightPriceScale: { borderColor: "#1e2530" },
      timeScale: { borderColor: "#1e2530", timeVisible: interval !== "1day" },
      autoSize: true,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#F04452",
      downColor: "#3182F6",
      borderUpColor: "#F04452",
      borderDownColor: "#3182F6",
      wickUpColor: "#F04452",
      wickDownColor: "#3182F6",
    });
    for (const p of MA_PERIODS) {
      maRef.current.set(
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
    candleRef.current = candles;
    const maMap = maRef.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      maMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 데이터 반영 */
  useEffect(() => {
    const cs = candleRef.current;
    if (!cs || !data?.candles.length) return;
    cs.setData(
      data.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    for (const p of MA_PERIODS) {
      maRef.current.get(p)?.setData(sma(data.candles, p));
    }
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      {/* 안내 + 인터벌 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
            해외 야간시세
          </span>
          {data?.krwPrice != null && (
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono tabular-nums">
              <span className="text-lg font-bold text-[var(--text)]">
                ₩{data.krwPrice.toLocaleString("ko-KR")}
              </span>
              {data.changePct != null && (
                <span
                  className={`text-sm font-semibold ${
                    data.changePct >= 0
                      ? "text-[var(--up)]"
                      : "text-[var(--down)]"
                  }`}
                >
                  {data.changePct >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(data.changePct).toFixed(2)}%
                </span>
              )}
              {data.eurPrice != null && (
                <span className="text-[11px] text-[var(--muted)]">
                  GDR €{data.eurPrice.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {data.eurKrw != null &&
                    ` · EUR/KRW ${data.eurKrw.toLocaleString("ko-KR")}`}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
          {NIGHT_INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-2.5 py-1 font-mono text-xs transition-colors ${
                interval === iv
                  ? "bg-[var(--panel2)] font-semibold text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 p-2">
        <div ref={containerRef} className="h-full w-full" />
        {!data && !error && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-sm text-[var(--muted)]">
            독일장(GDR) 시세 불러오는 중…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center font-mono text-xs text-[var(--muted)]">
            {error}
          </div>
        )}
      </div>

      <p className="border-t border-[var(--border)] px-3 py-2 text-[10px] leading-relaxed text-[var(--muted)]">
        독일 프랑크푸르트 거래소(XFRA) 상장 GDR을 그대로 가져와 원화로 환산한
        값입니다(거래시간 대략 16:00~04:00 KST). 등락률은 GDR 자체 기준. 환율·
        유동성 차이로 다음 날 시초가와 오차가 있을 수 있으며, 투자 참고용입니다.
      </p>
    </div>
  );
}
