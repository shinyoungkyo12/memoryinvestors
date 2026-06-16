"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  MarketFeedProvider,
  useMarketFeed,
} from "@/lib/market-feed";
import {
  getSymbol,
  formatPrice,
  INTERVALS,
  INTERVAL_LABELS,
  type Interval,
} from "@/lib/symbols";
import StockDetailSections from "@/components/StockDetailSections";

const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
});

/** 한 종목 관점으로 기존 데이터(시세/차트/컨센서스/재고/수주/기사)를 묶은 상세 화면 */
function StockDetailInner({ ticker }: { ticker: string }) {
  const info = getSymbol(ticker);
  const { quotes } = useMarketFeed();
  const [interval, setInterval] = useState<Interval>("1day");

  const q = quotes[ticker];

  if (!info) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="font-mono text-sm text-[var(--muted)]">
          알 수 없는 종목: {ticker}
        </p>
        <Link
          href="/"
          className="rounded-md border border-[var(--border)] px-4 py-2 font-mono text-xs text-[var(--text)]"
        >
          ← 대시보드로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1200px] flex-col gap-3 p-3">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="font-mono text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← 대시보드
          </Link>
          <h1 className="font-mono text-xl font-bold text-[var(--text)]">
            {info.nameKo}
          </h1>
          <span className="font-mono text-sm text-[var(--muted)]">
            {ticker} · {info.category}
          </span>
        </div>
        {q && (
          <div className="text-right">
            <div className="font-mono text-xl font-bold tabular-nums text-[var(--text)]">
              {formatPrice(q.price, info.currency)}
            </div>
            <div
              className={`font-mono text-sm tabular-nums ${
                q.changePct >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"
              }`}
            >
              {q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
            </div>
          </div>
        )}
      </header>

      {/* 차트 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <span className="font-mono text-sm font-bold text-[var(--text)]">
            가격 차트
          </span>
          <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
            {INTERVALS.map((iv) => (
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
        <div className="h-[44dvh] p-2 lg:h-[380px]">
          <CandleChart ticker={ticker} interval={interval} />
        </div>
      </section>

      <StockDetailSections ticker={ticker} />
    </div>
  );
}

export default function StockDetailClient({ ticker }: { ticker: string }) {
  return (
    <MarketFeedProvider>
      <StockDetailInner ticker={ticker} />
    </MarketFeedProvider>
  );
}
