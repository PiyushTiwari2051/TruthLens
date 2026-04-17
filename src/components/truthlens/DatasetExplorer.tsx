import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, Network, Globe2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from "recharts";

type Stats = {
  total_claims: number;
  by_verdict: Record<string, number>;
  by_language: Record<string, number>;
  by_dataset: Record<string, number>;
  qdrant: { enabled: boolean; vectors_count?: number; size?: number; distance?: string; status?: string };
  recent_analyses: any[];
};

const VERDICT_COLOR: Record<string, string> = {
  FALSE: "hsl(0 84% 60%)",
  MISLEADING: "hsl(28 96% 56%)",
  TRUE: "hsl(152 72% 45%)",
  UNVERIFIABLE: "hsl(220 14% 65%)",
  SATIRE: "hsl(220 95% 58%)",
  CONTESTED: "hsl(38 95% 58%)",
};

const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "हिन्दी", ta: "தமிழ்", bn: "বাংলা", te: "తెలుగు", mr: "मराठी", gu: "ગુજરાતી",
};

export const DatasetExplorer = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("dataset-stats");
    setStats(data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading || !stats) return (
    <div className="glass-card p-8 text-center text-muted-foreground font-mono-tech text-sm">
      Loading vector intelligence…
    </div>
  );

  const verdictData = Object.entries(stats.by_verdict).map(([k, v]) => ({ name: k, value: v }));
  const langData = Object.entries(stats.by_language).map(([k, v]) => ({ name: LANG_NAMES[k] ?? k, value: v, code: k }));
  const datasetData = Object.entries(stats.by_dataset)
    .map(([k, v]) => ({ name: k.replace(/_/g, " "), value: v }))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* metrics column */}
      <div className="space-y-4">
        <Stat icon={<Database className="h-5 w-5 text-primary-glow" />} label="Indexed claims (pgvector)" value={stats.total_claims.toLocaleString()} sub="384-d Cosine · IVFFlat" />
        <Stat
          icon={<Network className="h-5 w-5 text-saffron" />}
          label="Qdrant Cloud mirror"
          value={(stats.qdrant.vectors_count ?? 0).toLocaleString()}
          sub={stats.qdrant.enabled ? `${stats.qdrant.distance ?? "Cosine"} · ${stats.qdrant.size ?? 384}-d · ${stats.qdrant.status ?? "live"}` : "Not connected"}
          glow={stats.qdrant.enabled ? "saffron" : undefined}
        />
        <Stat icon={<Globe2 className="h-5 w-5 text-emerald" />} label="Languages covered" value={Object.keys(stats.by_language).length.toString()} sub="Primary: hi · ta · bn · en" />
        <Stat icon={<Activity className="h-5 w-5 text-emerald-glow" />} label="Live analyses" value={(stats.recent_analyses?.length ?? 0).toString()} sub="From the public /analyze endpoint" />
      </div>

      {/* verdict distribution */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-mono-tech uppercase tracking-wider text-muted-foreground mb-3">Verdict distribution</h4>
        <div className="h-56">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={verdictData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={3}>
                {verdictData.map((d, i) => <Cell key={i} fill={VERDICT_COLOR[d.name] ?? "hsl(220 95% 58%)"} stroke="hsl(var(--surface))" />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] font-mono-tech">
          {verdictData.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[d.name] }} />
              <span className="text-muted-foreground">{d.name}</span>
              <span className="ml-auto text-foreground">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* language + datasets */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-mono-tech uppercase tracking-wider text-muted-foreground mb-3">Top sources</h4>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={datasetData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} width={110} />
              <Tooltip cursor={{ fill: "hsl(var(--surface-2))" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {langData.map(l => (
            <span key={l.code} className="chip">
              <span className="text-saffron">{l.code}</span> · {l.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const Stat = ({ icon, label, value, sub, glow }: { icon: React.ReactNode; label: string; value: string; sub: string; glow?: "saffron" | "emerald" }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 relative overflow-hidden">
    {glow && <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full" style={{ background: `radial-gradient(circle, hsl(var(--${glow})) 0%, transparent 70%)`, opacity: 0.25 }} />}
    <div className="flex items-center gap-2 text-xs font-mono-tech uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
    <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
    <div className="mt-1 text-[11px] text-muted-foreground font-mono-tech">{sub}</div>
  </motion.div>
);
