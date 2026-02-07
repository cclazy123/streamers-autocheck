-- ==========================================
-- TikTok Live Screenshots - Database Schema
-- ==========================================

-- Accounts table (used by users adding accounts)
create table if not exists accounts (
  id bigserial primary key,
  username text not null unique,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index on username for faster lookups
create index if not exists idx_accounts_username on accounts(username) where is_deleted = false;
create index if not exists idx_accounts_created_at on accounts(created_at DESC);

-- Screenshots table (stores screenshot metadata and links)
create table if not exists screenshots (
  id bigserial primary key,
  username text not null,
  storage_path text not null,
  public_url text,
  is_live boolean default true,
  is_deleted boolean default false,
  captured_at timestamptz default now(),
  rating_count int default 0,
  rating_sum int default 0,
  average_rating decimal(3, 2) generated always as (
    case when rating_count > 0 
    then round(rating_sum::decimal / rating_count, 2)
    else null 
    end
  ) stored,
  foreign key (username) references accounts(username) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for faster queries
create index if not exists idx_screenshots_username on screenshots(username) where is_deleted = false;
create index if not exists idx_screenshots_captured_at on screenshots(captured_at DESC) where is_deleted = false;
create index if not exists idx_screenshots_username_captured_at on screenshots(username, captured_at DESC) where is_deleted = false;
create index if not exists idx_screenshots_rating_avg on screenshots(average_rating DESC) where is_deleted = false;

-- Ratings table (optional - for detailed rating history)
create table if not exists ratings (
  id bigserial primary key,
  screenshot_id bigint not null,
  rating int not null check (rating >= 1 and rating <= 5),
  rater_ip text,
  rater_session_id text,
  created_at timestamptz default now(),
  foreign key (screenshot_id) references screenshots(id) on delete cascade
);

create index if not exists idx_ratings_screenshot_id on ratings(screenshot_id);
create index if not exists idx_ratings_created_at on ratings(created_at DESC);

-- Tasks/Logs table (for tracking scheduler tasks)
create table if not exists scheduler_logs (
  id bigserial primary key,
  username text not null,
  status text not null, -- 'checking', 'captured', 'not_live', 'error'
  message text,
  screenshot_id bigint,
  error_message text,
  duration_ms int,
  created_at timestamptz default now(),
  foreign key (screenshot_id) references screenshots(id) on delete set null,
  foreign key (username) references accounts(username) on delete cascade
);

create index if not exists idx_scheduler_logs_username on scheduler_logs(username, created_at DESC);
create index if not exists idx_scheduler_logs_status on scheduler_logs(status, created_at DESC);
create index if not exists idx_scheduler_logs_created_at on scheduler_logs(created_at DESC);

-- Enable RLS (Row Level Security) - optional but recommended
alter table accounts enable row level security;
alter table screenshots enable row level security;
alter table scheduler_logs enable row level security;

-- Create policies for public read access (adjust as needed)
create policy "Accounts are viewable by all" on accounts
  for select using (is_deleted = false);

create policy "Screenshots are viewable by all" on screenshots
  for select using (is_deleted = false);

-- Grants for anonymous access (adjust based on your auth model)
grant select on accounts to anon;
grant select on screenshots to anon;
grant update(rating_count, rating_sum) on screenshots to anon;
