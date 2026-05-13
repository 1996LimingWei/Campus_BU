-- Migration: Create user_push_tokens table
-- Description: Stores Expo push tokens for users to enable push notifications.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT, -- e.g., 'ios', 'android', 'web'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- A user can only have one instance of a specific token
    UNIQUE(user_id, token)
);

-- Add an index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);

-- Set up Row Level Security (RLS)
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own tokens
CREATE POLICY "Users can insert their own push tokens" 
    ON public.user_push_tokens 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own tokens
CREATE POLICY "Users can view their own push tokens" 
    ON public.user_push_tokens 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own tokens (e.g., on logout)
CREATE POLICY "Users can delete their own push tokens" 
    ON public.user_push_tokens 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- Policy: Server (service_role) needs to read tokens to send notifications
-- This is implicitly allowed for the service_role key, but good to note.

-- Set up the updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_push_tokens_updated_at ON public.user_push_tokens;
CREATE TRIGGER set_user_push_tokens_updated_at
    BEFORE UPDATE ON public.user_push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.user_push_tokens to authenticated;
grant select, insert, update, delete on public.user_push_tokens to service_role;
