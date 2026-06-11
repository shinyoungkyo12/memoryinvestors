"use client";

/**
 * 전역 에러 바운더리 — 클라이언트 예외/청크 로드 실패 시
 * 빈 화면 대신 메시지와 새로고침 버튼을 표시합니다.
 * (배포 직후 이전 버전 페이지가 열려 있으면 새 청크를 못 찾는 경우가 흔한 원인)
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm font-bold text-[var(--text)]">
        화면을 표시하는 중 문제가 발생했습니다
      </p>
      <p className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
        사이트가 업데이트된 직후라면 새로고침으로 해결됩니다. 계속 반복되면
        아래 오류 내용을 캡처해 주세요.
      </p>
      <code className="max-w-md break-all rounded bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]">
        {error.message}
      </code>
      <div className="flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-[#0a0d13]"
        >
          새로고침
        </button>
        <button
          onClick={reset}
          className="rounded-md border border-[var(--border)] px-4 py-2 font-mono text-xs text-[var(--text)]"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
