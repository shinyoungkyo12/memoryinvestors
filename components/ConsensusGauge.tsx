"use client";

import { useEffect, useState } from "react";
import type { ConsensusRow } from "@/app/api/consensus/route";
import { getSymbol, formatPrice } from "@/lib/symbols";

/**
 * 증권사 목표가 컨센서스 — 최고 / 평균 / 최저 (Toss 형식)
 * - 시각화 막대 없이 3단(최고·평균·최저) + 각 상승여력%
 * - 한국(₩)·미국($) 통화 자동 처리, 애널리스트 수·투자의견 표기
 * - 데이터 없으면 안내. 데이터는 주 2회(월·목) 자동 갱신.
 */

export default function ConsensusGauge({ ticker }: { ticker: string }) {
  const [row, setRow] = useState<ConsensusRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/consensus");
        const json = (await res.json()) as { rows?: ConsensusRow[] };
        if (cancelled) return;
        setRow(json.rows?.find((r) => r.ticker === ticker) ?? null);
      } catch {
        /* 무시 */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!loaded) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="font-mono text-xs text-[var(--muted)]">
          컨센서스 불러오는 중…
        </div>
      </div>
    );
  }

  const mean = row?.target_mean ?? row?.target_price ?? null;
  if (!row || mean == null || row.current_price == null) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="mb-1 font-mono text-sm font-bold text-[var(--text)]">
          증권사 목표가 컨센서스
        </div>
        <div className="font-mono text-xs leading-relaxed text-[var(--muted)]">
          아직 수집된 컨센서스가 없습니다. 주 2회(월·목) 자동 갱신되며, 한국·미국
          개별주의 애널리스트 목표주가(최고·평균·최저)를 표시합니다.
        </div>
      </div>
    );
  }

  const currency = getSymbol(ticker)?.currency ?? "KRW";
  const cur = row.current_price;
  const fmt = (v: number) => formatPrice(v, currency);
  const upsideOf = (v: number) =>
    cur > 0 ? ((v - cur) / cur) * 100 : 0;

  // 최고/평균/최저 — 값이 없으면 평균으로 대체(단일치만 있는 과거 데이터 호환)
  const high = row.target_high ?? mean;
  const low = row.target_low ?? mean;

  const levels = [
    { label: "최고", value: high, accent: "var(--up)" },
    { label: "평균", value: mean, accent: "var(--accent)" },
    { label: "최저", value: low, accent: "var(--down)" },
  ];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-[var(--text)]">
          증권사 목표가 컨센서스
        </span>
        {row.opinion && (
          <span className="rounded border border-[var(--accent)]/40 px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]">
            {row.opinion}
          </span>
        )}
      </div>

      {/* 현재가 */}
      <div className="mb-3 flex items-baseline justify-between border-b border-[var(--border)] pb-3">
        <span className="font-mono text-[11px] text-[var(--muted)]">현재가</span>
        <span className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
          {fmt(cur)}
        </span>
      </div>

      {/* 최고 / 평균 / 최저 */}
      <ul className="flex flex-col gap-2.5">
        {levels.map(({ label, value, accent }) => {
          const up = upsideOf(value);
          const isUp = up >= 0;
          return (
            <li
              key={label}
              className="flex items-center justify-between gap-2"
            >
              <span
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold"
                style={{ color: accent, backgroundColor: `${accent}1a` }}
              >
                {label}
              </span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="font-mono text-base font-bold text-[var(--text)]">
                  {fmt(value)}
                </span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    isUp ? "text-[var(--up)]" : "text-[var(--down)]"
                  }`}
                >
                  {isUp ? "+" : ""}
                  {up.toFixed(1)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-[var(--border)] pt-2 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
        자료: Yahoo Finance 애널리스트 컨센서스
        {row.analyst_count ? ` · ${row.analyst_count}개사` : ""} ·{" "}
        {row.captured_at?.slice(0, 10)} 기준 · 정보 제공 목적, 투자 권유 아님
      </div>
    </div>
  );
}
