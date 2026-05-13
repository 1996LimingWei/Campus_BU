-- -----------------------------------------------------------------------------
-- COURSE EXCHANGE FEATURE MIGRATION (V2 - DEMO COMPATIBLE)
-- This script sets up the tables, policies, and functions for the course exchange feature.
-- -----------------------------------------------------------------------------

-- 1. Create Course Exchanges Table
CREATE TABLE IF NOT EXISTS public.course_exchanges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text, -- Changed from uuid to text to support demo_user
  user_name text,
  user_avatar text,
  user_major text,
  have_course text,
  have_section text,
  have_teacher text,
  have_time text,
  want_courses jsonb,
  reason text,
  contacts jsonb,
  status text DEFAULT 'open',
  comment_count int DEFAULT 0,
  likes int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Upgrade existing table if it exists
DO $$ 
BEGIN
  -- 1. Ensure columns exist (for old versions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_exchanges' AND column_name='have_section') THEN
    ALTER TABLE public.course_exchanges ADD COLUMN have_section text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_exchanges' AND column_name='have_teacher') THEN
    ALTER TABLE public.course_exchanges ADD COLUMN have_teacher text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_exchanges' AND column_name='have_time') THEN
    ALTER TABLE public.course_exchanges ADD COLUMN have_time text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_exchanges' AND column_name='want_courses') THEN
    ALTER TABLE public.course_exchanges ADD COLUMN want_courses jsonb;
  END IF;

  -- 2. Convert user_id from uuid to text to support "demo_user" string
  -- First drop the foreign key if it exists
  ALTER TABLE public.course_exchanges DROP CONSTRAINT IF EXISTS course_exchanges_user_id_fkey;
  -- Change type
  ALTER TABLE public.course_exchanges ALTER COLUMN user_id TYPE text;
END $$;

-- RLS for Course Exchanges
ALTER TABLE public.course_exchanges ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Exchanges are viewable by everyone.' AND tablename = 'course_exchanges') THEN
    CREATE POLICY "Exchanges are viewable by everyone." ON public.course_exchanges FOR SELECT USING ( true );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can insert exchange requests.' AND tablename = 'course_exchanges') THEN
    CREATE POLICY "Anyone can insert exchange requests." ON public.course_exchanges FOR INSERT WITH CHECK ( true );
  END IF;
END $$;


-- 2. Create Exchange Comments Table
CREATE TABLE IF NOT EXISTS public.exchange_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exchange_id uuid REFERENCES public.course_exchanges(id) ON DELETE CASCADE,
  author_id text, -- Changed from uuid to text to support demo_user
  author_name text,
  author_avatar text,
  content text,
  created_at timestamptz DEFAULT now()
);

-- Upgrade existing comments table
DO $$ 
BEGIN
  ALTER TABLE public.exchange_comments DROP CONSTRAINT IF EXISTS exchange_comments_author_id_fkey;
  ALTER TABLE public.exchange_comments ALTER COLUMN author_id TYPE text;
END $$;

-- RLS for Exchange Comments
ALTER TABLE public.exchange_comments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Comments are viewable by everyone.' AND tablename = 'exchange_comments') THEN
    CREATE POLICY "Comments are viewable by everyone." ON public.exchange_comments FOR SELECT USING ( true );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can insert exchange comments.' AND tablename = 'exchange_comments') THEN
    CREATE POLICY "Anyone can insert exchange comments." ON public.exchange_comments FOR INSERT WITH CHECK ( true );
  END IF;
END $$;


-- 3. Function to increment comment count (RPC)
CREATE OR REPLACE FUNCTION public.increment_exchange_comment_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.course_exchanges
  SET comment_count = comment_count + 1
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Data API GRANT（公开数据，anon 可读）
grant select                                                     on public.course_exchanges  to anon;
grant select, insert, update, delete                             on public.course_exchanges  to authenticated;
grant select, insert, update, delete                             on public.course_exchanges  to service_role;

grant select                                                     on public.exchange_comments to anon;
grant select, insert, update, delete                             on public.exchange_comments to authenticated;
grant select, insert, update, delete                             on public.exchange_comments to service_role;
