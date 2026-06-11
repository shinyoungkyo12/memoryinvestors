"use client";

import { SYMBOLS, formatPrice } from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";

/**
 * 상단 티커 테이프 — 전 종목(한국+미국) 실시간 시세가 흐르는 스트립.
 * prefers-reduced-motion 설정 시 정적 표시로 대체됩니다(globals.css).
 */
export default function TickerTape() {
  const { quotes } = useMarketFeed();

  const renderItems = (suffix: string) =>
    SYMBOLS.map((s) => {
      const q = quotes[s.ticker];
      const label = s.market === "KR" ? s.nameKo : s.ticker;
      return (
        <span key={`${s.ticker}${suffix}`} className="tape-item">
          <span className="text-[var(--muted)]">{label}</span>
          <span className="font-semibold text-[var(--text)]">
            {q ? formatPrice(q.price, s.currency) : "—"}
          </span>
          {q && (
            <span
              className={q.changePct >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}
            >
              {q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
            </span>
          )}
        </span>
      );
    });

  return (
    <div className="tape" aria-hidden="true">
      <div className="tape-track">
        {renderItems("")}
        {/* 무한 스크롤을 위한 복제 */}
        {renderItems("-dup")}
      </div>
    </div>
  );
}
