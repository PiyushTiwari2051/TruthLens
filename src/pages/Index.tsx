import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/truthlens-hero.jpeg";
import { Logo, BrandWordmark } from "@/components/truthlens/Logo";
import { AnalyzeConsole } from "@/components/truthlens/AnalyzeConsole";
import { AnalysisReport } from "@/components/truthlens/AnalysisReport";

const Index = () => {
  const [result, setResult] = useState<any>(null);

  return (
    <main className="relative min-h-screen">
      {/* NAV */}
      <header className="relative z-20 border-b border-border/40 bg-background/40 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <a href="#top" className="flex items-center gap-3">
            <Logo size={32} />
            <BrandWordmark />
          </a>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative z-10 overflow-hidden">
        <div className="container py-16 md:py-24 grid lg:grid-cols-[1.1fr,0.9fr] gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Verify the truth with <span className="gradient-text-brand">AI</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
              TruthLens helps you instantly detect deepfakes, manipulated images, and fake news. Simply drop a message or media to get a fact-check report.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#analyze" className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow-blue hover:shadow-glow-saffron transition">
                Start your analysis <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9 }}
            className="relative">
            <div className="absolute inset-0 -z-10 bg-gradient-brand opacity-30 blur-3xl rounded-full" />
            <div className="relative rounded-3xl ring-1 ring-border overflow-hidden shadow-panel">
              <img src={heroImg} alt="TruthLens emblem" width={1536} height={1024} className="w-full h-auto" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
            </div>
          </motion.div>
        </div>

        {/* divider */}
        <div className="container">
          <div className="h-px bg-gradient-tricolor opacity-50" />
        </div>
      </section>

      {/* ANALYZE */}
      <section id="analyze" className="relative z-10">
        <div className="container py-16 md:py-20">
           <div className="mb-10 max-w-2xl">
             <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Run an analysis</h2>
             <p className="mt-3 text-muted-foreground">Drop a forwarded message, headline, or image to verify its authenticity.</p>
           </div>
          <div className="grid gap-6">
            <AnalyzeConsole onResult={setResult} />
            {result && <AnalysisReport data={result} />}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-border/40 mt-10">
        <div className="container py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <div>
              <div className="font-bold">TruthLens</div>
              <div className="text-xs text-muted-foreground">Fact Verification Engine</div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} TruthLens. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
};

export default Index;
