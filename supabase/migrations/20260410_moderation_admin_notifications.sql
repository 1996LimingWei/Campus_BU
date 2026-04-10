-- Notify active admins when a new report is created.
-- This powers in-app moderation alert badges and notification entries.

create or replace function public.notify_admins_on_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if to_regclass('public.app_admins') is null or to_regclass('public.notifications') is null then
        return new;
    end if;

    insert into public.notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        is_read,
        created_at
    )
    select
        admin_users.user_id,
        'system',
        'notifications.title_moderation_alert',
        json_build_object(
            'key', 'notifications.moderation_report_created',
            'params', json_build_object(
                'targetType', new.target_type,
                'reason', new.reason
            )
        )::text,
        null,
        false,
        now()
    from public.app_admins as admin_users
    where admin_users.is_active = true
      and admin_users.user_id is not null
      and admin_users.user_id <> new.reporter_id;

    return new;
exception
    when others then
        raise warning 'notify_admins_on_new_report failed: %', sqlerrm;
        return new;
end;
$$;

do $$
begin
    if to_regclass('public.reports') is not null then
        drop trigger if exists trigger_notify_admins_on_new_report on public.reports;
        create trigger trigger_notify_admins_on_new_report
        after insert on public.reports
        for each row
        execute function public.notify_admins_on_new_report();
    end if;
end
$$;
