-- 업데이트 1: 재고 테이블에 통화 컬럼 추가 (삼성전자/SK하이닉스 = KRW)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

alter table inventory
  add column if not exists currency text not null default 'USD';
