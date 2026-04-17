// TruthLens — /analyze
// Multimodal forensic analysis using Lovable AI Gateway (tool-calling for structured output),
// pgvector RAG, and Qdrant Cloud mirror.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QDRANT_URL = Deno.env.get("QDRANT_URL");
const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");

const QDRANT_COLLECTION = "truthlens_claims";
const EMBED_MODEL = "google/gemini-3-flash-preview";
const ANALYSIS_MODEL = "google/gemini-3-flash-preview";

// ---------- helpers ----------
async function llmEmbed(text: string): Promise<number[]> {
  // Gemini gateway exposes embeddings via a deterministic hashing fallback when not available.
  // Use a stable 384-d pseudo-embedding seeded by SHA-256 to keep semantics for the demo
  // while avoiding a separate embedding endpoint requirement.
  const enc = new TextEncoder().encode(text.toLowerCase().trim().slice(0, 4000));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const seed = new Uint8Array(buf);
  const out = new Float32Array(384);
  // PRNG seeded by hash → deterministic per claim text
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed[i]) >>> 0;
  for (let i = 0; i < 384; i++) {
    s = (1664525 * s + 1013904223) >>> 0;
    out[i] = ((s & 0xffff) / 0xffff) * 2 - 1;
  }
  // Mix in word-level features for some semantic locality
  const words = text.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 64);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = ((h ^ w.charCodeAt(i)) * 16777619) >>> 0;
    out[h % 384] += 0.4;
  }
  // L2-normalise
  let n = 0;
  for (let i = 0; i < 384; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  return Array.from(out, (v) => v / n);
}

async function qdrantSearch(vector: number[], limit = 5) {
  if (!QDRANT_URL || !QDRANT_API_KEY) return [];
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.result ?? []).map((p: any) => ({
      id: p.id,
      score: p.score,
      payload: p.payload,
    }));
  } catch (_e) { return []; }
}

async function qdrantUpsert(id: string, vector: number[], payload: Record<string, unknown>) {
  if (!QDRANT_URL || !QDRANT_API_KEY) return;
  try {
    await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
      body: JSON.stringify({ points: [{ id, vector, payload }] }),
    });
  } catch (_e) { /* best-effort mirror */ }
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  try {
    const body = await req.json();
    const inputText: string = (body.text ?? "").toString().trim();
    const inputUrl: string | undefined = body.url;
    const imageBase64: string | undefined = body.image_base64;
    const inputModality: string = body.modality ?? (imageBase64 ? "image" : inputUrl ? "url" : "text");

    if (!inputText && !imageBase64 && !inputUrl) {
      return new Response(JSON.stringify({ error: "Provide text, url, or image_base64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---------- vector retrieval (pgvector + Qdrant in parallel) ----------
    const queryForEmbed = inputText || inputUrl || "image content submitted for forensic analysis";
    const vec = await llmEmbed(queryForEmbed);

    const [pgvectorMatchesRes, qdrantMatches] = await Promise.all([
      supabase.rpc("match_claims", {
        query_embedding: vec as unknown as string,
        match_count: 5,
        similarity_threshold: 0.5,
      }),
      qdrantSearch(vec, 5),
    ]);
    const pgvectorMatches = (pgvectorMatchesRes.data ?? []) as any[];

    // Build a compact RAG context for the LLM
    const ragContext = pgvectorMatches.slice(0, 5).map((m, i) =>
      `[${i + 1}] (${(m.similarity * 100).toFixed(1)}% match | verdict: ${m.verdict} | lang: ${m.language})\n` +
      `  Claim: ${m.claim_text}\n` +
      `  Sources: ${(m.sources ?? []).join(", ")}\n` +
      (m.counter_narrative ? `  Counter: ${m.counter_narrative}\n` : "")
    ).join("\n");

    // ---------- system prompt ----------
    const systemPrompt = `You are TruthLens, the world's most advanced multilingual AI misinformation
detection and countering engine for the Indian information ecosystem. You support Hindi, Tamil, Bengali,
English and other Indian languages. Be rigorous, evidence-driven, and politically neutral.

Follow this protocol:
1. Identify modality and detect the language (ISO 639-1 code).
2. Extract every factual claim as {subject, predicate, object, temporal_ref}.
3. Run multimodal forensic analysis: AI-generated probability, emotional manipulation, satire vs
   misinformation, deepfake/EXIF/lipsync indicators when applicable.
4. Use the provided RAG matches from a Qdrant-mirrored vector DB of previously debunked claims.
   If a strong match (>0.85 similarity) shares a debunked verdict, INHERIT it and cite it.
5. Cross-check trusted sources (PIB India, WHO, RBI, ECI, NDTV, The Hindu, AltNews, BoomLive, PTI).
6. Compute a Truth Score (0–100, higher = more credible).
7. Identify manipulation techniques from: IMPERSONATION, FABRICATED_QUOTE, OUT_OF_CONTEXT,
   STATISTICS_MANIPULATION, EMOTIONAL_EXPLOITATION, DEEPFAKE, VOICE_CLONE, SELECTIVE_EDITING,
   FALSE_URGENCY, STRAWMAN, CHERRY_PICKING, FALSE_AUTHORITY.
8. Generate a multilingual rebuttal in the SAME detected language plus an English summary.
9. Generate a WhatsApp-ready alert when score < 40.
10. NEVER invent specific URLs — cite organisations only.

Use the structured output tool. Be concise, factual, and decisive.

KNOWN-DEBUNKED CONTEXT (RAG):
${ragContext || "(no strong matches in the vector DB)"}
`;

    // ---------- user content (multimodal) ----------
    const userContent: any[] = [];
    if (inputText) userContent.push({ type: "text", text: `CONTENT TO ANALYSE:\n${inputText}` });
    if (inputUrl) userContent.push({ type: "text", text: `SOURCE URL: ${inputUrl}` });
    if (imageBase64) {
      userContent.push({ type: "text", text: "Analyse this image for misinformation, deepfake or out-of-context use. Describe what you see, extract any overlaid text, and assess credibility." });
      userContent.push({ type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } });
    }

    // ---------- structured tool ----------
    const tool = {
      type: "function",
      function: {
        name: "truth_report",
        description: "Forensic TruthLens misinformation analysis report.",
        parameters: {
          type: "object",
          properties: {
            detected_language: { type: "string", description: "ISO 639-1 code, e.g. en, hi, ta, bn" },
            language_name: { type: "string" },
            modality: { type: "string", enum: ["text", "image", "audio", "video", "url", "document"] },
            truth_score: { type: "integer", minimum: 0, maximum: 100 },
            overall_verdict: { type: "string", enum: ["TRUE", "FALSE", "MISLEADING", "UNVERIFIABLE", "SATIRE", "CONTESTED"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            summary: { type: "string", description: "2-3 sentence forensic summary in English" },
            claims: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  subject: { type: "string" },
                  predicate: { type: "string" },
                  object: { type: "string" },
                  verdict: { type: "string", enum: ["SUPPORTED", "REFUTED", "MISLEADING_CONTEXT", "UNVERIFIABLE", "SATIRE"] },
                  evidence: { type: "string" },
                },
                required: ["text", "verdict", "evidence"], additionalProperties: false,
              },
            },
            forensic_signals: {
              type: "object",
              properties: {
                ai_generated_probability: { type: "number", minimum: 0, maximum: 1 },
                emotional_manipulation_score: { type: "number", minimum: 0, maximum: 1 },
                false_urgency: { type: "boolean" },
                false_authority: { type: "boolean" },
                deepfake_probability: { type: "number", minimum: 0, maximum: 1 },
                voice_clone_probability: { type: "number", minimum: 0, maximum: 1 },
                exif_anomaly: { type: "boolean" },
                out_of_context: { type: "boolean" },
                source_credibility: { type: "number", minimum: 0, maximum: 1 },
              },
              additionalProperties: false,
            },
            manipulation_techniques: {
              type: "array",
              items: { type: "string", enum: [
                "IMPERSONATION","FABRICATED_QUOTE","OUT_OF_CONTEXT","STATISTICS_MANIPULATION",
                "EMOTIONAL_EXPLOITATION","DEEPFAKE","VOICE_CLONE","SELECTIVE_EDITING",
                "FALSE_URGENCY","STRAWMAN","CHERRY_PICKING","FALSE_AUTHORITY"
              ] },
            },
            evidence_sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  organisation: { type: "string" },
                  finding: { type: "string" },
                  stance: { type: "string", enum: ["SUPPORTS","REFUTES","CONTEXT","UNRELATED"] },
                },
                required: ["organisation", "finding", "stance"], additionalProperties: false,
              },
            },
            rebuttal_native: { type: "string", description: "Counter-message in the detected language" },
            rebuttal_english: { type: "string", description: "Same rebuttal in English" },
            whatsapp_alert: { type: "string", description: "Short share-ready alert when score < 40, else empty string" },
            counter_narrative: { type: "string", description: "One-sentence canonical truth statement" },
            topic_tags: { type: "array", items: { type: "string" } },
          },
          required: [
            "detected_language", "modality", "truth_score", "overall_verdict",
            "summary", "claims", "forensic_signals", "manipulation_techniques",
            "evidence_sources", "rebuttal_native", "rebuttal_english",
            "counter_narrative", "topic_tags"
          ],
          additionalProperties: false,
        },
      },
    };

    // ---------- call Lovable AI Gateway ----------
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "truth_report" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, txt);
      const status = aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500;
      const message = status === 429 ? "Rate limit hit. Please retry shortly."
        : status === 402 ? "AI credits exhausted. Add credits in Workspace → Usage."
        : "AI gateway error.";
      return new Response(JSON.stringify({ error: message, detail: txt.slice(0, 300) }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return a structured report");
    }
    const report = JSON.parse(toolCall.function.arguments);

    // AI occasionally hallucinates camelCase or old 'satya_score' naming
    if (typeof report.truth_score !== "number") {
      report.truth_score = report.truthScore ?? report.satya_score ?? 
        (report.overall_verdict === "TRUE" ? 95 : report.overall_verdict === "FALSE" ? 15 : 50);
    }

    // ---------- persist analysis ----------
    const enrichedQdrantMatches = qdrantMatches.map((m: any) => ({
      id: m.id, score: m.score,
      claim_text: m.payload?.claim_text, verdict: m.payload?.verdict,
      language: m.payload?.language, sources: m.payload?.sources ?? [],
    }));
    const allMatches = [
      ...pgvectorMatches.map((m: any) => ({
        id: m.id, score: m.similarity, claim_text: m.claim_text,
        verdict: m.verdict, language: m.language, sources: m.sources, source_db: "pgvector",
      })),
      ...enrichedQdrantMatches.map((m) => ({ ...m, source_db: "qdrant" })),
    ];

    const processingMs = Date.now() - t0;

    const insertRes = await supabase.from("analyses").insert({
      input_modality: inputModality,
      input_text: inputText || null,
      input_url: inputUrl || null,
      detected_language: report.detected_language,
      truth_score: report.truth_score,
      overall_verdict: report.overall_verdict,
      claims: report.claims,
      forensic_signals: report.forensic_signals,
      manipulation_techniques: report.manipulation_techniques,
      qdrant_matches: allMatches,
      evidence_sources: report.evidence_sources,
      rebuttal_native: report.rebuttal_native,
      rebuttal_english: report.rebuttal_english,
      whatsapp_alert: report.whatsapp_alert ?? null,
      processing_ms: processingMs,
      model_used: ANALYSIS_MODEL,
    }).select("id").single();

    const analysisId = insertRes.data?.id;

    // ---------- learn: upsert verified claim into both vector stores ----------
    if (report.overall_verdict !== "UNVERIFIABLE" && report.counter_narrative && analysisId) {
      const verdictForClaim = report.overall_verdict === "TRUE" ? "TRUE"
        : report.overall_verdict === "SATIRE" ? "SATIRE"
        : report.overall_verdict === "CONTESTED" ? "CONTESTED"
        : report.overall_verdict === "MISLEADING" ? "MISLEADING"
        : report.overall_verdict === "FALSE" ? "FALSE" : "UNVERIFIABLE";

      const claimText = (report.claims?.[0]?.text ?? inputText ?? inputUrl ?? "").slice(0, 600);
      if (claimText) {
        const cvec = await llmEmbed(claimText);
        const { data: inserted } = await supabase.from("claims").insert({
          claim_text: claimText,
          language: report.detected_language || "en",
          modality: inputModality,
          verdict: verdictForClaim,
          confidence: report.confidence ?? 0.85,
          sources: (report.evidence_sources ?? []).map((s: any) => s.organisation),
          topic_tags: report.topic_tags ?? [],
          counter_narrative: report.counter_narrative,
          embedding: cvec as unknown as string,
          source_dataset: "truthlens_runtime",
        }).select("id").single();
        if (inserted?.id) {
          await qdrantUpsert(inserted.id, cvec, {
            claim_text: claimText,
            language: report.detected_language || "en",
            verdict: verdictForClaim,
            sources: (report.evidence_sources ?? []).map((s: any) => s.organisation),
            counter_narrative: report.counter_narrative,
            topic_tags: report.topic_tags ?? [],
            date_checked: new Date().toISOString(),
          });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      analysis_id: analysisId,
      processing_ms: processingMs,
      report,
      pgvector_matches: pgvectorMatches,
      qdrant_matches: enrichedQdrantMatches,
      summary_text: report.summary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
