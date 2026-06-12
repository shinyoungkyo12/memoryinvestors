"use client";

import {
  KR_SYMBOLS,
  US_SYMBOLS,
  formatPrice,
  type SymbolInfo,
} from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";

interface Props {
  selected: string;
  onSelect: (ticker: string) => void;
}

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
        <span className="block font-mono text-[11px] text-[var(--muted)]">
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

export default function Watchlist({ selected, onSelect }: Props) {
  const groups: { label: string; items: SymbolInfo[] }[] = [
    { label: "한국 KRX", items: KR_SYMBOLS },
    { label: "미국 US", items: US_SYMBOLS },
  ];

  return (
    <nav
      aria-label="관련주식"
      className="flex flex-row gap-3 overflow-x-auto pb-1 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0"
    >
      <div className="hidden border-b border-[var(--border)] px-2 pb-2 font-mono text-xs font-bold tracking-wide text-[var(--text)] lg:block">
        관련주식
        <span className="ml-1.5 font-normal text-[var(--muted)]">
          전일종가 대비 %
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="shrink-0 lg:shrink">
          <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {g.label}
          </div>
          <ul className="flex flex-row gap-1 lg:flex-col lg:gap-0.5">
            {g.items.map((s) => (
              <li key={s.ticker} className="w-44 shrink-0 lg:w-auto lg:shrink">
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
  );
}
