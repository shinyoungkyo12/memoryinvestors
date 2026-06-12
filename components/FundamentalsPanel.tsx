"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { FundamentalsResponse } from "@/app/api/fundamentals/route";
import type { NewsItem } from "@/app/api/hbm-news/route";

/**
 * 펀더멘털 패널 — 사진 체크리스트의 ②③④ 항목
 *  1) 반도체 재고 수준: 재고($B) 막대 + DIO(재고일수) 라인
 *  2) 엔비디아 가이던스: 분기 매출 실적 막대 + 가이던스 라인
 *  3) HBM 수주 현황: 이벤트 타임라인
 */

const ACCENT = "#d8a24a";
const INV_TICKERS = ["MU", "SNDK", "STX", "WDC"] as const;
const TICKER_NAMES: Record<string, string> = {
  MU: "마이크론",
  SNDK: "샌디스크",
  STX: "씨게이트",
  WDC: "웨스턴디지털",
};

const CHART_OPTS = {
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
  leftPriceScale: { borderColor: "#1e2530", visible: true },
  timeScale: { borderColor: "#1e2530" },
  autoSize: true,
} as const;

const toTs = (d: string) =>
  Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) as UTCTimestamp;

function InventoryChart({
  data,
  ticker,
}: {
  data: FundamentalsResponse["inventory"];
  ticker: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, CHART_OPTS);
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = data[ticker];
    if (!chart || !series) return;

    // 시리즈 재구성 (종목 전환 시 전체 갱신이 가장 단순·안전)
    const bars = chart.addSeries(HistogramSeries, {
      color: "#3b4a63",
      priceScaleId: "right",
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    });
    const dioLine = chart.addSeries(LineSeries, {
      color: ACCENT,
      lineWidth: 2,
      priceScaleId: "left",
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    bars.setData(
      series.map((p) => ({ time: toTs(p.fiscalEnd), value: p.inventoryB })),
    );
    dioLine.setData(
      series
        .filter((p) => p.dio !== null)
        .map((p) => ({ time: toTs(p.fiscalEnd), value: p.dio as number })),
    );
    chart.timeScale().fitContent();
    return () => {
      // 언마운트 시에는 차트 생성 effect의 cleanup(chart.remove)이 먼저 실행되어
      // chart가 이미 파괴됨(chartRef=null) → 시리즈 개별 제거 생략
      if (!chartRef.current) return;
      try {
        chart.removeSeries(bars);
        chart.removeSeries(dioLine);
      } catch {
        // 이미 dispose된 경우 무시
      }
    };
  }, [data, ticker]);

  return <div ref={ref} className="h-64 w-full sm:h-72" />;
}

function NvidiaChart({ data }: { data: FundamentalsResponse["nvidia"] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || data.length === 0) return;
    const chart = createChart(el, {
      ...CHART_OPTS,
      leftPriceScale: { visible: false, borderColor: "#1e2530" },
    });
    const bars = chart.addSeries(HistogramSeries, {
      color: "#4a7c59",
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    });
    const guide = chart.addSeries(LineSeries, {
      color: ACCENT,
      lineWidth: 2,
      lineStyle: 1, // 점선
      pointMarkersVisible: true,
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    });
    bars.setData(
      data
        .filter((p) => p.actualB !== null)
        .map((p) => ({ time: toTs(p.fiscalEnd), value: p.actualB as number })),
    );
    guide.setData(
      data
        .filter((p) => p.guidanceB !== null)
        .map((p) => ({ time: toTs(p.fiscalEnd), value: p.guidanceB as number })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);

  return <div ref={ref} className="h-64 w-full sm:h-72" />;
}

const COMPANY_COLORS: Record<string, string> = {
  삼성전자: "#3182f6",
  SK하이닉스: "#f04452",
  마이크론: "#4a7c59",
  엔비디아: "#76b900",
};

export default function FundamentalsPanel() {
  const [data, setData] = useState<FundamentalsResponse | null>(null);
  const [error, setError] = useState("");
  const [ticker, setTicker] = useState<string>("MU");
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsError, setNewsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fundamentals");
        const json = (await res.json()) as FundamentalsResponse & {
          error?: string;
        };
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** HBM 자동 뉴스 피드 (Google News RSS) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hbm-news");
        const json = (await res.json()) as { items?: NewsItem[]; error?: string };
        if (cancelled) return;
        if (json.items) setNews(json.items);
        else setNewsError(json.error ?? "뉴스를 불러오지 못했습니다.");
      } catch {
        if (!cancelled) setNewsError("뉴스 피드 네트워크 오류");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasInventory = useMemo(
    () => Object.keys(data?.inventory ?? {}).length > 0,
    [data],
  );

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        펀더멘털 데이터 불러오는 중…
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {/* ② 반도체 재고 수준 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            반도체 재고 수준
          </h2>
          <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
            {INV_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => setTicker(t)}
                aria-pressed={ticker === t}
                className={`px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  ticker === t
                    ? "bg-[var(--panel2)] font-semibold text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="p-2">
          <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 px-2 font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3b4a63]" />
              <span className="text-[var(--text)]">막대 = 재고자산 ($B, 우축)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#d8a24a]" />
              <span className="text-[var(--text)]">
                선 = 재고일수 DIO (일, 좌축)
              </span>
            </span>
          </div>
          {hasInventory ? (
            <InventoryChart data={data.inventory} ticker={ticker} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-[var(--muted)]">
              <span>아직 수집된 재고 데이터가 없습니다.</span>
              <span className="text-xs">
                GitHub → Actions → &ldquo;펀더멘털 수집&rdquo; → Run workflow
              </span>
            </div>
          )}
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          {TICKER_NAMES[ticker]} ({ticker}) · 자료: SEC EDGAR 분기 공시.
          재고일수(DIO) = 지금 쌓인 재고가 며칠치 판매분인지 — 선이 내려가면
          재고가 빠르게 소진되는 것(수요 강세·업황 개선 신호), 올라가면 재고
          부담 증가입니다.
        </p>
      </section>

      {/* ④ 엔비디아 가이던스 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            엔비디아 분기 매출: 실적 vs 가이던스
            <span className="ml-2 font-normal text-[var(--muted)]">
              막대: 실적($B) · 점선: 가이던스
            </span>
          </h2>
        </div>
        <div className="p-2">
          {data.nvidia.length > 0 ? (
            <NvidiaChart data={data.nvidia} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-[var(--muted)]">
              <span>아직 수집된 매출 데이터가 없습니다.</span>
              <span className="text-xs">
                GitHub → Actions → &ldquo;펀더멘털 수집&rdquo; → Run workflow
              </span>
            </div>
          )}
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          실적: SEC EDGAR · 가이던스: 실적발표 outlook 중간값
          (data/nvda-guidance.json 수동 관리). 실적이 가이던스를 상회하는 폭이
          좁아지면 모멘텀 둔화 신호.
        </p>
      </section>

      {/* ③ HBM 수주 현황 타임라인 (수동 큐레이션) */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            메모리반도체주식 수주이슈
            <span className="ml-2 font-normal text-[var(--muted)]">
              검증(큐레이션) + 자동(뉴스 분류, 하루 3회)
            </span>
          </h2>
        </div>
        <ol className="max-h-[28rem] overflow-y-auto p-3">
          {data.hbmEvents.map((e) => (
            <li
              key={e.url}
              className="relative border-l border-[var(--border)] pb-4 pl-4 last:pb-1"
            >
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--accent)] bg-[var(--bg)]" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
                  {e.date}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    e.verified
                      ? "border border-[var(--accent)]/50 text-[var(--accent)]"
                      : "border border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {e.verified ? "검증" : "자동"}
                </span>
                {e.companies.map((c) => (
                  <span
                    key={c}
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                    style={{
                      color: COMPANY_COLORS[c] ?? "var(--muted)",
                      border: `1px solid ${COMPANY_COLORS[c] ?? "var(--border)"}40`,
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-sm leading-snug text-[var(--text)]">
                {e.title}
              </p>
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-[var(--muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {e.source} ↗
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* ③-b HBM 관련 최신기사 (자동 수집) */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            메모리반도체주식 관련 기사
            <span className="ml-2 font-normal text-[var(--muted)]">
              자동 수집 · Google News · 30분 갱신
            </span>
          </h2>
        </div>
        <ul className="max-h-[28rem] overflow-y-auto p-3">
          {news === null && !newsError && (
            <li className="py-8 text-center text-sm text-[var(--muted)]">
              뉴스 불러오는 중…
            </li>
          )}
          {newsError && (
            <li className="py-8 text-center text-sm text-[var(--muted)]">
              {newsError}
            </li>
          )}
          {news?.map((n) => (
            <li
              key={n.link}
              className="border-b border-[var(--border)] py-2.5 last:border-0"
            >
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm leading-snug text-[var(--text)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {n.title}
              </a>
              <div className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {n.source} · {n.publishedAt}
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          자동 피드는 노이즈가 섞일 수 있습니다. 중요한 수주 이벤트는 검증 후
          좌측 타임라인(JSON)에 추가하세요.
        </p>
      </section>
    </div>
  );
}
