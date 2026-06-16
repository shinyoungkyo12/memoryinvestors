"use client";

import { useEffect, useMemo, useState } from "react";
import { SYMBOLS, getSymbol } from "@/lib/symbols";
import type { TrendResponse, TrendRankItem } from "@/app/api/trend/route";
import type { FundamentalsResponse } from "@/app/api/fundamentals/route";
import type { ConsensusRow } from "@/app/api/consensus/route";
import {
  computeFundamental,
  type FundamentalResult,
} from "@/lib/fundamental-score";

/**
 * 종목 비교 — 기술 축 / 업황 축 2개 스코어를 두 종목 나란히 head-to-head.
 * - 기술: /api/trend (computeTrend 7점) 재사용
 * - 업황: /api/fundamentals + /api/consensus → computeFundamental
 * - 매크로는 표시하지 않음. ETF 제외(개별주 6종목).
 */

/** 비교 대상 개별주 (ETF 제외) */
const STOCKS = SYMBOLS.filter((s) => s.category !== "ETF");

const TECH_GRADE_COLOR: Record<string, string> = {
  강세: "var(--up)",
  중립: "var(--accent)",
  약세: "var(--down)",
};
const FUND_GRADE_COLOR: Record<string, string> = {
  개선: "var(--up)",
  중립: "var(--accent)",
  둔화: "var(--down)",
  "데이터 부족": "var(--muted)",
};

interface Criterion {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface AxisData {
  score: number;
  maxScore: number;
  grade: string;
  criteria: Criterion[];
}

/** 한 축(기술 또는 업황)을 두 종목 head-to-head로 렌더 */
function AxisCompare({
  title,
  subtitle,
  gradeColors,
  a,
  b,
}: {
  title: string;
  subtitle: string;
  gradeColors: Record<string, string>;
  a: AxisData | null;
  b: AxisData | null;
}) {
  // 두 종목 기준 항목 키 합집합 (A 순서 우선, B 추가분 뒤에)
  const keys: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const c of [...(a?.criteria ?? []), ...(b?.criteria ?? [])]) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    keys.push({ key: c.key, label: c.label });
  }

  const ratio = (d: AxisData | null) =>
    d && d.maxScore > 0 ? d.score / d.maxScore : -1;
  const ra = ratio(a);
  const rb = ratio(b);
  const aWins = ra >= 0 && ra > rb;
  const bWins = rb >= 0 && rb > ra;

  const cell = (d: AxisData | null, key: string) => {
    const c = d?.criteria.find((x) => x.key === key);
    if (!c)
      return (
        <span className="text-[var(--muted)]" title="데이터 없음">
          —
        </span>
      );
    return (
      <span
        title={c.detail}
        style={{ color: c.passed ? "var(--up)" : "var(--muted)" }}
      >
        {c.passed ? "✓" : "✗"}
      </span>
    );
  };

  const scoreBlock = (d: AxisData | null, wins: boolean) => (
    <div
      className={`flex flex-col items-center rounded-md border px-2 py-2 ${
        wins
          ? "border-[var(--accent)] bg-[var(--panel2)]"
          : "border-[var(--border)]"
      }`}
    >
      <span className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
        {d ? `${d.score}/${d.maxScore}` : "—"}
      </span>
      <span
        className="font-mono text-[11px]"
        style={{ color: d ? (gradeColors[d.grade] ?? "var(--muted)") : "var(--muted)" }}
      >
        {d?.grade ?? "데이터 없음"}
        {wins && <span className="ml-1 text-[var(--accent)]">▲우위</span>}
      </span>
    </div>
  );

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="font-mono text-sm font-bold text-[var(--text)]">
          {title}
        </h3>
        <p className="font-mono text-[10px] text-[var(--muted)]">{subtitle}</p>
      </div>

      {/* 총점 head-to-head */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {scoreBlock(a, aWins)}
        {scoreBlock(b, bWins)}
      </div>

      {/* 항목별 ✓/✗ */}
      {keys.length > 0 ? (
        <ul className="px-3 pb-3">
          {keys.map(({ key, label }) => (
            <li
              key={key}
              className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-1 border-t border-[var(--border)] py-1.5 text-center first:border-t-0"
            >
              <span className="font-mono text-sm">{cell(a, key)}</span>
              <span className="text-xs text-[var(--text)]">{label}</span>
              <span className="font-mono text-sm">{cell(b, key)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-3 text-center font-mono text-xs text-[var(--muted)]">
          채점 가능한 데이터가 없습니다.
        </p>
      )}
    </section>
  );
}

export default function ComparePanel() {
  const [tickerA, setTickerA] = useState("005930");
  const [tickerB, setTickerB] = useState("000660");
  const [trend, setTrend] = useState<TrendRankItem[] | null>(null);
  const [fund, setFund] = useState<FundamentalsResponse | null>(null);
  const [consensus, setConsensus] = useState<ConsensusRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, fRes, cRes] = await Promise.all([
          fetch("/api/trend"),
          fetch("/api/fundamentals"),
          fetch("/api/consensus"),
        ]);
        const tJson = (await tRes.json()) as TrendResponse;
        const fJson = (await fRes.json()) as FundamentalsResponse;
        const cJson = (await cRes.json()) as { rows?: ConsensusRow[] };
        if (cancelled) return;
        setTrend(tJson.items ?? []);
        setFund(fJson);
        setConsensus(cJson.rows ?? []);
      } catch {
        if (!cancelled) setError("비교 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const build = useMemo(() => {
    return (ticker: string) => {
      const info = getSymbol(ticker);
      const tech = trend?.find((t) => t.ticker === ticker) ?? null;
      const inv = fund?.inventory?.[ticker] ?? [];
      const unit = fund?.inventoryUnits?.[ticker] ?? "$B";
      const upside =
        consensus?.find((r) => r.ticker === ticker)?.upside_pct ?? null;
      const fundamental: FundamentalResult = computeFundamental(
        inv,
        upside,
        unit,
      );
      const techAxis: AxisData | null = tech
        ? {
            score: tech.score,
            maxScore: tech.maxScore,
            grade: tech.grade,
            criteria: tech.criteria,
          }
        : null;
      const fundAxis: AxisData = {
        score: fundamental.score,
        maxScore: fundamental.maxScore,
        grade: fundamental.grade,
        criteria: fundamental.criteria,
      };
      return { info, techAxis, fundAxis, upside };
    };
  }, [trend, fund, consensus]);

  const A = build(tickerA);
  const B = build(tickerB);

  const selector = (
    value: string,
    onChange: (v: string) => void,
    label: string,
  ) => (
    <label className="flex flex-1 flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {STOCKS.map((s) => (
          <option key={s.ticker} value={s.ticker}>
            {s.nameKo} ({s.ticker})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3">
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] px-4 py-2.5">
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          <span className="font-semibold text-[var(--text)]">종목 비교</span> ·
          기술 축(이동평균·RSI·신고가권 7점)과 업황 축(재고일수·재고·컨센서스
          상승여력)을 분리해 두 종목을 나란히 채점합니다. 거시경제 요인은 메모리
          섹터 전체에 공통이라 종목 비교에서 제외했습니다.
        </p>
      </div>

      {/* 종목 선택 */}
      <div className="flex items-end gap-2">
        {selector(tickerA, setTickerA, "종목 A")}
        <span className="pb-2 font-mono text-xs text-[var(--muted)]">vs</span>
        {selector(tickerB, setTickerB, "종목 B")}
      </div>

      {/* 종목명 헤더 */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] py-2">
          <span className="text-sm font-bold text-[var(--text)]">
            {A.info?.nameKo ?? tickerA}
          </span>
          <span className="ml-1 font-mono text-[11px] text-[var(--muted)]">
            {tickerA}
          </span>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] py-2">
          <span className="text-sm font-bold text-[var(--text)]">
            {B.info?.nameKo ?? tickerB}
          </span>
          <span className="ml-1 font-mono text-[11px] text-[var(--muted)]">
            {tickerB}
          </span>
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-8 text-center font-mono text-xs text-[var(--muted)]">
          비교 데이터 불러오는 중…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-8 text-center font-mono text-xs text-[var(--muted)]">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <AxisCompare
            title="기술 스코어"
            subtitle="이동평균 배열·주가 위치·RSI·52주 고점 (7점)"
            gradeColors={TECH_GRADE_COLOR}
            a={A.techAxis}
            b={B.techAxis}
          />
          <AxisCompare
            title="업황 스코어"
            subtitle="재고일수(DIO)·재고자산 방향·컨센서스 상승여력 (가변 점수)"
            gradeColors={FUND_GRADE_COLOR}
            a={A.fundAxis}
            b={B.fundAxis}
          />
        </>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-[var(--muted)]">
        기술: Yahoo Finance 일봉 · 업황: SEC EDGAR/DART 분기 재고, 네이버 금융
        컨센서스(한국 2사). 업황 데이터가 없는 종목·항목은 &ldquo;—&rdquo;로
        표시되며 분모에서 제외됩니다. 정보 제공 목적이며 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
