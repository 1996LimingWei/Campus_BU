-- Create agent_memory table to store user-specific facts and preferences
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fact_key TEXT NOT NULL,
    fact_value JSONB,
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure a user only has one value for a specific fact key
    UNIQUE(user_id, fact_key)
);

-- Enable RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own memory
CREATE POLICY "Users can manage their own agent memory"
    ON agent_memory
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Data API GRANT（私有用户数据，不给 anon）
grant select, insert, update, delete on public.agent_memory to authenticated;
grant select, insert, update, delete on public.agent_memory to service_role;
