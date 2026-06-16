"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  DEFAULT_TICKER,
  formatPrice,
  getSymbol,
  INTERVALS,
  INTERVAL_LABELS,
  type Interval,
} from "@/lib/symbols";
import { MarketFeedProvider, useMarketFeed, type Quote } from "@/lib/market-feed";
import Watchlist from "@/components/Watchlist";
import TickerTape from "@/components/TickerTape";
import SummaryBar from "@/components/SummaryBar";
import MemoryIndexChart from "@/components/MemoryIndexChart";
import NightFutureBanner from "@/components/NightFutureBanner";
import BottomTabBar from "@/components/BottomTabBar";
import PullToRefresh from "@/components/PullToRefresh";
import TrendStrengthPanel from "@/components/TrendStrengthPanel";
import FeedbackPanel from "@/components/FeedbackPanel";
import InfoBox from "@/components/InfoBox";

const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
});

const SpotPanel = dynamic(() => import("@/components/SpotPanel"), {
  ssr: false,
});

const StockDetailSections = dynamic(
  () => import("@/components/StockDetailSections"),
  { ssr: false },
);

const HyperliquidPanel = dynamic(
  () => import("@/components/HyperliquidPanel"),
  { ssr: false },
);

const FundamentalsPanel = dynamic(
  () => import("@/components/FundamentalsPanel"),
  { ssr: false },
);

const MarketSharePanel = dynamic(
  () => import("@/components/MarketSharePanel"),
  { ssr: false },
);

const ComparePanel = dynamic(
  () => import("@/components/ComparePanel"),
  { ssr: false },
);

type View =
  | "memindex"
  | "stocks"
  | "spot"
  | "fundamentals"
  | "share"
  | "compare"
  | "feedback";

const VALID_VIEWS = new Set<View>([
  "memindex", "stocks", "spot", "fundamentals", "share", "compare", "feedback",
]);

const SOURCE_LABEL: Record<Quote["source"], string> = {
  ws: "LIVE",
  rest: "SNAPSHOT",
  yahoo: "지연시세",
};

function ConnectionDot() {
  const { connected } = useMarketFeed();
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-[var(--live)]" : "bg-[var(--muted)]"
        }`}
      />
      {connected ? "US 실시간 연결됨" : "US 연결 대기"}
    </span>
  );
}

function SelectedHeader({ ticker }: { ticker: string }) {
  const { quotes } = useMarketFeed();
  const info = getSymbol(ticker);
  const q = quotes[ticker];
  const isUp = (q?.changePct ?? 0) >= 0;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
        {info?.nameKo}
        <span className="ml-2 font-mono text-sm font-normal text-[var(--muted)]">
          {ticker} · {info?.nameEn}
        </span>
      </h1>
      {q && info && (
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-2xl font-bold text-[var(--text)]">
            {formatPrice(q.price, info.currency)}
          </span>
          <span
            className={`text-sm font-semibold ${
              isUp ? "text-[var(--up)]" : "text-[var(--down)]"
            }`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {SOURCE_LABEL[q.source]}
          </span>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [interval, setInterval] = useState<Interval>("1day");
  const [view, setView] = useState<View>("memindex");
  const isSamsungOrHynix = ticker === "005930" || ticker === "000660";

  // Sync view with browser history so back/forward buttons work
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v") as View | null;
    const initial: View = v && VALID_VIEWS.has(v) ? v : "memindex";
    // URL의 ?v= 로 초기 탭 동기화 (마운트 1회)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(initial);
    window.history.replaceState({ v: initial }, "");

    const onPopState = (e: PopStateEvent) => {
      const pv = (e.state?.v ?? "memindex") as View;
      setView(VALID_VIEWS.has(pv) ? pv : "memindex");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (v: View) => {
    window.history.pushState({ v }, "", `?v=${v}`);
    setView(v);
  };

  return (
    <div className="flex min-h-dvh flex-col pb-16 lg:pb-0">
      <PullToRefresh />
      {/* 상단 바 */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <button
          onClick={() => navigate("memindex")}
          aria-label="홈으로"
          className="flex items-baseline gap-1 font-mono transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <span className="text-sm font-bold tracking-tight text-[var(--text)]">
            MEMORY
          </span>
          <span className="text-sm font-bold tracking-tight text-[var(--accent)]">
            {"//INVESTORS"}
          </span>
          <span className="ml-2 hidden text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] sm:inline">
            메모리 반도체 모니터
          </span>
        </button>
        <div className="flex items-center gap-3">
          <nav
            aria-label="화면 전환"
            className="hidden overflow-hidden rounded-md border border-[var(--border)] lg:flex"
          >
            {(
              [
                ["memindex", "메모리 지수"],
                ["stocks", "실시간 차트"],
                ["spot", "메모리현물가"],
                ["fundamentals", "펀더멘털"],
                ["share", "점유율"],
                ["compare", "종목비교"],
                ["feedback", "피드백"],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => navigate(v)}
                aria-current={view === v ? "page" : undefined}
                className={`px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  view === v
                    ? "bg-[var(--panel2)] font-semibold text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <ConnectionDot />
        </div>
      </header>

      <TickerTape />
      <NightFutureBanner />
      <SummaryBar onNavigate={navigate} />

      {/* 본문 */}
      {view === "memindex" ? (
        <div className="flex flex-1 flex-col gap-3 p-3">
          <MemoryIndexChart
            onSelectStock={(t) => {
              setTicker(t);
              navigate("stocks");
            }}
          />
          <TrendStrengthPanel
            onSelectStock={(t) => {
              setTicker(t);
              navigate("stocks");
            }}
          />
        </div>
      ) : view === "spot" ? (
        <div className="flex-1 p-3">
          <SpotPanel />
        </div>
      ) : view === "fundamentals" ? (
        <div className="flex-1 p-3">
          <FundamentalsPanel />
        </div>
      ) : view === "share" ? (
        <div className="flex-1 p-3">
          <MarketSharePanel />
        </div>
      ) : view === "compare" ? (
        <div className="flex-1 p-3">
          <ComparePanel />
        </div>
      ) : view === "feedback" ? (
        <div className="flex-1 p-3">
          <FeedbackPanel />
        </div>
      ) : (
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          {/* 관심종목 */}
          <aside className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 lg:w-64">
            <Watchlist selected={ticker} onSelect={setTicker} />
          </aside>

          {/* 차트 영역 */}
          <main className="flex min-h-[60dvh] flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <SelectedHeader ticker={ticker} />
              <div
                role="tablist"
                aria-label="차트 인터벌"
                className="flex overflow-hidden rounded-md border border-[var(--border)]"
              >
                {INTERVALS.map((iv) => (
                  <button
                    key={iv}
                    role="tab"
                    aria-selected={interval === iv}
                    onClick={() => setInterval(iv)}
                    className={`px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                      interval === iv
                        ? "bg-[var(--panel2)] font-semibold text-[var(--accent)]"
                        : "text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {INTERVAL_LABELS[iv]}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[55dvh] p-2 lg:h-auto lg:min-h-0 lg:flex-1">
              <CandleChart ticker={ticker} interval={interval} />
            </div>
            <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
              미국: Finnhub 실시간 체결 + Twelve Data 과거봉 · 한국: Yahoo 지연
              시세(15~20분) + Yahoo 과거봉. 이동평균선(5/10/20/60/120)은 확정 봉
              기준입니다. 본 화면은 정보 제공 목적이며 투자 권유가 아닙니다.
            </p>
            <div className="px-2 pb-2">
              <InfoBox
                title="이동평균선(MA) 읽는 법"
                intro="이동평균선은 일정 기간 종가의 평균을 이은 선으로, 추세의 방향과 지지/저항 수준을 보여줍니다. MA5·10은 단기, MA20은 시장에서 '생명선'으로 불리는 기준선, MA60은 중기(분기), MA120은 장기(반기) 추세를 나타냅니다."
                signals={[
                  {
                    icon: "📈",
                    label: "정배열 (5>10>20>60>120)",
                    desc: "단기선이 장기선 위에 차례로 정렬 — 상승 추세가 건강하게 진행 중이라는 일반적 신호입니다.",
                  },
                  {
                    icon: "📉",
                    label: "역배열 (5<10<20<60<120)",
                    desc: "하락 추세 진행 중 — 통상 추세 전환 확인 전까지 보수적으로 접근하는 구간으로 해석됩니다.",
                  },
                  {
                    icon: "🛡️",
                    label: "MA20 지지 / 이탈",
                    desc: "주가가 MA20 부근에서 지지되면 추세 유지, 거래량을 동반해 하향 이탈하면 단기 추세 약화 신호로 봅니다.",
                  },
                  {
                    icon: "✂️",
                    label: "골든/데드 크로스",
                    desc: "단기선이 장기선을 상향 돌파(골든)하면 추세 전환 기대, 하향 돌파(데드)하면 하락 전환 경계 신호입니다.",
                  },
                ]}
              />
            </div>
          </main>
        </div>

        {/* 삼성·하이닉스: 하이퍼리퀴드 거래가 + 다음날 시초가 예측 */}
        {isSamsungOrHynix && <HyperliquidPanel ticker={ticker} />}

        {/* 종목 상세 — 실시간차트 탭에 병합 (컨센서스/재고/수주/기사) */}
        <StockDetailSections ticker={ticker} />
      </div>
      )}

      <footer className="border-t border-[var(--border)] px-4 py-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[var(--muted)]">
            <Link href="/guide" className="hover:text-[var(--accent)]">
              용어사전
            </Link>
            <Link href="/faq" className="hover:text-[var(--accent)]">
              자주 묻는 질문
            </Link>
          </nav>
          <p className="font-mono text-[10px] text-[var(--muted)]">
            투자 참고용 정보이며 투자 권유가 아닙니다. 실제 거래 시 증권사 정식
            시세를 확인하세요.
          </p>
        </div>
      </footer>

      <BottomTabBar view={view} onChange={navigate} />
    </div>
  );
}

export default function Page() {
  return (
    <MarketFeedProvider>
      <Dashboard />
    </MarketFeedProvider>
  );
}
