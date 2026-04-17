-- TruthLens schema: claims (with pgvector), analyses, claim_sources
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verdict enum
DO $$ BEGIN
  CREATE TYPE public.verdict AS ENUM ('TRUE','FALSE','MISLEADING','UNVERIFIABLE','SATIRE','CONTESTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.modality AS ENUM ('text','image','audio','video','url','document');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Reference debunked-claims dataset (LIAR + Indian PIB/AltNews + WHO)
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  modality public.modality NOT NULL DEFAULT 'text',
  verdict public.verdict NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.9,
  sources TEXT[] NOT NULL DEFAULT '{}',
  topic_tags TEXT[] NOT NULL DEFAULT '{}',
  region TEXT DEFAULT 'national',
  virality_score NUMERIC(4,3) DEFAULT 0.5,
  counter_narrative TEXT,
  date_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_dataset TEXT NOT NULL DEFAULT 'curated_in',
  embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_embedding_idx ON public.claims
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS claims_lang_idx ON public.claims(language);
CREATE INDEX IF NOT EXISTS claims_verdict_idx ON public.claims(verdict);
CREATE INDEX IF NOT EXISTS claims_tags_idx ON public.claims USING GIN(topic_tags);

-- User-submitted analyses (full forensic reports)
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_modality public.modality NOT NULL,
  input_text TEXT,
  input_url TEXT,
  detected_language TEXT,
  truth_score INTEGER NOT NULL,
  overall_verdict public.verdict NOT NULL,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  forensic_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  manipulation_techniques TEXT[] NOT NULL DEFAULT '{}',
  qdrant_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  rebuttal_native TEXT,
  rebuttal_english TEXT,
  whatsapp_alert TEXT,
  processing_ms INTEGER,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analyses_created_idx ON public.analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS analyses_verdict_idx ON public.analyses(overall_verdict);

-- RLS: claims dataset and analyses are public-read; writes server-only via service-role
ALTER TABLE public.claims   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims_public_read"   ON public.claims   FOR SELECT USING (true);
CREATE POLICY "analyses_public_read" ON public.analyses FOR SELECT USING (true);

-- Vector search RPC (cosine), filterable by language
CREATE OR REPLACE FUNCTION public.match_claims(
  query_embedding vector(384),
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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