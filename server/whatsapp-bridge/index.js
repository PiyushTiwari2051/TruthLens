/**
 * TruthLens WhatsApp bridge — Baileys (multi-device) + WebSocket fan-out for the Vite app.
 * Single linked-device session, one QR at a time. Logout clears local auth and shows a fresh QR.
 * Run: npm run whatsapp-bridge (from repo root) after npm install in this folder once.
 */
import http from "http";
import path from "path";
import { readdir, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TRUTHLENS_WA_BRIDGE_PORT || 7071);
/** Default session folder — never commit `baileys_auth/`. If delete fails (Windows locks), we switch to a fresh subfolder. */
const BASE_AUTH_DIR = path.join(__dirname, "baileys_auth");
/** Current creds path; changes when we rotate after a failed delete. */
let activeAuthDir = BASE_AUTH_DIR;

const logger = pino({ level: "silent" });
const recentMessages = [];
const MAX_RECENT = 60;

function textOf(msg) {
  const m = msg?.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  ).trim();
}

/** @type {WebSocketServer | null} */
let wss = null;

function broadcast(obj) {
  const s = JSON.stringify(obj);
  if (!wss) return;
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(s);
  }
}

let sock = null;
let reconnectTimer = null;
let logoutInFlight = false;
/** Serialize startSock / teardown so logout → new QR is reliable (esp. Windows). */
let sockChain = Promise.resolve();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function destroySocketInstance(instance) {
  if (!instance) return;
  try {
    instance.ev.removeAllListeners();
  } catch {
    /* ignore */
  }
  try {
    instance.end(undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Removes legacy multi-slot folders (baileys_auth/slot-0 …) from older bridge versions
 * so only the single-session store under baileys_auth/ is used.
 */
async function removeLegacySlotDirs() {
  let names;
  try {
    names = await readdir(BASE_AUTH_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!/^slot-\d+$/.test(name)) continue;
    try {
      await rm(path.join(BASE_AUTH_DIR, name), { recursive: true, force: true });
      console.log(`Removed legacy WhatsApp session folder: baileys_auth/${name}`);
    } catch (e) {
      console.error(`Could not remove legacy folder ${name}:`, e);
    }
  }
}

async function performLogout() {
  if (logoutInFlight) {
    throw new Error("BUSY");
  }
  logoutInFlight = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  await sockChain;
  sockChain = sockChain.then(async () => {
    broadcast({ type: "status", status: "logging_out" });

    const previous = sock;
    sock = null;
    recentMessages.length = 0;

    if (previous) {
      try {
        await Promise.race([previous.logout().catch(() => {}), sleep(8000)]);
      } catch {
        /* ignore */
      }
      destroySocketInstance(previous);
    }

    await sleep(500);

    const dirToDelete = activeAuthDir;
    let deleted = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await rm(dirToDelete, { recursive: true, force: true });
        deleted = true;
        break;
      } catch (e) {
        console.error("Remove auth dir (retry):", e);
        await sleep(350 * (attempt + 1));
      }
    }

    if (!deleted) {
      activeAuthDir = path.join(BASE_AUTH_DIR, `active-${Date.now()}`);
      console.warn("Could not delete session folder (likely file locks). Using fresh path:", activeAuthDir);
      void rm(dirToDelete, { recursive: true, force: true }).catch(() => {});
    } else {
      activeAuthDir = BASE_AUTH_DIR;
    }

    broadcast({ type: "status", status: "logged_out" });
    broadcast({ type: "status", status: "connecting" });
    broadcast({ type: "session_cleared" });

    await sleep(400);
    try {
      await startSockInner();
    } catch (e) {
      console.error("startSockInner after logout:", e);
      broadcast({ type: "status", status: "error", detail: String(e?.message || e) });
    } finally {
      logoutInFlight = false;
    }
  });

  await sockChain.catch((e) => {
    console.error("logout chain:", e);
    logoutInFlight = false;
  });
}

async function startSockInner() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const previous = sock;
  sock = null;
  destroySocketInstance(previous);
  await sleep(200);

  broadcast({ type: "status", status: "connecting" });

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(activeAuthDir);

  const newSock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["TruthLens", "Desktop", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock = newSock;

  newSock.ev.on("creds.update", saveCreds);

  newSock.ev.on("connection.update", async (update) => {
    if (sock !== newSock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
        if (sock !== newSock) return;
        broadcast({ type: "qr", dataUrl });
        broadcast({ type: "status", status: "qr" });
      } catch (e) {
        console.error("QR encode failed:", e);
      }
    }

    if (connection === "close") {
      if (sock !== newSock) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const shouldReconnect = !loggedOut && !logoutInFlight;
      broadcast({ type: "status", status: "close", code, loggedOut });
      if (loggedOut) {
        recentMessages.length = 0;
      }
      if (shouldReconnect) {
        reconnectTimer = setTimeout(() => {
          sockChain = sockChain.then(() => startSockInner()).catch((err) => console.error("reconnect failed:", err));
        }, 3500);
      }
    } else if (connection === "open") {
      if (sock !== newSock) return;
      broadcast({ type: "status", status: "open" });
      broadcast({ type: "history", messages: recentMessages.slice(-40) });
    } else if (connection === "connecting") {
      if (sock !== newSock) return;
      broadcast({ type: "status", status: "connecting" });
    }
  });

  newSock.ev.on("messages.upsert", ({ messages, type }) => {
    if (sock !== newSock) return;
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const body = textOf(msg);
      if (!body) continue;
      const row = {
        id: msg.key.id,
        remoteJid: msg.key.remoteJid,
        pushName: msg.pushName || "",
        body: body.slice(0, 8000),
        ts: Number(msg.messageTimestamp || Date.now() / 1000),
      };
      recentMessages.push(row);
      if (recentMessages.length > MAX_RECENT) recentMessages.splice(0, recentMessages.length - MAX_RECENT);
      broadcast({ type: "chat_message", payload: row });
    }
  });
}

function startSock() {
  sockChain = sockChain.then(() => startSockInner()).catch((err) => {
    console.error("startSock error:", err);
    broadcast({ type: "status", status: "error", detail: String(err?.message || err) });
  });
  return sockChain;
}

const server = http.createServer((req, res) => {
  const url = req.url?.split("?")[0] || "/";

  if (url === "/reset-session" && req.method === "POST") {
    performLogout()
      .then(() => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, message: "Session cleared; new QR will follow on WebSocket clients." }));
      })
      .catch((e) => {
        if (e?.message === "BUSY") {
          res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "Session reset already in progress" }));
          return;
        }
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      });
    return;
  }

  if (url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, port: PORT, activeAuthDir }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(
    `TruthLens WhatsApp bridge — WS on same port (single session)\n` +
      `POST http://127.0.0.1:${PORT}/reset-session — clear session & new QR (same as app Log out)\n` +
      `GET  http://127.0.0.1:${PORT}/health — status\n`,
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`
[TruthLens] Port ${PORT} is already in use — another process (usually another WhatsApp bridge) is bound to it.

Fix:
  1) Stop the other terminal running "npm run whatsapp-bridge", or
  2) From repo root:  npm run whatsapp-bridge:kill
     then:            npm run whatsapp-bridge

Manual (Windows):
  netstat -ano | findstr :${PORT}
  taskkill /F /PID <pid>
`);
    process.exit(1);
  }
  console.error("[TruthLens] HTTP server error:", err);
  process.exit(1);
});

const wssInstance = new WebSocketServer({ server });
wss = wssInstance;

wssInstance.on("connection", (ws) => {
  const initial = sock?.user != null ? "open" : sock != null ? "connecting" : "idle";
  ws.send(JSON.stringify({ type: "status", status: initial }));
  if (recentMessages.length) {
    ws.send(JSON.stringify({ type: "history", messages: recentMessages.slice(-40) }));
  }
  ws.on("message", (raw) => {
    void (async () => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "logout" || msg?.type === "reset_session") {
          try {
            await performLogout();
          } catch (e) {
            if (e?.message !== "BUSY") console.error("performLogout:", e);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  });
});

server.listen(PORT, "127.0.0.1", async () => {
  try {
    await removeLegacySlotDirs();
  } catch (e) {
    console.error("Legacy folder cleanup:", e);
  }
  console.log(`TruthLens WhatsApp bridge listening on http://127.0.0.1:${PORT} (WS same port, single QR session)`);
  startSock();
});
