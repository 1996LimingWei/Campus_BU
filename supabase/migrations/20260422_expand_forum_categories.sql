ALTER TABLE public.forum_posts 
    DROP CONSTRAINT IF EXISTS forum_posts_category_check;

ALTER TABLE public.forum_posts 
    ADD CONSTRAINT forum_posts_category_check 
    CHECK (category IN ('general', 'activity', 'guide', 'lost_found', 'marketplace', 'teaming', 'confession', 'help'));

COMMENT ON COLUMN public.forum_posts.category IS 'general | activity | guide | lost_found | marketplace | teaming | confession | help';