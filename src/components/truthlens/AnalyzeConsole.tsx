import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Link as LinkIcon, FileText, Image as ImageIcon, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Mode = "text" | "url" | "image";

const SAMPLES = [
  { lang: "en", label: "EN · viral political", text: "BREAKING: PM Modi has just announced ₹10 lakh per farmer in their bank accounts under PM-Kisan! Forward to all WhatsApp groups before it's deleted!" },
  { lang: "hi", label: "हिन्दी · health hoax", text: "बड़ी खबर: WHO ने कन्फर्म किया है कि गोमूत्र पीने से कैंसर पूरी तरह ठीक हो जाता है। तुरंत फॉरवर्ड करें!" },
  { lang: "en", label: "EN · deepfake claim",   text: "Watch: Amitabh Bachchan officially endorses this new crypto investment scheme guaranteeing 40% monthly returns. Sign up at bit.ly/amitabh-crypto" },
  { lang: "ta", label: "தமிழ் · scheme scam",    text: "முக்கிய அறிவிப்பு: மத்திய அரசு தமிழ்நாட்டில் இலவச மின்சாரம் அறிவித்துள்ளது. இந்த லிங்கில் பதிவு செய்யுங்கள்: bit.ly/free-power-tn" },
  { lang: "en", label: "EN · finance scam",     text: "RBI is releasing a new ₹1000 note next month. Old notes will be invalid after Dec 31. Act fast!" },
];

export const AnalyzeConsole = ({ onResult }: { onResult: (result: any) => void }) => {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");

  const stages = [
    "Detecting language…",
    "Extracting claims via NER…",
    "Querying Qdrant Cloud (HNSW, 384-d cosine)…",
    "Cross-checking trusted sources…",
    "Running multimodal forensic signals…",
    "Synthesising verdict & multilingual rebuttal…",
  ];

  const handleFile = async (f: File) => {
    if (f.size > 6 * 1024 * 1024) { toast.error("Image must be under 6 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (mode === "text" && !text.trim()) return toast.error("Paste some content to analyse");
    if (mode === "url"  && !url.trim())  return toast.error("Enter a URL");
    if (mode === "image" && !imageData)  return toast.error("Upload an image");

    setLoading(true);
    let i = 0;
    setStage(stages[0]);
    const tick = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setStage(stages[i]);
    }, 900);

    try {
      const payload: any = { modality: mode };
      if (mode === "text") payload.text = text;
      if (mode === "url") { payload.url = url; payload.text = `Analyse the source URL ${url} for credibility and possible misinformation.`; }
      if (mode === "image") payload.image_base64 = imageData;

      const { data, error } = await supabase.functions.invoke("analyze", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onResult(data);
      toast.success(`TruthScore ${data.report.truth_score} — ${data.report.overall_verdict}`);
    } catch (e: any) {
      const msg = e?.message ?? "Analysis failed";
      if (msg.includes("Rate limit")) toast.error("Rate limited. Try again in a moment.");
      else if (msg.includes("credits")) toast.error("AI credits exhausted — top up in Workspace → Usage.");
      else toast.error(msg);
    } finally {
      clearInterval(tick); setLoading(false); setStage("");
    }
  };

  return (
    <div className="glass-card p-6 md:p-8 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-tricolor opacity-70" />

      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-saffron" />
            Forensic Intake Console
          </h3>
          <p className="text-xs text-muted-foreground font-mono-tech mt-1">
            POST /v1/analyze · multilingual · multimodal · Qdrant-RAG
          </p>
        </div>
        <div className="flex rounded-lg bg-surface-2 p-1 ring-1 ring-border">
          <ModeBtn active={mode==="text"} onClick={() => setMode("text")}><FileText className="h-3.5 w-3.5" /> Text</ModeBtn>
          <ModeBtn active={mode==="url"} onClick={() => setMode("url")}><LinkIcon className="h-3.5 w-3.5" /> URL</ModeBtn>
          <ModeBtn active={mode==="image"} onClick={() => setMode("image")}><ImageIcon className="h-3.5 w-3.5" /> Image</ModeBtn>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === "text" && (
          <motion.div key="text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <textarea
              value={text} onChange={e => setText(e.target.value)} rows={6}
              placeholder="Paste a WhatsApp forward, tweet, news headline, or claim in any Indian language…"
              className="w-full resize-none rounded-xl bg-surface-2/60 ring-1 ring-border focus:ring-primary p-4 text-sm font-mono-tech placeholder:text-muted-foreground/60 focus:outline-none transition"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SAMPLES.map(s => (
                <button key={s.label} type="button" onClick={() => setText(s.text)}
                  className="chip hover:bg-surface-3 hover:ring-primary/40 transition">
                  <span className="text-saffron font-mono-tech">{s.lang}</span>
                  <span className="opacity-80">{s.label.split(" · ")[1]}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {mode === "url" && (
          <motion.div key="url" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <input
              value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/news/article"
              className="w-full rounded-xl bg-surface-2/60 ring-1 ring-border focus:ring-primary p-4 text-sm font-mono-tech focus:outline-none"
            />
            <p className="mt-2 text-xs text-muted-foreground">URL credibility is scored against MBFC-style heuristics + topic priors. Server-side scraping is disabled in this demo.</p>
          </motion.div>
        )}

        {mode === "image" && (
          <motion.div key="image" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <label className="block w-full rounded-xl bg-surface-2/40 ring-1 ring-dashed ring-border hover:ring-primary p-8 text-center cursor-pointer transition">
              <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {imageData ? (
                <img src={imageData} alt="upload" className="mx-auto max-h-48 rounded-lg" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary-glow" />
                  Drop a meme, screenshot or photo. JPG / PNG · ≤ 6 MB
                </div>
              )}
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="text-xs font-mono-tech text-muted-foreground min-h-[1.25rem]">
          {loading ? <span className="text-primary-glow">{stage}</span> : "Ready · processing typically 4–8 s"}
        </div>
        <button
          onClick={submit} disabled={loading}
          className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bg-gradient-brand text-primary-foreground shadow-glow-blue hover:shadow-glow-saffron transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Analysing…" : "Run forensic analysis"}
        </button>
      </div>
    </div>
  );
};

const ModeBtn = ({ active, onClick, children }: any) => (
  <button onClick={onClick}
    className={`px-3 py-1.5 rounded-md text-xs font-mono-tech inline-flex items-center gap-1.5 transition ${
      active ? "bg-primary text-primary-foreground shadow-glow-blue" : "text-muted-foreground hover:text-foreground"
    }`}>{children}</button>
);
