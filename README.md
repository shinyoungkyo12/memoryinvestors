# MemoryInvestors

메모리 반도체(DRAM/HBM/NAND) 투자 모니터링 대시보드.

**Phase 1** ✅ 미국 메모리 종목 실시간 차트 (MU·SNDK·STX·WDC·DRAM ETF)
**Phase 2** ✅ 한국 종목 (삼성전자·SK하이닉스·442580·0181B0) — KIS 실시간 / Yahoo 폴백
**Phase 3** ✅ DRAM 현물가격 자동 수집 + 추이 차트 (DRAMeXchange → GitHub Actions → Supabase)
**Phase 4** ✅ 반도체 재고(DIO) + 엔비디아 실적vs가이던스 + HBM 수주 타임라인
**Phase 5** ✅ 메모리 시장 점유율 (D램/HBM/낸드 세그먼트별 TOP3 + 분기 추이)

> 점유율 출처: 카운터포인트리서치 공개 발표치 (매출액 기준).
> 분기 발표 시 `data/market-share.json`에 1개 분기 추가 → push 하면 반영.

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
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | supabase.com (무료) | 현물가/재고/이벤트 저장소 |
| `DART_API_KEY` | opendart.fss.or.kr (무료, 선택) | 삼성전자·SK하이닉스 재고 수집 |

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

### 수주 타임라인 자동 수집 (상시)
1. Supabase SQL Editor에서 `supabase/schema-news-events.sql` 실행
2. 이후 평일 하루 3회(현물가 수집과 동일 스케줄) 메모리 수주 뉴스가 자동으로 타임라인에 추가됩니다 — "자동" 배지
3. 로컬 테스트: `npm run news:dry`
4. 자동 항목 중 중요 이벤트는 검증 후 `data/hbm-events.json`으로 승격 — "검증" 배지

### 수동 관리 데이터 (분기 1회 수준)
- `data/nvda-guidance.json` — 엔비디아 실적발표 때 다음 분기 가이던스 1줄 추가
- `data/hbm-events.json` — HBM 수주 뉴스 나올 때 항목 추가
- 수정 후 `git push` 하면 사이트 자동 반영

### 삼성전자·SK하이닉스 재고 (DART)
1. https://opendart.fss.or.kr → 회원가입 → 인증키 신청 (즉시 발급)
2. Supabase SQL Editor에서 `supabase/schema-update-1.sql` 실행 (currency 컬럼)
3. `.env.local`과 GitHub Secrets에 `DART_API_KEY` 추가
4. "펀더멘털 수집" 워크플로 실행 → 재고 차트에 삼성/하이닉스 버튼 활성화 (단위: 조원)
* 자동 수집된 수주이슈는 30일 경과 시 자동 삭제됩니다 (검증 항목은 유지)

## 4. 배포

`git push` → Vercel 자동 재배포.

## 차트/현물가 사용 메모

- 차트 인터벌: 15분 / 1시간 / 일봉 / 주봉 · 이동평균선 MA 5/10/20/60/120 (확정 봉 기준)
- DRAM 현물가 탭: 기간별 변화율 카드(1주/1개월/1분기/1년 전 대비, 데이터 없으면 "부재" 표시)
- 일별 현물가 과거치는 유료 데이터라 백필 불가 → 월별 고정거래가 보도치(data/spot-history.json)로 장기 추세 보완. 매월 말 보도 확인 후 1줄 추가

## 알려진 제약 / 주의

- DRAMeXchange는 비공식 스크래핑 — 사이트 구조 변경 시 수집 실패 가능 (`npm run scrape:dry`로 진단)
- 수집된 현물가의 **공개 재게시는 저작권 이슈 가능성** 있음 → 기본 표시를 지수화(첫날=100)로 설정. 개인 연구용 사용 권장
- Yahoo KRX 시세는 15~20분 지연 / 신규상장 ETF(0181B0)는 Yahoo 미지원 가능 → KIS 키 필요
- Twelve Data 무료: 분당 8회 (서버 캐시로 완화)
