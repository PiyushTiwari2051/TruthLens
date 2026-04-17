import { Cpu, Database, Globe2, Sparkles, ShieldCheck, Network, Layers3, Mic, Image as ImageIcon, Video } from "lucide-react";

const FEATURES = [
  { icon: Cpu, color: "primary-glow", title: "Multimodal AI pipeline", desc: "Lovable AI Gateway (Gemini Pro + Flash) drives claim extraction, NER, deepfake heuristics, satire detection and chain-of-thought verdict reasoning via tool-calling." },
  { icon: Database, color: "saffron", title: "Qdrant vector RAG", desc: "Every analysis runs HNSW cosine search over a 384-d Qdrant Cloud collection mirrored with Postgres pgvector — sub-5 ms semantic match against 220+ debunked claims." },
  { icon: Globe2, color: "emerald", title: "22 Indian languages", desc: "Detects, analyses and counters in Hindi, Tamil, Bengali, English and 19 more. Rebuttals are generated in the same script as the misinformation." },
  { icon: Layers3, color: "primary-glow", title: "Forensic signal panel", desc: "AI-gen probability, emotional manipulation, deepfake/voice-clone scores, EXIF anomaly, source credibility, false-urgency and false-authority flags — all explainable." },
  { icon: Network, color: "saffron", title: "Self-learning corpus", desc: "Every verified analysis is upserted back into Qdrant + pgvector — the knowledge graph compounds with every WhatsApp forward checked." },
  { icon: ShieldCheck, color: "emerald", title: "C2PA-aware architecture", desc: "Designed for cryptographic media authenticity (C2PA), MLflow retraining, Label Studio HITL, and Whisper / FaceForensics++ extension points." },
];

export const FeatureGrid = () => (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    {FEATURES.map((f, i) => {
      const Icon = f.icon;
      return (
        <div key={i} className="glass-card p-5 group hover:ring-primary/40 transition relative overflow-hidden">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 group-hover:opacity-30 blur-2xl transition"
               style={{ background: `hsl(var(--${f.color}))` }} />
          <Icon className={`h-6 w-6 mb-3 text-${f.color}`} />
          <h4 className="font-bold mb-1.5">{f.title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
        </div>
      );
    })}
  </div>
);

export const ModalityRail = () => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {[
      { i: Sparkles, l: "Text", s: "Claims · NER · burstiness" },
      { i: ImageIcon, l: "Image", s: "Deepfake · EXIF · OCR" },
      { i: Mic, l: "Audio", s: "Voice clones · MFCC" },
      { i: Video, l: "Video", s: "Lip-sync · FaceForensics++" },
    ].map((m, i) => {
      const I = m.i;
      return (
        <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-brand grid place-items-center shadow-glow-blue">
            <I className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold">{m.l}</div>
            <div className="text-[10px] uppercase tracking-wider font-mono-tech text-muted-foreground">{m.s}</div>
          </div>
        </div>
      );
    })}
  </div>
);
