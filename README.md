# MemoryInvestors

메모리 반도체(DRAM/HBM/NAND) 투자 모니터링 대시보드.

**Phase 1 (현재):** 미국 메모리 종목 실시간 차트
- 종목: MU(마이크론) · SNDK(샌디스크) · STX(씨게이트) · WDC(웨스턴디지털) · DRAM(Roundhill Memory ETF)
- 실시간 체결: Finnhub WebSocket (클라이언트 직접 구독)
- 과거 봉(1분~일봉): Twelve Data (서버 프록시 + 캐싱)
- 차트: TradingView Lightweight Charts v5

**로드맵:** Phase 2 한국 종목(KIS API) → Phase 3 DRAM 현물가격 수집 → Phase 4 재고/엔비디아 가이던스 → Phase 5 상관관계 분석

---

## 1. 로컬 실행

```bash
npm install
cp .env.example .env.local   # 키 2개 입력
npm run dev                   # http://localhost:3000
```

API 키 발급 (둘 다 무료):
| 키 | 발급처 | 노출 범위 |
|---|---|---|
| `NEXT_PUBLIC_FINNHUB_API_KEY` | https://finnhub.io/register | 클라이언트 (WS 특성상 불가피) |
| `TWELVE_DATA_API_KEY` | https://twelvedata.com | 서버 전용 |

## 2. GitHub 업로드

```bash
git init
git add .
git commit -m "Phase 1: 미국 메모리 종목 실시간 차트"
git branch -M main
git remote add origin https://github.com/<your-id>/memoryinvestors.git
git push -u origin main
```

## 3. Vercel 배포 (push 시 자동 재배포)

1. https://vercel.com/new → GitHub `memoryinvestors` repo Import
2. **Environment Variables**에 `.env.local`의 키 2개 등록
3. Deploy — 이후 `main` 브랜치에 push 할 때마다 자동 배포됩니다

## 알려진 제약

- Twelve Data 무료: 분당 8회 / 일 800회 → 서버 캐시로 완화했으나 인터벌을 빠르게 연타하면 일시 지연 가능 (만료 캐시 폴백 동작)
- Finnhub 무료 WS: 미국 거래소 체결만 제공 → 한국 종목은 Phase 2에서 KIS API로 처리
- 장 마감 시간에는 WS 체결이 없어 REST 스냅샷(60초 주기)으로 표시됨
