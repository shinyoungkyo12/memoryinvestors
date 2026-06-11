"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SpotSeries } from "@/app/api/spot/route";

/**
 * DRAM 현물가격 패널
 * - 좌: 선택 품목 가격 추이 라인차트 (지수화 토글: 첫 수집일=100)
 * - 우: 전체 품목 최신가 + 변동률 테이블
 */

const LINE_COLOR = "#d8a24a";

export default function SpotPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [data, setData] = useState<SpotSeries[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [indexed, setIndexed] = useState(true);

  /** 데이터 로드 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/spot");
        const json = (await res.json()) as {
          series?: SpotSeries[];
          error?: string;
        };
        if (cancelled) return;
        if (!json.series) {
          setError(json.error ?? "데이터를 불러오지 못했습니다.");
          return;
        }
        setData(json.series);
        if (json.series.length > 0) setSelected(json.series[0].item);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      timeScale: { borderColor: "#1e2530" },
      autoSize: true,
    });
    const line = chart.addSeries(LineSeries, {
      color: LINE_COLOR,
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = line;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  /** 선택 품목/지수화 변경 → 차트 데이터 갱신 */
  const selectedSeries = useMemo(
    () => data?.find((s) => s.item === selected),
    [data, selected],
  );

  useEffect(() => {
    const line = seriesRef.current;
    if (!line || !selectedSeries) return;
    const base = selectedSeries.points[0]?.price ?? 1;
    line.setData(
      selectedSeries.points.map((p) => ({
        time: Math.floor(Date.parse(`${p.date}T00:00:00Z`) / 1000) as UTCTimestamp,
        value: indexed ? (p.price / base) * 100 : p.price,
      })),
    );
    line.applyOptions({
      priceFormat: indexed
        ? { type: "price", precision: 1, minMove: 0.1 }
        : { type: "price", precision: 3, minMove: 0.001 },
    });
    chartRef.current?.timeScale().fitContent();
  }, [selectedSeries, indexed]);

  const isEmpty = data !== null && data.length === 0;

  return (
    <div className="flex h-full flex-col gap-3 xl:flex-row">
      {/* 차트 */}
      <div className="flex min-h-[50dvh] flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            DRAM 현물가 추이
            {selected && (
              <span className="ml-2 font-normal text-[var(--muted)]">
                {selected}
              </span>
            )}
          </h2>
          <label className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={indexed}
              onChange={(e) => setIndexed(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            지수화 (첫 수집일=100)
          </label>
        </div>
        <div className="relative min-h-0 flex-1 p-2">
          <div ref={containerRef} className="h-full w-full" />
          {!data && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
              현물가 데이터 불러오는 중…
            </div>
          )}
          {(error || isEmpty) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="text-sm text-[var(--muted)]">
                {error || "아직 수집된 현물가 데이터가 없습니다."}
              </span>
              {isEmpty && (
                <span className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
                  GitHub repo → Actions 탭 → &ldquo;DRAM 현물가 수집&rdquo; →
                  Run workflow 버튼으로 첫 수집을 실행하세요. 이후 평일 하루
                  3회 자동 수집됩니다.
                </span>
              )}
            </div>
          )}
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          자료: DRAMeXchange 현물가 (비공식 수집 · 개인 연구용). 가격은 Session
          Average 기준.
        </p>
      </div>

      {/* 품목 테이블 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] xl:w-96">
        <div className="border-b border-[var(--border)] px-4 py-3 font-mono text-sm font-bold text-[var(--text)]">
          품목별 최신가
        </div>
        <ul className="max-h-[60dvh] overflow-y-auto p-2">
          {data?.map((s) => {
            const up = (s.latest.changePct ?? 0) >= 0;
            const active = s.item === selected;
            return (
              <li key={s.item}>
                <button
                  onClick={() => setSelected(s.item)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    active
                      ? "bg-[var(--panel2)] shadow-[inset_2px_0_0_var(--accent)]"
                      : "hover:bg-[var(--panel2)]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[var(--text)]">
                      {s.item}
                    </span>
                    <span className="block font-mono text-[10px] text-[var(--muted)]">
                      {s.latest.date} · {s.points.length}개 수집
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono tabular-nums">
                    <span className="block text-sm text-[var(--text)]">
                      {s.item === "DXI"
                        ? s.latest.price.toLocaleString()
                        : `$${s.latest.price.toFixed(3)}`}
                    </span>
                    {s.latest.changePct !== null && (
                      <span
                        className={`block text-xs ${
                          up ? "text-[var(--up)]" : "text-[var(--down)]"
                        }`}
                      >
                        {up ? "+" : ""}
                        {s.latest.changePct.toFixed(2)}%
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
