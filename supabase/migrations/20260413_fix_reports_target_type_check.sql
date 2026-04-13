-- Fix: add 'user' to reports_target_type_check constraint
-- When a user is blocked, moderation.ts auto-creates a report with target_type = 'user'.
-- The existing constraint did not include 'user', causing a 23514 violation.

do $$
begin
    -- Drop the old constraint if it exists (regardless of name)
    if exists (
        select 1
        from pg_constraint
        where conrelid = 'public.reports'::regclass
          and contype = 'c'
          and conname = 'reports_target_type_check'
    ) then
        alter table public.reports drop constraint reports_target_type_check;
    end if;

    -- Re-add the constraint with 'user' included
    alter table public.reports
        add constraint reports_target_type_check
        check (target_type in (
            'post',
            'comment',
            'forum_post',
            'forum_comment',
            'teacher_review',
            'course_review',
            'course_message',
            'direct_message',
            'exchange_post',
            'exchange_comment',
            'teaming_post',
            'teaming_comment',
            'user'
        ));
end
$$;
