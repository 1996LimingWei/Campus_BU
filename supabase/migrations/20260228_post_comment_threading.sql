-- Add threaded replies support for campus post comments (floor -> replies)
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent_comment_id
ON public.post_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_parent_created
ON public.post_comments(post_id, parent_comment_id, created_at);
