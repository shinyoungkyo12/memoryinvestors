import { NextResponse } from "next/server";

/**
 * GET /api/hl-debug
 * Hyperliquid API 응답 진단용 (개발/운영 확인 목적).
 * SAMSUNG / SKHYNIX 키가 어떻게 반환되는지 확인.
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";

async function tryPost(label: string, body: unknown) {
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const status = res.status;
    if (!res.ok) return { label, status, error: `HTTP ${status}` };
    const json = await res.json();

    if (Array.isArray(json)) {
      return { label, status, type: "array", length: json.length, sample: json.slice(0, 2) };
    }
    if (json && typeof json === "object") {
      const keys = Object.keys(json);
      const targets: Record<string, unknown> = {};
      for (const k of ["SAMSUNG", "SKHYNIX", "xyz:SAMSUNG", "xyz:SKHYNIX"]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (k in json) targets[k] = (json as any)[k];
      }
      return {
        label,
        status,
        type: "object",
        totalKeys: keys.length,
        sampleKeys: keys.slice(0, 20),
        targetKeys: targets,
      };
    }
    return { label, status, type: typeof json };
  } catch (e) {
    return { label, error: String(e) };
  }
}

async function tryCandleSnapshot(coin: string) {
  const end = Date.now();
  const start = end - 30 * 86_400_000;
  return tryPost(`candleSnapshot:${coin}`, {
    type: "candleSnapshot",
    req: { coin, interval: "1d", startTime: start, endTime: end },
  });
}

export async function GET() {
  const [
    allMids,
    allMidsDexXyz,
    candleSamsung,
    candleSamsungXyz,
    candleSkhynix,
    candleSkhynixXyz,
  ] = await Promise.all([
    tryPost("allMids (standard)", { type: "allMids" }),
    tryPost("allMids (dex:xyz)", { type: "allMids", dex: "xyz" }),
    tryCandleSnapshot("SAMSUNG"),
    tryCandleSnapshot("xyz:SAMSUNG"),
    tryCandleSnapshot("SKHYNIX"),
    tryCandleSnapshot("xyz:SKHYNIX"),
  ]);

  return NextResponse.json(
    { allMids, allMidsDexXyz, candleSamsung, candleSamsungXyz, candleSkhynix, candleSkhynixXyz },
    { headers: { "Cache-Control": "no-store" } },
  );
}
