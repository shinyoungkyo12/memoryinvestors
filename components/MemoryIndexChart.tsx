"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
} from "lightweight-charts";
import type {
  IndexHistoryResponse,
  IndexHistoryPoint,
  MemberPoint,
} from "@/app/api/index-history/route";

/**
 * 메모리 반도체 지수 — 일봉 차트
 * - 일봉 전용 (주봉 없음)
 * - 호버 시 그 시점의 구성종목별 종가 + 전일 대비 등락률 표시
 * - 기준일(첫 공통 거래일)=1000, 수익률 동일가중
 */

const UP = "#F04452";
const DOWN = "#3182F6";

function fmtClose(m: MemberPoint): string {
  if (m.currency === "KRW") {
    return `₩${Math.round(m.close).toLocaleString("ko-KR")}`;
  }
  return `$${m.close.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function MemoryIndexChart({
  onSelectStock,
}: {
  /** 구성종목 클릭 시 호출 — 실시간 차트의 해당 종목으로 이동 */
  onSelectStock?: (ticker: string) => void;
}) {
  const [data, setData] = useState<IndexHistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<IndexHistoryPoint | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const pointByDate = useRef<Map<string, IndexHistoryPoint>>(new Map());

  /** 데이터 로드 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/index-history");
        const json = (await res.json()) as IndexHistoryResponse;
        if (cancelled) return;
        if (!json.points) {
          setError("지수 데이터를 불러오지 못했습니다.");
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
      timeScale: { borderColor: "#1e2530", timeVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: "#3a4252", width: 1, style: 2, labelVisible: true },
        horzLine: { color: "#3a4252", width: 1, style: 2, labelVisible: true },
      },
      autoSize: true,
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: UP,
      topColor: "rgba(240,68,82,0.25)",
      bottomColor: "rgba(240,68,82,0.0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = area;

    const onMove = (param: MouseEventParams) => {
      if (!param.time) {
        setHover(null);
        return;
      }
      const t = param.time as UTCTimestamp;
      const date = new Date(t * 1000).toISOString().slice(0, 10);
      setHover(pointByDate.current.get(date) ?? null);
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  /** 데이터 → 차트 반영 */
  useEffect(() => {
    const area = seriesRef.current;
    if (!area || !data?.points.length) return;

    const map = new Map<string, IndexHistoryPoint>();
    const seriesData = data.points.map((p) => {
      map.set(p.date, p);
      return {
        time: (Date.parse(`${p.date}T00:00:00Z`) / 1000) as UTCTimestamp,
        value: p.value,
      };
    });
    pointByDate.current = map;

    const first = data.points[0].value;
    const last = data.points[data.points.length - 1].value;
    const up = last >= first;
    area.applyOptions({
      lineColor: up ? UP : DOWN,
      topColor: up ? "rgba(240,68,82,0.25)" : "rgba(49,130,246,0.25)",
      bottomColor: up ? "rgba(240,68,82,0.0)" : "rgba(49,130,246,0.0)",
    });
    area.setData(seriesData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const latest = data?.points.at(-1) ?? null;

  /** 전일·전월·전년 대비 등락 (일봉 시계열에서 N거래일 전과 비교) */
  const changes = useMemo(() => {
    const pts = data?.points;
    if (!pts || pts.length < 2) return null;
    const last = pts[pts.length - 1].value;
    if (last <= 0) return null;
    const pick = (daysBack: number): number | null => {
      const idx = pts.length - 1 - daysBack;
      if (idx < 0) return null;
      const base = pts[idx].value;
      return base > 0 ? ((last - base) / base) * 100 : null;
    };
    return {
      day: pick(1), // 전일(직전 거래일)
      month: pick(21), // 약 1개월(21 거래일)
      year: pick(252), // 약 1년(252 거래일)
    };
  }, [data]);

  const shownPoint = hover ?? latest;
  const isEmpty = data !== null && data.points.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* 지수 설명 배너 — 이 지수가 무엇인지 명시 */}
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] px-4 py-2.5">
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          <span className="font-semibold text-[var(--text)]">
            메모리 반도체 지수란?
          </span>{" "}
          나스닥 지수처럼, 메모리 반도체에 해당하는 종목들(삼성전자·SK하이닉스·마이크론·샌디스크·씨게이트·웨스턴디지털,
          ETF 제외)의 주가를 한데 묶어{" "}
          <span className="text-[var(--text)]">이 사이트가 자체적으로 지수화</span>
          한 값입니다. 특정 기관의 공식 지수가 아니며, 메모리 섹터 전체의 흐름을
          한눈에 보기 위한 참고용 지표입니다.
        </p>
      </div>

      {/* 헤더: 지수값 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            <span className="text-[var(--accent)]">●</span>
            메모리 반도체 지수
            <span className="rounded border border-[var(--border)] px-1 py-0.5 text-[9px] normal-case tracking-normal">
              자체 산출 · 기준일 = 1000 · 일봉
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text)]">
              {latest
                ? latest.value.toLocaleString("ko-KR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })
                : "—"}
            </span>
            {changes && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {[
                  { label: "전일", v: changes.day },
                  { label: "전월", v: changes.month },
                  { label: "전년", v: changes.year },
                ].map(({ label, v }) => (
                  <span
                    key={label}
                    className="flex items-baseline gap-1 font-mono text-xs tabular-nums"
                  >
                    <span className="text-[10px] text-[var(--muted)]">
                      {label}
                    </span>
                    {v === null ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      <span
                        className={
                          v >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"
                        }
                      >
                        {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        {/* 차트 */}
        <div className="relative flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2">
          <div className="h-[48dvh] w-full xl:h-[420px]">
            <div ref={containerRef} className="h-full w-full" />
          </div>
          {!data && !error && (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-sm text-[var(--muted)]">
              지수 시계열 불러오는 중…
            </div>
          )}
          {(error || isEmpty) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="text-sm text-[var(--muted)]">
                {error || "아직 지수 데이터가 없습니다."}
              </span>
              {data && data.missing.length > 0 && (
                <span className="font-mono text-xs text-[var(--muted)]">
                  데이터 부재: {data.missing.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 우: 구성종목 종가/등락 (호버 시 해당 시점, 아니면 최신) */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] xl:w-[320px]">
          <div className="border-b border-[var(--border)] px-4 py-2.5">
            <div className="font-mono text-xs font-bold text-[var(--text)]">
              구성종목 종가 · 전일 대비
            </div>
            <div className="font-mono text-[10px] text-[var(--muted)]">
              {shownPoint
                ? `${shownPoint.date} 기준${hover ? " (호버)" : " (최신)"}`
                : "차트에 마우스를 올리면 해당 시점 표시"}
            </div>
          </div>
          <ul className="p-2">
            {shownPoint && shownPoint.members.length > 0 ? (
              shownPoint.members.map((m) => {
                const up = (m.changePct ?? 0) >= 0;
                return (
                  <li key={m.ticker}>
                    <button
                      onClick={() => onSelectStock?.(m.ticker)}
                      title={`${m.nameKo} 실시간 차트로 이동`}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--panel2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    >
                      <span className="flex items-center gap-1 text-sm text-[var(--text)]">
                        {m.nameKo}
                        <span
                          aria-hidden="true"
                          className="text-[var(--muted)]"
                        >
                          ›
                        </span>
                      </span>
                      <span className="flex flex-col items-end">
                        <span className="font-mono text-sm tabular-nums text-[var(--text)]">
                          {fmtClose(m)}
                        </span>
                        {m.changePct !== null && (
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              up ? "text-[var(--up)]" : "text-[var(--down)]"
                            }`}
                          >
                            {up ? "▲" : "▼"} {Math.abs(m.changePct).toFixed(2)}%
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-6 text-center font-mono text-xs text-[var(--muted)]">
                데이터 대기 중
              </li>
            )}
          </ul>
          <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] leading-relaxed text-[var(--muted)]">
            ETF 제외 6종목(삼성·하이닉스·MU·SNDK·STX·WDC)의 전일 대비 등락을
            동일가중 평균해 지수를 산출합니다. 수익률 기반이라 환율 영향 없음.
          </p>
        </div>
      </div>
    </div>
  );
}
