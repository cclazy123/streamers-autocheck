-- ==========================================
-- Fix RLS policies for screenshots table ONLY
-- Allow anonymous users to INSERT screenshots
-- ==========================================

-- Drop existing problematic policies if they exist
drop policy if exists "Screenshots ratings are updateable by all" on screenshots;
drop policy if exists "Screenshots are insertable by all" on screenshots;

-- Create simple policy for insert
create policy "Screenshots are insertable by all" on screenshots
  for insert with check (true);

-- Create policy for select
create policy "Screenshots are viewable by all" on screenshots
  for select using (true);

-- Grant insert and select permission to anon
grant insert on screenshots to anon;
grant select on screenshots to anon;

-- Allow anonupdate ratings columns
create policy "Screenshots ratings are updateable by all" on screenshots
  for update with check (true);

grant update on screenshots to anon;

-- Verify the policies were created
select schemaname, tablename, policyname from pg_policies where tablename = 'screenshots';
