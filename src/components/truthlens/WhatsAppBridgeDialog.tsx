import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, MessageSquareShare, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TruthLensAnalyzeResponse } from "@/types/truthlensAnalyze";
import { cn } from "@/lib/utils";

type WaStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "open"
  | "close"
  | "error"
  | "logging_out"
  | "logged_out";

export type WaChatRow = {
  id: string;
  remoteJid?: string;
  pushName: string;
  body: string;
  ts: number;
};

function wsUrlFromEnv(): string {
  const u = import.meta.env.VITE_WHATSAPP_BRIDGE_URL;
  if (typeof u === "string" && u.startsWith("ws")) return u;
  return "ws://127.0.0.1:7071";
}

export function WhatsAppBridgeDialog({
  open,
  onOpenChange,
  onAnalysisResult,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAnalysisResult: (data: TruthLensAnalyzeResponse) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WaStatus>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  /** Bumps on each new QR payload so the image remounts (fixes stale canvas when reconnecting). */
  const [qrEpoch, setQrEpoch] = useState(0);
  const [rows, setRows] = useState<WaChatRow[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(false);

  const appendOrReplace = useCallback((payload: WaChatRow) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === payload.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = payload;
        return next;
      }
      return [...prev, payload].slice(-80);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    setWsError(null);
    setStatus("connecting");
    const url = wsUrlFromEnv();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setStatus("error");
      setWsError(e instanceof Error ? e.message : "WebSocket failed");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setWsError(null);
      setBridgeConnected(true);
    };

    ws.onerror = () => {
      setStatus("error");
      setBridgeConnected(false);
      setWsError(`Cannot reach bridge at ${url}. Run: npm run whatsapp-bridge`);
    };

    ws.onclose = () => {
      setBridgeConnected(false);
      if (open && wsRef.current === ws) {
        setStatus((s) => (s === "open" ? "close" : s));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        const t = msg.type;

        if (t === "session_cleared") {
          setRows([]);
          setQrDataUrl(null);
          setStatus("connecting");
          toast.success("Session cleared. Scan the new QR to link this device or another phone.");
          return;
        }

        if (t === "qr" && typeof msg.dataUrl === "string") {
          setQrEpoch((n) => n + 1);
          setQrDataUrl(msg.dataUrl);
          setStatus("qr");
          return;
        }

        if (t === "status" && typeof msg.status === "string") {
          const st = msg.status as WaStatus;
          if (st === "logged_out") {
            setRows([]);
            setQrDataUrl(null);
            setStatus("connecting");
            return;
          }
          if (st === "logging_out") {
            setQrDataUrl(null);
            setStatus("logging_out");
            return;
          }
          setStatus(st);
          if (st === "open") setQrDataUrl(null);
          return;
        }

        if (t === "history" && Array.isArray(msg.messages)) {
          setRows((msg.messages as WaChatRow[]).filter((m) => m?.id && m?.body));
          return;
        }

        if (t === "chat_message" && msg.payload && typeof msg.payload === "object") {
          appendOrReplace(msg.payload as WaChatRow);
        }
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      if (wsRef.current === ws) wsRef.current = null;
      ws.close();
    };
  }, [open, appendOrReplace]);

  const sendLogout = () => {
    if (
      !window.confirm(
        "Log out and unlink this bridge from WhatsApp (Linked devices)? Local session data will be deleted and a new QR code will appear so you can scan with another device.",
      )
    ) {
      return;
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "logout" }));
      toast.message("Logging out…", { description: "Removing session and generating a new QR." });
    } else {
      toast.error("Not connected to the bridge. Start: npm run whatsapp-bridge");
    }
  };

  const runTruthLens = async (row: WaChatRow) => {
    const text = row.body?.trim();
    if (!text) return;
    setAnalyzingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke<TruthLensAnalyzeResponse>("analyze", {
        body: { modality: "text", text: `[WhatsApp · ${row.pushName || row.remoteJid || "unknown"}]\n${text}` },
      });
      if (error) throw error;
      if (data && "error" in data && data.error) throw new Error(String(data.error));
      if (!data?.report) throw new Error("Malformed analyse response");
      onAnalysisResult(data);
      toast.success(`TruthScore ${data.report.truth_score} — ${data.report.overall_verdict}`);
      document.getElementById("analyze")?.scrollIntoView({ behavior: "smooth", block: "start" });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareShare className="h-5 w-5 text-emerald" />
            WhatsApp → TruthLens bridge
          </DialogTitle>
          <DialogDescription className="text-left">
            One local <span className="font-mono-tech text-foreground/90">Baileys</span> session. Messages received on
            this linked device appear below; one click runs the same forensic pipeline as the console. Use{" "}
            <span className="text-foreground/90">Log out</span> to wipe the saved session and get a fresh QR for another
            device.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-surface-2/50 ring-1 ring-border p-3 text-xs font-mono-tech text-muted-foreground space-y-1">
          <div>
            1. In a terminal: <code className="text-saffron">npm run whatsapp-bridge</code> — only one instance. If you see
            port 7071 busy, run <code className="text-foreground/90">npm run whatsapp-bridge:kill</code> then start again (
            or <code className="text-foreground/90">npm run whatsapp-bridge:restart</code>).
          </div>
          <div>
            2. Bridge URL (optional): <code className="text-primary-glow">VITE_WHATSAPP_BRIDGE_URL</code> — default{" "}
            <code className="text-foreground/90">ws://127.0.0.1:7071</code>
          </div>
          <div>
            3. Scan the QR with WhatsApp → Settings → Linked devices. Session folder:{" "}
            <code className="font-mono-tech">server/whatsapp-bridge/baileys_auth/</code>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Radio
            className={cn(
              "h-4 w-4",
              status === "open"
                ? "text-emerald animate-pulse"
                : status === "logging_out"
                  ? "text-saffron animate-pulse"
                  : status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
            )}
          />
          <span className="font-mono-tech capitalize">{status.replace(/_/g, " ")}</span>
          {wsError && <span className="text-destructive text-xs truncate">{wsError}</span>}
        </div>

        {qrDataUrl && status !== "open" && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground text-center">Scan with WhatsApp → Settings → Linked devices</p>
            <img
              key={qrEpoch}
              src={qrDataUrl}
              alt="WhatsApp QR"
              className="rounded-xl ring-2 ring-emerald/40 bg-white p-2 max-w-[280px]"
            />
          </div>
        )}

        {status === "connecting" && !qrDataUrl && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Waiting for bridge…
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-mono-tech uppercase tracking-wider text-muted-foreground">Recent forwards</h4>
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border bg-background/40 divide-y divide-border">
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No messages yet. Keep this dialog open after linking — new chats appear in real time.
              </div>
            ) : (
              [...rows].reverse().map((row) => (
                <div key={row.id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono-tech text-muted-foreground mb-1">
                      {(row.pushName || "Unknown").slice(0, 48)} · {new Date(row.ts * 1000).toLocaleString()}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{row.body}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!!analyzingId}
                    className="shrink-0 gap-1.5"
                    onClick={() => void runTruthLens(row)}
                  >
                    {analyzingId === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary-glow" />
                    )}
                    Fact-check
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:space-x-0">
          <p className="text-[11px] text-muted-foreground text-left flex-1 mr-auto">
            <strong className="text-foreground/80 font-normal">Log out</strong> deletes the local session in{" "}
            <code className="font-mono-tech">baileys_auth/</code>, unlinks this bridge from WhatsApp, and shows a new QR
            immediately so you can connect another device.
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!bridgeConnected || status === "logging_out"}
            className="gap-2 shrink-0"
            onClick={sendLogout}
          >
            <LogOut className="h-4 w-4" />
            {status === "logging_out" ? "Logging out…" : "Log out & new QR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
