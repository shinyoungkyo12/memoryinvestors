"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { US_SYMBOLS } from "@/lib/symbols";
import type { QuoteSnapshot } from "@/lib/types";

/**
 * 통합 시세 피드
 * - 미국: Finnhub WebSocket 체결 스트림 (+ REST /quote 폴백 60초)
 * - 한국: /api/kr-quotes 폴링 5초 (Yahoo Finance 지연 시세)
 *
 * 주의: Finnhub 키는 브라우저 WebSocket 특성상 클라이언트에 노출됩니다(NEXT_PUBLIC_).
 * 무료 전용 키를 사용하세요.
 */

export interface Trade {
  ticker: string;
  price: number;
  volume: number;
  /** Unix ms */
  time: number;
}

export interface Quote {
  price: number;
  prevClose: number;
  changePct: number;
  /** ws=실시간 체결, rest=스냅샷, yahoo=지연 시세 */
  source: "ws" | "rest" | "yahoo";
  updatedAt: number;
}

type TradeListener = (t: Trade) => void;

interface MarketFeedValue {
  quotes: Record<string, Quote>;
  /** 미국 WS 연결 상태 */
  connected: boolean;
  /** 미국 종목 체결 스트림 구독 (차트 캔들 집계용). 반환값 = 해제 함수 */
  onTrade: (ticker: string, cb: TradeListener) => () => void;
}

const MarketFeedContext = createContext<MarketFeedValue | null>(null);

const US_QUOTE_POLL_MS = 60_000;
const KR_QUOTE_POLL_MS = 5_000;

export function MarketFeedProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<TradeListener>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

  const onTrade = useCallback((ticker: string, cb: TradeListener) => {
    const map = listenersRef.current;
    if (!map.has(ticker)) map.set(ticker, new Set());
    map.get(ticker)!.add(cb);
    return () => {
      map.get(ticker)?.delete(cb);
    };
  }, []);

  /** ── 한국: /api/kr-quotes 폴링 ───────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/kr-quotes");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { quotes?: QuoteSnapshot[] };
        if (!json.quotes) return;
        setQuotes((prev) => {
          const next = { ...prev };
          for (const q of json.quotes!) {
            next[q.ticker] = {
              price: q.price,
              prevClose: q.prevClose,
              changePct: q.changePct,
              source: q.provider,
              updatedAt: Date.now(),
            };
          }
          return next;
        });
      } catch {
        // 일시 오류는 다음 폴링에서 회복
      }
    }

    poll();
    const id = setInterval(poll, KR_QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  /** ── 미국: REST /quote 폴백 (초기값 + 장외 시간) ───────── */
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    async function fetchQuotes() {
      for (const s of US_SYMBOLS) {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${s.ticker}&token=${apiKey}`,
          );
          if (!res.ok) continue;
          const q = (await res.json()) as { c: number; pc: number };
          if (cancelled || !q.c) continue;
          setQuotes((prev) => {
            const cur = prev[s.ticker];
            if (cur?.source === "ws" && Date.now() - cur.updatedAt < 5_000) {
              return { ...prev, [s.ticker]: { ...cur, prevClose: q.pc } };
            }
            return {
              ...prev,
              [s.ticker]: {
                price: q.c,
                prevClose: q.pc,
                changePct: q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0,
                source: "rest",
                updatedAt: Date.now(),
              },
            };
          });
        } catch {
          // 개별 종목 실패는 무시
        }
      }
    }

    fetchQuotes();
    const id = setInterval(fetchQuotes, US_QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiKey]);

  /** ── 미국: WebSocket 체결 스트림 ────────────────────── */
  useEffect(() => {
    if (!apiKey) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (disposed) return;
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        for (const s of US_SYMBOLS) {
          ws.send(JSON.stringify({ type: "subscribe", symbol: s.ticker }));
        }
      };

      ws.onmessage = (ev) => {
        let msg: {
          type: string;
          data?: { s: string; p: number; v: number; t: number }[];
        };
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.type !== "trade" || !msg.data) return;

        const latest = new Map<string, { p: number; t: number }>();
        for (const d of msg.data) {
          const trade: Trade = {
            ticker: d.s,
            price: d.p,
            volume: d.v,
            time: d.t,
          };
          listenersRef.current.get(d.s)?.forEach((cb) => cb(trade));
          const prev = latest.get(d.s);
          if (!prev || d.t >= prev.t) latest.set(d.s, { p: d.p, t: d.t });
        }

        setQuotes((prev) => {
          const next = { ...prev };
          for (const [ticker, { p, t }] of latest) {
            const pc = prev[ticker]?.prevClose ?? 0;
            next[ticker] = {
              price: p,
              prevClose: pc,
              changePct: pc ? ((p - pc) / pc) * 100 : 0,
              source: "ws",
              updatedAt: t,
            };
          }
          return next;
        });
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        const delay = Math.min(30_000, 1_000 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [apiKey]);

  return (
    <MarketFeedContext.Provider value={{ quotes, connected, onTrade }}>
      {children}
    </MarketFeedContext.Provider>
  );
}

export function useMarketFeed(): MarketFeedValue {
  const ctx = useContext(MarketFeedContext);
  if (!ctx)
    throw new Error("useMarketFeed는 MarketFeedProvider 내부에서만 사용 가능합니다.");
  return ctx;
}
