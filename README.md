# MemoryInvestors

메모리 반도체(DRAM/HBM/NAND) 투자 모니터링 대시보드.

**Phase 1** ✅ 미국 메모리 종목 실시간 차트 (MU·SNDK·STX·WDC·DRAM ETF)
**Phase 2** ✅ 한국 종목 (삼성전자·SK하이닉스·442580·0181B0) — KIS 실시간 / Yahoo 폴백
**Phase 3** ✅ DRAM 현물가격 자동 수집 + 추이 차트 (DRAMeXchange → GitHub Actions → Supabase)
**Phase 4** ✅ 반도체 재고(DIO) + 엔비디아 실적vs가이던스 + HBM 수주 타임라인
**Phase 5** ✅ 현물가-주가 상관 히트맵 + Lead-Lag 선행성 분석

> 상관분석은 현물가 표본 30거래일 이상부터 통계적으로 유의미합니다.
> 별도 설정 불필요 — 현물가가 쌓이면 [상관분석] 탭이 자동으로 채워집니다.

---

## 1. 로컬 실행

```bash
npm install
cp .env.example .env.local   # 키 입력
npm run dev                   # http://localhost:3000
```

| 환경변수 | 발급처 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_FINNHUB_API_KEY` | finnhub.io (무료) | 미국 실시간 체결 |
| `TWELVE_DATA_API_KEY` | twelvedata.com (무료) | 미국 과거 봉 |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | apiportal.koreainvestment.com (선택) | 한국 실시간 현재가. 미설정 시 Yahoo 지연시세 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | supabase.com (무료) | DRAM 현물가 저장소 |

## 2. DRAM 현물가 수집 설정 (Phase 3)

### 2-1. Supabase 준비
1. https://supabase.com → New project (무료)
2. SQL Editor → `supabase/schema.sql` 내용 붙여넣고 **Run**
3. Project Settings → API → `URL`과 `service_role` 키 복사

### 2-2. GitHub Secrets 등록
repo → Settings → Secrets and variables → Actions → New repository secret
```
SUPABASE_URL              = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = (service_role 키)
```

### 2-3. 첫 수집 실행
repo → Actions 탭 → "DRAM 현물가 수집" → **Run workflow**
이후 평일 KST 10:30 / 14:30 / 17:30 자동 수집.

### 2-4. Vercel 환경변수 추가
Vercel → Settings → Environment Variables에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 추가 → Redeploy

### 로컬에서 파싱 테스트
```bash
npm run scrape:dry   # DB 저장 없이 파싱 결과만 출력
```

## 3. 펀더멘털 수집 설정 (Phase 4)

1. Supabase SQL Editor에서 `supabase/schema-phase4.sql` 실행 (테이블 2개 추가)
2. GitHub → Actions → "펀더멘털 수집 (재고·NVDA 매출)" → Run workflow (첫 수집)
   - 이후 매주 월요일 09:00 KST 자동 실행
   - 별도 키 불필요 (SEC EDGAR는 무료 공개 API)
3. 로컬 테스트: `npm run fundamentals:dry`

### 수동 관리 데이터 (분기 1회 수준)
- `data/nvda-guidance.json` — 엔비디아 실적발표 때 다음 분기 가이던스 1줄 추가
- `data/hbm-events.json` — HBM 수주 뉴스 나올 때 항목 추가
- 수정 후 `git push` 하면 사이트 자동 반영

## 4. 배포

`git push` → Vercel 자동 재배포.

## 알려진 제약 / 주의

- DRAMeXchange는 비공식 스크래핑 — 사이트 구조 변경 시 수집 실패 가능 (`npm run scrape:dry`로 진단)
- 수집된 현물가의 **공개 재게시는 저작권 이슈 가능성** 있음 → 기본 표시를 지수화(첫날=100)로 설정. 개인 연구용 사용 권장
- Yahoo KRX 시세는 15~20분 지연 / 신규상장 ETF(0181B0)는 Yahoo 미지원 가능 → KIS 키 필요
- Twelve Data 무료: 분당 8회 (서버 캐시로 완화)
