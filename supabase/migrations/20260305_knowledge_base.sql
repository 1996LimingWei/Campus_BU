-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create the knowledge base table
create table if not exists public.agent_knowledge_base (
    id uuid primary key default gen_random_uuid(),
    content text not null,       -- The chunk of text
    metadata jsonb,              -- e.g., source, section, title
    embedding vector(384)        -- 384 dimensions for all-MiniLM-L6-v2
);

-- Create an HNWS index for fast similarity search
create index on public.agent_knowledge_base using hnsw (embedding vector_cosine_ops);

-- RLS Policies
alter table public.agent_knowledge_base enable row level security;

create policy "Allow everyone to read knowledge base"
    on public.agent_knowledge_base for select
    using (true);

create policy "Allow authenticated users to insert knowledge base"
    on public.agent_knowledge_base for insert
    to authenticated
    with check (true);

-- Create a Postgres function for similarity search matching
create or replace function match_knowledge_base (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    agent_knowledge_base.id,
    agent_knowledge_base.content,
    agent_knowledge_base.metadata,
    1 - (agent_knowledge_base.embedding <=> query_embedding) as similarity
  from agent_knowledge_base
  where 1 - (agent_knowledge_base.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
