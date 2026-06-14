"use client";

import { useEffect, useState } from "react";
import type { EtfHoldingsResponse } from "@/app/api/etf-holdings/route";

/**
 * ETF 구성종목 패널 — 상세 페이지에서 ETF 종목일 때 표시
 * - 월별 구성종목·비중 (현재 월 기준, 없으면 최근 월 폴백)
 * - 추적 개별종목(삼성·하이닉스·마이크론 등)은 강조
 */

const TRACKED = [
  "삼성전자",
  "SK하이닉스",
  "마이크론",
  "샌디스크",
  "씨게이트",
  "웨스턴디지털",
];

const BAR_COLORS = [
  "#f04452",
  "#3182f6",
  "#4a7c59",
  "#d8a24a",
  "#a16ee8",
  "#5aa9b8",
  "#c77dba",
  "#8a93a5",
  "#6b7280",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

export default function EtfHoldingsPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EtfHoldingsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/etf-holdings?ticker=${ticker}`);
        if (!res.ok) {
          if (!cancelled) setError("구성종목 데이터를 불러오지 못했습니다.");
          return;
        }
        const json = (await res.json()) as EtfHoldingsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="font-mono text-xs text-[var(--muted)]">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="font-mono text-xs text-[var(--muted)]">
          구성종목 불러오는 중…
        </div>
      </div>
    );
  }

  const maxW =
    data.holdings.find((h) => !h.name.includes("기타"))?.weight ??
    data.holdings[0]?.weight ??
    1;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            ETF 구성종목 · 비중
          </h2>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
            {data.issuer} · {data.baseIndex}
          </div>
        </div>
        <div className="text-right">
          <span className="rounded border border-[var(--accent)]/40 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]">
            {monthLabel(data.month)} 기준
          </span>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
            운용사 공시 {data.asOf}
            {data.fallback && " · 당월 미공시(최근월 표시)"}
          </div>
        </div>
      </div>

      <div className="p-4">
        <ul className="flex flex-col gap-2.5">
          {data.holdings.map((h, i) => {
            const tracked = TRACKED.includes(h.name);
            return (
              <li key={h.name}>
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      tracked
                        ? "font-semibold text-[var(--text)]"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {h.name}
                    {tracked && (
                      <span className="ml-1.5 text-[var(--accent)]">●</span>
                    )}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text)]">
                    {h.weight.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--panel2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(h.weight / maxW) * 100}%`,
                      background: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          정기변경: {data.rebalance} · {data.note}
          <br />
          <span className="text-[var(--accent)]">●</span> = 이 대시보드 추적
          개별종목 · 비중은 운용사 공시 기준이며 매월 갱신됩니다. 정보 제공
          목적, 투자 권유 아님.
        </p>
      </div>
    </section>
  );
}
