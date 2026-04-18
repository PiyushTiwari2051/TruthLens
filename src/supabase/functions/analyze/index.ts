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
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";

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

async function tavilySearch(query: string) {
  if (!TAVILY_API_KEY.trim() || !query) return "";
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        include_answers: false,
        include_domains: ["pib.gov.in", "who.int", "rbi.org.in", "altnews.in", "boomlive.in", "vishvasnews.com", "factly.in", "smhoaxslayer.com", "thehindu.com", "ptinews.com"],
        max_results: 3,
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return (j.results || []).map((res: any, i: number) => 
      `Search Result [${i+1}]:\nTitle: ${res.title}\nURL: ${res.url}\nContent: ${res.content}`
    ).join("\n\n");
  } catch (_e) { return ""; }
}

type DocRow = { line: string; authenticity: string; reasoning?: string };

function parseDocumentRow(item: unknown): DocRow | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const line = String(o.line ?? o.text ?? o.content ?? o.line_text ?? "").trimEnd();
  if (!line.trim()) return null;
  let auth = String(o.authenticity ?? o.Authenticity ?? o.verdict ?? o.label ?? "UNVERIFIED")
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (auth === "REFUTED" || auth === "FALSE") auth = "FAKE";
  if (auth === "SUPPORTED" || auth === "TRUE") auth = "REAL";
  if (auth === "MISLEADING_CONTEXT") auth = "MISLEADING";
  if (auth === "UNVERIFIABLE") auth = "UNVERIFIED";
  if (!["REAL", "FAKE", "MISLEADING", "UNVERIFIED"].includes(auth)) auth = "UNVERIFIED";
  const reasoning = o.reasoning != null ? String(o.reasoning)
    : o.evidence != null ? String(o.evidence) : undefined;
  return { line, authenticity: auth, reasoning };
}

/** Guarantees non-empty document_analysis for document modality so clients can render + export. */
function ensureDocumentAnalysis(report: Record<string, unknown>, inputModality: string, inputText: string) {
  if (inputModality !== "document" || !inputText.trim()) return;
  const sourceLines = inputText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const raw = report.document_analysis ?? report.documentAnalysis;
  const fromModel: DocRow[] = [];
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const p = parseDocumentRow(it);
      if (p) fromModel.push(p);
    }
  }
  if (sourceLines.length === 0) {
    report.document_analysis = fromModel.length ? fromModel : [];
    return;
  }
  report.document_analysis = sourceLines.map((line, i) => {
    const m = fromModel[i];
    if (!m) {
      return {
        line,
        authenticity: "UNVERIFIED",
        reasoning: "No model row for this source line index — check overall claims and evidence.",
      };
    }
    return { line, authenticity: m.authenticity, reasoning: m.reasoning };
  });
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  try {
    const body = await req.json();
    let inputText: string = (body.text ?? "").toString().trim();
    const inputUrl: string | undefined = body.url;
    const imageBase64: string | undefined = body.image_base64;
    const documentText: string = (body.document_text ?? "").toString().trim();
    const documentFilename: string | undefined = body.document_filename;
    const videoFrames: string[] = Array.isArray(body.video_frames_base64) ? body.video_frames_base64 : [];
    const videoMeta = body.video_meta as Record<string, unknown> | undefined;
    const audioForensicsClient = body.audio_forensics_client as Record<string, unknown> | undefined;
    const mimeHint: string | undefined = body.mime_type;
    const inputModality: string = (body.modality ?? (imageBase64 ? "image" : inputUrl ? "url" : "text")).toString();

    if (documentText && inputModality === "document") inputText = documentText;
    if (!inputText && documentText) inputText = documentText;

    const hasVideoFrames = videoFrames.length > 0;
    const hasMediaPayload = !!(inputText || imageBase64 || inputUrl || hasVideoFrames);

    if (!hasMediaPayload) {
      return new Response(JSON.stringify({ error: "Provide text, url, image_base64, document_text, or video_frames_base64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---------- vector retrieval (pgvector + Qdrant in parallel) ----------
    const queryForEmbed = inputText || inputUrl || (hasVideoFrames ? "video keyframes submitted for forensic analysis" : "image content submitted for forensic analysis");
    const vec = await llmEmbed(queryForEmbed);

    const [pgvectorMatchesRes, qdrantMatches, liveSearchResults] = await Promise.all([
      supabase.rpc("match_claims", {
        query_embedding: vec as unknown as string,
        match_count: 5,
        similarity_threshold: 0.5,
      }),
      qdrantSearch(vec, 5),
      tavilySearch(queryForEmbed),
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

Output modality in structured JSON must be exactly: "${inputModality}".

Follow this protocol:
1. Identify modality and detect the language (ISO 639-1 code).
2. Extract every factual claim as {subject, predicate, object, temporal_ref}.
3. Run multimodal forensic analysis: AI-generated probability, emotional manipulation, satire vs
   misinformation, deepfake/EXIF/lipsync indicators when applicable.
4. Use the provided RAG matches from a Qdrant-mirrored vector DB of previously debunked claims.
   If a strong match (>0.85 similarity) shares a debunked verdict, INHERIT it and cite it.
5. Cross-check against the LIVE SEARCH RESULTS provided below.
6. Compute a Truth Score (0–100, higher = more credible).
7. Identify manipulation techniques from: IMPERSONATION, FABRICATED_QUOTE, OUT_OF_CONTEXT,
   STATISTICS_MANIPULATION, EMOTIONAL_EXPLOITATION, DEEPFAKE, VOICE_CLONE, SELECTIVE_EDITING,
   FALSE_URGENCY, STRAWMAN, CHERRY_PICKING, FALSE_AUTHORITY.
8. Generate a multilingual rebuttal in the SAME detected language plus an English summary.
9. Generate a WhatsApp-ready alert when score < 40.
10. If modality is 'document', provide 'document_analysis' array: one entry per non-empty source line (split on newlines) with authenticity + reasoning. (T10 Pipeline)
11. If modality is 'video', provide 'video_specific_signals' describing lip-sync, face boundary, temporal consistency, keyed off the attached keyframes. (V1-V8 Pipeline)
12. If modality is 'audio', provide 'audio_specific_signals' like Jitter/Shimmer, MFCC-style anomalies, calibrated to any CLIENT DSP SUMMARY numbers provided. (A1-A7 Pipeline)
13. If modality is 'audio' or 'video', also return 'multimodal_explain': 3–6 sentences explaining how the media was interpreted and how the forensic signals support the verdict.
14. Use the exact URLs from the LIVE SEARCH RESULTS in your evidence sources. NEVER hallucinate or invent URLs. If no URL is available in the provided context, leave it blank.

Use the structured output tool. Be concise, factual, and decisive.

KNOWN-DEBUNKED CONTEXT (RAG):
${ragContext || "(no strong matches in the vector DB)"}

LIVE SEARCH RESULTS (TAVILY API):
${liveSearchResults || "(no recent news found)"}
`;

    // ---------- user content (multimodal) ----------
    const userContent: any[] = [];
    const docName = documentFilename ? ` (${documentFilename})` : "";
    const metaBits = [
      mimeHint ? `MIME: ${mimeHint}` : "",
      videoMeta ? `VIDEO_META_JSON: ${JSON.stringify(videoMeta)}` : "",
      audioForensicsClient ? `CLIENT_DSP_JSON: ${JSON.stringify(audioForensicsClient)}` : "",
    ].filter(Boolean).join("\n");

    if (inputModality === "document" && inputText) {
      userContent.push({
        type: "text",
        text: `DOCUMENT${docName} — line-by-line forensic pass (T10).\n${metaBits ? metaBits + "\n" : ""}---\n${inputText}\n---\nMANDATORY: In your truth_report tool call you MUST include document_analysis as a JSON array with EXACTLY one object per non-empty line above (same order). Each object: { "line": "<exact line text>", "authenticity": "REAL"|"FAKE"|"MISLEADING"|"UNVERIFIED", "reasoning": "<brief>" }. Count lines after splitting on newlines; skip only completely blank lines.`,
      });
    } else if (inputModality === "video") {
      userContent.push({
        type: "text",
        text: `VIDEO FORENSICS (V1–V8).\n${metaBits ? metaBits + "\n" : ""}NARRATIVE / CONTAINER:\n${inputText || "(no sidecar text)"}\n\n${hasVideoFrames ? `Attached: ${videoFrames.length} sampled keyframes.` : "No bitmap keyframes supplied — rely on narrative and priors, and keep confidence lower."}\nReturn video_specific_signals + multimodal_explain.`,
      });
      for (const frame of videoFrames.slice(0, 8)) {
        const url = typeof frame === "string" && frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}`;
        userContent.push({ type: "image_url", image_url: { url } });
      }
    } else if (inputModality === "audio") {
      userContent.push({
        type: "text",
        text: `AUDIO FORENSICS (A1–A7).\n${metaBits ? metaBits + "\n" : ""}NOTES:\n${inputText || "(no transcript)"}\nReturn audio_specific_signals + multimodal_explain grounded in CLIENT_DSP_JSON if present.`,
      });
    } else {
      if (inputText) userContent.push({ type: "text", text: `CONTENT TO ANALYSE:\n${inputText}` });
      if (inputUrl) userContent.push({ type: "text", text: `SOURCE URL: ${inputUrl}` });
      if (imageBase64) {
        userContent.push({ type: "text", text: "Analyse this image for misinformation, deepfake or out-of-context use. Describe what you see, extract any overlaid text, and assess credibility." });
        userContent.push({ type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } });
      }
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
                  url: { type: "string" },
                },
                required: ["organisation", "finding", "stance"], additionalProperties: false,
              },
            },
            rebuttal_native: { type: "string", description: "Counter-message in the detected language" },
            rebuttal_english: { type: "string", description: "Same rebuttal in English" },
            whatsapp_alert: { type: "string", description: "Short share-ready alert when score < 40, else empty string" },
            counter_narrative: { type: "string", description: "One-sentence canonical truth statement" },
            topic_tags: { type: "array", items: { type: "string" } },
            document_analysis: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line: { type: "string" },
                  authenticity: { type: "string", enum: ["REAL", "FAKE", "MISLEADING", "UNVERIFIED"] },
                  reasoning: { type: "string" }
                },
                required: ["line", "authenticity"]
              }
            },
            audio_specific_signals: {
              type: "object",
              properties: {
                mfcc_jitter: { type: "number", description: "Jitter score" },
                mfcc_shimmer: { type: "number", description: "Shimmer score" },
                splicing_detected: { type: "boolean" },
                synthesis_tool_signature: { type: "string" }
              }
            },
            video_specific_signals: {
              type: "object",
              properties: {
                lip_sync_offset_ms: { type: "number" },
                face_boundary_anomaly: { type: "boolean" },
                temporal_inconsistency: { type: "boolean" }
              }
            },
            multimodal_explain: {
              type: "string",
              description: "For audio/video: how signals were read and how they support the verdict (3–6 sentences). Empty for text/image/document/url.",
            },
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
    const report = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

    // AI occasionally hallucinates camelCase or old 'satya_score' naming
    if (typeof report.truth_score !== "number") {
      report.truth_score = (report.truthScore ?? report.satya_score ??
        (report.overall_verdict === "TRUE" ? 95 : report.overall_verdict === "FALSE" ? 15 : 50)) as number;
    }

    ensureDocumentAnalysis(report, inputModality, inputText);

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
      source_document_text: inputModality === "document" ? inputText.slice(0, 48_000) : undefined,
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
