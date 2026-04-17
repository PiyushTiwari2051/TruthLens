-- Move pgvector to extensions schema (Supabase best practice)
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- Recreate the RPC referencing the relocated type
CREATE OR REPLACE FUNCTION public.match_claims(
  query_embedding extensions.vector,
  match_count int DEFAULT 5,
  match_language text DEFAULT NULL,
  similarity_threshold float DEFAULT 0.55
)
RETURNS TABLE (
  id UUID,
  claim_text TEXT,
  language TEXT,
  verdict public.verdict,
  confidence NUMERIC,
  sources TEXT[],
  counter_narrative TEXT,
  topic_tags TEXT[],
  date_checked TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.id, c.claim_text, c.language, c.verdict, c.confidence,
         c.sources, c.counter_narrative, c.topic_tags, c.date_checked,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.claims c
  WHERE c.embedding IS NOT NULL
    AND (match_language IS NULL OR c.language = match_language)
    AND (1 - (c.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;