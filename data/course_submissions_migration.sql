-- 课程提交审核表 (Course Submissions)
-- 用于存储用户提交的新课程，待管理员审核后才能正式添加到 courses 表

-- 创建课程提交表
CREATE TABLE IF NOT EXISTS public.course_submissions (
  id uuid default gen_random_uuid() primary key,
  code text not null,
  name text,
  instructor text,
  department text,
  credits int default 3,
  
  -- 提交者信息
  submitted_by uuid references public.users(id),
  submitter_name text,
  submitter_email text,
  
  -- 审核状态: pending, approved, rejected
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  
  -- 审核信息
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  review_notes text,
  
  -- 时间戳
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 创建索引以加快查询
CREATE INDEX IF NOT EXISTS idx_course_submissions_status ON public.course_submissions(status);
CREATE INDEX IF NOT EXISTS idx_course_submissions_code ON public.course_submissions(code);

-- 启用 RLS
ALTER TABLE public.course_submissions ENABLE ROW LEVEL SECURITY;

-- 安全策略
-- 1. 所有人可以查看已批准的提交
CREATE POLICY "Anyone can view approved submissions." 
  ON public.course_submissions 
  FOR SELECT 
  USING (status = 'approved');

-- 2. 用户可以查看自己的提交（任何状态）
CREATE POLICY "Users can view own submissions." 
  ON public.course_submissions 
  FOR SELECT 
  USING (auth.uid() = submitted_by);

-- 3. 已登录用户可以创建提交
CREATE POLICY "Authenticated users can submit courses." 
  ON public.course_submissions 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- 4. 用户可以更新自己的待审核提交
CREATE POLICY "Users can update own pending submissions." 
  ON public.course_submissions 
  FOR UPDATE 
  USING (auth.uid() = submitted_by AND status = 'pending');

-- 5. 用户可以删除自己的待审核提交
CREATE POLICY "Users can delete own pending submissions." 
  ON public.course_submissions 
  FOR DELETE 
  USING (auth.uid() = submitted_by AND status = 'pending');

-- 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_course_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_course_submissions_updated_at ON public.course_submissions;
CREATE TRIGGER trigger_course_submissions_updated_at
  BEFORE UPDATE ON public.course_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_course_submissions_updated_at();

-- 创建审核通过后自动添加到 courses 表的函数
CREATE OR REPLACE FUNCTION approve_course_submission(submission_id uuid, reviewer_id uuid, notes text DEFAULT NULL)
RETURNS json AS $$
DECLARE
  submission RECORD;
  new_course_id text;
  result json;
BEGIN
  -- 获取提交记录
  SELECT * INTO submission FROM public.course_submissions WHERE id = submission_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Submission not found or already processed');
  END IF;
  
  -- 检查课程代码是否已存在
  IF EXISTS (SELECT 1 FROM public.courses WHERE code = upper(submission.code)) THEN
    -- 标记为已拒绝（重复）
    UPDATE public.course_submissions 
    SET status = 'rejected', 
        reviewed_by = reviewer_id, 
        reviewed_at = now(),
        review_notes = COALESCE(notes, 'Duplicate course code') 
    WHERE id = submission_id;
    
    RETURN json_build_object('success', false, 'error', 'Course code already exists');
  END IF;
  
  -- 添加到正式课程表
  INSERT INTO public.courses (code, name, instructor, department, credits)
  VALUES (upper(submission.code), submission.name, submission.instructor, submission.department, submission.credits)
  RETURNING id INTO new_course_id;
  
  -- 更新提交状态为已批准
  UPDATE public.course_submissions 
  SET status = 'approved', 
      reviewed_by = reviewer_id, 
      reviewed_at = now(),
      review_notes = notes 
  WHERE id = submission_id;
  
  RETURN json_build_object('success', true, 'course_id', new_course_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 拒绝课程提交的函数
CREATE OR REPLACE FUNCTION reject_course_submission(submission_id uuid, reviewer_id uuid, notes text)
RETURNS json AS $$
BEGIN
  UPDATE public.course_submissions 
  SET status = 'rejected', 
      reviewed_by = reviewer_id, 
      reviewed_at = now(),
      review_notes = notes 
  WHERE id = submission_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Submission not found or already processed');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注意：管理员审核功能需要配合管理后台或通过 Supabase Dashboard 直接操作
-- 更完善的方案可以添加 admin 角色检查

-- Data API GRANT（公开查看已批准提交 + 自己的提交）
grant select                                                     on public.course_submissions to anon;
grant select, insert, update, delete                             on public.course_submissions to authenticated;
grant select, insert, update, delete                             on public.course_submissions to service_role;
