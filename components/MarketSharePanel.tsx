"use client";

import { useMemo, useState } from "react";
import shareJson from "@/data/market-share.json";
import InfoBox from "@/components/InfoBox";

/**
 * 메모리 시장 점유율 패널
 * - D램 / HBM / 낸드플래시 세그먼트별 TOP3 (최신 분기, 매출액 기준)
 * - 분기별 추이 테이블 (전 업체)
 * - 데이터: 카운터포인트리서치 공개 발표치 (data/market-share.json 수동 관리, 분기 1회)
 * - 기업만 표시 (ETF 제외)
 */

interface Quarter {
  label: string;
  shares: Record<string, number>;
}

interface Segment {
  id: string;
  nameKo: string;
  updated: string;
  source: string;
  sourceUrl: string;
  quarters: Quarter[];
}

/** 대시보드 추적 종목 (하이라이트 대상) — ETF 제외 */
const TRACKED = new Set([
  "삼성전자",
  "SK하이닉스",
  "마이크론",
  "샌디스크",
  "씨게이트",
  "웨스턴디지털",
]);

const COMPANY_COLORS: Record<string, string> = {
  삼성전자: "#3182f6",
  SK하이닉스: "#f04452",
  마이크론: "#4a7c59",
  샌디스크: "#d8a24a",
  키옥시아: "#8a93a5",
  YMTC: "#8a93a5",
  CXMT: "#8a93a5",
  난야: "#8a93a5",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function latestRanking(seg: Segment): { company: string; share: number }[] {
  const latest = seg.quarters[seg.quarters.length - 1];
  return Object.entries(latest.shares)
    .map(([company, share]) => ({ company, share }))
    .sort((a, b) => b.share - a.share);
}

function SegmentCard({ seg }: { seg: Segment }) {
  const ranking = useMemo(() => latestRanking(seg), [seg]);
  const top3 = ranking.slice(0, 3);
  const latestLabel = seg.quarters[seg.quarters.length - 1].label;
  const maxShare = top3[0]?.share ?? 1;
  const [showTrend, setShowTrend] = useState(false);

  // 추이 테이블용: 전체 분기에 등장한 모든 회사 (최신 분기 점유율 순)
  const allCompanies = useMemo(() => {
    const set = new Set<string>();
    for (const q of seg.quarters) {
      for (const c of Object.keys(q.shares)) set.add(c);
    }
    const latest = seg.quarters[seg.quarters.length - 1].shares;
    return [...set].sort((a, b) => (latest[b] ?? -1) - (latest[a] ?? -1));
  }, [seg]);

  return (
    <section className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-mono text-sm font-bold text-[var(--text)]">
          {seg.nameKo}
          <span className="ml-2 font-normal text-[var(--muted)]">
            {latestLabel} 매출 점유율
          </span>
        </h2>
        <button
          onClick={() => setShowTrend((v) => !v)}
          aria-expanded={showTrend}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {showTrend ? "TOP3 보기" : "분기 추이"}
        </button>
      </div>

      {!showTrend ? (
        /* ── TOP3 ── */
        <div className="flex flex-1 flex-col justify-center gap-4 p-5">
          {top3.map((r, i) => (
            <div key={r.company}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <span aria-hidden="true">{MEDALS[i]}</span>
                  {r.company}
                  {TRACKED.has(r.company) && (
                    <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                      추적종목
                    </span>
                  )}
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                  {r.share}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--panel2)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(r.share / maxShare) * 100}%`,
                    background: COMPANY_COLORS[r.company] ?? "var(--muted)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── 분기 추이 테이블 ── */
        <div className="flex-1 overflow-x-auto p-3">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-[var(--muted)]">업체</th>
                {seg.quarters.map((q) => (
                  <th
                    key={q.label}
                    className="px-2 py-1.5 text-right text-[var(--muted)]"
                  >
                    {q.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCompanies.map((c) => (
                <tr key={c} className="border-t border-[var(--border)]">
                  <td className="px-2 py-1.5 text-[var(--text)]">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: COMPANY_COLORS[c] ?? "var(--muted)" }}
                    />
                    {c}
                    {TRACKED.has(c) && (
                      <span className="ml-1 text-[var(--accent)]">●</span>
                    )}
                  </td>
                  {seg.quarters.map((q) => {
                    const v = q.shares[c as keyof typeof q.shares];
                    return (
                      <td
                        key={q.label}
                        className="px-2 py-1.5 text-right tabular-nums text-[var(--text)]"
                      >
                        {v !== undefined ? `${v}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
        자료:{" "}
        <a
          href={seg.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          {seg.source}
        </a>{" "}
        · 갱신 {seg.updated} · 반올림으로 합계가 100%가 아닐 수 있음
      </p>
    </section>
  );
}

export default function MarketSharePanel() {
  const segments = shareJson.segments as Segment[];

  return (
    <div className="flex flex-col gap-3">
      <InfoBox
        title="점유율, 어떻게 읽나요?"
        intro="매출액 기준 글로벌 점유율입니다. 메모리는 소수 기업이 과점한 시장이라 점유율 변화 자체가 수주 경쟁·수율·기술력의 성적표입니다. 특히 HBM 점유율은 AI 메모리 주도권을 가장 직접적으로 보여주는 숫자입니다."
        signals={[
          {
            icon: "🏆",
            label: "HBM 점유율 변동",
            desc: "분기에 3%p 이상 움직이면 대형 수주의 이동을 의미 — 해당 기업 주가 리레이팅의 트리거가 되곤 합니다.",
          },
          {
            icon: "💰",
            label: "D램: 점유율 vs 수익성",
            desc: "점유율 1위가 곧 이익 1위는 아닙니다. HBM 비중이 높은 기업이 같은 점유율에서도 마진이 큽니다.",
          },
          {
            icon: "🇨🇳",
            label: "CXMT(중국) 추격",
            desc: "범용 D램에서 중국 점유율 상승은 장기 공급과잉 리스크 — 추이를 계속 지켜봐야 하는 변수입니다.",
          },
          {
            icon: "📊",
            label: "분기 추이 버튼",
            desc: "각 카드의 '분기 추이'를 누르면 5개 분기 흐름이 보입니다. 한 분기 수치보다 방향이 중요합니다.",
          },
        ]}
      />
      <div className="grid gap-3 xl:grid-cols-3">
        {segments.map((seg) => (
          <SegmentCard key={seg.id} seg={seg} />
        ))}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-[var(--muted)]">
        매출액 기준 글로벌 점유율 · 기업 단위 표시(ETF 제외) ·{" "}
        <span className="text-[var(--accent)]">●</span> = 이 대시보드 추적 종목
        · 분기 발표 시 data/market-share.json에 1개 분기 추가 → push 하면
        반영됩니다.
      </p>
    </div>
  );
}
