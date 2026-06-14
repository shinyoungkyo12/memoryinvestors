"use client";

import { useEffect, useState } from "react";
import type { ConsensusRow } from "@/app/api/consensus/route";

/**
 * 목표가 컨센서스 게이지
 * - 현재가 ─────● 목표가 막대 + 상승여력%
 * - ticker로 필터. 데이터 없으면 안내 (수집 전이거나 미국 종목)
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

  if (!row || row.target_price == null || row.current_price == null) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="mb-1 font-mono text-sm font-bold text-[var(--text)]">
          증권사 목표가 컨센서스
        </div>
        <div className="font-mono text-xs leading-relaxed text-[var(--muted)]">
          아직 수집된 컨센서스가 없습니다. 평일 장 마감 후(16:30 KST) 자동
          갱신되며, 한국 2사(삼성·하이닉스)만 수집됩니다. 미국 종목은 네이버
          금융 미제공이라 표시되지 않습니다.
        </div>
      </div>
    );
  }

  const cur = row.current_price;
  const tgt = row.target_price;
  const up = (row.upside_pct ?? 0) >= 0;
  // 막대 범위: 현재가/목표가 중 작은 값~큰 값
  const lo = Math.min(cur, tgt);
  const hi = Math.max(cur, tgt);
  const span = hi - lo || 1;
  const curPos = ((cur - lo) / span) * 100;
  const tgtPos = ((tgt - lo) / span) * 100;

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

      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] text-[var(--muted)]">현재가</div>
          <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
            ₩{Math.round(cur).toLocaleString("ko-KR")}
          </div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[10px] text-[var(--muted)]">
            상승여력
          </div>
          <div
            className={`font-mono text-xl font-bold tabular-nums ${
              up ? "text-[var(--up)]" : "text-[var(--down)]"
            }`}
          >
            {up ? "+" : ""}
            {row.upside_pct?.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] text-[var(--muted)]">목표가</div>
          <div className="font-mono text-lg font-bold tabular-nums text-[var(--accent)]">
            ₩{Math.round(tgt).toLocaleString("ko-KR")}
          </div>
        </div>
      </div>

      {/* 게이지 막대 */}
      <div className="relative mt-4 h-2 rounded-full bg-[var(--panel2)]">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[var(--text)] bg-[var(--panel)]"
          style={{ left: `calc(${curPos}% - 6px)` }}
          title="현재가"
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--accent)]"
          style={{ left: `calc(${tgtPos}% - 6px)` }}
          title="목표가"
        />
      </div>
      <div className="mt-3 font-mono text-[10px] text-[var(--muted)]">
        자료: 네이버 금융 컨센서스 · {row.captured_at?.slice(0, 10)} 기준 · 정보
        제공 목적, 투자 권유 아님
      </div>
    </div>
  );
}
