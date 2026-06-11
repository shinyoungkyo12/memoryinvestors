-- Phase 4: 재고 + NVDA 매출 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

create table if not exists inventory (
  id bigint generated always as identity primary key,
  ticker text not null,
  fiscal_end date not null,
  inventory_usd numeric not null,
  cogs_usd numeric,
  dio numeric,
  created_at timestamptz not null default now(),
  unique (ticker, fiscal_end)
);
create index if not exists idx_inventory_ticker on inventory (ticker, fiscal_end);
alter table inventory enable row level security;

create table if not exists nvda_revenue (
  id bigint generated always as identity primary key,
  fiscal_end date not null unique,
  revenue_usd numeric not null,
  created_at timestamptz not null default now()
);
alter table nvda_revenue enable row level security;
