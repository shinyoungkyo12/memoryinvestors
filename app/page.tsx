"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  DEFAULT_TICKER,
  getSymbol,
  INTERVALS,
  INTERVAL_LABELS,
  type Interval,
} from "@/lib/symbols";
import { MarketFeedProvider, useMarketFeed } from "@/lib/market-feed";
import Watchlist from "@/components/Watchlist";
import TickerTape from "@/components/TickerTape";

const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
});

function ConnectionDot() {
  const { connected } = useMarketFeed();
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-[var(--live)]" : "bg-[var(--muted)]"
        }`}
      />
      {connected ? "실시간 연결됨" : "연결 대기"}
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
      <h1 className="font-mono text-xl font-bold tracking-tight text-[var(--text)]">
        {ticker}
        <span className="ml-2 text-sm font-normal text-[var(--muted)]">
          {info?.nameKo} · {info?.nameEn}
        </span>
      </h1>
      {q && (
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-2xl font-bold text-[var(--text)]">
            ${q.price.toFixed(2)}
          </span>
          <span
            className={`text-sm font-semibold ${
              isUp ? "text-[var(--up)]" : "text-[var(--down)]"
            }`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {q.source === "ws" ? "live" : "snapshot"}
          </span>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [interval, setInterval] = useState<Interval>("1min");

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
            메모리 반도체 모니터 · Phase 1
          </span>
        </div>
        <ConnectionDot />
      </header>

      <TickerTape />

      {/* 본문 */}
      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* 관심종목 */}
        <aside className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 lg:w-60">
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
            시세: Finnhub 실시간 체결(WebSocket) · 과거 봉: Twelve Data. 무료 API
            한도(분당 8회)로 인터벌을 빠르게 전환하면 일시적으로 로드가 지연될 수
            있습니다. 본 화면은 정보 제공 목적이며 투자 권유가 아닙니다.
          </p>
        </main>
      </div>
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
