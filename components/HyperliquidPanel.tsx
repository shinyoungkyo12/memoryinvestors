"use client";

import { useEffect, useState } from "react";
import type { HlPredictResponse } from "@/app/api/hl-predict/route";

/**
 * 하이퍼리퀴드 거래가 + 다음날 시초가 예측 패널 (삼성전자·SK하이닉스).
 * - 하이퍼리퀴드 현재가(USD)
 * - 다음날 예측 시초가(KRW) + 갭(%)
 * - 신뢰도(%): 회귀 모델 인샘플 방향 적중률
 * - 현물/하이퍼리퀴드 상관계수 표기
 * 60초 갱신.
 */
export default function HyperliquidPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<HlPredictResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async (reset: boolean) => {
      if (reset) {
        setData(null);
        setError("");
      }
      try {
        const res = await fetch(`/api/hl-predict?ticker=${ticker}`);
        const json = (await res.json()) as HlPredictResponse;
        if (cancelled) return;
        setData(json);
        setError(json.available ? "" : json.error ?? "예측을 불러오지 못했습니다.");
      } catch {
        if (!cancelled) setError("네트워크 오류가 발생했습니다.");
      }
    };
    load(true);
    timer = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [ticker]);

  const confidenceColor = (c: number) =>
    c >= 60 ? "var(--up)" : c >= 50 ? "var(--accent)" : "var(--down)";

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-[var(--text)]">
          하이퍼리퀴드 · 다음날 시초가 예측
        </span>
        <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
          Hyperliquid
        </span>
      </div>

      {!data && !error ? (
        <div className="px-4 py-8 text-center font-mono text-xs text-[var(--muted)]">
          하이퍼리퀴드 시세·예측 불러오는 중…
        </div>
      ) : !data?.available ? (
        <div className="px-4 py-8 text-center font-mono text-xs leading-relaxed text-[var(--muted)]">
          {error || "예측 데이터가 없습니다."}
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {/* 현재가 + 예측 시초가 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5">
              <div className="font-mono text-[10px] text-[var(--muted)]">
                하이퍼리퀴드 현재가
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                {data.hlPrice != null
                  ? `$${data.hlPrice.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}`
                  : "—"}
              </div>
              <div className="font-mono text-[10px] text-[var(--muted)]">
                {data.hlSymbol}
              </div>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5">
              <div className="font-mono text-[10px] text-[var(--muted)]">
                예측 다음날 시초가
              </div>
              {data.predictedOpen != null ? (
                <>
                  <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                    ₩{data.predictedOpen.toLocaleString("ko-KR")}
                  </div>
                  {data.predictedGapPct != null && (
                    <div
                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                        data.predictedGapPct >= 0
                          ? "text-[var(--up)]"
                          : "text-[var(--down)]"
                      }`}
                    >
                      {data.predictedGapPct >= 0 ? "▲" : "▼"}{" "}
                      {Math.abs(data.predictedGapPct).toFixed(2)}% (종가 대비)
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-1 font-mono text-xs leading-relaxed text-[var(--muted)]">
                  {data.error ?? "데이터 축적 중…"}
                </div>
              )}
            </div>
          </div>

          {/* 신뢰도 */}
          {data.confidence != null && (
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-mono text-[11px] text-[var(--muted)]">
                  예측 신뢰도 (방향 적중률)
                </span>
                <span
                  className="font-mono text-sm font-bold tabular-nums"
                  style={{ color: confidenceColor(data.confidence) }}
                >
                  {data.confidence.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--panel2)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, data.confidence))}%`,
                    backgroundColor: confidenceColor(data.confidence),
                  }}
                />
              </div>
            </div>
          )}

          {/* 상관계수 + 표본 */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
            <span>
              현물↔HL 상관:{" "}
              <span className="tabular-nums text-[var(--text)]">
                {data.corrHl != null ? data.corrHl.toFixed(2) : "—"}
              </span>
            </span>
            <span>
              현물↔시초가 상관:{" "}
              <span className="tabular-nums text-[var(--text)]">
                {data.corrSpot != null ? data.corrSpot.toFixed(2) : "—"}
              </span>
            </span>
            <span>
              학습 표본:{" "}
              <span className="tabular-nums text-[var(--text)]">
                {data.samples ?? "—"}일
              </span>
            </span>
          </div>

          <p className="border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
            DRAM 현물(DXI)·하이퍼리퀴드 수익률로 다음날 KRX 시초가 갭을 다중
            선형회귀해 예측한 값입니다. 신뢰도는 과거 표본의 방향(상승/하락) 적중률
            이며, 실제 시초가와 오차가 있을 수 있습니다. 투자 참고용입니다.
          </p>
        </div>
      )}
    </section>
  );
}
