import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MemoryInvestors — 메모리 반도체 대시보드";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0a0d13 0%, #131a26 100%)",
          color: "#e8edf4",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "#d8a24a",
            fontSize: 28,
            letterSpacing: 6,
            marginBottom: 24,
          }}
        >
          ● MEMORY INVESTORS
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 28,
            display: "flex",
          }}
        >
          메모리 반도체 펀더멘털을
          <br />한 화면에서
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#8a93a5",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          DRAM·HBM·NAND 현물가 · 자체 지수 · 목표가 · 재고 · 점유율
        </div>
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 12,
          }}
        >
          {["삼성전자", "SK하이닉스", "마이크론", "시초가 예측"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 24,
                padding: "8px 20px",
                borderRadius: 8,
                background: "rgba(216,162,74,0.15)",
                border: "1px solid rgba(216,162,74,0.4)",
                color: "#d8a24a",
                display: "flex",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
