-- Temporary fix to allow local TS script (using anon key) to insert vectors
DROP POLICY IF EXISTS "Allow authenticated users to insert knowledge base" ON public.agent_knowledge_base;

CREATE POLICY "Allow anon to insert knowledge base"
    ON public.agent_knowledge_base FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
