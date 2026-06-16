"use client";

import {
  KR_SYMBOLS,
  US_SYMBOLS,
  formatPrice,
  getSymbol,
  type SymbolInfo,
} from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";

interface Props {
  selected: string;
  onSelect: (ticker: string) => void;
}

const GROUPS: { label: string; items: SymbolInfo[] }[] = [
  { label: "한국 KRX", items: KR_SYMBOLS },
  { label: "미국 US", items: US_SYMBOLS },
];

/** 데스크톱 — 시세 포함 세로 리스트 버튼 */
function SymbolButton({
  s,
  active,
  onSelect,
}: {
  s: SymbolInfo;
  active: boolean;
  onSelect: (ticker: string) => void;
}) {
  const { quotes } = useMarketFeed();
  const q = quotes[s.ticker];
  const isUp = (q?.changePct ?? 0) >= 0;

  return (
    <button
      onClick={() => onSelect(s.ticker)}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        active
          ? "bg-[var(--panel2)] shadow-[inset_2px_0_0_var(--accent)]"
          : "hover:bg-[var(--panel2)]"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[var(--text)]">
          {s.nameKo}
        </span>
        <span className="block truncate font-mono text-[11px] text-[var(--muted)]">
          {s.ticker} · {s.category}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-sm tabular-nums text-[var(--text)]">
          {q ? formatPrice(q.price, s.currency) : "—"}
        </span>
        <span
          className={`block font-mono text-xs tabular-nums ${
            q
              ? isUp
                ? "text-[var(--up)]"
                : "text-[var(--down)]"
              : "text-[var(--muted)]"
          }`}
        >
          {q ? `${isUp ? "+" : ""}${q.changePct.toFixed(2)}%` : "대기"}
        </span>
      </span>
    </button>
  );
}

/** 모바일 — 드롭다운 선택 + 선택 종목 시세 요약 */
function MobileSelect({ selected, onSelect }: Props) {
  const { quotes } = useMarketFeed();
  const info = getSymbol(selected);
  const q = quotes[selected];
  const isUp = (q?.changePct ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <select
          aria-label="종목 선택"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--panel2)] py-2.5 pl-3 pr-9 font-mono text-sm font-semibold text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.nameKo} ({s.ticker})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[var(--muted)]"
        >
          ▾
        </span>
      </label>

      {/* 선택 종목 시세 요약 */}
      {info && (
        <div className="flex items-baseline justify-between rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
          <span className="font-mono text-[11px] text-[var(--muted)]">
            {info.ticker} · {info.category}
          </span>
          <span className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-base font-bold text-[var(--text)]">
              {q ? formatPrice(q.price, info.currency) : "—"}
            </span>
            {q && (
              <span
                className={`text-xs font-semibold ${
                  isUp ? "text-[var(--up)]" : "text-[var(--down)]"
                }`}
              >
                {isUp ? "+" : ""}
                {q.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Watchlist({ selected, onSelect }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1 lg:border-b lg:border-[var(--border)] lg:px-2 lg:pb-2">
        <span className="font-mono text-xs font-bold tracking-wide text-[var(--text)]">
          종목 선택
        </span>
        <span className="font-mono text-[10px] text-[var(--muted)]">
          <span className="lg:hidden">선택 시 차트·상세 변경</span>
          <span className="hidden lg:inline">전일종가 대비 %</span>
        </span>
      </div>

      {/* 모바일: 드롭다운 */}
      <div className="lg:hidden">
        <MobileSelect selected={selected} onSelect={onSelect} />
      </div>

      {/* 데스크톱: 세로 리스트 */}
      <nav
        aria-label="종목 선택"
        className="hidden lg:flex lg:flex-col lg:gap-4"
      >
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {g.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((s) => (
                <li key={s.ticker}>
                  <SymbolButton
                    s={s}
                    active={s.ticker === selected}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
