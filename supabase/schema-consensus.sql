-- 목표가 컨센서스 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

create table if not exists consensus (
  ticker text primary key,
  name_ko text,
  target_price numeric,
  current_price numeric,
  opinion text,
  upside_pct numeric,
  captured_at timestamptz not null default now()
);
alter table consensus enable row level security;
