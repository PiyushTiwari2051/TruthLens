import { Circle, Check } from "lucide-react";
import { motion } from "framer-motion";

export const Logo = ({ size = 36 }: { size?: number }) => (
  <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
    <motion.div
      className="absolute inset-0 rounded-full"
      style={{ background: "var(--gradient-brand)", opacity: 0.18 }}
      animate={{ scale: [1, 1.06, 1], opacity: [0.18, 0.28, 0.18] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    />
    <Circle className="absolute text-primary-glow" style={{ width: size, height: size }} strokeWidth={1.8} />
    <Circle className="absolute text-primary/70" style={{ width: size * 0.64, height: size * 0.64 }} strokeWidth={1.8} />
    <Check className="relative text-saffron" style={{ width: size * 0.38, height: size * 0.38 }} strokeWidth={2.4} />
  </div>
);

export const BrandWordmark = () => (
  <div className="leading-none">
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-bold tracking-tight">
        <span className="text-foreground">Truth</span>
        <span className="gradient-text-brand">Lens</span>
      </span>
    </div>
    <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono-tech">
      AI Misinformation Detector
    </div>
  </div>
);
