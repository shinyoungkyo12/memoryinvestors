"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 당겨서 새로고침 — 모바일 전용.
 * 페이지 최상단(scrollY=0)에서 아래로 충분히 당기면 location.reload().
 * 데스크톱/마우스에는 영향 없음(터치 이벤트만 사용).
 */

const THRESHOLD = 70; // px

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      // 최상단에서만 시작
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        // 저항감: 실제 이동의 일부만 반영
        setPull(Math.min(dy * 0.5, THRESHOLD + 20));
      }
    };
    const onEnd = () => {
      if (startY.current === null) return;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        // 살짝 보여준 뒤 새로고침
        setTimeout(() => window.location.reload(), 300);
      } else {
        setPull(0);
      }
      startY.current = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pull, refreshing]);

  if (pull === 0 && !refreshing) return null;

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center lg:hidden"
      style={{ height: `${pull}px`, opacity: progress }}
    >
      <div className="flex items-center gap-2 font-mono text-xs text-[var(--accent)]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: `rotate(${progress * 360}deg)`,
            transition: refreshing ? "none" : "transform 0.1s",
            animation: refreshing ? "spin 0.8s linear infinite" : "none",
          }}
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        {refreshing
          ? "새로고침 중…"
          : progress >= 1
            ? "놓으면 새로고침"
            : "당겨서 새로고침"}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
