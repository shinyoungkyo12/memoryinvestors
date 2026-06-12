"use client";

/**
 * 지표 해석 가이드 박스 — 모든 패널에서 재사용
 * "이 지표가 뭔지 + 어떤 움직임이 어떤 신호인지"를 초보 기준으로 설명
 */

export interface Signal {
  icon: string;
  label: string;
  desc: string;
}

interface Props {
  title: string;
  intro: string;
  signals: Signal[];
}

export default function InfoBox({ title, intro, signals }: Props) {
  return (
    <details className="group rounded-lg border border-[var(--border)] bg-[var(--panel)] open:pb-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-mono text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">📌</span>
        <span className="font-semibold text-[var(--text)]">{title}</span>
        <span className="ml-auto text-[10px] group-open:hidden">펼치기 ▾</span>
        <span className="ml-auto hidden text-[10px] group-open:inline">접기 ▴</span>
      </summary>
      <div className="px-4">
        <p className="mb-3 text-sm leading-relaxed text-[var(--text)]">{intro}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {signals.map((s) => (
            <div
              key={s.label}
              className="rounded-md bg-[var(--panel2)] px-3 py-2"
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
                <span aria-hidden="true">{s.icon}</span>
                {s.label}
              </div>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
