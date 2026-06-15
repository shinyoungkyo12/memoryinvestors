/**
 * 사이트 공통 메타 정보 (SEO)
 *
 * 배포 도메인:
 *  - NEXT_PUBLIC_SITE_URL 우선 (직접 지정, 예: https://memoryinvestors.vercel.app)
 *  - 없으면 Vercel 자동 주입 VERCEL_URL 사용
 *  - 둘 다 없으면 로컬
 */

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveBaseUrl();

export const SITE_NAME = "MemoryInvestors";

export const SITE_TITLE =
  "MemoryInvestors — 메모리 반도체 현물가·지수·목표가 한눈에";

export const SITE_DESCRIPTION =
  "DRAM·HBM·NAND 현물가, 자체 메모리 반도체 지수, 삼성전자·SK하이닉스·마이크론 등 종목별 실시간 차트·목표가 컨센서스·재고(DIO)·점유율을 한 화면에서. 삼성·하이닉스 다음날 시초가 예측까지.";

/** 검색 타깃 키워드 */
export const SITE_KEYWORDS = [
  "DRAM 현물가",
  "HBM 점유율",
  "메모리 반도체 재고",
  "삼성전자 목표가",
  "SK하이닉스 목표가",
  "메모리 반도체 지수",
  "마이크론 주가",
  "낸드 현물가",
  "DDR5 가격",
  "시초가 예측",
  "메모리 반도체 ETF",
];
