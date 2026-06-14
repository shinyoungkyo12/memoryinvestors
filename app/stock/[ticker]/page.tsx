import type { Metadata } from "next";
import { getSymbol, SYMBOLS } from "@/lib/symbols";
import StockDetailClient from "@/components/StockDetailClient";

/** 빌드 시 생성할 종목 경로 (정적 생성) */
export function generateStaticParams() {
  return SYMBOLS.map((s) => ({ ticker: s.ticker }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const info = getSymbol(ticker);
  if (!info) return { title: "종목 상세 — MemoryInvestors" };
  return {
    title: `${info.nameKo}(${ticker}) 실시간 차트·목표가·재고 — MemoryInvestors`,
    description: `${info.nameKo} 메모리 반도체 종목의 실시간 차트, 증권사 목표가 컨센서스, 재고/DIO, 관련 수주이슈와 기사를 한 화면에서 확인하세요.`,
  };
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  return <StockDetailClient ticker={ticker} />;
}
