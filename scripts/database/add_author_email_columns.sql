-- 添加author_email列到posts、post_comments和food_reviews表
-- 在Supabase Dashboard -> SQL Editor中运行此脚本

-- 1. 为posts表添加author_email列（如果不存在）
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS author_email text;

-- 2. 为post_comments表添加author_email列（如果不存在）
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS author_email text;

-- 3. 为food_reviews表添加author_email列（如果不存在）
ALTER TABLE public.food_reviews
ADD COLUMN IF NOT EXISTS author_email text;

-- 4. 为users表添加email列（可选，用于存储用户邮箱）
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email text;
