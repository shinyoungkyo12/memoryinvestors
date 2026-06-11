-- DRAM 현물가격 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

create table if not exists dram_spot (
  id bigint generated always as identity primary key,
  captured_date date not null,
  item text not null,
  price numeric not null,
  change_pct numeric,
  created_at timestamptz not null default now(),
  unique (item, captured_date)
);

create index if not exists idx_dram_spot_date on dram_spot (captured_date);
create index if not exists idx_dram_spot_item on dram_spot (item);

-- RLS 활성화: service_role 키(서버/Actions)만 쓰기, 외부 직접 접근 차단
alter table dram_spot enable row level security;
