"use client";

/**
 * 피드백 / 오류 제보 패널
 * - 외부 구글폼으로 연결 (새 창)
 * - 오류 제보 / 기능 제안 / 데이터 오류 등을 안내
 */

const FORM_URL = "https://forms.gle/pqBLSHekL5TGBFx67";

const TOPICS: { icon: string; title: string; desc: string }[] = [
  {
    icon: "🐛",
    title: "오류 제보",
    desc: "시세가 안 뜨거나 화면이 깨지는 등 버그를 발견하셨다면 알려주세요.",
  },
  {
    icon: "💡",
    title: "기능 제안",
    desc: "추가됐으면 하는 종목·지표·기능이 있다면 자유롭게 제안해 주세요.",
  },
  {
    icon: "📊",
    title: "데이터 오류",
    desc: "현물가·재고·목표가·ETF 구성 등 데이터가 실제와 다르면 제보해 주세요.",
  },
];

export default function FeedbackPanel() {
  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-col items-center text-center">
          <span className="text-4xl">💬</span>
          <h2 className="mt-3 text-xl font-bold text-[var(--text)]">
            피드백 · 오류 제보
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            여러분의 의견이 이 사이트를 더 정확하고 유용하게 만듭니다. 작은
            오류나 사소한 제안도 환영합니다.
          </p>

          <a
            href={FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-mono text-sm font-bold text-[#0a0d13] transition-opacity hover:opacity-90"
          >
            피드백 보내기
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7M17 7H8M17 7v9" />
            </svg>
          </a>
          <span className="mt-2 font-mono text-[10px] text-[var(--muted)]">
            구글 폼으로 연결됩니다 (새 창)
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {TOPICS.map((t) => (
            <div
              key={t.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel2)]/30 p-3 text-center"
            >
              <div className="text-2xl">{t.icon}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                {t.title}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                {t.desc}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
