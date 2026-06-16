import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "자주 묻는 질문 (FAQ)",
  description:
    "메모리 반도체 현물가는 어디서 보나요? HBM 점유율, 다음날 시초가 예측, 메모리 지수 산출 방식 등 자주 묻는 질문을 정리했습니다.",
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "DRAM 현물가는 어디서 확인하나요?",
    a: "이 사이트의 '메모리 현물가' 탭에서 DRAM·NAND 주요 제품의 현물가 추이를 확인할 수 있습니다. 현물가는 시장에서 즉시 거래되는 가격으로, 메모리 업황의 선행지표로 활용됩니다.",
  },
  {
    q: "HBM 점유율은 어떻게 되나요?",
    a: "'점유율' 탭에서 D램·HBM·NAND 시장의 제조사별 점유율을 확인할 수 있습니다. HBM 시장은 SK하이닉스가 선도하고 있으며, 삼성전자·마이크론이 추격하는 구도입니다. 데이터는 시장조사기관 발표 기준으로 갱신됩니다.",
  },
  {
    q: "메모리 반도체 지수는 어떻게 산출되나요?",
    a: "ETF를 제외한 메모리 반도체 6종목(삼성전자·SK하이닉스·마이크론·샌디스크·씨게이트·웨스턴디지털)의 주가를 기준일 대비 수익률로 동일가중 평균해 산출합니다. 나스닥지수처럼 섹터 전체 흐름을 한눈에 보기 위한 이 사이트의 자체 지표이며, 특정 기관의 공식 지수가 아닙니다.",
  },
  {
    q: "삼성·하이닉스의 다음날 시초가 예측은 어떻게 계산되나요?",
    a: "실시간 차트에서 삼성전자·SK하이닉스를 선택하면 하이퍼리퀴드(Hyperliquid) 거래가와 함께 다음날 시초가 예측을 볼 수 있습니다. DRAM 현물(DXI)·하이퍼리퀴드 수익률로 다음날 KRX 시초가 갭을 다중 선형회귀해 예측하며, 과거 표본의 방향(상승/하락) 적중률을 신뢰도(%)로 표기합니다. 실제 시초가와 오차가 있을 수 있는 투자 참고용 지표입니다.",
  },
  {
    q: "목표가 컨센서스는 얼마나 자주 갱신되나요?",
    a: "평일 장 마감 후(16:30 KST) 자동으로 갱신됩니다. 증권사 애널리스트들의 목표주가 평균과 현재가 대비 상승 여력을 종목 상세 페이지에서 확인할 수 있습니다. 현재 한국 2사(삼성·하이닉스) 기준입니다.",
  },
  {
    q: "재고일수(DIO)는 왜 중요한가요?",
    a: "DIO는 보유 재고를 모두 파는 데 걸리는 평균 일수입니다. 메모리 업황은 재고 사이클에 크게 좌우되기 때문에, DIO가 높아지면 업황 둔화, 낮아지면 수요 회복 신호로 해석합니다. 종목 상세 페이지에서 분기별 재고와 DIO를 확인할 수 있습니다.",
  },
  {
    q: "이 사이트의 정보로 투자해도 되나요?",
    a: "이 사이트가 제공하는 모든 시세·지표·차트는 투자 참고용 정보이며, 특정 종목이나 거래에 대한 투자 권유가 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게 있으며, 실제 거래 시에는 증권사의 정식 시세를 확인하시기 바랍니다.",
  },
];

export default function FaqPage() {
  // JSON-LD 구조화 데이터 (검색엔진 리치 결과)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/"
        className="font-mono text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        ← 대시보드
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-[var(--text)]">
        자주 묻는 질문
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        메모리 반도체 데이터와 이 사이트 사용법에 대한 자주 묻는 질문입니다.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
          >
            <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text)] marker:hidden">
              <span className="mr-2 text-[var(--accent)]">Q.</span>
              {f.q}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </main>
  );
}
