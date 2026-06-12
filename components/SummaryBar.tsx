"use client";

import { useEffect, useState } from "react";
import { useMarketFeed } from "@/lib/market-feed";
import { formatPrice, getSymbol } from "@/lib/symbols";
import type { SummaryData } from "@/app/api/summary/route";

/**
 * 오늘의 메모리 요약 바 — 티커 테이프 아래 상시 노출
 * [수집상태●] [현물가 헤드라인] [핵심 3종목] [이번주 수주이슈]
 * 각 칩 클릭 → 해당 탭 이동. 신선도: 초록=2일 내, 노랑=5일 내, 빨강=지연
 */

type View = "stocks" | "spot" | "fundamentals" | "share";

interface Props {
  onNavigate: (view: View) => void;
}

const KEY_TICKERS = ["005930", "000660", "MU"];

function freshness(lastDate: string): { color: string; label: string } {
  const days = (Date.now() - Date.parse(lastDate)) / 86_400_000;
  if (days <= 2) return { color: "bg-[var(--live)]", label: "최신" };
  if (days <= 5) return { color: "bg-[#e8d44d]", label: "수집 지연" };
  return { color: "bg-[var(--up)]", label: "수집 중단 의심" };
}

function Chip({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-xs transition-colors hover:border-[var(--accent)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {children}
    </button>
  );
}

function Pct({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={up ? "text-[var(--up)]" : "text-[var(--down)]"}>
      {up ? "▲" : "▼"}
      {Math.abs(v).toFixed(2)}%
    </span>
  );
}

export default function SummaryBar({ onNavigate }: Props) {
  const { quotes } = useMarketFeed();
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/summary");
        if (!res.ok) return;
        const json = (await res.json()) as SummaryData;
        if (!cancelled) setData(json);
      } catch {
        // 요약 실패해도 본문에는 영향 없음
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fresh = data?.spot ? freshness(data.spot.lastDate) : null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
        오늘의 메모리
      </span>

      {/* 현물가 헤드라인 + 신선도 */}
      {data?.spot && (
        <Chip
          onClick={() => onNavigate("spot")}
          title={`마지막 수집: ${data.spot.lastDate} (${fresh?.label})`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${fresh?.color}`} />
          {data.spot.headlineItem ? (
            <>
              <span className="text-[var(--muted)]">
                {data.spot.headlineItem.replace(/\s*\(.*?\)\s*/, " ").slice(0, 14)}
              </span>
              <Pct v={data.spot.headlineChangePct} />
              <span className="text-[var(--muted)]">
                품목 {data.spot.upCount}↑ {data.spot.downCount}↓
              </span>
            </>
          ) : (
            <span className="text-[var(--muted)]">
              현물가 수집 {data.spot.lastDate}
            </span>
          )}
        </Chip>
      )}

      {/* 핵심 종목 */}
      {KEY_TICKERS.map((t) => {
        const q = quotes[t];
        const info = getSymbol(t);
        if (!q || !info) return null;
        return (
          <Chip key={t} onClick={() => onNavigate("stocks")}>
            <span className="text-[var(--muted)]">{info.nameKo}</span>
            <span className="text-[var(--text)]">
              {formatPrice(q.price, info.currency)}
            </span>
            <Pct v={q.changePct} />
          </Chip>
        );
      })}

      {/* 수주이슈 */}
      {data && (
        <Chip onClick={() => onNavigate("fundamentals")}>
          <span className="text-[var(--muted)]">이번주 수주이슈</span>
          <span
            className={
              data.eventsThisWeek > 0
                ? "font-bold text-[var(--accent)]"
                : "text-[var(--text)]"
            }
          >
            {data.eventsThisWeek}건
          </span>
          <span className="text-[var(--muted)]">→</span>
        </Chip>
      )}
    </div>
  );
}
