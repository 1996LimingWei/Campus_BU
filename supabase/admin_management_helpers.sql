-- Admin Management Helper Functions
-- Use these functions in Supabase SQL Editor to manage admins easily

-- ============================================================
-- HOW TO USE:
-- ============================================================
-- 1. To ADD an admin:
--    SELECT add_admin('user-email@example.com', 'Reason for adding');
-- 
-- 2. To REMOVE an admin:
--    SELECT remove_admin('user-email@example.com', 'Reason for removal');
-- 
-- 3. To CHECK if user is admin:
--    SELECT check_admin_status('user-email@example.com');
-- 
-- 4. To LIST all active admins:
--    SELECT * FROM list_all_admins();
-- ============================================================

-- Function to add admin by email
CREATE OR REPLACE FUNCTION add_admin(
  target_email text,
  reason text DEFAULT 'Added via SQL'
)
RETURNS json AS $$
DECLARE
  target_user_id uuid;
  current_admin_id uuid;
  result json;
BEGIN
  -- Get the user_id from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  -- Check if user exists
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with email: ' || target_email);
  END IF;

  -- Get an active admin to act as granter (use the first active admin found)
  SELECT user_id INTO current_admin_id
  FROM public.app_admins
  WHERE is_active = true
  LIMIT 1;

  -- If no active admin exists, allow self-grant (for initial setup)
  IF current_admin_id IS NULL THEN
    current_admin_id := target_user_id;
  END IF;

  -- Use the grant_admin_status function
  SELECT grant_admin_status(target_user_id, target_email, current_admin_id, reason) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove admin by email
CREATE OR REPLACE FUNCTION remove_admin(
  target_email text,
  reason text DEFAULT 'Removed via SQL'
)
RETURNS json AS $$
DECLARE
  target_user_id uuid;
  current_admin_id uuid;
  result json;
BEGIN
  -- Get the user_id from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  -- Check if user exists
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with email: ' || target_email);
  END IF;

  -- Get an active admin to act as revoker
  SELECT user_id INTO current_admin_id
  FROM public.app_admins
  WHERE is_active = true AND user_id != target_user_id
  LIMIT 1;

  -- If no other admin exists, allow self-revoke
  IF current_admin_id IS NULL THEN
    current_admin_id := target_user_id;
  END IF;

  -- Use the revoke_admin_status function
  SELECT revoke_admin_status(target_user_id, current_admin_id, reason) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check admin status by email
CREATE OR REPLACE FUNCTION check_admin_status(
  target_email text
)
RETURNS json AS $$
DECLARE
  target_user_id uuid;
  admin_record RECORD;
BEGIN
  -- Get the user_id from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  -- Check if user exists
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with email: ' || target_email);
  END IF;

  -- Get admin record
  SELECT * INTO admin_record
  FROM public.app_admins
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('email', target_email, 'is_admin', false, 'message', 'User has never been an admin');
  END IF;

  RETURN json_build_object(
    'email', target_email,
    'user_id', target_user_id,
    'is_admin', admin_record.is_active,
    'granted_at', admin_record.granted_at,
    'granted_by', admin_record.granted_by,
    'revoked_at', admin_record.revoked_at,
    'revoke_reason', admin_record.revoke_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to list all active admins
CREATE OR REPLACE FUNCTION list_all_admins()
RETURNS TABLE (
  user_id uuid,
  email text,
  granted_at timestamptz,
  granted_by_email text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.user_id,
    a.email,
    a.granted_at,
    gu.email as granted_by_email
  FROM public.app_admins a
  LEFT JOIN auth.users gu ON gu.id = a.granted_by
  WHERE a.is_active = true
  ORDER BY a.granted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage:
-- SELECT add_admin('25421751@life.hkbu.edu.hk', 'Initial admin setup');
-- SELECT remove_admin('user@example.com', 'No longer needed');
-- SELECT check_admin_status('user@example.com');
-- SELECT * FROM list_all_admins();
