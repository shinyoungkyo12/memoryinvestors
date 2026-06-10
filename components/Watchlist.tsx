"use client";

import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { useMarketFeed } from "@/lib/market-feed";

interface Props {
  selected: string;
  onSelect: (ticker: string) => void;
}

const CATEGORY_ORDER: SymbolInfo["category"][] = [
  "DRAM/HBM",
  "NAND/Storage",
  "HDD",
  "ETF",
];

export default function Watchlist({ selected, onSelect }: Props) {
  const { quotes } = useMarketFeed();

  return (
    <nav aria-label="관심종목" className="flex flex-col gap-4">
      {CATEGORY_ORDER.map((cat) => {
        const group = SYMBOLS.filter((s) => s.category === cat);
        if (group.length === 0) return null;
        return (
          <div key={cat}>
            <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {cat}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.map((s) => {
                const q = quotes[s.ticker];
                const isUp = (q?.changePct ?? 0) >= 0;
                const active = s.ticker === selected;
                return (
                  <li key={s.ticker}>
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
                        <span className="block font-mono text-sm font-semibold text-[var(--text)]">
                          {s.ticker}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {s.nameKo}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-sm tabular-nums text-[var(--text)]">
                          {q ? q.price.toFixed(2) : "—"}
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
                          {q
                            ? `${isUp ? "+" : ""}${q.changePct.toFixed(2)}%`
                            : "대기"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
