import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "메모리 반도체 용어사전",
  description:
    "DRAM 현물가, 고정거래가, HBM, DIO(재고일수), NAND, DDR5 등 메모리 반도체 투자에 필요한 핵심 용어를 쉽게 정리했습니다.",
  alternates: { canonical: "/guide" },
};

interface Term {
  term: string;
  en?: string;
  desc: string;
}

const TERMS: { group: string; items: Term[] }[] = [
  {
    group: "가격 지표",
    items: [
      {
        term: "현물가",
        en: "Spot Price",
        desc: "메모리 반도체가 그때그때 시장에서 즉시 거래되는 가격. 수요·공급에 민감하게 반응해 업황의 선행지표로 쓰입니다. 다만 전체 거래의 일부(약 10% 이하)만 현물로 거래됩니다.",
      },
      {
        term: "고정거래가",
        en: "Contract Price",
        desc: "제조사와 대형 고객사가 월·분기 단위로 계약하는 가격. 실제 매출의 대부분을 차지하며, 현물가 흐름을 후행해서 반영하는 경향이 있습니다.",
      },
      {
        term: "DDR5 / DDR4",
        desc: "DRAM의 세대 규격. 숫자가 클수록 최신·고성능이며, AI 서버 수요로 DDR5 비중이 빠르게 늘고 있습니다.",
      },
    ],
  },
  {
    group: "제품 종류",
    items: [
      {
        term: "DRAM",
        desc: "데이터를 임시 저장하는 휘발성 메모리. PC·서버·모바일의 주기억장치로 쓰이며 삼성전자·SK하이닉스·마이크론이 과점합니다.",
      },
      {
        term: "HBM",
        en: "High Bandwidth Memory",
        desc: "DRAM을 수직으로 쌓아 데이터 대역폭을 크게 높인 고성능 메모리. AI 가속기(GPU)에 필수로 들어가며, SK하이닉스가 시장을 선도합니다. 현물시장 없이 전량 계약으로 거래됩니다.",
      },
      {
        term: "NAND 플래시",
        desc: "전원이 꺼져도 데이터가 유지되는 비휘발성 메모리. SSD·USB·메모리카드에 쓰입니다. 삼성전자·SK하이닉스·키오시아·샌디스크 등이 경쟁합니다.",
      },
    ],
  },
  {
    group: "재무 지표",
    items: [
      {
        term: "DIO (재고일수)",
        en: "Days Inventory Outstanding",
        desc: "보유 재고를 모두 파는 데 걸리는 평균 일수. 높을수록 재고가 쌓여 업황이 둔화됐다는 신호, 낮아지면 수요 회복 신호로 해석합니다.",
      },
      {
        term: "재고자산",
        en: "Inventory",
        desc: "아직 팔리지 않은 제품·원재료의 가치. 메모리 업황의 바닥·고점을 가늠하는 핵심 지표입니다.",
      },
      {
        term: "목표가 컨센서스",
        desc: "여러 증권사 애널리스트가 제시한 목표주가의 평균. 현재가 대비 상승 여력을 가늠하는 참고 지표입니다.",
      },
    ],
  },
  {
    group: "이 사이트 용어",
    items: [
      {
        term: "메모리 반도체 지수",
        desc: "이 사이트가 자체 산출한 지수. ETF를 제외한 메모리 반도체 6종목(삼성·하이닉스·마이크론·샌디스크·씨게이트·웨스턴디지털)의 주가를 나스닥지수처럼 묶어 섹터 전체 흐름을 한눈에 봅니다. 공식 지수가 아닌 참고용입니다.",
      },
      {
        term: "다음날 시초가 예측",
        desc: "삼성·하이닉스에 한해, DRAM 현물(DXI)과 하이퍼리퀴드(Hyperliquid) 거래가의 수익률로 다음날 KRX 시초가 갭을 다중 선형회귀해 추정합니다. 과거 표본의 방향 적중률을 신뢰도(%)로 함께 표기하는 참고용 지표입니다.",
      },
      {
        term: "방향 적중률 (신뢰도)",
        desc: "예측 모델이 과거 데이터에서 상승/하락 '방향'을 맞힌 비율. 예측 시초가 갭의 부호가 실제와 일치한 표본의 비율을 백분율로 나타낸 값으로, 값이 높을수록 방향 예측이 신뢰할 만함을 뜻합니다.",
      },
    ],
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="font-mono text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        ← 대시보드
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-[var(--text)]">
        메모리 반도체 용어사전
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        메모리 반도체 투자에 자주 등장하는 핵심 용어를 쉽게 풀어 정리했습니다.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {TERMS.map((g) => (
          <section key={g.group}>
            <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
              {g.group}
            </h2>
            <dl className="flex flex-col gap-4">
              {g.items.map((t) => (
                <div
                  key={t.term}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
                >
                  <dt className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-[var(--text)]">
                      {t.term}
                    </span>
                    {t.en && (
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {t.en}
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                    {t.desc}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </main>
  );
}
