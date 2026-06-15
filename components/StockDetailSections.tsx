"use client";

import { useEffect, useMemo, useState } from "react";
import ConsensusGauge from "@/components/ConsensusGauge";
import EtfHoldingsPanel from "@/components/EtfHoldingsPanel";
import { getSymbol } from "@/lib/symbols";
import type { FundamentalsResponse } from "@/app/api/fundamentals/route";
import type { StockNewsItem } from "@/app/api/stock-news/route";

/**
 * 종목 상세 섹션 (차트 제외) — 컨센서스/ETF 구성 + 재고/DIO + 수주이슈 + 관련기사.
 * 실시간차트 탭과 /stock 상세 페이지에서 공통으로 사용.
 * MarketFeedProvider는 부모가 제공한다고 가정.
 */
export default function StockDetailSections({ ticker }: { ticker: string }) {
  const info = getSymbol(ticker);
  const [fund, setFund] = useState<FundamentalsResponse | null>(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [news, setNews] = useState<StockNewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFundLoading(true);
      try {
        const fRes = await fetch("/api/fundamentals");
        const fJson = (await fRes.json()) as FundamentalsResponse;
        if (!cancelled) setFund(fJson);
      } catch {
        /* 무시 */
      } finally {
        if (!cancelled) setFundLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const isKR = info?.market === "KR";
  const isETF = info?.category === "ETF";

  const inv = fund?.inventory?.[ticker] ?? [];
  const invUnit = fund?.inventoryUnits?.[ticker] ?? "$B";
  const latestInv = inv.at(-1) ?? null;

  const events = useMemo(() => {
    if (!fund?.hbmEvents || !info) return [];
    return fund.hbmEvents.filter(
      (e) =>
        e.companies?.some((c) => c.includes(info.nameKo)) ||
        e.title.includes(info.nameKo),
    );
  }, [fund, info]);

  const relNews = news ?? [];

  if (!info) return null;

  return (
    <div className="flex flex-col gap-3">
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
                    재고자산
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                    {latestInv.inventoryB.toLocaleString("ko-KR")}
                    <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                      {invUnit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-[var(--muted)]">
                    DIO
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                    {latestInv.dio ?? "—"}
                    {latestInv.dio != null && (
                      <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                        일
                      </span>
                    )}
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
