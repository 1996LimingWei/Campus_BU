-- Agent memory table for persistent user facts
create table if not exists public.agent_memory (
  user_id uuid not null references public.users(id) on delete cascade,
  fact_key text not null,
  fact_value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, fact_key)
);

alter table public.agent_memory enable row level security;

drop policy if exists "Users can read own agent memory" on public.agent_memory;
drop policy if exists "Users can upsert own agent memory" on public.agent_memory;

create policy "Users can read own agent memory"
on public.agent_memory
for select
using (auth.uid() = user_id);

create policy "Users can upsert own agent memory"
on public.agent_memory
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.agent_memory to authenticated;
grant select, insert, update, delete on public.agent_memory to service_role;
