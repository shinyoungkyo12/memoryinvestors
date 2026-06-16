import { NextRequest, NextResponse } from "next/server";
import { resolveHlSymbol, fetchHlMid } from "@/lib/hyperliquid";

/**
 * GET /api/hl-price?ticker=005930|000660
 *
 * 하이퍼리퀴드 실시간 현재가(USD)만 가볍게 반환. 패널에서 짧은 주기로 폴링.
 */

export interface HlPriceResponse {
  ticker: string;
  symbol: string | null;
  price: number | null;
  at: number;
}

const CACHE_TTL = 3_000;
const cache = new Map<string, { at: number; price: number | null }>();

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const sym = resolveHlSymbol(ticker);

  const reply = (price: number | null): NextResponse => {
    const body: HlPriceResponse = {
      ticker,
      symbol: sym?.display ?? null,
      price,
      at: Date.now(),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  };

  if (!sym) return reply(null);

  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL) return reply(hit.price);

  const price = await fetchHlMid(sym);
  cache.set(ticker, { at: Date.now(), price });
  return reply(price);
}
