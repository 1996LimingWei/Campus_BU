-- -----------------------------------------------------------------------------
-- NOTIFICATION CENTER MIGRATION
-- This script sets up the table for storing user notifications.
-- -----------------------------------------------------------------------------

-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL, -- The recipient (supports text for demo_user)
  type text NOT NULL, -- 'comment', 'like', 'system', 'agent_match'
  title text NOT NULL,
  content text NOT NULL,
  related_id uuid, -- Reference to the resource (exchange_id, etc.)
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Users can only see their own notifications
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own notifications.' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can view their own notifications." ON public.notifications 
    FOR SELECT USING ( auth.uid()::text = user_id OR user_id = 'demo_user' );
  END IF;
  
  -- Service role or functions can insert notifications
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'System can insert notifications.' AND tablename = 'notifications') THEN
    CREATE POLICY "System can insert notifications." ON public.notifications 
    FOR INSERT WITH CHECK ( true );
  END IF;

  -- Users can update their own notifications (to mark as read)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own notifications.' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can update their own notifications." ON public.notifications 
    FOR UPDATE USING ( auth.uid()::text = user_id OR user_id = 'demo_user' );
  END IF;
END $$;

-- 2. Enable Realtime (Crucial for the "Alert" tab to update live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
