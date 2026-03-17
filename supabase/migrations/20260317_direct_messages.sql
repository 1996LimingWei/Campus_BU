-- Direct messaging between users

create table if not exists public.direct_conversations (
    id                  uuid primary key default gen_random_uuid(),
    participant_one     uuid not null references auth.users(id) on delete cascade,
    participant_two     uuid not null references auth.users(id) on delete cascade,
    last_message_at     timestamptz,
    last_message_preview text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint direct_conversations_unique_pair unique (participant_one, participant_two),
    constraint direct_conversations_no_self check (participant_one <> participant_two),
    constraint direct_conversations_sorted_pair check (participant_one::text < participant_two::text)
);

create table if not exists public.direct_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
    sender_id       uuid not null references auth.users(id) on delete cascade,
    receiver_id     uuid not null references auth.users(id) on delete cascade,
    content         text not null,
    read_at         timestamptz,
    created_at      timestamptz not null default now(),
    constraint direct_messages_non_empty_content check (char_length(btrim(content)) > 0),
    constraint direct_messages_no_self check (sender_id <> receiver_id)
);

create index if not exists direct_conversations_participant_one_idx
    on public.direct_conversations (participant_one, coalesce(last_message_at, created_at) desc);

create index if not exists direct_conversations_participant_two_idx
    on public.direct_conversations (participant_two, coalesce(last_message_at, created_at) desc);

create index if not exists direct_messages_conversation_created_idx
    on public.direct_messages (conversation_id, created_at asc);

create index if not exists direct_messages_receiver_unread_idx
    on public.direct_messages (receiver_id, read_at, created_at desc);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "direct_conversations_select_participants" on public.direct_conversations;
create policy "direct_conversations_select_participants"
on public.direct_conversations
for select
using (auth.uid() = participant_one or auth.uid() = participant_two);

drop policy if exists "direct_conversations_insert_participants" on public.direct_conversations;
create policy "direct_conversations_insert_participants"
on public.direct_conversations
for insert
with check (
    (auth.uid() = participant_one or auth.uid() = participant_two)
    and participant_one <> participant_two
    and participant_one::text < participant_two::text
);

drop policy if exists "direct_conversations_update_participants" on public.direct_conversations;
create policy "direct_conversations_update_participants"
on public.direct_conversations
for update
using (auth.uid() = participant_one or auth.uid() = participant_two)
with check (auth.uid() = participant_one or auth.uid() = participant_two);

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
on public.direct_messages
for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "direct_messages_insert_sender" on public.direct_messages;
create policy "direct_messages_insert_sender"
on public.direct_messages
for insert
with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
        select 1
        from public.direct_conversations c
        where c.id = conversation_id
          and (
              (c.participant_one = sender_id and c.participant_two = receiver_id)
              or
              (c.participant_one = receiver_id and c.participant_two = sender_id)
          )
    )
);

drop policy if exists "direct_messages_update_receiver" on public.direct_messages;
create policy "direct_messages_update_receiver"
on public.direct_messages
for update
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

create or replace function public.set_direct_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trigger_direct_conversations_updated_at on public.direct_conversations;
create trigger trigger_direct_conversations_updated_at
before update on public.direct_conversations
for each row
execute function public.set_direct_conversations_updated_at();

create or replace function public.touch_direct_conversation_from_message()
returns trigger
language plpgsql
as $$
begin
    update public.direct_conversations
    set
        last_message_at = new.created_at,
        last_message_preview = left(new.content, 140),
        updated_at = new.created_at
    where id = new.conversation_id;

    return new;
end;
$$;

drop trigger if exists trigger_touch_direct_conversation_from_message on public.direct_messages;
create trigger trigger_touch_direct_conversation_from_message
after insert on public.direct_messages
for each row
execute function public.touch_direct_conversation_from_message();

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'direct_conversations'
        ) then
            alter publication supabase_realtime add table public.direct_conversations;
        end if;

        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'direct_messages'
        ) then
            alter publication supabase_realtime add table public.direct_messages;
        end if;
    end if;
end
$$;
