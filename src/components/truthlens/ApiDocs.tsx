import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/analyze`;

const CURL = `curl -X POST "${ENDPOINT}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "BREAKING: PM Modi announced ₹10 lakh per farmer under PM-Kisan",
    "modality": "text"
  }'`;

const JS = `const { data } = await supabase.functions.invoke("analyze", {
  body: {
    text: "बड़ी खबर: WHO ने कन्फर्म किया है कि गोमूत्र पीने से कैंसर ठीक होता है",
    modality: "text",
  },
});

console.log(data.report.truth_score);     // 0–100
console.log(data.report.overall_verdict); // FALSE | MISLEADING | …
console.log(data.qdrant_matches);          // semantic hits in Qdrant Cloud`;

const RESPONSE = `{
  "ok": true,
  "analysis_id": "7864829f-…",
  "processing_ms": 5372,
  "report": {
    "detected_language": "en",
    "truth_score": 5,
    "overall_verdict": "FALSE",
    "claims": [{ "subject": "PM Modi", "predicate": "announced",
                  "object": "₹10 lakh per farmer", "verdict": "REFUTED" }],
    "manipulation_techniques": ["FALSE_URGENCY","FABRICATED_QUOTE"],
    "evidence_sources": [
      { "organisation": "PIB Fact Check", "stance": "REFUTES", "finding": "…" }
    ],
    "rebuttal_native":  "PM-Kisan provides ₹6,000/year, not ₹10 lakh.",
    "rebuttal_english": "PM-Kisan provides ₹6,000/year, not ₹10 lakh.",
    "counter_narrative": "PM-Kisan = ₹6,000/year in three instalments."
  },
  "qdrant_matches": [
    { "id": "…", "score": 0.97, "claim_text": "…", "verdict": "FALSE" }
  ]
}`;

export const ApiDocs = () => {
  const [tab, setTab] = useState<"curl"|"js"|"resp">("curl");
  const [copied, setCopied] = useState(false);
  const code = tab === "curl" ? CURL : tab === "js" ? JS : RESPONSE;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true); toast.success("Copied");
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-surface-2/40">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-emerald" />
          <div className="text-sm font-mono-tech">
            <span className="text-emerald">POST</span>
            <span className="text-foreground/80 ml-2">/v1/analyze</span>
          </div>
        </div>
        <div className="flex rounded-lg bg-surface p-1 ring-1 ring-border">
          {(["curl","js","resp"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-mono-tech rounded-md transition ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>{t === "resp" ? "response" : t}</button>
          ))}
        </div>
      </div>
      <div className="relative">
        <button onClick={copy} className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-xs font-mono-tech text-muted-foreground hover:text-foreground ring-1 ring-border">
          {copied ? <Check className="h-3 w-3 text-emerald" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className="overflow-x-auto p-5 text-xs leading-relaxed font-mono-tech text-foreground/90 bg-[#0b1020]/40 max-h-[420px]">
{code}
        </pre>
      </div>
    </div>
  );
};
