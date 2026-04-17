// TruthLens — /seed-dataset
// Seeds ~200 claims (LIAR-style + curated Indian PIB/AltNews + WHO health misinfo) with
// 384-d hash embeddings, then mirrors them into Qdrant Cloud.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QDRANT_URL = Deno.env.get("QDRANT_URL");
const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");
const QDRANT_COLLECTION = "truthlens_claims";

async function embed(text: string): Promise<number[]> {
  const enc = new TextEncoder().encode(text.toLowerCase().trim().slice(0, 4000));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const seed = new Uint8Array(buf);
  const out = new Float32Array(384);
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed[i]) >>> 0;
  for (let i = 0; i < 384; i++) {
    s = (1664525 * s + 1013904223) >>> 0;
    out[i] = ((s & 0xffff) / 0xffff) * 2 - 1;
  }
  const words = text.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 64);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = ((h ^ w.charCodeAt(i)) * 16777619) >>> 0;
    out[h % 384] += 0.4;
  }
  let n = 0; for (let i = 0; i < 384; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  return Array.from(out, (v) => v / n);
}

async function ensureQdrantCollection() {
  if (!QDRANT_URL || !QDRANT_API_KEY) return false;
  try {
    const head = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      headers: { "api-key": QDRANT_API_KEY },
    });
    if (head.ok) return true;
    const create = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
      body: JSON.stringify({ vectors: { size: 384, distance: "Cosine" } }),
    });
    return create.ok;
  } catch { return false; }
}

async function qdrantUpsertBatch(points: { id: string; vector: number[]; payload: any }[]) {
  if (!QDRANT_URL || !QDRANT_API_KEY || points.length === 0) return false;
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
      body: JSON.stringify({ points }),
    });
    return r.ok;
  } catch { return false; }
}

// =============================================================================
// DATASET — 200+ debunked claims
// Sources: PIB Fact Check, AltNews, BoomLive, FactlyIN, WHO, Vishvas News,
// + LIAR-style English political claims sample. (Themes paraphrased for licensing.)
// =============================================================================

type Seed = {
  claim_text: string;
  language: string;
  verdict: "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIABLE" | "SATIRE" | "CONTESTED";
  sources: string[];
  topic_tags: string[];
  region?: string;
  counter_narrative: string;
  source_dataset: string;
  virality_score?: number;
};

const SEEDS: Seed[] = [
  // ---------- INDIAN POLITICAL ----------
  { claim_text: "Government of India is depositing ₹10 lakh in every farmer's bank account from PM-Kisan Yojana.", language: "en", verdict: "FALSE", sources: ["PIB Fact Check","Ministry of Agriculture"], topic_tags: ["politics","scheme","farmers"], counter_narrative: "PM-Kisan provides ₹6,000/year (3 instalments of ₹2,000), not ₹10 lakh.", source_dataset: "curated_in", virality_score: 0.92 },
  { claim_text: "केंद्र सरकार सभी छात्रों को ₹4,000 की छात्रवृत्ति मुफ्त में दे रही है।", language: "hi", verdict: "FALSE", sources: ["PIB Fact Check"], topic_tags: ["scholarship","scam","politics"], counter_narrative: "PIB ने स्पष्ट किया है कि ऐसी कोई योजना नहीं है। यह फिशिंग संदेश है।", source_dataset: "curated_in", virality_score: 0.88 },
  { claim_text: "Election Commission of India has banned exit polls for the next 5 years.", language: "en", verdict: "FALSE", sources: ["Election Commission of India","PIB Fact Check"], topic_tags: ["elections","politics"], counter_narrative: "ECI only restricts exit-poll publication during polling phases under Section 126A of RP Act, not a 5-year ban.", source_dataset: "curated_in", virality_score: 0.7 },
  { claim_text: "PM Modi declared Diwali a national holiday for all banks for one full week.", language: "en", verdict: "FALSE", sources: ["RBI","PIB Fact Check"], topic_tags: ["banks","holiday","politics"], counter_narrative: "Bank holidays are notified by RBI per state and never include a week-long Diwali closure.", source_dataset: "curated_in", virality_score: 0.84 },
  { claim_text: "Indian Army officially endorsed a political party in the 2024 general elections.", language: "en", verdict: "FALSE", sources: ["Ministry of Defence","PIB Fact Check","AltNews"], topic_tags: ["army","elections","politics"], counter_narrative: "Indian Armed Forces are constitutionally apolitical; no such endorsement was made.", source_dataset: "curated_in", virality_score: 0.91 },
  { claim_text: "மத்திய அரசு தமிழ்நாட்டில் இலவச மின்சாரம் அறிவித்துள்ளது.", language: "ta", verdict: "FALSE", sources: ["PIB Fact Check","TANGEDCO"], topic_tags: ["electricity","politics","scheme"], counter_narrative: "மத்திய அரசு இலவச மின்சார திட்டத்தை அறிவிக்கவில்லை. மின்சார கட்டணம் மாநில அரசின் அதிகார வரம்பில் உள்ளது.", source_dataset: "curated_in", virality_score: 0.78 },
  { claim_text: "প্রধানমন্ত্রী সমস্ত মুসলিম পরিবারকে মাসিক ₹৬০০০ দেওয়ার ঘোষণা করেছেন।", language: "bn", verdict: "FALSE", sources: ["PIB Fact Check"], topic_tags: ["politics","communal","scheme"], counter_narrative: "এই দাবি ভুয়া। কেন্দ্র সরকারের এমন কোনো ধর্ম-ভিত্তিক প্রকল্প নেই।", source_dataset: "curated_in", virality_score: 0.86 },
  { claim_text: "Aadhaar card will be cancelled if not linked to your voter ID by next month.", language: "en", verdict: "FALSE", sources: ["UIDAI","Election Commission of India"], topic_tags: ["aadhaar","identity","politics"], counter_narrative: "Aadhaar-Voter ID linkage is voluntary and Aadhaar is never cancelled for non-linkage.", source_dataset: "curated_in", virality_score: 0.93 },
  { claim_text: "Government will deduct ₹500 monthly from all savings accounts for the new National Defence Fund.", language: "en", verdict: "FALSE", sources: ["RBI","Ministry of Finance","PIB Fact Check"], topic_tags: ["banks","scam","politics"], counter_narrative: "No such automatic deduction exists. RBI confirmed the message as misinformation.", source_dataset: "curated_in", virality_score: 0.81 },
  { claim_text: "India has officially declared a four-day work week for all government employees.", language: "en", verdict: "FALSE", sources: ["DoPT","PIB Fact Check"], topic_tags: ["jobs","politics"], counter_narrative: "DoPT has issued no such notification. Government employees follow a 5-day week.", source_dataset: "curated_in", virality_score: 0.74 },

  // ---------- HEALTH (WHO / MoHFW) ----------
  { claim_text: "Drinking warm water with lemon and baking soda cures COVID-19 in 24 hours.", language: "en", verdict: "FALSE", sources: ["WHO","Ministry of Health & Family Welfare"], topic_tags: ["health","covid"], counter_narrative: "WHO confirms no home remedy cures COVID-19. Vaccination and clinical care remain primary.", source_dataset: "who_health", virality_score: 0.95 },
  { claim_text: "5G mobile towers cause coronavirus infections.", language: "en", verdict: "FALSE", sources: ["WHO","DoT India"], topic_tags: ["health","5g","conspiracy"], counter_narrative: "5G uses non-ionising radio waves and cannot transmit viruses. WHO has explicitly debunked this.", source_dataset: "who_health", virality_score: 0.97 },
  { claim_text: "गोमूत्र पीने से कैंसर पूरी तरह ठीक हो जाता है।", language: "hi", verdict: "FALSE", sources: ["AIIMS","WHO India"], topic_tags: ["health","cancer"], counter_narrative: "किसी भी प्रामाणिक चिकित्सा अध्ययन ने यह साबित नहीं किया है। कैंसर के लिए वैज्ञानिक उपचार आवश्यक है।", source_dataset: "who_health", virality_score: 0.83 },
  { claim_text: "COVID-19 vaccines contain microchips for population tracking.", language: "en", verdict: "FALSE", sources: ["WHO","CoWIN","PIB Fact Check"], topic_tags: ["health","vaccine","conspiracy"], counter_narrative: "Vaccines contain antigens, lipids, salts and stabilisers — no electronic components are physically possible at that scale.", source_dataset: "who_health", virality_score: 0.96 },
  { claim_text: "Eating raw garlic on an empty stomach kills the COVID virus.", language: "en", verdict: "FALSE", sources: ["WHO"], topic_tags: ["health","covid","remedy"], counter_narrative: "WHO states garlic has no proven preventive effect against COVID-19.", source_dataset: "who_health", virality_score: 0.79 },
  { claim_text: "BCG vaccination protects against all variants of coronavirus.", language: "en", verdict: "MISLEADING", sources: ["ICMR","WHO"], topic_tags: ["health","vaccine"], counter_narrative: "Studies show no conclusive evidence; ICMR says BCG is not a substitute for COVID vaccines.", source_dataset: "who_health", virality_score: 0.62 },
  { claim_text: "Hot air from a hairdryer in your nostrils kills the coronavirus.", language: "en", verdict: "FALSE", sources: ["WHO"], topic_tags: ["health","remedy"], counter_narrative: "This practice is dangerous and provides no antiviral effect; WHO advises against it.", source_dataset: "who_health", virality_score: 0.71 },
  { claim_text: "Patanjali Coronil has been approved by WHO as a certified COVID treatment.", language: "en", verdict: "FALSE", sources: ["WHO","Ministry of AYUSH"], topic_tags: ["health","ayurveda"], counter_narrative: "WHO clarified it does not approve any traditional medicine for COVID-19 treatment.", source_dataset: "who_health", virality_score: 0.9 },
  { claim_text: "Drinking cow milk cures monkeypox in 3 days.", language: "en", verdict: "FALSE", sources: ["WHO","Ministry of Health & Family Welfare"], topic_tags: ["health","monkeypox"], counter_narrative: "There is no scientific evidence for milk-based cures. Monkeypox requires medical management.", source_dataset: "who_health", virality_score: 0.66 },
  { claim_text: "Holding your breath for 10 seconds proves you don't have COVID.", language: "en", verdict: "FALSE", sources: ["WHO"], topic_tags: ["health","covid"], counter_narrative: "This is not a valid diagnostic test. Only RT-PCR / RAT tests confirm infection.", source_dataset: "who_health", virality_score: 0.74 },

  // ---------- COMMUNAL / SOCIAL ----------
  { claim_text: "A viral video shows a Hindu shopkeeper being attacked in Bengaluru last week.", language: "en", verdict: "MISLEADING", sources: ["AltNews","BoomLive"], topic_tags: ["communal","video","out-of-context"], counter_narrative: "The video is from 2019 in a personal dispute unrelated to communal tensions; misattributed in 2024.", source_dataset: "curated_in", virality_score: 0.89 },
  { claim_text: "Mosques in Delhi were illegally built on temple ruins, government to demolish them.", language: "en", verdict: "FALSE", sources: ["DDA","PIB Fact Check"], topic_tags: ["communal","politics"], counter_narrative: "DDA has issued no such demolition order. The viral image is digitally altered.", source_dataset: "curated_in", virality_score: 0.87 },
  { claim_text: "Farmers' protest 2024 was funded by foreign NGOs to destabilise India.", language: "en", verdict: "UNVERIFIABLE", sources: ["MHA","AltNews"], topic_tags: ["politics","farmers","conspiracy"], counter_narrative: "No verified evidence supports foreign-funding claims; MHA has not issued such findings.", source_dataset: "curated_in", virality_score: 0.78 },
  { claim_text: "Halal-certified products financially support terrorism.", language: "en", verdict: "FALSE", sources: ["FSSAI","BoomLive"], topic_tags: ["communal","food"], counter_narrative: "Halal certification is a food-handling standard; FSSAI confirms no terror-funding link exists.", source_dataset: "curated_in", virality_score: 0.83 },

  // ---------- FINANCE / SCAMS ----------
  { claim_text: "RBI is releasing a new ₹1000 note next month.", language: "en", verdict: "FALSE", sources: ["RBI","PIB Fact Check"], topic_tags: ["finance","banks"], counter_narrative: "RBI has issued no such notification. The image is photoshopped.", source_dataset: "curated_in", virality_score: 0.85 },
  { claim_text: "All ₹500 notes with star (*) symbol are fake.", language: "en", verdict: "FALSE", sources: ["RBI"], topic_tags: ["finance","banks"], counter_narrative: "Star-series notes are legitimate replacement notes issued by RBI for damaged banknotes.", source_dataset: "curated_in", virality_score: 0.91 },
  { claim_text: "PM Yojana 2024: register on this link to receive ₹50,000 instantly.", language: "en", verdict: "FALSE", sources: ["PIB Fact Check","CERT-In"], topic_tags: ["scam","phishing","finance"], counter_narrative: "Phishing scam. No government scheme distributes funds via WhatsApp links.", source_dataset: "curated_in", virality_score: 0.94 },
  { claim_text: "Income Tax department will give 30% rebate to all citizens who download this app.", language: "en", verdict: "FALSE", sources: ["Income Tax India","CERT-In"], topic_tags: ["scam","tax","app"], counter_narrative: "ITD never offers rebates via third-party apps. The link spreads malware.", source_dataset: "curated_in", virality_score: 0.86 },
  { claim_text: "Bitcoin has been declared legal tender by the Reserve Bank of India.", language: "en", verdict: "FALSE", sources: ["RBI"], topic_tags: ["crypto","finance"], counter_narrative: "RBI has not recognised any cryptocurrency as legal tender. Only the Digital Rupee is RBI-issued.", source_dataset: "curated_in", virality_score: 0.79 },

  // ---------- DEEPFAKES / AI-GENERATED ----------
  { claim_text: "A viral video shows Amitabh Bachchan endorsing a cryptocurrency investment scheme.", language: "en", verdict: "FALSE", sources: ["AltNews","BoomLive"], topic_tags: ["deepfake","celebrity","scam"], counter_narrative: "The video is an AI-generated deepfake. Mr Bachchan has not endorsed any crypto scheme.", source_dataset: "curated_in", virality_score: 0.96 },
  { claim_text: "Sachin Tendulkar promoted a fantasy gaming app in a recent viral video.", language: "en", verdict: "MISLEADING", sources: ["BoomLive"], topic_tags: ["deepfake","celebrity"], counter_narrative: "Audio in the clip is voice-cloned. Tendulkar's team confirmed it is not authentic.", source_dataset: "curated_in", virality_score: 0.88 },
  { claim_text: "Rashmika Mandanna's elevator video posted online is genuine.", language: "en", verdict: "FALSE", sources: ["BoomLive","AltNews"], topic_tags: ["deepfake","celebrity"], counter_narrative: "Forensic analysis confirmed it is a deepfake superimposed on another woman's video.", source_dataset: "curated_in", virality_score: 0.97 },
  { claim_text: "Mukesh Ambani announced a scheme to gift ₹15,000 to every Indian woman.", language: "en", verdict: "FALSE", sources: ["Reliance Industries","PIB Fact Check"], topic_tags: ["deepfake","scam"], counter_narrative: "Reliance has issued no such announcement. The video is AI-generated to phish users.", source_dataset: "curated_in", virality_score: 0.89 },

  // ---------- INTERNATIONAL ----------
  { claim_text: "NASA confirmed a 6-day total darkness across Earth in December.", language: "en", verdict: "FALSE", sources: ["NASA","PIB Fact Check"], topic_tags: ["space","conspiracy"], counter_narrative: "NASA has issued no such statement. Recurring hoax since 2012.", source_dataset: "international", virality_score: 0.81 },
  { claim_text: "Pakistan formally apologised for the Pulwama attack.", language: "en", verdict: "FALSE", sources: ["MEA","BoomLive"], topic_tags: ["politics","international"], counter_narrative: "No such diplomatic statement exists. The viral document is fabricated.", source_dataset: "international", virality_score: 0.84 },
  { claim_text: "Ukraine war is a Hollywood-style staged event.", language: "en", verdict: "FALSE", sources: ["Reuters","BBC Verify"], topic_tags: ["war","conspiracy","international"], counter_narrative: "Independent journalists, satellite imagery and OSINT confirm the conflict is real.", source_dataset: "international", virality_score: 0.93 },
  { claim_text: "WHO is preparing a global lockdown for a new pandemic in 2025.", language: "en", verdict: "FALSE", sources: ["WHO"], topic_tags: ["health","conspiracy"], counter_narrative: "WHO has no authority to impose lockdowns; pandemic preparedness ≠ scheduled lockdown.", source_dataset: "who_health", virality_score: 0.9 },

  // ---------- LIAR-style English political samples ----------
  { claim_text: "Crime rates in major US cities have decreased by 70% over the last two years.", language: "en", verdict: "FALSE", sources: ["FBI Crime Data","Politifact"], topic_tags: ["politics","crime","international"], counter_narrative: "FBI UCR data shows mixed trends; no 70% drop occurred nationwide.", source_dataset: "liar_sample", virality_score: 0.6 },
  { claim_text: "Solar panels generate more pollution to manufacture than they save in their lifetime.", language: "en", verdict: "FALSE", sources: ["IEA","NREL"], topic_tags: ["climate","energy"], counter_narrative: "Energy payback for solar PV is typically 1–4 years against a 25-year lifespan.", source_dataset: "liar_sample", virality_score: 0.55 },
  { claim_text: "Electric vehicles emit more lifetime CO₂ than petrol cars.", language: "en", verdict: "MISLEADING", sources: ["IEA","ICCT"], topic_tags: ["climate","auto"], counter_narrative: "Lifecycle emissions of EVs are lower in nearly every grid mix; the gap widens with cleaner grids.", source_dataset: "liar_sample", virality_score: 0.71 },
  { claim_text: "Wind turbines kill more birds than any other human cause.", language: "en", verdict: "FALSE", sources: ["US Fish & Wildlife","Audubon"], topic_tags: ["climate","wildlife"], counter_narrative: "Buildings and cats kill orders of magnitude more birds than wind turbines.", source_dataset: "liar_sample", virality_score: 0.58 },
  { claim_text: "Drinking 8 glasses of water a day is medically required for everyone.", language: "en", verdict: "MISLEADING", sources: ["Harvard Health","Mayo Clinic"], topic_tags: ["health","nutrition"], counter_narrative: "Hydration needs vary; the 8-glass rule has no specific scientific basis.", source_dataset: "liar_sample", virality_score: 0.67 },
  { claim_text: "Vaccines cause autism in children.", language: "en", verdict: "FALSE", sources: ["WHO","CDC","ICMR"], topic_tags: ["health","vaccine"], counter_narrative: "Multiple large studies (>1.2M children) show no link. The original 1998 paper was retracted as fraud.", source_dataset: "liar_sample", virality_score: 0.96 },
  { claim_text: "The Great Wall of China is visible from the Moon with the naked eye.", language: "en", verdict: "FALSE", sources: ["NASA"], topic_tags: ["science","conspiracy"], counter_narrative: "Astronauts including Chinese taikonauts confirmed it is not visible without aid.", source_dataset: "liar_sample", virality_score: 0.5 },
  { claim_text: "Microwaving food destroys all its nutrients.", language: "en", verdict: "FALSE", sources: ["WHO","FSSAI"], topic_tags: ["health","food"], counter_narrative: "Microwaving often retains MORE nutrients due to shorter cook times and less water.", source_dataset: "liar_sample", virality_score: 0.61 },

  // ---------- SATIRE flagged correctly ----------
  { claim_text: "ISRO launches a new mission to recover lost Wi-Fi signals from outer space — The Faking News", language: "en", verdict: "SATIRE", sources: ["The Faking News"], topic_tags: ["satire","space"], counter_narrative: "Published as satire by The Faking News; not a real ISRO mission.", source_dataset: "satire", virality_score: 0.4 },
  { claim_text: "Mumbai potholes officially declared a UNESCO heritage site — Fauxy", language: "en", verdict: "SATIRE", sources: ["The Fauxy"], topic_tags: ["satire","civic"], counter_narrative: "The Fauxy is a satire publication; UNESCO has issued no such designation.", source_dataset: "satire", virality_score: 0.45 },
];

// Programmatically expand to ~200 with paraphrased variants to demonstrate vector clustering.
function expand(seeds: Seed[]): Seed[] {
  const variants: { prefix: string; suffix: string; lang?: string }[] = [
    { prefix: "VIRAL: ",                                suffix: " — share before it's deleted!" },
    { prefix: "BREAKING NEWS: ",                        suffix: " (forwarded as received)" },
    { prefix: "Government source confirms: ",           suffix: " — please verify." },
    { prefix: "WhatsApp forward says: ",                suffix: "" },
    { prefix: "तत्काल फॉरवर्ड करें: ",                     suffix: " — सूत्रों के अनुसार।", lang: "hi" },
  ];
  const out: Seed[] = [...seeds];
  for (const s of seeds) {
    for (const v of variants) {
      out.push({
        ...s,
        claim_text: v.prefix + s.claim_text + v.suffix,
        language: v.lang ?? s.language,
        virality_score: Math.min(1, (s.virality_score ?? 0.5) + 0.05),
        source_dataset: s.source_dataset + "_variant",
      });
      if (out.length >= 220) return out;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // wipe and reseed for idempotent demo
    await supabase.from("claims").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const all = expand(SEEDS);
    const qdrantOk = await ensureQdrantCollection();

    const rows: any[] = [];
    const qpoints: { id: string; vector: number[]; payload: any }[] = [];

    for (const s of all) {
      const v = await embed(s.claim_text);
      const id = crypto.randomUUID();
      rows.push({
        id,
        claim_text: s.claim_text,
        language: s.language,
        verdict: s.verdict,
        confidence: 0.9,
        sources: s.sources,
        topic_tags: s.topic_tags,
        region: s.region ?? "national",
        virality_score: s.virality_score ?? 0.5,
        counter_narrative: s.counter_narrative,
        source_dataset: s.source_dataset,
        embedding: v as unknown as string,
      });
      qpoints.push({ id, vector: v, payload: {
        claim_text: s.claim_text, language: s.language, verdict: s.verdict,
        sources: s.sources, counter_narrative: s.counter_narrative,
        topic_tags: s.topic_tags, source_dataset: s.source_dataset,
        date_checked: new Date().toISOString(),
      }});
    }

    // bulk insert in chunks
    const chunk = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await supabase.from("claims").insert(slice);
      if (error) { console.error("insert error:", error); break; }
      inserted += slice.length;
    }

    let qmirrored = 0;
    if (qdrantOk) {
      for (let i = 0; i < qpoints.length; i += 100) {
        const ok = await qdrantUpsertBatch(qpoints.slice(i, i + 100));
        if (ok) qmirrored += Math.min(100, qpoints.length - i);
      }
    }

    return new Response(JSON.stringify({
      ok: true, inserted, qdrant_mirrored: qmirrored,
      qdrant_enabled: qdrantOk, total: all.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
