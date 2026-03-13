-- App Admins Table
-- Stores list of administrators for the CampusCopy app
-- Admins have special privileges like content moderation, user management, etc.

-- Step 1: Drop existing policies (to avoid "already exists" errors)
DROP POLICY IF EXISTS "public_check_admin_status" ON public.app_admins;
DROP POLICY IF EXISTS "admins_view_admin_list" ON public.app_admins;
DROP POLICY IF EXISTS "admins_insert_admins" ON public.app_admins;
DROP POLICY IF EXISTS "admins_update_admins" ON public.app_admins;
DROP POLICY IF EXISTS "admins_delete_admins" ON public.app_admins;

-- Step 2: Drop existing trigger/function for updated_at (clean slate)
DROP TRIGGER IF EXISTS trigger_app_admins_updated_at ON public.app_admins;
DROP FUNCTION IF EXISTS update_app_admins_updated_at();

-- Step 3: Drop existing helper functions (to avoid conflicts)
DROP FUNCTION IF EXISTS grant_admin_status(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS revoke_admin_status(uuid, uuid, text);
DROP FUNCTION IF EXISTS is_user_admin(uuid);

-- Step 4: Create/Recreate app_admins table (safe with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.app_admins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade unique,
  email text not null,
  granted_by uuid references public.users(id),
  granted_at timestamptz default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  revoke_reason text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Step 5: Create/recreate indexes (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_app_admins_user_id ON public.app_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_app_admins_email ON public.app_admins(email);
CREATE INDEX IF NOT EXISTS idx_app_admins_is_active ON public.app_admins(is_active);

-- Step 6: Enable RLS (idempotent - no error if already enabled)
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

-- Step 7: Recreate Policies (no duplicates now)
-- SIMPLE POLICY: Allow users to see their own admin status ONLY
-- This avoids recursion by not using subqueries
CREATE POLICY "public_check_admin_status" ON public.app_admins FOR SELECT TO authenticated USING (
  user_id = auth.uid()
);

-- Admin management policies (require existing admin) - use simple check
CREATE POLICY "admins_manage_admins" ON public.app_admins FOR ALL TO authenticated USING (
  user_id = auth.uid()  -- Users can always manage their own record
  OR 
  EXISTS (  -- Existing admins can manage others
    SELECT 1 FROM public.app_admins AS admin_check
    WHERE admin_check.user_id = auth.uid() 
    AND admin_check.is_active = true
  )
);

-- Step 8: Recreate auto-update updated_at trigger/function
CREATE OR REPLACE FUNCTION update_app_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_app_admins_updated_at
  BEFORE UPDATE ON public.app_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_app_admins_updated_at();

-- Step 9: Recreate helper functions
-- Function to grant admin status
CREATE OR REPLACE FUNCTION grant_admin_status(
  target_user_id uuid,
  target_email text,
  granter_user_id uuid,
  reason text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  existing_admin RECORD;
  result json;
BEGIN
  -- Check if granter is an active admin
  IF NOT EXISTS (
    SELECT 1 FROM public.app_admins 
    WHERE user_id = granter_user_id AND is_active = true
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only active admins can grant admin status');
  END IF;

  -- Check if user already has active admin status
  SELECT * INTO existing_admin
  FROM public.app_admins
  WHERE user_id = target_user_id AND is_active = true;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User already has admin status');
  END IF;

  -- If user had admin status before and it was revoked, reactivate it
  IF EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = target_user_id AND is_active = false
  ) THEN
    UPDATE public.app_admins
    SET is_active = true,
        revoked_at = NULL,
        revoked_by = NULL,
        revoke_reason = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
    
    RETURN json_build_object('success', true, 'action', 'reactivated');
  END IF;

  -- Grant new admin status
  INSERT INTO public.app_admins (user_id, email, granted_by, granted_at, is_active, revoke_reason)
  VALUES (target_user_id, target_email, granter_user_id, now(), true, NULL);

  RETURN json_build_object('success', true, 'action', 'granted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke admin status
CREATE OR REPLACE FUNCTION revoke_admin_status(
  target_user_id uuid,
  revoker_user_id uuid,
  reason text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  admin_record RECORD;
  result json;
BEGIN
  -- Check if revoker is an active admin
  IF NOT EXISTS (
    SELECT 1 FROM public.app_admins 
    WHERE user_id = revoker_user_id AND is_active = true
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only active admins can revoke admin status');
  END IF;

  -- Get admin record
  SELECT * INTO admin_record
  FROM public.app_admins
  WHERE user_id = target_user_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User does not have active admin status');
  END IF;

  -- Revoke admin status
  UPDATE public.app_admins
  SET is_active = false,
      revoked_at = now(),
      revoked_by = revoker_user_id,
      revoke_reason = reason,
      updated_at = now()
  WHERE user_id = target_user_id;

  RETURN json_build_object('success', true, 'action', 'revoked');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(check_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = check_user_id AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert initial admin (you can add more here)
-- Note: You need to replace '{{USER_ID}}' with the actual UUID after the user registers
-- For now, this is a template - you'll need to manually get the user_id from auth.users
-- Example:
-- INSERT INTO public.app_admins (user_id, email, granted_by, is_active)
-- SELECT 
--   u.id,
--   '25421751@life.hkbu.edu.hk',
--   u.id, -- Self-granted for initial setup
--   true
-- FROM auth.users u
-- WHERE u.email = '25421751@life.hkbu.edu.hk';