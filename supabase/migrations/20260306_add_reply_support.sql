-- Add reply support for all comment sections

-- 1. forum_comments
ALTER TABLE public.forum_comments 
ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.forum_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS reply_to_name text;

CREATE INDEX IF NOT EXISTS idx_forum_comments_parent_id ON public.forum_comments(parent_comment_id);

-- 2. exchange_comments
ALTER TABLE public.exchange_comments 
ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.exchange_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS reply_to_name text;

CREATE INDEX IF NOT EXISTS idx_exchange_comments_parent_id ON public.exchange_comments(parent_comment_id);

-- 3. teaming_comments
ALTER TABLE public.teaming_comments 
ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.teaming_comments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS reply_to_name text;

CREATE INDEX IF NOT EXISTS idx_teaming_comments_parent_id ON public.teaming_comments(parent_comment_id);

-- 4. post_comments (add reply_to_name, parent_comment_id already exists)
ALTER TABLE public.post_comments 
ADD COLUMN IF NOT EXISTS reply_to_name text;
