"use client";

import { useEffect, useState } from "react";
import type { HlPredictResponse } from "@/app/api/hl-predict/route";
import type { HlPriceResponse } from "@/app/api/hl-price/route";

/**
 * 하이퍼리퀴드 거래가 + 다음날 시초가 예측 패널 (삼성전자·SK하이닉스).
 * - 현재가(USD): /api/hl-price 5초 폴링 (실시간)
 * - 예측: /api/hl-predict 60초 폴링 — 코스피 장 마감(15:30 KST) 이후에만 산출
 */
export default function HyperliquidPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<HlPredictResponse | null>(null);
  const [error, setError] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);

  // 예측 + 메타 (60초)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async (reset: boolean) => {
      if (reset) {
        setData(null);
        setError("");
        setLivePrice(null);
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

  // 실시간 현재가 (5초)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const res = await fetch(`/api/hl-price?ticker=${ticker}`);
        const json = (await res.json()) as HlPriceResponse;
        if (!cancelled && json.price != null) setLivePrice(json.price);
      } catch {
        /* 다음 틱에서 회복 */
      }
    };
    tick();
    timer = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [ticker]);

  const confidenceColor = (c: number) =>
    c >= 60 ? "var(--up)" : c >= 50 ? "var(--accent)" : "var(--down)";

  const price = livePrice ?? data?.hlPrice ?? null;
  const marketOpen = data?.marketOpen ?? false;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-[var(--text)]">
          하이퍼리퀴드 · 다음날 시초가 예측
        </span>
        <span className="flex items-center gap-1.5">
          {livePrice != null && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-[var(--up)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--up)]" />
              LIVE
            </span>
          )}
          <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
            Hyperliquid
          </span>
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
          {/* 장중 안내 배너 */}
          {marketOpen && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2">
              <span className="text-sm">🕒</span>
              <p className="font-mono text-[11px] leading-relaxed text-[var(--text)]">
                코스피 정규장 진행 중입니다. 다음날 시초가 예측은{" "}
                <span className="font-bold text-[var(--accent)]">
                  장 마감(15:30 KST) 이후
                </span>{" "}
                에 산출됩니다. 현재가는 실시간으로 표시됩니다.
              </p>
            </div>
          )}

          {/* 현재가 + 예측 시초가 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5">
              <div className="font-mono text-[10px] text-[var(--muted)]">
                하이퍼리퀴드 현재가
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">
                {price != null
                  ? `$${price.toLocaleString("en-US", {
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
                  {marketOpen ? "장 마감 후 제공" : (data.error ?? "데이터 축적 중…")}
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
          {data.predictedOpen != null && (
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
          )}

          <p className="border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
            현재가는 하이퍼리퀴드 실시간 시세입니다. 예측 시초가는 코스피 장
            마감(15:30 KST) 이후, DRAM 현물(DXI)·하이퍼리퀴드 수익률로 다음날 KRX
            시초가 갭을 다중 선형회귀해 산출하며, 신뢰도는 과거 표본의
            방향(상승/하락) 적중률입니다. 실제 시초가와 오차가 있을 수 있는 투자
            참고용 지표입니다.
          </p>
        </div>
      )}
    </section>
  );
}
