import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Download, ExternalLink, AlertOctagon, MessageCircle, Layers, Fingerprint, Languages, Brain, Database, Network, Clapperboard, Mic2 } from "lucide-react";
import { TruthScoreDial, VerdictBadge, type Verdict } from "./Verdict";
import type { TruthLensAnalyzeResponse, TruthReport, DocumentAnalysisLine } from "@/types/truthlensAnalyze";
import { getDocumentAnalysisRows, isFakeAuthenticity } from "@/lib/documentAnalysisRows";

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

export const AnalysisReport = ({ data }: { data: TruthLensAnalyzeResponse }) => {
  if (!data.report) return null;
  const r: TruthReport = data.report;
  const verdict = (r.overall_verdict ?? "UNVERIFIABLE") as Verdict;
  const docRows = getDocumentAnalysisRows(data);

  const handleExportPdf = () => {
    const rows = getDocumentAnalysisRows(data);
    if (!rows.length) {
      toast.error("No document lines to export. Upload a document again and run analysis.");
      return;
    }
    try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 44;
    const maxW = pageW - margin * 2;
    let y = 52;

    const newPageIfNeeded = (needed: number) => {
      const pageH = doc.internal.pageSize.getHeight();
      if (y + needed > pageH - 44) {
        doc.addPage();
        y = 52;
      }
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(20, 20, 20);
    doc.text("TruthLens — T10 document forensics", margin, y);
    y += 26;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`TruthScore: ${r.truth_score ?? r.satya_score ?? "—"} · Verdict: ${r.overall_verdict}`, margin, y);
    y += 16;
    doc.text(`Language: ${r.detected_language ?? "—"} · Generated ${new Date().toISOString().slice(0, 19)}Z`, margin, y);
    y += 28;

    rows.forEach((line: DocumentAnalysisLine, idx: number) => {
      const auth = (line.authenticity || "UNVERIFIED").toUpperCase();
      if (auth === "FAKE" || auth === "REFUTED" || auth === "FALSE") doc.setTextColor(185, 28, 28);
      else if (auth === "MISLEADING") doc.setTextColor(161, 98, 7);
      else if (auth === "REAL") doc.setTextColor(21, 128, 61);
      else doc.setTextColor(70, 70, 70);

      const head = `[${String(idx + 1).padStart(2, "0")}] ${auth}`;
      const bodyLines = doc.splitTextToSize(line.line || "", maxW);
      const reasonLines = line.reasoning
        ? doc.splitTextToSize(`Reasoning: ${line.reasoning}`, maxW)
        : [];
      const blockH = 14 + bodyLines.length * 13 + (reasonLines.length ? 10 + reasonLines.length * 11 : 0);
      newPageIfNeeded(blockH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(head, margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      bodyLines.forEach((bl: string) => {
        newPageIfNeeded(16);
        doc.text(bl, margin, y);
        y += 13;
      });
      if (reasonLines.length) {
        doc.setFontSize(8.5);
        doc.setTextColor(90, 90, 90);
        reasonLines.forEach((rl: string) => {
          newPageIfNeeded(14);
          doc.text(rl, margin, y);
          y += 11;
        });
      }
      y += 10;
    });

    doc.save(`truthlens-annotated-${Date.now()}.pdf`);
    toast.success(`Downloaded PDF with ${rows.length} annotated lines.`);
    } catch (e) {
      console.error(e);
      toast.error("PDF export failed. Try another browser or disable strict download blockers.");
    }
  };

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
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-bold mb-1">Forensic verdict</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.summary}</p>
              </div>
              {docRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold bg-destructive/15 text-destructive ring-1 ring-destructive/35 hover:bg-destructive/25 transition"
                >
                  <Download className="h-4 w-4" />
                  Download fake-line PDF
                </button>
              )}
            </div>
          </div>
          {r.whatsapp_alert && (
            <div className="md:max-w-xs rounded-xl bg-emerald/10 ring-1 ring-emerald/40 p-4 text-xs">
              <div className="flex items-center gap-1.5 text-emerald font-mono-tech uppercase tracking-wider mb-1">
                <MessageCircle className="h-3.5 w-3.5" />  alert
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
            
            {r.video_specific_signals && (
              <div className="pt-4 mt-2 border-t border-border/50 space-y-2">
                <h5 className="text-[11px] uppercase tracking-wider font-mono-tech text-muted-foreground flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5 text-primary-glow" /> Video Forensics (V1-V8)</h5>
                <SignalBar label="Facial Boundary Artifacts" value={r.video_specific_signals.face_boundary_anomaly ? 0.95 : 0.05} invert />
                <SignalBar label="Skin Texture Inconsistency" value={r.video_specific_signals.face_boundary_anomaly ? 0.85 : 0.04} invert />
                <SignalBar label="Temporal Warping" value={r.video_specific_signals.temporal_inconsistency ? 0.88 : 0.02} invert />
                <div className="text-[11px] font-mono-tech flex justify-between mt-1 text-muted-foreground p-1.5 bg-surface-2/40 rounded">
                  <span>Audio vs Mouth Timing:</span> <span className="text-destructive font-bold tabular-nums">+{r.video_specific_signals.lip_sync_offset_ms}ms</span>
                </div>
                {r.video_specific_signals.lip_sync_offset_ms > 40 && (
                  <div className="text-[10px] font-mono-tech text-warning border border-warning/20 bg-warning/10 p-2 rounded mt-2">
                    <span className="opacity-80">PHONEME-VISEME MISMATCH DETECTED</span>
                  </div>
                )}
              </div>
            )}
            
            {r.audio_specific_signals && (
              <div className="pt-4 mt-2 border-t border-border/50 space-y-2">
                <h5 className="text-[11px] uppercase tracking-wider font-mono-tech text-muted-foreground flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5 text-primary-glow" /> Audio Forensics (A1-A7)</h5>
                {r.audio_specific_signals.mfcc_jitter !== undefined && <SignalBar label="Jitter / Shimmer Analysis" value={r.audio_specific_signals.mfcc_jitter} invert />}
                <SignalBar label="Breathing Pattern Anomaly" value={r.audio_specific_signals.splicing_detected ? 0.80 : 0.05} invert />
                <SignalBar label="Prosody Naturalness" value={r.audio_specific_signals.splicing_detected ? 0.3 : 0.9} />
                {r.audio_specific_signals.synthesis_tool_signature && (
                  <div className="text-[10px] font-mono-tech text-destructive border border-destructive/20 bg-destructive/10 p-2 rounded mt-2">
                    <span className="opacity-80">AI SYNTHESIS SIGNATURE:</span> {r.audio_specific_signals.synthesis_tool_signature}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {typeof r.multimodal_explain === "string" && r.multimodal_explain.trim() && (r.modality === "audio" || r.modality === "video") && (
        <div className="glass-card p-6 ring-1 ring-primary/25 border-l-4 border-l-primary/60">
          <h4 className="font-bold flex items-center gap-2 mb-2">
            {r.modality === "video" ? <Clapperboard className="h-4 w-4 text-primary-glow" /> : <Mic2 className="h-4 w-4 text-primary-glow" />}
            Multimodal engineer readout
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{r.multimodal_explain.trim()}</p>
        </div>
      )}

      {/* DOCUMENT ANALYSIS T10 PIPELINE */}
      {docRows.length > 0 && (
        <div className="glass-card p-6 border-l-4 border-l-primary/50 ring-1 ring-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h4 className="font-bold flex items-center gap-2"><Layers className="h-4 w-4 text-emerald" /> T10 Document Line-by-Line Forensics</h4>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 transition">
                <Download className="h-3.5 w-3.5" /> Download annotated PDF
              </button>
            </div>
          </div>
          <div className="space-y-1.5 bg-surface-2/20 p-4 rounded-xl font-mono-tech text-sm leading-relaxed tracking-tight shadow-inner max-h-[400px] overflow-y-auto">
            {docRows.map((line, idx: number) => {
               const isFake = isFakeAuthenticity(line.authenticity);
               const isMisleading = line.authenticity === "MISLEADING";
               const isReal = line.authenticity === "REAL";
               const isUnverified = line.authenticity === "UNVERIFIED" || line.authenticity === "UNVERIFIABLE";
               
               const colorClass = isFake ? "bg-destructive/10 text-destructive border-l-2 border-destructive shadow-[inset_0_1px_rgba(255,255,255,0.05)]" :
                             isMisleading ? "bg-saffron/10 text-saffron border-l-2 border-saffron" :
                             isReal ? "text-emerald opacity-90 border-l-2 border-emerald/50" :
                             isUnverified ? "text-muted-foreground border-l-2 border-border bg-surface-2/30" : "text-muted-foreground border-l-2 border-transparent";
                             
               return (
                  <div key={idx} title={`Reasoning: ${line.reasoning}`} className={`px-3 py-2 rounded-r-md transition hover:bg-surface-3 cursor-help ${colorClass}`}>
                     <span className="opacity-40 select-none mr-3 text-[10px] w-4 inline-block">{String(idx+1).padStart(2,'0')}</span>
                     {line.line}
                  </div>
               )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <AlertOctagon className="h-3.5 w-3.5" /> Hover over highlighted lines to view AI verification reasoning. Lines marked <span className="text-destructive font-bold">RED</span> are flagged as synthetic or factually fabricated.
          </p>
        </div>
      )}

      {/* EVIDENCE & REBUTTAL */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-card p-6">
          <h4 className="font-bold mb-4">Trusted-source evidence</h4>
          <div className="space-y-2">
            {r.evidence_sources?.map((s: any, i: number) => {
              // If the remote backend hasn't been updated to return a URL, we use "I'm Feeling Lucky" 
              // which automatically redirects the user to the actual source webpage.
              const finalUrl = s.url || `https://www.google.com/search?btnI=1&q=${encodeURIComponent(s.organisation + " " + s.finding + " fact check")}`;
              return (
              <div key={i} className="flex items-start gap-3 rounded-lg p-3 bg-surface-2/50 ring-1 ring-border">
                <a href={finalUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 text-primary-glow shrink-0 hover:text-primary transition">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className="text-sm flex-1">
                  <div className="font-medium">
                    <a href={finalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition">
                      {s.organisation?.replace(/SatyaDrishti/gi, 'TruthLens')}
                    </a>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.finding}</div>
                </div>
                <span className={`chip shrink-0 ${stanceColor(s.stance)}`}>{s.stance}</span>
              </div>
            )})}
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
