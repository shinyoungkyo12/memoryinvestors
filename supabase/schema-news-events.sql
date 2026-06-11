-- 수주 이벤트 자동 수집 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run

create table if not exists news_events (
  id bigint generated always as identity primary key,
  event_date date not null,
  title text not null,
  source text,
  url text not null unique,
  companies text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_news_events_date on news_events (event_date desc);
alter table news_events enable row level security;
