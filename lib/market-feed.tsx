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
import { SYMBOLS } from "@/lib/symbols";

/**
 * Finnhub 실시간 피드
 * - WebSocket(wss://ws.finnhub.io) 으로 전 종목 체결(trade) 구독
 * - 장 마감/연결 전 초기 시세는 REST /quote 로 확보 (60초 주기 폴백 갱신)
 *
 * 주의: 브라우저 WebSocket 특성상 Finnhub 키는 클라이언트에 노출됩니다(NEXT_PUBLIC_).
 * Finnhub 무료 키는 호출량 제한만 있으므로 키 자체를 무료 전용으로 발급해 사용하세요.
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
  /** "ws" = 실시간 체결 반영, "rest" = REST 스냅샷 */
  source: "ws" | "rest";
  updatedAt: number;
}

type TradeListener = (t: Trade) => void;

interface MarketFeedValue {
  quotes: Record<string, Quote>;
  /** WS 연결 상태 */
  connected: boolean;
  /** 특정 종목 체결 스트림 구독 (차트 캔들 집계용). 반환값 = 해제 함수 */
  onTrade: (ticker: string, cb: TradeListener) => () => void;
}

const MarketFeedContext = createContext<MarketFeedValue | null>(null);

const QUOTE_POLL_MS = 60_000;

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

  /** REST /quote 폴백: 초기값 + 장중 WS 누락 대비 주기 갱신 */
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    async function fetchQuotes() {
      for (const s of SYMBOLS) {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${s.ticker}&token=${apiKey}`,
          );
          if (!res.ok) continue;
          const q = (await res.json()) as { c: number; pc: number };
          if (cancelled || !q.c) continue;
          setQuotes((prev) => {
            const cur = prev[s.ticker];
            // 최근 5초 내 WS 체결이 있으면 REST 값으로 덮지 않음
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
          // 개별 종목 실패는 무시하고 다음 종목 진행
        }
      }
    }

    fetchQuotes();
    const id = setInterval(fetchQuotes, QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiKey]);

  /** WebSocket 연결 + 자동 재연결(지수 백오프) */
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
        for (const s of SYMBOLS) {
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

        // 동일 메시지 내 종목별 마지막 체결만 시세에 반영
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
