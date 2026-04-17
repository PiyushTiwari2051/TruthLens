import { Shield, Eye } from "lucide-react";
import { motion } from "framer-motion";

export const Logo = ({ size = 36 }: { size?: number }) => (
  <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
    <motion.div
      className="absolute inset-0 rounded-full"
      style={{ background: "var(--gradient-brand)", filter: "blur(14px)", opacity: 0.55 }}
      animate={{ scale: [1, 1.15, 1] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    />
    <Shield className="absolute text-primary-glow" style={{ width: size, height: size }} strokeWidth={1.5} />
    <Eye className="relative text-saffron" style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
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
      Fact Verification Engine
    </div>
  </div>
);
