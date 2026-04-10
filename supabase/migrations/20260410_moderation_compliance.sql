-- Apple Guideline 1.2 moderation compliance hardening
-- 1) UGC EULA consent persistence
-- 2) Reports workflow + SLA fields
-- 3) User blocks + moderation actions
-- 4) Server-side objectionable content filtering

create or replace function public.check_user_is_active_admin()
returns boolean
language plpgsql
security definer
as $$
begin
    if to_regclass('public.app_admins') is null then
        return false;
    end if;

    return exists (
        select 1
        from public.app_admins
        where user_id = auth.uid()
          and is_active = true
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- EULA consents
-- ---------------------------------------------------------------------------
create table if not exists public.user_eula_consents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    eula_version text not null,
    accepted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (user_id, eula_version)
);

create index if not exists idx_user_eula_consents_user_id
    on public.user_eula_consents (user_id, accepted_at desc);

alter table public.user_eula_consents enable row level security;

drop policy if exists "user_eula_consents_select_own" on public.user_eula_consents;
create policy "user_eula_consents_select_own"
on public.user_eula_consents for select
using (auth.uid() = user_id or public.check_user_is_active_admin());

drop policy if exists "user_eula_consents_insert_own" on public.user_eula_consents;
create policy "user_eula_consents_insert_own"
on public.user_eula_consents for insert
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- User blocks
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
    id uuid primary key default gen_random_uuid(),
    blocker_id uuid not null references auth.users(id) on delete cascade,
    blocked_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (blocker_id, blocked_id),
    constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocker
    on public.user_blocks (blocker_id, created_at desc);

create index if not exists idx_user_blocks_blocked
    on public.user_blocks (blocked_id, created_at desc);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_self" on public.user_blocks;
create policy "user_blocks_select_self"
on public.user_blocks for select
using (auth.uid() = blocker_id or auth.uid() = blocked_id or public.check_user_is_active_admin());

drop policy if exists "user_blocks_insert_self" on public.user_blocks;
create policy "user_blocks_insert_self"
on public.user_blocks for insert
with check (auth.uid() = blocker_id);

drop policy if exists "user_blocks_delete_self" on public.user_blocks;
create policy "user_blocks_delete_self"
on public.user_blocks for delete
using (auth.uid() = blocker_id or public.check_user_is_active_admin());

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references auth.users(id) on delete cascade,
    target_type text not null,
    target_id text not null,
    target_author_id uuid references auth.users(id) on delete set null,
    reason text not null,
    details text default '',
    status text not null default 'pending'
        check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
    resolution text,
    first_response_due_at timestamptz not null default (now() + interval '24 hours'),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.reports
    add column if not exists target_author_id uuid references auth.users(id) on delete set null;
alter table public.reports
    add column if not exists resolution text;
alter table public.reports
    add column if not exists first_response_due_at timestamptz default (now() + interval '24 hours');
alter table public.reports
    add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.reports
    add column if not exists reviewed_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'reports_status_check'
          and conrelid = 'public.reports'::regclass
    ) then
        alter table public.reports
            add constraint reports_status_check
            check (status in ('pending', 'under_review', 'resolved', 'dismissed'));
    end if;
end
$$;

update public.reports
set first_response_due_at = coalesce(first_response_due_at, created_at + interval '24 hours')
where first_response_due_at is null;

create index if not exists idx_reports_status_created_at
    on public.reports (status, created_at desc);

create index if not exists idx_reports_due_at
    on public.reports (first_response_due_at asc);

create index if not exists idx_reports_target
    on public.reports (target_type, target_id);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
on public.reports for select
using (
    auth.uid() = reporter_id
    or auth.uid() = target_author_id
    or public.check_user_is_active_admin()
);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports for insert
with check (auth.uid() = reporter_id);

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
on public.reports for update
using (public.check_user_is_active_admin())
with check (public.check_user_is_active_admin());

-- ---------------------------------------------------------------------------
-- Moderation actions (audit log)
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_actions (
    id uuid primary key default gen_random_uuid(),
    action_type text not null,
    actor_id uuid references auth.users(id) on delete set null,
    report_id uuid references public.reports(id) on delete set null,
    target_user_id uuid references auth.users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_moderation_actions_created
    on public.moderation_actions (created_at desc);

create index if not exists idx_moderation_actions_report
    on public.moderation_actions (report_id);

alter table public.moderation_actions enable row level security;

drop policy if exists "moderation_actions_select_admin" on public.moderation_actions;
create policy "moderation_actions_select_admin"
on public.moderation_actions for select
using (public.check_user_is_active_admin() or auth.uid() = actor_id);

drop policy if exists "moderation_actions_insert_auth" on public.moderation_actions;
create policy "moderation_actions_insert_auth"
on public.moderation_actions for insert
with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Optional user bans table for moderation escalation
-- ---------------------------------------------------------------------------
create table if not exists public.user_bans (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
    reason text,
    created_by uuid references auth.users(id) on delete set null,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    revoked_at timestamptz
);

create unique index if not exists idx_user_bans_active_unique
    on public.user_bans (user_id)
    where status = 'active';

alter table public.user_bans enable row level security;

drop policy if exists "user_bans_select_self_or_admin" on public.user_bans;
create policy "user_bans_select_self_or_admin"
on public.user_bans for select
using (auth.uid() = user_id or public.check_user_is_active_admin());

drop policy if exists "user_bans_admin_manage" on public.user_bans;
create policy "user_bans_admin_manage"
on public.user_bans for all
using (public.check_user_is_active_admin())
with check (public.check_user_is_active_admin());

-- ---------------------------------------------------------------------------
-- Direct message block enforcement
-- ---------------------------------------------------------------------------
create or replace function public.prevent_blocked_direct_messages()
returns trigger
language plpgsql
as $$
begin
    if exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = new.sender_id and ub.blocked_id = new.receiver_id)
           or (ub.blocker_id = new.receiver_id and ub.blocked_id = new.sender_id)
    ) then
        raise exception 'Direct message blocked by user relationship'
            using errcode = 'P0001';
    end if;
    return new;
end;
$$;

do $$
begin
    if to_regclass('public.direct_messages') is not null then
        drop trigger if exists trigger_prevent_blocked_direct_messages on public.direct_messages;
        create trigger trigger_prevent_blocked_direct_messages
        before insert on public.direct_messages
        for each row
        execute function public.prevent_blocked_direct_messages();
    end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Server-side objectionable content filtering
-- ---------------------------------------------------------------------------
create or replace function public.reject_if_objectionable()
returns trigger
language plpgsql
as $$
declare
    i integer;
    field_name text;
    field_value text;
    merged_text text := '';
    rule_regex text := '(约炮|招嫖|援交|裸聊|色情|黄片|porn|sex\\s*(service|chat)?|种族歧视|nazi|kill\\s+all|hate\\s+(group|people)|支那|贱种|炸学校|杀了你|砍死|爆头|枪击|bomb\\s+(school|campus)|kill\\s+you|骚扰|霸凌|去死|滚开|傻逼|智障|废物|婊子|fuck\\s+you|加v|vx[:：]?|whatsapp[:：]?|稳赚|代写|刷单|兼职日结|返利|点击链接|彩票计划群|博彩)';
begin
    for i in 0..tg_nargs - 1 loop
        field_name := tg_argv[i];
        field_value := coalesce(to_jsonb(new) ->> field_name, '');
        if length(btrim(field_value)) > 0 then
            merged_text := merged_text || ' ' || field_value;
        end if;
    end loop;

    if length(btrim(merged_text)) > 0 and merged_text ~* rule_regex then
        raise exception 'Content rejected by moderation policy'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

do $$
begin
    if to_regclass('public.posts') is not null then
        drop trigger if exists trigger_posts_content_filter on public.posts;
        create trigger trigger_posts_content_filter
        before insert or update on public.posts
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.post_comments') is not null then
        drop trigger if exists trigger_post_comments_content_filter on public.post_comments;
        create trigger trigger_post_comments_content_filter
        before insert or update on public.post_comments
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.forum_posts') is not null then
        drop trigger if exists trigger_forum_posts_content_filter on public.forum_posts;
        create trigger trigger_forum_posts_content_filter
        before insert or update on public.forum_posts
        for each row execute function public.reject_if_objectionable('title', 'content');
    end if;

    if to_regclass('public.forum_comments') is not null then
        drop trigger if exists trigger_forum_comments_content_filter on public.forum_comments;
        create trigger trigger_forum_comments_content_filter
        before insert or update on public.forum_comments
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.teacher_reviews') is not null then
        drop trigger if exists trigger_teacher_reviews_content_filter on public.teacher_reviews;
        create trigger trigger_teacher_reviews_content_filter
        before insert or update on public.teacher_reviews
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.course_reviews') is not null then
        drop trigger if exists trigger_course_reviews_content_filter on public.course_reviews;
        create trigger trigger_course_reviews_content_filter
        before insert or update on public.course_reviews
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.messages') is not null then
        drop trigger if exists trigger_messages_content_filter on public.messages;
        create trigger trigger_messages_content_filter
        before insert or update on public.messages
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.direct_messages') is not null then
        drop trigger if exists trigger_direct_messages_content_filter on public.direct_messages;
        create trigger trigger_direct_messages_content_filter
        before insert or update on public.direct_messages
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.course_exchanges') is not null then
        drop trigger if exists trigger_course_exchanges_content_filter on public.course_exchanges;
        create trigger trigger_course_exchanges_content_filter
        before insert or update on public.course_exchanges
        for each row execute function public.reject_if_objectionable('have_course', 'have_section', 'have_teacher', 'have_time', 'reason');
    end if;

    if to_regclass('public.exchange_comments') is not null then
        drop trigger if exists trigger_exchange_comments_content_filter on public.exchange_comments;
        create trigger trigger_exchange_comments_content_filter
        before insert or update on public.exchange_comments
        for each row execute function public.reject_if_objectionable('content');
    end if;

    if to_regclass('public.course_teaming') is not null then
        drop trigger if exists trigger_course_teaming_content_filter on public.course_teaming;
        create trigger trigger_course_teaming_content_filter
        before insert or update on public.course_teaming
        for each row execute function public.reject_if_objectionable('section', 'self_intro', 'target_teammate');
    end if;

    if to_regclass('public.teaming_comments') is not null then
        drop trigger if exists trigger_teaming_comments_content_filter on public.teaming_comments;
        create trigger trigger_teaming_comments_content_filter
        before insert or update on public.teaming_comments
        for each row execute function public.reject_if_objectionable('content');
    end if;
end
$$;
