"use client";

import { SYMBOLS } from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";

/**
 * 상단 티커 테이프 — 전 종목 실시간 시세가 흐르는 스트립.
 * prefers-reduced-motion 설정 시 정적 그리드로 대체됩니다(globals.css).
 */
export default function TickerTape() {
  const { quotes } = useMarketFeed();

  const items = SYMBOLS.map((s) => {
    const q = quotes[s.ticker];
    return (
      <span key={s.ticker} className="tape-item">
        <span className="text-[var(--muted)]">{s.ticker}</span>
        <span className="font-semibold text-[var(--text)]">
          {q ? `$${q.price.toFixed(2)}` : "—"}
        </span>
        {q && (
          <span className={q.changePct >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}>
            {q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
        )}
      </span>
    );
  });

  return (
    <div className="tape" aria-hidden="true">
      <div className="tape-track">
        {items}
        {/* 무한 스크롤을 위한 복제 */}
        {SYMBOLS.map((s) => {
          const q = quotes[s.ticker];
          return (
            <span key={`${s.ticker}-dup`} className="tape-item">
              <span className="text-[var(--muted)]">{s.ticker}</span>
              <span className="font-semibold text-[var(--text)]">
                {q ? `$${q.price.toFixed(2)}` : "—"}
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
        })}
      </div>
    </div>
  );
}
