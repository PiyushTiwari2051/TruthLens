import { useEffect, useRef } from "react";

type Props = {
  file: File | null;
  active: boolean;
  label?: string;
};

/** Lightweight “live scan” visual while the forensic API runs (time-domain sweep of the decoded buffer). */
export function MediaScanMeter({ file, active, label = "Live signal scan" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!file || !active) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const run = async () => {
      const ac = new AudioContext();
      try {
        const ab = await file.arrayBuffer();
        const audio = await ac.decodeAudioData(ab.slice(0));
        const ch = audio.getChannelData(0);
        const total = ch.length;
        const win = Math.max(1024, Math.floor(total / 400));
        let cursor = 0;
        const w = canvas.width;
        const h = canvas.height;

        const tick = () => {
          if (cancelled) return;
          g.clearRect(0, 0, w, h);
          g.fillStyle = "hsl(var(--surface-3))";
          g.fillRect(0, 0, w, h);
          const slice = ch.subarray(cursor, Math.min(cursor + win, total));
          cursor = (cursor + Math.floor(win * 0.35)) % Math.max(total - win, 1);
          g.strokeStyle = "hsl(var(--primary))";
          g.lineWidth = 1.2;
          g.beginPath();
          for (let x = 0; x < w; x++) {
            const idx = Math.floor((x / w) * slice.length);
            const v = slice[idx] ?? 0;
            const y = h / 2 - v * (h * 0.42);
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          g.fillStyle = "hsl(var(--muted-foreground) / 0.35)";
          g.fillRect(0, h - 4, w, 4);
          g.fillStyle = "hsl(var(--primary))";
          const pulse = (performance.now() / 200) % w;
          g.fillRect(pulse, h - 4, 28, 4);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = "hsl(var(--muted-foreground))";
        g.font = "12px monospace";
        g.fillText("Preview unavailable for this codec.", 8, 24);
      } finally {
        await ac.close().catch(() => {});
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [file, active]);

  if (!file || !active) return null;

  return (
    <div className="mt-3 rounded-lg bg-surface-2/50 ring-1 ring-border p-3">
      <div className="text-[10px] uppercase tracking-wider font-mono-tech text-muted-foreground mb-2">{label}</div>
      <canvas ref={canvasRef} width={560} height={96} className="w-full h-[96px] rounded-md bg-background/40" />
    </div>
  );
}
