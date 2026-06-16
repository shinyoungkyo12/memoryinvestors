"use client";

import { useEffect, useState } from "react";
import type { TrendResponse, TrendRankItem } from "@/app/api/trend/route";

/**
 * 추세 강도 랭킹 — 개별주(ETF 제외) 기술적 분석 점수.
 * - 접힌 상태: 점수 막대 + 등급 + 요약 칩
 * - 펼친 상태: 7개 조건 체크리스트(✅/❌) + 근거 값
 * - 종목 클릭 시 실시간 차트로 이동 (onSelectStock)
 */

const GRADE_COLOR: Record<string, string> = {
  강세: "var(--up)",
  중립: "var(--accent)",
  약세: "var(--down)",
};

function ScoreBar({ score, max }: { score: number; max: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${score}/${max}점`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-sm"
          style={{
            background:
              i < score ? "var(--accent)" : "var(--panel2)",
          }}
        />
      ))}
    </span>
  );
}

function TrendRow({
  item,
  rank,
  onSelectStock,
}: {
  item: TrendRankItem;
  rank: number;
  onSelectStock?: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = GRADE_COLOR[item.grade];

  return (
    <li className="border-b border-[var(--border)] last:border-0">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-5 shrink-0 font-mono text-xs text-[var(--muted)]">
          {rank}
        </span>
        <button
          onClick={() => onSelectStock?.(item.ticker)}
          className="shrink-0 text-left text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)]"
          title={`${item.nameKo} 실시간 차트로 이동`}
        >
          {item.nameKo}
          <span aria-hidden className="ml-0.5 text-[var(--muted)]">
            ›
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <ScoreBar score={item.score} max={item.maxScore} />
          <span
            className="w-8 text-right font-mono text-xs tabular-nums"
            style={{ color }}
          >
            {item.score}/{item.maxScore}
          </span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: `${color}20`, color }}
          >
            {item.grade}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="근거 펼치기"
            className="-m-1.5 rounded p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* 요약 칩 (접힌 상태에서도 보임) */}
      {item.highlights.length > 0 && !open && (
        <div className="flex flex-wrap gap-1 px-3 pb-2 pl-10">
          {item.highlights.map((h) => (
            <span
              key={h}
              className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* 펼친 체크리스트 */}
      {open && (
        <ul className="px-3 pb-3 pl-10">
          {item.criteria.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-2 py-1"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <span style={{ color: c.passed ? "var(--up)" : "var(--muted)" }}>
                  {c.passed ? "✓" : "✗"}
                </span>
                <span
                  className={
                    c.passed ? "text-[var(--text)]" : "text-[var(--muted)]"
                  }
                >
                  {c.label}
                </span>
              </span>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function TrendStrengthPanel({
  onSelectStock,
}: {
  onSelectStock?: (ticker: string) => void;
}) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/trend");
        const json = (await res.json()) as TrendResponse;
        if (cancelled) return;
        if (!json.items) {
          setError("추세 데이터를 불러오지 못했습니다.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-[var(--text)]">
          <span className="text-[var(--accent)]">●</span>
          추세 강도 랭킹
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--muted)]">
            기술적 분석 · 일봉
          </span>
        </h2>
        <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
          이동평균 배열·주가 위치·RSI·52주 고점으로 채점(7점) · 클릭하면 근거
          펼침
        </p>
      </div>

      {!data && !error && (
        <div className="px-4 py-8 text-center font-mono text-xs text-[var(--muted)]">
          추세 강도 계산 중…
        </div>
      )}
      {error && (
        <div className="px-4 py-8 text-center font-mono text-xs text-[var(--muted)]">
          {error}
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul>
          {data.items.map((item, i) => (
            <TrendRow
              key={item.ticker}
              item={item}
              rank={i + 1}
              onSelectStock={onSelectStock}
            />
          ))}
        </ul>
      )}

      <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] leading-relaxed text-[var(--muted)]">
        5점 이상 강세 · 3~4점 중립 · 2점 이하 약세. 기술적 지표에 따른 참고용
        분석이며, 투자 권유가 아닙니다. 데이터: Yahoo Finance 일봉.
        {data && data.missing.length > 0 && ` · 데이터 부재: ${data.missing.join(", ")}`}
      </p>
    </section>
  );
}
