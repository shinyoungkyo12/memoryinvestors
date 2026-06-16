-- 목표가 컨센서스 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

create table if not exists consensus (
  ticker text primary key,
  name_ko text,
  target_price numeric,   -- 평균 목표가 (target_mean 과 동일, 하위호환 유지)
  current_price numeric,
  opinion text,
  upside_pct numeric,      -- 평균 목표가 기준 상승여력
  captured_at timestamptz not null default now()
);
alter table consensus enable row level security;

-- 최고/평균/최저 컨센서스 확장 (Toss 형식) — 기존 테이블에도 안전하게 추가
alter table consensus add column if not exists target_high numeric;
alter table consensus add column if not exists target_low numeric;
alter table consensus add column if not exists target_mean numeric;
alter table consensus add column if not exists analyst_count int;
alter table consensus add column if not exists source text;
