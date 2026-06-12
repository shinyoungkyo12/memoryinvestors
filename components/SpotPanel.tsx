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
 * - 상단: 선택 품목의 기간별 변화율 카드 (1주/1개월/1분기/1년 전 대비)
 * - 좌: 가격 추이 라인차트 (지수화 토글)
 * - 우: 전체 품목 최신가 테이블
 * 데이터 결측 시 "부재(기준일)"로 명시 (추정치 표시 안 함)
 */

const LINE_COLOR = "#d8a24a";

/** 변화율 비교 구간: 목표 과거일 ± 허용오차(일) */
const HORIZONS = [
  { label: "1주 전 대비", days: 7, tol: 4 },
  { label: "1개월 전 대비", days: 30, tol: 8 },
  { label: "1분기 전 대비", days: 91, tol: 15 },
  { label: "1년 전 대비", days: 365, tol: 31 },
] as const;

const dayMs = 86_400_000;

function findNearest(
  points: SpotSeries["points"],
  targetDate: string,
  tolDays: number,
) {
  const target = Date.parse(targetDate);
  let best: { price: number; date: string; gap: number } | null = null;
  for (const p of points) {
    const gap = Math.abs(Date.parse(p.date) - target) / dayMs;
    if (gap <= tolDays && (!best || gap < best.gap)) {
      best = { price: p.price, date: p.date, gap };
    }
  }
  return best;
}

function ChangeCards({ series }: { series: SpotSeries }) {
  const latest = series.latest;
  const latestT = Date.parse(latest.date);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {HORIZONS.map((h) => {
        const targetDate = new Date(latestT - h.days * dayMs)
          .toISOString()
          .slice(0, 10);
        const base = findNearest(series.points, targetDate, h.tol);
        const pct = base ? ((latest.price - base.price) / base.price) * 100 : null;
        const up = (pct ?? 0) >= 0;
        return (
          <div
            key={h.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
          >
            <div className="font-mono text-[11px] text-[var(--muted)]">
              {h.label}
            </div>
            {pct !== null && base ? (
              <>
                <div
                  className={`font-mono text-xl font-bold tabular-nums ${
                    up ? "text-[var(--up)]" : "text-[var(--down)]"
                  }`}
                >
                  {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[var(--muted)]">
                  {base.price.toFixed(3)} → {latest.price.toFixed(3)} ({base.date})
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-xl font-bold text-[var(--muted)]">
                  부재
                </div>
                <div className="font-mono text-[11px] text-[var(--muted)]">
                  ({targetDate} 기준 데이터 없음)
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SpotPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [data, setData] = useState<SpotSeries[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [defaultItem, setDefaultItem] = useState<string>("");
  const [indexed, setIndexed] = useState(false);

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
        if (json.series.length > 0) {
          // 기본 선택: 데이터가 가장 긴 품목 (장기 추세 우선)
          const longest = [...json.series].sort(
            (a, b) => b.points.length - a.points.length,
          )[0];
          setSelected(longest.item);
          setDefaultItem(longest.item);
        }
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
      pointMarkersVisible: true,
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
    <div className="flex flex-col gap-3">
      {/* 변화율 카드 */}
      {selectedSeries && <ChangeCards series={selectedSeries} />}

      <div className="flex flex-col gap-3 xl:flex-row">
        {/* 차트 */}
        <div className="flex flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-mono text-sm font-bold text-[var(--text)]">
              메모리 현물가 추이
              {selected && (
                <span className="ml-2 font-normal text-[var(--muted)]">
                  {selected}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={indexed}
                  onChange={(e) => setIndexed(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                지수화 (첫 데이터=100)
              </label>
              <button
                onClick={() => {
                  setSelected(defaultItem);
                  setIndexed(false);
                  chartRef.current?.timeScale().fitContent();
                }}
                className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                ⟲ 초기화
              </button>
            </div>
          </div>
          <div className="relative h-[45dvh] p-2 xl:h-auto xl:min-h-[28rem] xl:flex-1">
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
                    Run workflow 버튼으로 첫 수집을 실행하세요.
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            일별 품목(DRAM·NAND 등): DRAMeXchange 현물가 자동 수집 (Session Average) ·
            &ldquo;고정거래가(월별·보도치)&rdquo; 품목: 언론 보도된 월별
            계약가격으로 장기 추세 참고용 (data/spot-history.json에 매월 추가).
            개인 연구용.
          </p>
        </div>

        {/* 품목 테이블 (확대) */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] xl:w-[28rem]">
          <div className="border-b border-[var(--border)] px-4 py-3 font-mono text-sm font-bold text-[var(--text)]">
            품목별 최신가
          </div>
          <ul className="max-h-[60dvh] overflow-y-auto p-2 xl:max-h-[34rem]">
            {data?.map((s) => {
              const up = (s.latest.changePct ?? 0) >= 0;
              const active = s.item === selected;
              return (
                <li key={s.item}>
                  <button
                    onClick={() => setSelected(s.item)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                      active
                        ? "bg-[var(--panel2)] shadow-[inset_2px_0_0_var(--accent)]"
                        : "hover:bg-[var(--panel2)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--text)]">
                        {s.item}
                      </span>
                      <span className="block font-mono text-[11px] text-[var(--muted)]">
                        {s.latest.date} · {s.points.length}개 수집
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono tabular-nums">
                      <span className="block text-base font-semibold text-[var(--text)]">
                        {s.item === "DXI"
                          ? s.latest.price.toLocaleString()
                          : `$${s.latest.price.toFixed(3)}`}
                      </span>
                      {s.latest.changePct !== null && (
                        <span
                          className={`block text-sm ${
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
    </div>
  );
}
