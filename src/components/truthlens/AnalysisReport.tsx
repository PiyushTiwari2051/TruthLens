import { motion } from "framer-motion";
import { ExternalLink, AlertOctagon, MessageCircle, Layers, Fingerprint, Languages, Brain, Database, Network } from "lucide-react";
import { TruthScoreDial, VerdictBadge, type Verdict } from "./Verdict";

const TECHNIQUE_LABEL: Record<string, string> = {
  IMPERSONATION: "Impersonation",
  FABRICATED_QUOTE: "Fabricated quote",
  OUT_OF_CONTEXT: "Out-of-context",
  STATISTICS_MANIPULATION: "Stats manipulation",
  EMOTIONAL_EXPLOITATION: "Emotional exploit",
  DEEPFAKE: "Deepfake",
  VOICE_CLONE: "Voice clone",
  SELECTIVE_EDITING: "Selective edit",
  FALSE_URGENCY: "False urgency",
  STRAWMAN: "Strawman",
  CHERRY_PICKING: "Cherry-picking",
  FALSE_AUTHORITY: "False authority",
};

export const AnalysisReport = ({ data }: { data: any }) => {
  if (!data?.report) return null;
  const r = data.report;
  const verdict = r.overall_verdict as Verdict;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16,1,0.3,1] }}
      className="grid gap-5"
    >
      {/* HEADER */}
      <div className="glass-card p-6 ring-tricolor scan-line">
        <div className="grid md:grid-cols-[auto,1fr,auto] items-center gap-6">
          <TruthScoreDial score={r.truth_score ?? r.satya_score ?? (verdict === 'TRUE' ? 95 : verdict === 'FALSE' ? 15 : 50)} />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <VerdictBadge verdict={verdict} large />
              <span className="chip"><Languages className="h-3 w-3 text-emerald" /> {r.detected_language?.toUpperCase()}</span>
              <span className="chip"><Brain className="h-3 w-3 text-primary-glow" /> {data.processing_ms} ms</span>
              <span className="chip"><Database className="h-3 w-3 text-saffron" /> {data.pgvector_matches?.length ?? 0} pgvector hits</span>
              <span className="chip"><Network className="h-3 w-3 text-saffron" /> {data.qdrant_matches?.length ?? 0} Qdrant hits</span>
            </div>
            <h3 className="text-xl font-bold mb-1">Forensic verdict</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{r.summary}</p>
          </div>
          {r.whatsapp_alert && (
            <div className="md:max-w-xs rounded-xl bg-emerald/10 ring-1 ring-emerald/40 p-4 text-xs">
              <div className="flex items-center gap-1.5 text-emerald font-mono-tech uppercase tracking-wider mb-1">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp alert
              </div>
              <p className="text-foreground/90">{r.whatsapp_alert}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* CLAIMS */}
        <div className="lg:col-span-2 glass-card p-6">
          <h4 className="font-bold flex items-center gap-2 mb-4"><Layers className="h-4 w-4 text-primary-glow" /> Extracted claims</h4>
          <div className="space-y-3">
            {r.claims?.map((c: any, i: number) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="rounded-lg bg-surface-2/60 ring-1 ring-border p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm flex-1">{c.text}</p>
                  <span className={`chip shrink-0 ${claimColor(c.verdict)}`}>{c.verdict}</span>
                </div>
                {(c.subject || c.predicate || c.object) && (
                  <div className="text-[11px] font-mono-tech text-muted-foreground mb-2">
                    [<span className="text-primary-glow">{c.subject}</span>] +
                    [<span className="text-saffron">{c.predicate}</span>] +
                    [<span className="text-emerald">{c.object}</span>]
                  </div>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">{c.evidence}</p>
              </motion.div>
            ))}
          </div>

          {/* TECHNIQUES */}
          {r.manipulation_techniques?.length > 0 && (
            <div className="mt-6">
              <h5 className="text-xs uppercase tracking-wider font-mono-tech text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-destructive" /> Manipulation techniques detected
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {r.manipulation_techniques.map((t: string) => (
                  <span key={t} className="chip bg-destructive/10 ring-destructive/30 text-destructive">
                    {TECHNIQUE_LABEL[t] ?? t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FORENSIC SIGNALS */}
        <div className="glass-card p-6">
          <h4 className="font-bold flex items-center gap-2 mb-4"><Fingerprint className="h-4 w-4 text-saffron" /> Forensic signals</h4>
          <div className="space-y-3">
            <SignalBar label="AI-generated probability" value={r.forensic_signals?.ai_generated_probability} invert />
            <SignalBar label="Emotional manipulation"   value={r.forensic_signals?.emotional_manipulation_score} invert />
            <SignalBar label="Deepfake probability"     value={r.forensic_signals?.deepfake_probability} invert />
            <SignalBar label="Voice clone probability"  value={r.forensic_signals?.voice_clone_probability} invert />
            <SignalBar label="Source credibility"        value={r.forensic_signals?.source_credibility} />
            <div className="pt-2 grid grid-cols-2 gap-2 text-[11px] font-mono-tech">
              <Flag on={r.forensic_signals?.false_urgency}    label="False urgency" />
              <Flag on={r.forensic_signals?.false_authority}  label="False authority" />
              <Flag on={r.forensic_signals?.exif_anomaly}     label="EXIF anomaly" />
              <Flag on={r.forensic_signals?.out_of_context}   label="Out of context" />
            </div>
          </div>
        </div>
      </div>

      {/* EVIDENCE & REBUTTAL */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-card p-6">
          <h4 className="font-bold mb-4">Trusted-source evidence</h4>
          <div className="space-y-2">
            {r.evidence_sources?.map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-3 bg-surface-2/50 ring-1 ring-border">
                <ExternalLink className="h-4 w-4 mt-0.5 text-primary-glow shrink-0" />
                <div className="text-sm flex-1">
                  <div className="font-medium">{s.organisation?.replace(/SatyaDrishti/gi, 'TruthLens')}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.finding}</div>
                </div>
                <span className={`chip shrink-0 ${stanceColor(s.stance)}`}>{s.stance}</span>
              </div>
            ))}
          </div>

          {(data.qdrant_matches?.length > 0) && (
            <div className="mt-5">
              <h5 className="text-xs uppercase tracking-wider font-mono-tech text-muted-foreground mb-2">
                Qdrant similarity hits (HNSW · cosine)
              </h5>
              <div className="space-y-1.5">
                {data.qdrant_matches.slice(0,4).map((m: any) => (
                  <div key={m.id} className="text-xs flex items-center gap-2 rounded-md bg-surface-2/40 ring-1 ring-border p-2">
                    <span className="font-mono-tech text-saffron tabular-nums">{(m.score*100).toFixed(1)}%</span>
                    <span className="truncate flex-1 text-muted-foreground">{m.claim_text}</span>
                    <span className="chip">{m.verdict}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-saffron opacity-20 blur-2xl" />
          <h4 className="font-bold mb-3">Multilingual rebuttal</h4>
          <div className="rounded-lg p-3 bg-surface-2/50 ring-1 ring-border mb-3">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono-tech text-muted-foreground mb-1.5">
              Native ({r.detected_language})
            </div>
            <p className={`text-sm leading-relaxed ${r.detected_language === "hi" ? "font-devanagari" : ""}`}>{r.rebuttal_native}</p>
          </div>
          <div className="rounded-lg p-3 bg-surface-2/50 ring-1 ring-border">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono-tech text-muted-foreground mb-1.5">English</div>
            <p className="text-sm leading-relaxed">{r.rebuttal_english}</p>
          </div>
          <div className="mt-4 rounded-lg p-3 bg-emerald/10 ring-1 ring-emerald/30">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono-tech text-emerald mb-1">Counter-narrative</div>
            <p className="text-sm font-medium">{r.counter_narrative}</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

function claimColor(v: string) {
  switch (v) {
    case "SUPPORTED": return "bg-emerald/15 ring-emerald/40 text-emerald";
    case "REFUTED": return "bg-destructive/15 ring-destructive/40 text-destructive";
    case "MISLEADING_CONTEXT": return "bg-saffron/15 ring-saffron/40 text-saffron";
    case "SATIRE": return "bg-primary/15 ring-primary/40 text-primary-glow";
    default: return "bg-muted/30 text-muted-foreground";
  }
}
function stanceColor(v: string) {
  switch (v) {
    case "REFUTES": return "bg-destructive/15 ring-destructive/40 text-destructive";
    case "SUPPORTS": return "bg-emerald/15 ring-emerald/40 text-emerald";
    case "CONTEXT": return "bg-saffron/15 ring-saffron/40 text-saffron";
    default: return "bg-muted/30 text-muted-foreground";
  }
}

const SignalBar = ({ label, value = 0, invert = false }: { label: string; value?: number; invert?: boolean }) => {
  const pct = Math.round((value ?? 0) * 100);
  const danger = invert ? pct >= 60 : pct < 40;
  const warn   = invert ? pct >= 30 : pct < 70;
  const color = danger ? "hsl(var(--destructive))" : warn ? "hsl(var(--warning))" : "hsl(var(--success))";
  return (
    <div>
      <div className="flex justify-between text-[11px] font-mono-tech text-muted-foreground">
        <span>{label}</span><span className="text-foreground tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-surface-3 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
          className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  );
};

const Flag = ({ on, label }: { on?: boolean; label: string }) => (
  <div className={`rounded-md px-2 py-1.5 ring-1 flex items-center justify-between ${on ? "bg-destructive/10 ring-destructive/30 text-destructive" : "bg-surface-2/40 ring-border text-muted-foreground"}`}>
    <span>{label}</span>
    <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-destructive" : "bg-muted-foreground/40"}`} />
  </div>
);
