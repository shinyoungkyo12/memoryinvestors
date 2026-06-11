"use client";

import { useEffect, useMemo, useState } from "react";
import { getSymbol } from "@/lib/symbols";
import type {
  CorrCell,
  CorrelationResponse,
} from "@/app/api/correlation/route";

/**
 * 상관분석 패널
 * - 히트맵: DRAM 현물가 품목(행) × 종목(열) 일별 수익률 상관계수
 * - 셀 클릭 → Lead-Lag 상세: 현물가를 ±N 거래일 시프트했을 때의 상관 분포
 * - 표본 수(n)에 따라 신뢰도 표시 (30 미만은 참고용)
 */

const RELIABLE_N = 30;

/** 상관계수 → 셀 배경색 (양: 적색 계열, 음: 청색 계열 — 한국 관례와 통일) */
function corrColor(corr: number | null): string {
  if (corr === null) return "transparent";
  const a = Math.min(Math.abs(corr), 1) * 0.55;
  return corr >= 0
    ? `rgba(240, 68, 82, ${a})`
    : `rgba(49, 130, 246, ${a})`;
}

function interpret(cell: CorrCell): string {
  if (cell.corr === null || cell.bestLag === null) return "";
  const name = getSymbol(cell.ticker)?.nameKo ?? cell.ticker;
  const strength =
    Math.abs(cell.bestLagCorr ?? 0) >= 0.5
      ? "강한"
      : Math.abs(cell.bestLagCorr ?? 0) >= 0.3
        ? "중간"
        : "약한";
  const dir = (cell.bestLagCorr ?? 0) >= 0 ? "양(+)" : "음(−)";
  if (cell.bestLag > 0) {
    return `현물가가 ${name} 주가를 약 ${cell.bestLag}거래일 선행하는 ${strength} ${dir}의 관계가 관측됩니다.`;
  }
  if (cell.bestLag < 0) {
    return `${name} 주가가 현물가를 약 ${-cell.bestLag}거래일 선행하는 ${strength} ${dir}의 관계가 관측됩니다.`;
  }
  return `같은 날 움직임의 ${strength} ${dir} 상관이 가장 큽니다 (뚜렷한 선행성 없음).`;
}

export default function CorrelationPanel() {
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{
    item: string;
    ticker: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/correlation");
        const json = (await res.json()) as CorrelationResponse & {
          error?: string;
        };
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cellMap = useMemo(() => {
    const m = new Map<string, CorrCell>();
    for (const c of data?.cells ?? []) m.set(`${c.item}|${c.ticker}`, c);
    return m;
  }, [data]);

  const selectedCell = selected
    ? cellMap.get(`${selected.item}|${selected.ticker}`)
    : undefined;

  const maxN = useMemo(
    () => Math.max(0, ...(data?.cells.map((c) => c.n) ?? [0])),
    [data],
  );

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        상관분석 계산 중… (주가 일봉 9종목 수집)
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 데이터 충분성 배너 */}
      {maxN < RELIABLE_N && (
        <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--panel)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]">
          <span className="font-mono font-bold text-[var(--accent)]">
            데이터 수집 중 ({maxN}/{RELIABLE_N}일)
          </span>
          <span className="ml-2 text-[var(--muted)]">
            현물가 수집을 시작한 지 얼마 되지 않아 표본이 부족합니다.
            상관계수는 매칭 표본이 최소 {RELIABLE_N}거래일 이상 쌓인 뒤부터
            통계적으로 의미가 있습니다. 그 전까지의 수치는 참고용입니다 —
            수집은 평일 자동으로 진행되며 이 화면도 자동으로 채워집니다.
          </span>
        </div>
      )}

      {/* 히트맵 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-[var(--text)]">
            현물가 × 주가 상관 히트맵
            <span className="ml-2 font-normal text-[var(--muted)]">
              일별 수익률 동시점 피어슨 상관 · 셀 클릭 → 선행성 상세
            </span>
          </h2>
        </div>
        <div className="overflow-x-auto p-2">
          {data.items.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">
              현물가 데이터가 아직 없습니다. [DRAM 현물가] 탭의 수집 안내를
              확인하세요.
            </div>
          ) : (
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[var(--panel)] px-2 py-1.5 text-left text-[var(--muted)]">
                    품목 \ 종목
                  </th>
                  {data.tickers.map((t) => (
                    <th
                      key={t}
                      className="px-1 py-1.5 text-center text-[var(--muted)]"
                      title={getSymbol(t)?.nameKo}
                    >
                      {getSymbol(t)?.market === "KR"
                        ? (getSymbol(t)?.nameKo ?? t).slice(0, 4)
                        : t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item}>
                    <td className="sticky left-0 max-w-44 truncate bg-[var(--panel)] px-2 py-1 text-[var(--text)]">
                      {item}
                    </td>
                    {data.tickers.map((t) => {
                      const c = cellMap.get(`${item}|${t}`);
                      const active =
                        selected?.item === item && selected?.ticker === t;
                      return (
                        <td key={t} className="p-0.5">
                          <button
                            onClick={() => setSelected({ item, ticker: t })}
                            className={`w-full rounded px-1 py-1.5 text-center tabular-nums transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                              active
                                ? "ring-1 ring-[var(--accent)]"
                                : "hover:scale-105"
                            }`}
                            style={{ background: corrColor(c?.corr ?? null) }}
                            title={`n=${c?.n ?? 0}`}
                          >
                            {c?.corr !== null && c?.corr !== undefined
                              ? c.corr.toFixed(2)
                              : "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          적색 = 양의 상관(같은 방향) · 청색 = 음의 상관 · 진할수록 강함 ·
          &ldquo;·&rdquo; = 표본 부족(5일 미만)
        </p>
      </section>

      {/* Lead-Lag 상세 */}
      {selectedCell && selectedCell.lags.length > 0 && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-mono text-sm font-bold text-[var(--text)]">
              선행성(Lead-Lag) 분석
              <span className="ml-2 font-normal text-[var(--muted)]">
                {selectedCell.item} ×{" "}
                {getSymbol(selectedCell.ticker)?.nameKo ?? selectedCell.ticker}{" "}
                · 표본 {selectedCell.n}일
                {selectedCell.n < RELIABLE_N && " (참고용)"}
              </span>
            </h2>
          </div>
          <div className="flex items-end justify-center gap-1 px-4 pb-2 pt-6">
            {selectedCell.lags.map((p) => {
              const h = p.corr === null ? 0 : Math.abs(p.corr) * 100;
              const isBest = p.lag === selectedCell.bestLag;
              return (
                <div
                  key={p.lag}
                  className="flex flex-col items-center gap-1"
                  title={`lag ${p.lag}: ${p.corr?.toFixed(3) ?? "—"}`}
                >
                  <div
                    className="w-4 rounded-t sm:w-6"
                    style={{
                      height: `${Math.max(h, 2)}px`,
                      background: isBest
                        ? "var(--accent)"
                        : (p.corr ?? 0) >= 0
                          ? "rgba(240,68,82,0.5)"
                          : "rgba(49,130,246,0.5)",
                    }}
                  />
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      isBest
                        ? "font-bold text-[var(--accent)]"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {p.lag > 0 ? `+${p.lag}` : p.lag}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 pb-1 text-center font-mono text-[10px] text-[var(--muted)]">
            ← 주가 선행 · lag(거래일) · 현물가 선행 →
          </p>
          <p className="border-t border-[var(--border)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]">
            {interpret(selectedCell)}
            {selectedCell.n < RELIABLE_N && (
              <span className="ml-1 text-[var(--muted)]">
                단, 표본 {selectedCell.n}일은 통계적 신뢰 기준(
                {RELIABLE_N}일)에 미달하므로 해석에 주의하세요.
              </span>
            )}
          </p>
        </section>
      )}
      {selectedCell && selectedCell.lags.length === 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
          이 조합은 매칭 표본이 부족해 선행성 분석을 계산할 수 없습니다 (n=
          {selectedCell.n}).
        </div>
      )}
    </div>
  );
}
