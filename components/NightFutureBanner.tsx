"use client";

import { useEffect, useState } from "react";
import type { NightFutureResponse } from "@/app/api/night-future/route";

/**
 * 코스피200 야간선물 배너
 * - 한국 장 마감 후 야간선물 세션(KST 18:00~05:00)에만 노출
 * - 세션이 아니거나 데이터 없으면 아무것도 렌더하지 않음 (null 반환)
 * - 단순 지수값만 표시 (차트 없음)
 * - 30초 폴링
 */

export default function NightFutureBanner() {
  const [data, setData] = useState<NightFutureResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/night-future");
        const json = (await res.json()) as NightFutureResponse;
        if (!cancelled) setData(json);
      } catch {
        /* 무시 */
      }
    };
    load();
    timer = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // 세션이 아니면 표시 안 함
  if (!data || !data.sessionOpen) return null;

  // 세션이지만 데이터 못 가져온 경우: 간단한 안내만 (KIS 키/코드 이슈)
  if (!data.available || data.price === null) {
    return (
      <div className="border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
          <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 text-[var(--accent)]">
            야간선물
          </span>
          <span>
            코스피200 야간선물 세션 중 · 시세 연결 대기
            {data.error ? ` (${data.error})` : ""}
          </span>
        </div>
      </div>
    );
  }

  const up = (data.changePct ?? 0) >= 0;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent)]">
          야간선물
        </span>
        <span className="font-mono text-xs text-[var(--muted)]">
          코스피200 (CME 연계)
        </span>
        <span className="font-mono text-base font-bold tabular-nums text-[var(--text)]">
          {data.price.toLocaleString("ko-KR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span
          className={`font-mono text-sm font-bold tabular-nums ${
            up ? "text-[var(--up)]" : "text-[var(--down)]"
          }`}
        >
          {up ? "▲" : "▼"} {Math.abs(data.diff ?? 0).toFixed(2)} (
          {up ? "+" : ""}
          {data.changePct?.toFixed(2)}%)
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">
          장 마감 후 18:00~익일 05:00 · 30초 갱신
        </span>
      </div>
    </div>
  );
}
