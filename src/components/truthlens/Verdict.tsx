import { motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Smile, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Verdict = "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIABLE" | "SATIRE" | "CONTESTED";

const cfg: Record<Verdict, { color: string; bg: string; ring: string; icon: LucideIcon; label: string }> = {
  TRUE:          { color: "text-emerald",    bg: "bg-emerald/15",     ring: "ring-emerald/40",     icon: CheckCircle2, label: "Verified True" },
  FALSE:         { color: "text-destructive", bg: "bg-destructive/15", ring: "ring-destructive/40", icon: XCircle,      label: "False" },
  MISLEADING:    { color: "text-saffron",    bg: "bg-saffron/15",     ring: "ring-saffron/40",     icon: AlertTriangle, label: "Misleading" },
  UNVERIFIABLE:  { color: "text-muted-foreground", bg: "bg-muted/30", ring: "ring-muted-foreground/30", icon: HelpCircle, label: "Unverifiable" },
  SATIRE:        { color: "text-primary-glow", bg: "bg-primary/15",   ring: "ring-primary/40",     icon: Smile,        label: "Satire" },
  CONTESTED:     { color: "text-warning",    bg: "bg-warning/15",     ring: "ring-warning/40",     icon: Scale,        label: "Contested" },
};

export const VerdictBadge = ({ verdict, large = false }: { verdict: Verdict; large?: boolean }) => {
  const c = cfg[verdict] ?? cfg.UNVERIFIABLE;
  const Icon = c.icon;
  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${c.bg} ${c.ring} ${c.color} ${
        large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs"
      } font-mono-tech tracking-wide font-medium`}
    >
      <Icon className={large ? "h-4 w-4" : "h-3 w-3"} />
      {c.label}
    </motion.span>
  );
};

export function scoreColor(score: number) {
  if (score >= 75) return "hsl(var(--success))";
  if (score >= 45) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

export const TruthScoreDial = ({ score }: { score: number }) => {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color = scoreColor(score);
  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} stroke="hsl(var(--surface-3))" strokeWidth="10" fill="none" />
        <motion.circle
          cx="70" cy="70" r={r}
          stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${dash} ${c}` }}
          transition={{ duration: 1.2, ease: [0.16,1,0.3,1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono-tech">Truth</div>
      </div>
    </div>
  );
};
