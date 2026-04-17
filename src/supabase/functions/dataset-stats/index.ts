// TruthLens — /dataset-stats: aggregate counts for the public dataset explorer.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QDRANT_URL = Deno.env.get("QDRANT_URL");
const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [{ count: totalClaims }, verdicts, languages, datasets, recent] = await Promise.all([
      supabase.from("claims").select("*", { count: "exact", head: true }),
      supabase.from("claims").select("verdict"),
      supabase.from("claims").select("language"),
      supabase.from("claims").select("source_dataset"),
      supabase.from("analyses").select("id, created_at, truth_score, overall_verdict, detected_language, input_text").order("created_at", { ascending: false }).limit(8),
    ]);

    const byVerdict: Record<string, number> = {};
    (verdicts.data ?? []).forEach((r: any) => { byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1; });
    const byLanguage: Record<string, number> = {};
    (languages.data ?? []).forEach((r: any) => { byLanguage[r.language] = (byLanguage[r.language] ?? 0) + 1; });
    const byDataset: Record<string, number> = {};
    (datasets.data ?? []).forEach((r: any) => { byDataset[r.source_dataset] = (byDataset[r.source_dataset] ?? 0) + 1; });

    let qdrantInfo: any = { enabled: false };
    if (QDRANT_URL && QDRANT_API_KEY) {
      try {
        const r = await fetch(`${QDRANT_URL}/collections/truthlens_claims`, {
          headers: { "api-key": QDRANT_API_KEY },
        });
        if (r.ok) {
          const j = await r.json();
          qdrantInfo = {
            enabled: true,
            vectors_count: j?.result?.points_count ?? j?.result?.vectors_count ?? null,
            indexed_vectors: j?.result?.indexed_vectors_count ?? null,
            status: j?.result?.status ?? "unknown",
            distance: j?.result?.config?.params?.vectors?.distance ?? "Cosine",
            size: j?.result?.config?.params?.vectors?.size ?? 384,
          };
        } else {
          qdrantInfo = { enabled: true, error: `qdrant ${r.status}` };
        }
      } catch (e) {
        qdrantInfo = { enabled: true, error: e instanceof Error ? e.message : "unknown" };
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      total_claims: totalClaims ?? 0,
      by_verdict: byVerdict,
      by_language: byLanguage,
      by_dataset: byDataset,
      recent_analyses: recent.data ?? [],
      qdrant: qdrantInfo,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
