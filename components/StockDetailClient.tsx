"use client";

import { useEffect, useMemo, useState } from "react";
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
import ConsensusGauge from "@/components/ConsensusGauge";
import EtfHoldingsPanel from "@/components/EtfHoldingsPanel";
import type { FundamentalsResponse } from "@/app/api/fundamentals/route";
import type { StockNewsItem } from "@/app/api/stock-news/route";

const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
});

/** 한 종목 관점으로 기존 데이터(시세/차트/컨센서스/재고/수주/기사)를 묶은 상세 화면 */
function StockDetailInner({ ticker }: { ticker: string }) {
  const info = getSymbol(ticker);
  const { quotes } = useMarketFeed();
  const [interval, setInterval] = useState<Interval>("1day");
  const [fund, setFund] = useState<FundamentalsResponse | null>(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [news, setNews] = useState<StockNewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fRes = await fetch("/api/fundamentals");
        const fJson = (await fRes.json()) as FundamentalsResponse;
        if (!cancelled) setFund(fJson);
      } catch {
        /* 무시 — fundLoading 종료로 '데이터 없음' 표시 */
      } finally {
        if (!cancelled) setFundLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 종목별 관련 기사 (전용 API — 종목명으로 검색) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNews(null);
      try {
        const res = await fetch(`/api/stock-news?ticker=${ticker}`);
        const json = (await res.json()) as { items?: StockNewsItem[] };
        if (!cancelled) setNews(json.items ?? []);
      } catch {
        if (!cancelled) setNews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const q = quotes[ticker];
  const isKR = info?.market === "KR";
  const isETF = info?.category === "ETF";

  // 이 종목 재고 시계열
  const inv = fund?.inventory?.[ticker] ?? [];
  const invUnit = fund?.inventoryUnits?.[ticker] ?? "$B";
  const latestInv = inv.at(-1) ?? null;

  // 이 종목이 등장한 수주이슈 (companies 또는 제목에 종목명 포함)
  const events = useMemo(() => {
    if (!fund?.hbmEvents || !info) return [];
    return fund.hbmEvents.filter(
      (e) =>
        e.companies?.some((c) => c.includes(info.nameKo)) ||
        e.title.includes(info.nameKo),
    );
  }, [fund, info]);

  // 관련 기사는 stock-news API가 종목명으로 직접 검색해 반환
  const relNews = news ?? [];

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

      {/* ETF: 구성종목 / 개별주: 컨센서스 + 재고 */}
      {isETF ? (
        <EtfHoldingsPanel ticker={ticker} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {isKR && <ConsensusGauge ticker={ticker} />}

          <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 font-mono text-sm font-bold text-[var(--text)]">
              재고 / 재고일수 (DIO)
            </div>
            {fundLoading ? (
              <div className="font-mono text-xs text-[var(--muted)]">
                재고 데이터 불러오는 중…
              </div>
            ) : latestInv ? (
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="font-mono text-[10px] text-[var(--muted)]">
                    재고자산 ({invUnit})
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                    {latestInv.inventoryB.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-[var(--muted)]">
                    DIO (일)
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                    {latestInv.dio ?? "—"}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-[var(--muted)]">
                  {latestInv.fiscalEnd} 분기
                </div>
              </div>
            ) : (
              <div className="font-mono text-xs leading-relaxed text-[var(--muted)]">
                아직 재고 데이터가 없습니다. 매주 월요일 자동 수집(SEC EDGAR /
                DART)되며, 미국 4종목은 즉시, 한국 2사는 DART_API_KEY 설정 시
                수집됩니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 수주이슈 + 관련기사 2단 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-4 py-2.5 font-mono text-sm font-bold text-[var(--text)]">
            관련 수주이슈
          </div>
          <ul className="max-h-72 overflow-y-auto p-2">
            {fundLoading ? (
              <li className="px-2 py-6 text-center font-mono text-xs text-[var(--muted)]">
                수주이슈 불러오는 중…
              </li>
            ) : events.length > 0 ? (
              events.map((e) => (
                <li
                  key={e.url}
                  className="border-b border-[var(--border)] px-2 py-2 last:border-0"
                >
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {e.title}
                  </a>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {e.date}
                  </span>
                </li>
              ))
            ) : (
              <li className="px-2 py-6 text-center font-mono text-xs text-[var(--muted)]">
                이 종목 관련 수주이슈가 없습니다.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-4 py-2.5 font-mono text-sm font-bold text-[var(--text)]">
            관련 기사
          </div>
          <ul className="max-h-72 overflow-y-auto p-2">
            {news === null ? (
              <li className="px-2 py-6 text-center font-mono text-xs text-[var(--muted)]">
                기사 불러오는 중…
              </li>
            ) : relNews.length > 0 ? (
              relNews.map((n) => (
                <li
                  key={n.link}
                  className="border-b border-[var(--border)] px-2 py-2 last:border-0"
                >
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {n.title}
                  </a>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {n.source} · {n.publishedAt}
                  </span>
                </li>
              ))
            ) : (
              <li className="px-2 py-6 text-center font-mono text-xs text-[var(--muted)]">
                이 종목 관련 기사가 없습니다.
              </li>
            )}
          </ul>
        </section>
      </div>
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
