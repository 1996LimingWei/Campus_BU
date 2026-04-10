-- Admin moderation enforcement actions:
-- 1) Allow admins to remove reported content / ban users from the moderation workbench
-- 2) Enforce active bans at database write time for UGC tables

create or replace function public.reject_banned_actor()
returns trigger
language plpgsql
as $$
declare
    actor_text text;
    actor_id uuid;
begin
    actor_text := nullif(to_jsonb(new) ->> tg_argv[0], '');
    if actor_text is null then
        return new;
    end if;

    begin
        actor_id := actor_text::uuid;
    exception
        when others then
            return new;
    end;

    if exists (
        select 1
        from public.user_bans ub
        where ub.user_id = actor_id
          and ub.status = 'active'
          and (ub.expires_at is null or ub.expires_at > now())
    ) then
        raise exception 'User is banned from creating content'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

do $$
begin
    if to_regclass('public.posts') is not null then
        drop trigger if exists trigger_posts_ban_guard on public.posts;
        create trigger trigger_posts_ban_guard
        before insert or update on public.posts
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.post_comments') is not null then
        drop trigger if exists trigger_post_comments_ban_guard on public.post_comments;
        create trigger trigger_post_comments_ban_guard
        before insert or update on public.post_comments
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.forum_posts') is not null then
        drop trigger if exists trigger_forum_posts_ban_guard on public.forum_posts;
        create trigger trigger_forum_posts_ban_guard
        before insert or update on public.forum_posts
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.forum_comments') is not null then
        drop trigger if exists trigger_forum_comments_ban_guard on public.forum_comments;
        create trigger trigger_forum_comments_ban_guard
        before insert or update on public.forum_comments
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.teacher_reviews') is not null then
        drop trigger if exists trigger_teacher_reviews_ban_guard on public.teacher_reviews;
        create trigger trigger_teacher_reviews_ban_guard
        before insert or update on public.teacher_reviews
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.course_reviews') is not null then
        drop trigger if exists trigger_course_reviews_ban_guard on public.course_reviews;
        create trigger trigger_course_reviews_ban_guard
        before insert or update on public.course_reviews
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.messages') is not null then
        drop trigger if exists trigger_messages_ban_guard on public.messages;
        create trigger trigger_messages_ban_guard
        before insert or update on public.messages
        for each row execute function public.reject_banned_actor('sender_id');
    end if;

    if to_regclass('public.direct_messages') is not null then
        drop trigger if exists trigger_direct_messages_ban_guard on public.direct_messages;
        create trigger trigger_direct_messages_ban_guard
        before insert or update on public.direct_messages
        for each row execute function public.reject_banned_actor('sender_id');
    end if;

    if to_regclass('public.course_exchanges') is not null then
        drop trigger if exists trigger_course_exchanges_ban_guard on public.course_exchanges;
        create trigger trigger_course_exchanges_ban_guard
        before insert or update on public.course_exchanges
        for each row execute function public.reject_banned_actor('user_id');
    end if;

    if to_regclass('public.exchange_comments') is not null then
        drop trigger if exists trigger_exchange_comments_ban_guard on public.exchange_comments;
        create trigger trigger_exchange_comments_ban_guard
        before insert or update on public.exchange_comments
        for each row execute function public.reject_banned_actor('author_id');
    end if;

    if to_regclass('public.course_teaming') is not null then
        drop trigger if exists trigger_course_teaming_ban_guard on public.course_teaming;
        create trigger trigger_course_teaming_ban_guard
        before insert or update on public.course_teaming
        for each row execute function public.reject_banned_actor('user_id');
    end if;

    if to_regclass('public.teaming_comments') is not null then
        drop trigger if exists trigger_teaming_comments_ban_guard on public.teaming_comments;
        create trigger trigger_teaming_comments_ban_guard
        before insert or update on public.teaming_comments
        for each row execute function public.reject_banned_actor('author_id');
    end if;
end
$$;

create or replace function public.moderation_apply_action(
    report_id uuid,
    action text,
    note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_report public.reports%rowtype;
    normalized_action text := lower(trim(coalesce(action, '')));
    target_user uuid;
    content_removed boolean := false;
    user_banned boolean := false;
    resolved_note text;
begin
    if not public.check_user_is_active_admin() then
        raise exception 'Only active admins can apply moderation actions'
            using errcode = '42501';
    end if;

    select *
    into target_report
    from public.reports
    where id = report_id;

    if not found then
        raise exception 'Moderation report not found'
            using errcode = 'P0002';
    end if;

    if normalized_action not in ('remove_content', 'ban_user', 'remove_content_and_ban_user') then
        raise exception 'Unsupported moderation action: %', normalized_action
            using errcode = '22023';
    end if;

    if target_report.target_author_id is not null then
        target_user := target_report.target_author_id;
    elsif target_report.target_type = 'user'
      and target_report.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        target_user := target_report.target_id::uuid;
    end if;

    if normalized_action in ('remove_content', 'remove_content_and_ban_user') then
        case target_report.target_type
            when 'post' then
                delete from public.posts where id::text = target_report.target_id;
                content_removed := true;
            when 'comment' then
                delete from public.post_comments where id::text = target_report.target_id;
                content_removed := true;
            when 'forum_post' then
                delete from public.forum_posts where id::text = target_report.target_id;
                content_removed := true;
            when 'forum_comment' then
                delete from public.forum_comments where id::text = target_report.target_id;
                content_removed := true;
            when 'teacher_review' then
                delete from public.teacher_reviews where id::text = target_report.target_id;
                content_removed := true;
            when 'course_review' then
                delete from public.course_reviews where id::text = target_report.target_id;
                content_removed := true;
            when 'course_message' then
                delete from public.messages where id::text = target_report.target_id;
                content_removed := true;
            when 'direct_message' then
                delete from public.direct_messages where id::text = target_report.target_id;
                content_removed := true;
            when 'exchange_post' then
                delete from public.course_exchanges where id::text = target_report.target_id;
                content_removed := true;
            when 'exchange_comment' then
                delete from public.exchange_comments where id::text = target_report.target_id;
                content_removed := true;
            when 'teaming_post' then
                delete from public.course_teaming where id::text = target_report.target_id;
                content_removed := true;
            when 'teaming_comment' then
                delete from public.teaming_comments where id::text = target_report.target_id;
                content_removed := true;
            when 'user' then
                content_removed := false;
            else
                raise exception 'Unsupported report target type for content removal: %', target_report.target_type
                    using errcode = '22023';
        end case;
    end if;

    if normalized_action in ('ban_user', 'remove_content_and_ban_user') then
        if target_user is null then
            raise exception 'This report does not have a bannable target user'
                using errcode = '22023';
        end if;

        update public.user_bans
        set status = 'active',
            reason = coalesce(note, reason, 'Banned via moderation workbench'),
            created_by = auth.uid(),
            expires_at = null,
            revoked_at = null
        where user_id = target_user
          and status = 'active';

        if not found then
            insert into public.user_bans (
                user_id,
                status,
                reason,
                created_by,
                expires_at,
                created_at,
                revoked_at
            ) values (
                target_user,
                'active',
                coalesce(note, 'Banned via moderation workbench'),
                auth.uid(),
                null,
                now(),
                null
            );
        end if;

        user_banned := true;
    end if;

    resolved_note := coalesce(
        note,
        case normalized_action
            when 'remove_content' then 'Removed reported content from the app.'
            when 'ban_user' then 'Banned the reported user.'
            else 'Removed reported content and banned the reported user.'
        end
    );

    update public.reports
    set status = 'resolved',
        resolution = resolved_note,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = target_report.id;

    insert into public.moderation_actions (
        action_type,
        actor_id,
        report_id,
        target_user_id,
        metadata
    ) values (
        normalized_action,
        auth.uid(),
        target_report.id,
        target_user,
        jsonb_build_object(
            'target_type', target_report.target_type,
            'target_id', target_report.target_id,
            'note', resolved_note,
            'content_removed', content_removed,
            'user_banned', user_banned
        )
    );

    return jsonb_build_object(
        'success', true,
        'report_id', target_report.id,
        'action', normalized_action,
        'content_removed', content_removed,
        'user_banned', user_banned
    );
end;
$$;
