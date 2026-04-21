import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const HF_MODEL_URL =
  "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, match_threshold = 0.55, match_count = 5 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "missing query" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Generate embedding via HuggingFace Inference API (same model as ingestion)
    const hfKey = Deno.env.get("HF_API_KEY") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (hfKey) headers["Authorization"] = `Bearer ${hfKey}`;

    const hfRes = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: query, options: { wait_for_model: true } }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error("HuggingFace API error:", hfRes.status, errText);
      return new Response(
        JSON.stringify({ error: "embedding_failed", detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const embedding: number[] = await hfRes.json();

    // 2. Vector similarity search via existing RPC
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("match_knowledge_base", {
      query_embedding: embedding,
      match_threshold,
      match_count,
    });

    if (error) {
      console.error("match_knowledge_base error:", error);
      return new Response(
        JSON.stringify({ error: "search_failed", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("embed-search error:", err);
    return new Response(
      JSON.stringify({ error: "internal", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
