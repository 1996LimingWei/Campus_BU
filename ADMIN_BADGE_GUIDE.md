# Admin Badge System

## Overview

The Admin Badge system allows you to designate certain users as administrators with a visible red "Admin" badge, similar to the BU_Edu badge but with distinct styling.

## Features

- ✅ **Visual Badge**: Red "Admin" badge displayed next to user names
- ✅ **Database-backed**: Admin status stored in `app_admins` table
- ✅ **Easy Management**: Add/remove admins via SQL commands
- ✅ **Performance Optimized**: Client-side caching (5 minutes)
- ✅ **Security**: Row Level Security (RLS) policies protect admin data

## Badge Appearance

| Badge Type | Color | Text | Purpose |
|------------|-------|------|---------|
| **Admin** | 🔴 Red background, white text | "Admin" | App administrators |
| **BU_Edu** | 🔵 Blue border, blue text | "BU_Edu" | HKBU affiliated users |

## Setup Instructions

### Step 1: Run Database Migration

Run the migration file in Supabase SQL Editor:

```bash
# Copy and paste this file into Supabase Dashboard -> SQL Editor
supabase/migrations/20260312_add_admin_system.sql
```

This creates:
- `app_admins` table with RLS policies
- Helper functions (`grant_admin_status`, `revoke_admin_status`, `is_user_admin`)
- Indexes for performance

### Step 2: Add First Admin

After running the migration, add your first admin:

```bash
# Run this in Supabase SQL Editor
supabase/add_first_admin.sql
```

This adds `25421751@life.hkbu.edu.hk` as the first admin.

**Important**: The user must have registered/logged in at least once for their account to exist in `auth.users`.

### Step 3: Verify Admin Status

Check if the admin was added successfully:

```sql
SELECT * FROM list_all_admins();
```

You should see:
```
user_id | email | granted_at | granted_by_email
--------|-------|------------|------------------
(uuid)  | 25421751@life.hkbu.edu.hk | (timestamp) | (email)
```

## Managing Admins

### Method 1: Using Helper Functions (Recommended)

First, run the helper functions file:

```bash
# Run this ONCE to create helper functions
supabase/admin_management_helpers.sql
```

Then use these commands in Supabase SQL Editor:

#### Add an Admin
```sql
SELECT add_admin('user-email@life.hkbu.edu.hk', 'Reason for adding');
```

#### Remove an Admin
```sql
SELECT remove_admin('user-email@life.hkbu.edu.hk', 'Reason for removal');
```

#### Check Admin Status
```sql
SELECT check_admin_status('user-email@life.hkbu.edu.hk');
```

#### List All Active Admins
```sql
SELECT * FROM list_all_admins();
```

### Method 2: Direct SQL Commands

#### Add Admin Manually
```sql
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'user-email@life.hkbu.edu.hk';
  
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.app_admins (user_id, email, granted_by, is_active)
    VALUES (admin_user_id, 'user-email@life.hkbu.edu.hk', admin_user_id, true);
  END IF;
END $$;
```

#### Remove Admin Manually
```sql
UPDATE public.app_admins
SET is_active = false,
    revoked_at = now(),
    revoke_reason = 'No longer needed'
WHERE user_id = (
  SELECT id FROM auth.users 
  WHERE email = 'user-email@life.hkbu.edu.hk'
);
```

## How It Works

### Frontend Integration

The admin badge is automatically displayed when:
1. User's admin status is checked via `isAdmin()` function
2. Result is cached for 5 minutes for performance
3. Badge appears next to BU_Edu badge (if both apply)

### Where Badges Appear

- ✅ Profile page (next to display name)
- ✅ Forum posts (next to author name)
- ✅ Campus posts (next to author name)
- ✅ Post comments (next to commenter name)
- ✅ Course reviews (next to reviewer name)

### Badge Priority

If a user has both Admin and BU_Edu badges:
```
[Name] [Admin] [BU_Edu]
```

Admin badge appears first (left) as it's more prominent.

## Technical Details

### Database Schema

```sql
CREATE TABLE app_admins (
  id uuid primary key,
  user_id uuid references users(id),
  email text not null,
  granted_by uuid references users(id),
  granted_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  is_active boolean default true,
  created_at timestamptz,
  updated_at timestamptz
);
```

### Cache Configuration

- **Cache Duration**: 5 minutes
- **Cache Location**: In-memory (client-side)
- **Auto-refresh**: On page reload or cache expiry

### Security

- **RLS Policies**: Only active admins can manage other admins
- **Public Read**: Users can only check their own admin status
- **Audit Trail**: All grants/revocations are logged with timestamps

## Troubleshooting

### Badge Not Showing

1. **Check if user exists in database**:
   ```sql
   SELECT id FROM auth.users WHERE email = 'user-email@life.hkbu.edu.hk';
   ```

2. **Check admin status**:
   ```sql
   SELECT check_admin_status('user-email@life.hkbu.edu.hk');
   ```

3. **Clear app cache**: Restart the Expo app

4. **Check RLS policies**: Ensure policies are enabled correctly

### Can't Add Admin

1. **User must be registered**: The email must exist in `auth.users`
2. **Need at least one active admin**: To add new admins (except for initial setup)
3. **Check permissions**: Only active admins can grant/revoke admin status

## Future Enhancements

Potential features to add:
- [ ] Admin dashboard UI
- [ ] Bulk admin operations
- [ ] Admin roles/levels (Super Admin, Moderator, etc.)
- [ ] Admin activity logs
- [ ] Temporary admin access (with expiry)
- [ ] Admin permissions system

## Files Created

```
supabase/
├── migrations/
│   └── 20260312_add_admin_system.sql      # Main migration
├── add_first_admin.sql                     # Initial admin script
└── admin_management_helpers.sql            # Helper functions

components/common/
├── AdminBadge.tsx                          # Admin badge component
└── EduBadge.tsx                            # Existing BU_Edu badge

utils/
└── userUtils.ts                            # isAdmin() utilities

app/(tabs)/
└── profile.tsx                             # Updated with AdminBadge

components/
├── campus/PostCard.tsx                     # Updated with AdminBadge
└── forum/ForumPostRow.tsx                  # Updated with AdminBadge
```

## Support

For issues or questions:
1. Check Supabase logs for database errors
2. Check browser/app console for frontend errors
3. Verify RLS policies are correctly configured
4. Ensure all migration files have been run successfully
