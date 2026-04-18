import { useCallback, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Link as LinkIcon, FileText, Image as ImageIcon, Send, Film, Music } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  analyzeAudioFile,
  extractDocumentText,
  extractVideoFrames,
  readVideoMeta,
  summarizeAudioHeuristics,
  type AudioForensicsClient,
  type VideoMeta,
} from "@/lib/truthlensMedia";
import { MediaScanMeter } from "./MediaScanMeter";
import type { TruthLensAnalyzeResponse } from "@/types/truthlensAnalyze";

type Mode = "text" | "url" | "image" | "audio" | "video" | "document";

const MAX_DOC_CHARS = 14_000;
const VIDEO_FRAME_COUNT = 4;

const SAMPLES = [
  { lang: "en", label: "EN · viral political", text: "BREAKING: PM Modi has just announced ₹10 lakh per farmer in their bank accounts under PM-Kisan! Forward to all WhatsApp groups before it's deleted!" },
  { lang: "hi", label: "हिन्दी · health hoax", text: "बड़ी खबर: WHO ने कन्फर्म किया है कि गोमूत्र पीने से कैंसर पूरी तरह ठीक हो जाता है। तुरंत फॉरवर्ड करें!" },
  { lang: "en", label: "EN · deepfake claim",   text: "Watch: Amitabh Bachchan officially endorses this new crypto investment scheme guaranteeing 40% monthly returns. Sign up at bit.ly/amitabh-crypto" },
  { lang: "ta", label: "தமிழ் · scheme scam",    text: "முக்கிய அறிவிப்பு: மத்திய அரசு தமிழ்நாட்டில் இலவச மின்சாரம் அறிவித்துள்ளது. இந்த லிங்கில் பதிவு செய்யுங்கள்: bit.ly/free-power-tn" },
  { lang: "en", label: "EN · finance scam",     text: "RBI is releasing a new ₹1000 note next month. Old notes will be invalid after Dec 31. Act fast!" },
];

export const AnalyzeConsole = ({ onResult }: { onResult: (result: TruthLensAnalyzeResponse) => void }) => {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [prepBusy, setPrepBusy] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<{ chars: number; pages?: number } | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoMeta | null>(null);
  const [audioHeuristicLine, setAudioHeuristicLine] = useState<string | null>(null);
  const [frameThumbs, setFrameThumbs] = useState<string[]>([]);

  const documentTextRef = useRef<string | null>(null);
  const videoFramesRef = useRef<string[]>([]);
  const videoMetaRef = useRef<VideoMeta | null>(null);
  const audioForensicsRef = useRef<AudioForensicsClient | null>(null);

  const resetMediaRefs = () => {
    documentTextRef.current = null;
    videoFramesRef.current = [];
    videoMetaRef.current = null;
    audioForensicsRef.current = null;
    setPickedFile(null);
    setVideoPreviewUrl(null);
    setDocInfo(null);
    setVideoInfo(null);
    setAudioHeuristicLine(null);
    setFrameThumbs([]);
  };

  const getStages = (m: Mode) => {
    if (m === "video") return [
      "Registering container + colour space…",
      "Sampling keyframes for V1–V8 vision forensics…",
      "Estimating motion vectors + temporal seams…",
      "Scoring face boundary / warping priors…",
      "Cross-checking audio-visual plausibility…",
      "Synthesising verdict + multimodal_explain…",
    ];
    if (m === "audio") return [
      "Decoding PCM + running client DSP heuristics…",
      "Projecting prosody / stationarity features…",
      "Searching synthesis-tool priors (A1–A7)…",
      "Correlating with Qdrant + live sources…",
      "Synthesising verdict + multimodal_explain…",
    ];
    if (m === "document") return [
      "Extracting text (PDF/DOCX/TXT) in-browser…",
      "Segmenting lines for T10 authenticity pass…",
      "Correlating claims with pgvector + Qdrant…",
      "Building line-level authenticity map…",
      "Rendering export-ready annotations…",
    ];
    return [
      "Detecting language…",
      "Extracting claims via NER…",
      "Querying Qdrant Cloud (HNSW, 384-d cosine)…",
      "Cross-checking trusted sources…",
      "Running multimodal forensic signals…",
      "Synthesising verdict & multilingual rebuttal…",
    ];
  };

  const handleImageFile = async (f: File) => {
    if (f.size > 25 * 1024 * 1024) { toast.error("Keep uploads under 25 MB for this demo."); return; }
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result as string);
    reader.readAsDataURL(f);
  };

  const prepareMedia = useCallback(async (f: File, m: Mode) => {
    setPrepBusy(true);
    try {
      if (m === "document") {
        const { text: docText, pages } = await extractDocumentText(f);
        if (!docText.trim()) throw new Error("No extractable text in that document.");
        documentTextRef.current = docText;
        setDocInfo({ chars: docText.length, pages });
        toast.success(`Document ready · ${docText.length.toLocaleString()} chars${pages ? ` · ${pages} pp.` : ""}`);
      } else if (m === "video") {
        const [meta, frames] = await Promise.all([
          readVideoMeta(f),
          extractVideoFrames(f, VIDEO_FRAME_COUNT),
        ]);
        videoMetaRef.current = meta;
        videoFramesRef.current = frames;
        setVideoInfo(meta);
        setFrameThumbs(frames.slice(0, 3));
        const u = URL.createObjectURL(f);
        setVideoPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return u;
        });
        toast.success(`Video ready · ${frames.length} keyframes · ${Math.round(meta.durationSec)}s`);
      } else if (m === "audio") {
        const forensics = await analyzeAudioFile(f);
        audioForensicsRef.current = forensics;
        setAudioHeuristicLine(summarizeAudioHeuristics(forensics));
        toast.success("Audio decoded · client DSP heuristics attached to payload.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not prepare file";
      toast.error(msg);
      resetMediaRefs();
    } finally {
      setPrepBusy(false);
    }
  }, []);

  const handleFile = async (f: File) => {
    if (f.size > 25 * 1024 * 1024) { toast.error("Keep uploads under 25 MB for this demo."); return; }
    setPickedFile(f);
    if (mode === "image") {
      await handleImageFile(f);
      return;
    }
    documentTextRef.current = null;
    videoFramesRef.current = [];
    videoMetaRef.current = null;
    audioForensicsRef.current = null;
    setDocInfo(null);
    setVideoInfo(null);
    setAudioHeuristicLine(null);
    setFrameThumbs([]);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    await prepareMedia(f, mode);
  };

  const submit = async () => {
    if (mode === "text" && !text.trim()) return toast.error("Paste some content to analyse");
    if (mode === "url"  && !url.trim())  return toast.error("Enter a URL");
    if (mode === "image" && !imageData)  return toast.error("Upload an image");
    if (mode === "audio" && !pickedFile) return toast.error("Upload an audio file");
    if (mode === "video" && !pickedFile) return toast.error("Upload a video file");
    if (mode === "document" && !pickedFile) return toast.error("Upload a PDF or document");
    if (mode === "document" && !documentTextRef.current?.trim()) return toast.error("Document text not extracted yet — pick another file.");
    if (mode === "video" && videoFramesRef.current.length === 0) return toast.error("Keyframes not ready — wait for prep or re-upload.");
    if (prepBusy) return toast.error("Still preparing media…");

    setLoading(true);
    let i = 0;
    const currentStages = getStages(mode);
    setStage(currentStages[0]);
    const tick = setInterval(() => {
      i = Math.min(i + 1, currentStages.length - 1);
      setStage(currentStages[i]);
    }, 1100);

    try {
      const payload: Record<string, unknown> = { modality: mode, mime_type: pickedFile?.type ?? undefined };

      if (mode === "text") payload.text = text;
      if (mode === "url") {
        payload.url = url;
        payload.text = `Analyse the source URL ${url} for credibility and possible misinformation.`;
      }
      if (mode === "image") payload.image_base64 = imageData;

      if (mode === "document") {
        const raw = documentTextRef.current ?? "";
        const clipped = raw.length > MAX_DOC_CHARS ? `${raw.slice(0, MAX_DOC_CHARS)}\n\n[TRUTHLENS TRUNCATION: send shorter PDF or split pages]` : raw;
        payload.text = clipped;
        payload.document_text = clipped;
        payload.document_filename = pickedFile?.name ?? "document";
      }

      if (mode === "video" && pickedFile) {
        const meta = videoMetaRef.current ?? videoInfo;
        payload.video_frames_base64 = videoFramesRef.current;
        payload.video_meta = meta ?? undefined;
        payload.text = [
          `File: ${pickedFile.name}`,
          meta ? `Resolution ${meta.width}×${meta.height}, duration ${meta.durationSec.toFixed(2)}s.` : "",
          `Keyframes: ${videoFramesRef.current.length} JPEG samples across timeline.`,
          "Task: deepfake / manipulation / misinformation forensics on frames + metadata.",
        ].filter(Boolean).join("\n");
      }

      if (mode === "audio" && pickedFile) {
        const fx = audioForensicsRef.current;
        payload.audio_forensics_client = fx ?? undefined;
        payload.text = [
          `File: ${pickedFile.name}`,
          fx ? `Client DSP: ${JSON.stringify(fx)}` : "",
          audioHeuristicLine ? `Heuristic summary: ${audioHeuristicLine}` : "",
          "Task: voice-clone / synthesis / splicing likelihood using metrics + language priors.",
        ].filter(Boolean).join("\n\n");
      }

      const { data, error } = await supabase.functions.invoke<TruthLensAnalyzeResponse>("analyze", { body: payload });
      if (error) throw error;
      if (data && "error" in data && data.error) throw new Error(String(data.error));
      if (!data?.report) throw new Error("Malformed analyse response");

      if (mode === "document") {
        const rawDoc = documentTextRef.current ?? "";
        const clipped =
          rawDoc.length > MAX_DOC_CHARS
            ? `${rawDoc.slice(0, MAX_DOC_CHARS)}\n\n[TRUTHLENS TRUNCATION: send shorter PDF or split pages]`
            : rawDoc;
        data.source_document_text = data.source_document_text ?? clipped;
      }

      onResult(data);
      toast.success(`TruthScore ${data.report.truth_score} — ${data.report.overall_verdict}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
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

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-saffron" />
            Forensic Intake Console
          </h3>
          <p className="text-xs text-muted-foreground font-mono-tech mt-1">
            Multimodal analyse · PDF/DOCX/TXT extraction · video keyframes · audio DSP heuristics
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-surface-2 p-1 ring-1 ring-border">
            <ModeBtn active={mode==="text"} onClick={() => { setMode("text"); setImageData(null); resetMediaRefs(); }}><FileText className="h-3.5 w-3.5" /> Text</ModeBtn>
            <ModeBtn active={mode==="url"} onClick={() => { setMode("url"); setImageData(null); resetMediaRefs(); }}><LinkIcon className="h-3.5 w-3.5" /> URL</ModeBtn>
            <ModeBtn active={mode==="image"} onClick={() => { setMode("image"); setImageData(null); resetMediaRefs(); }}><ImageIcon className="h-3.5 w-3.5" /> Image</ModeBtn>
          </div>
          <div className="flex rounded-lg bg-surface-2 p-1 ring-1 ring-border">
            <ModeBtn active={mode==="audio"} onClick={() => { setMode("audio"); setImageData(null); resetMediaRefs(); }}><Music className="h-3.5 w-3.5" /> Audio</ModeBtn>
            <ModeBtn active={mode==="video"} onClick={() => { setMode("video"); setImageData(null); resetMediaRefs(); }}><Film className="h-3.5 w-3.5" /> Video</ModeBtn>
            <ModeBtn active={mode==="document"} onClick={() => { setMode("document"); setImageData(null); resetMediaRefs(); }}><FileText className="h-3.5 w-3.5" /> Doc</ModeBtn>
          </div>
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
            <p className="mt-2 text-xs text-muted-foreground">URL credibility is scored with retrieval + source priors. Server-side scraping stays minimal in this demo.</p>
          </motion.div>
        )}

        {mode === "image" && (
          <motion.div key="image" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <label className="block w-full rounded-xl bg-surface-2/40 ring-1 ring-dashed ring-border hover:ring-primary p-8 text-center cursor-pointer transition">
              <input type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} />
              {imageData ? (
                <img src={imageData} alt="upload" className="mx-auto max-h-48 rounded-lg" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary-glow" />
                  Drop meme, screenshot or photo (JPG/PNG/WebP).
                </div>
              )}
            </label>
          </motion.div>
        )}

        {mode === "audio" && (
          <motion.div key="audio" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <label className="block w-full rounded-xl bg-surface-2/40 ring-1 ring-dashed ring-border hover:ring-primary p-6 text-center cursor-pointer transition">
              <input type="file" accept="audio/*" hidden onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} />
              {pickedFile ? (
                <div className="text-left space-y-2">
                  <div className="p-3 bg-primary/10 text-primary font-mono-tech rounded-lg text-sm">
                    {prepBusy ? "Decoding audio…" : `Loaded: ${pickedFile.name}`}
                  </div>
                  {audioHeuristicLine && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{audioHeuristicLine}</p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex flex-col items-center">
                  <div className="flex gap-2">
                    <span className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center font-bold">WAV</span>
                    <span className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center font-bold">MP3</span>
                  </div>
                  <div className="mt-4">Upload audio — we decode in-browser, attach DSP metrics, then run A1–A7 via the forensic API.</div>
                </div>
              )}
            </label>
            <MediaScanMeter file={pickedFile} active={loading} label="Live waveform sweep (client-side)" />
          </motion.div>
        )}

        {mode === "video" && (
          <motion.div key="video" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <label className="block w-full rounded-xl bg-surface-2/40 ring-1 ring-dashed ring-border hover:ring-primary p-6 text-center cursor-pointer transition">
              <input type="file" accept="video/*" hidden onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} />
              {pickedFile ? (
                <div className="space-y-3 text-left">
                  <div className="p-3 bg-primary/10 text-primary font-mono-tech rounded-lg text-sm">
                    {prepBusy ? "Sampling keyframes…" : `Loaded: ${pickedFile.name}`}
                  </div>
                  {videoPreviewUrl && (
                    <video src={videoPreviewUrl} className="w-full max-h-52 rounded-lg ring-1 ring-border bg-black/40" controls muted playsInline />
                  )}
                  {videoInfo && (
                    <p className="text-xs text-muted-foreground font-mono-tech">
                      {videoInfo.width}×{videoInfo.height} · {videoInfo.durationSec.toFixed(2)}s · {VIDEO_FRAME_COUNT} keyframes
                    </p>
                  )}
                  {frameThumbs.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {frameThumbs.map((src, idx) => (
                        <img key={idx} src={src} alt={`frame ${idx}`} className="h-16 rounded border border-border object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex flex-col items-center">
                  <div className="h-10 w-16 bg-muted/30 rounded border border-border mt-2 grid place-items-center">MP4</div>
                  <div className="mt-4">Upload a reel or clip — we auto-sample keyframes for V1–V8 vision forensics.</div>
                </div>
              )}
            </label>
          </motion.div>
        )}

        {mode === "document" && (
          <motion.div key="document" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <label className="block w-full rounded-xl bg-surface-2/40 ring-1 ring-dashed ring-border hover:ring-primary p-6 text-center cursor-pointer transition">
              <input type="file" accept=".pdf,.docx,.txt" hidden onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} />
              {pickedFile ? (
                <div className="text-left space-y-2">
                  <div className="p-3 bg-primary/10 text-primary font-mono-tech rounded-lg text-sm">
                    {prepBusy ? "Extracting text…" : `Ready: ${pickedFile.name}`}
                  </div>
                  {docInfo && (
                    <p className="text-xs text-muted-foreground">
                      {docInfo.chars.toLocaleString()} characters extracted{docInfo.pages ? ` · ${docInfo.pages} PDF pages` : ""}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex flex-col items-center">
                  <div className="h-10 w-10 bg-destructive/10 text-destructive rounded border border-destructive/20 mt-2 grid place-items-center font-bold">PDF</div>
                  <div className="mt-4">PDF, DOCX, or TXT — text is extracted locally, then line-authenticated server-side (T10).</div>
                </div>
              )}
            </label>
          </motion.div>
        )}

      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="text-xs font-mono-tech text-muted-foreground min-h-[1.25rem]">
          {loading ? <span className="text-primary-glow">{stage}</span> : prepBusy ? <span className="text-saffron">Preparing media…</span> : "Ready · typical latency 4–12 s depending on modality"}
        </div>
        <button
          onClick={() => void submit()} disabled={loading || prepBusy}
          className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bg-gradient-brand text-primary-foreground shadow-glow-blue hover:shadow-glow-saffron transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Analysing…" : "Run forensic analysis"}
        </button>
      </div>
    </div>
  );
};

const ModeBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-md text-xs font-mono-tech inline-flex items-center gap-1.5 transition ${
      active ? "bg-primary text-primary-foreground shadow-glow-blue" : "text-muted-foreground hover:text-foreground"
    }`}>{children}</button>
);
