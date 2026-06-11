"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  DEFAULT_TICKER,
  formatPrice,
  getSymbol,
  INTERVALS,
  INTERVAL_LABELS,
  type Interval,
} from "@/lib/symbols";
import { MarketFeedProvider, useMarketFeed, type Quote } from "@/lib/market-feed";
import Watchlist from "@/components/Watchlist";
import TickerTape from "@/components/TickerTape";

const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
});

const SpotPanel = dynamic(() => import("@/components/SpotPanel"), {
  ssr: false,
});

const FundamentalsPanel = dynamic(
  () => import("@/components/FundamentalsPanel"),
  { ssr: false },
);

const MarketSharePanel = dynamic(
  () => import("@/components/MarketSharePanel"),
  { ssr: false },
);

type View = "stocks" | "spot" | "fundamentals" | "share";

const SOURCE_LABEL: Record<Quote["source"], string> = {
  ws: "LIVE",
  kis: "LIVE·KIS",
  rest: "SNAPSHOT",
  yahoo: "지연시세",
};

function ConnectionDot() {
  const { connected } = useMarketFeed();
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-[var(--live)]" : "bg-[var(--muted)]"
        }`}
      />
      {connected ? "US 실시간 연결됨" : "US 연결 대기"}
    </span>
  );
}

function SelectedHeader({ ticker }: { ticker: string }) {
  const { quotes } = useMarketFeed();
  const info = getSymbol(ticker);
  const q = quotes[ticker];
  const isUp = (q?.changePct ?? 0) >= 0;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
        {info?.nameKo}
        <span className="ml-2 font-mono text-sm font-normal text-[var(--muted)]">
          {ticker} · {info?.nameEn}
        </span>
      </h1>
      {q && info && (
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-2xl font-bold text-[var(--text)]">
            {formatPrice(q.price, info.currency)}
          </span>
          <span
            className={`text-sm font-semibold ${
              isUp ? "text-[var(--up)]" : "text-[var(--down)]"
            }`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {SOURCE_LABEL[q.source]}
          </span>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [interval, setInterval] = useState<Interval>("1min");
  const [view, setView] = useState<View>("stocks");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 상단 바 */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-sm font-bold tracking-tight text-[var(--text)]">
            MEMORY
          </span>
          <span className="text-sm font-bold tracking-tight text-[var(--accent)]">
            {"//INVESTORS"}
          </span>
          <span className="ml-2 hidden text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] sm:inline">
            메모리 반도체 모니터
          </span>
        </div>
        <div className="flex items-center gap-3">
          <nav
            aria-label="화면 전환"
            className="flex overflow-hidden rounded-md border border-[var(--border)]"
          >
            {(
              [
                ["stocks", "실시간 차트"],
                ["spot", "DRAM 현물가"],
                ["fundamentals", "펀더멘털"],
                ["share", "점유율"],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-current={view === v ? "page" : undefined}
                className={`px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  view === v
                    ? "bg-[var(--panel2)] font-semibold text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <ConnectionDot />
        </div>
      </header>

      <TickerTape />

      {/* 본문 */}
      {view === "spot" ? (
        <div className="flex-1 p-3">
          <SpotPanel />
        </div>
      ) : view === "fundamentals" ? (
        <div className="flex-1 p-3">
          <FundamentalsPanel />
        </div>
      ) : view === "share" ? (
        <div className="flex-1 p-3">
          <MarketSharePanel />
        </div>
      ) : (
      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* 관심종목 */}
        <aside className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 lg:w-64">
          <Watchlist selected={ticker} onSelect={setTicker} />
        </aside>

        {/* 차트 영역 */}
        <main className="flex min-h-[60dvh] flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <SelectedHeader ticker={ticker} />
            <div
              role="tablist"
              aria-label="차트 인터벌"
              className="flex overflow-hidden rounded-md border border-[var(--border)]"
            >
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  role="tab"
                  aria-selected={interval === iv}
                  onClick={() => setInterval(iv)}
                  className={`px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
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
          <div className="min-h-0 flex-1 p-2">
            <CandleChart ticker={ticker} interval={interval} />
          </div>
          <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            미국: Finnhub 실시간 체결 + Twelve Data 과거봉 · 한국: KIS 실시간
            현재가(앱키 설정 시) 또는 Yahoo 지연 시세(15~20분) + Yahoo 과거봉.
            한국 1분봉의 실시간 갱신은 5초 폴링 기반 근사치입니다. 본 화면은 정보
            제공 목적이며 투자 권유가 아닙니다.
          </p>
        </main>
      </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <MarketFeedProvider>
      <Dashboard />
    </MarketFeedProvider>
  );
}
