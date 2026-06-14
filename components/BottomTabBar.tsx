"use client";

/**
 * 모바일 하단 탭바 — lg 미만에서만 표시.
 * 데스크톱은 기존 상단 탭 유지(이 컴포넌트는 lg:hidden).
 */

type View =
  | "memindex"
  | "stocks"
  | "spot"
  | "fundamentals"
  | "share"
  | "compare"
  | "feedback";

const TABS: { key: View; label: string; icon: string }[] = [
  { key: "memindex", label: "지수", icon: "M3 17l6-6 4 4 7-7" },
  { key: "stocks", label: "차트", icon: "M4 19V5m5 14V9m5 10V7m5 12V11" },
  { key: "spot", label: "현물가", icon: "M12 3v18m6-13H8.5a2.5 2.5 0 000 5H15a2.5 2.5 0 010 5H6" },
  {
    key: "fundamentals",
    label: "펀더멘털",
    icon: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  },
  { key: "share", label: "점유율", icon: "M12 2a10 10 0 100 20V2zM12 12l8-4" },
  {
    key: "compare",
    label: "비교",
    icon: "M9 3v18M15 3v18M4 8h5M15 8h5M4 14h5M15 14h5",
  },
  {
    key: "feedback",
    label: "피드백",
    icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  },
];

export default function BottomTabBar({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <nav
      aria-label="모바일 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map((t) => {
          const active = view === t.key;
          return (
            <li key={t.key} className="flex-1">
              <button
                onClick={() => onChange(t.key)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-3 transition-colors ${
                  active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }`}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={t.icon} />
                </svg>
                <span className="font-mono text-[10px] leading-tight">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
