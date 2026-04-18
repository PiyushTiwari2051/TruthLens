/**
 * Frees TRUTHLENS_WA_BRIDGE_PORT (default 7071) by killing the LISTENING process.
 * Use when you see EADDRINUSE — usually a duplicate "npm run whatsapp-bridge".
 */
import { execSync } from "node:child_process";
import process from "node:process";

const port = Number(process.env.TRUTHLENS_WA_BRIDGE_PORT || 7071);

if (process.platform === "win32") {
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      if (!line.includes(`:${port}`) && !line.includes(`:${port} `)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
    if (pids.size === 0) {
      console.log(`No LISTENING process on port ${port}.`);
      process.exit(0);
    }
    for (const pid of pids) {
      console.log(`Stopping PID ${pid} (port ${port})…`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
      } catch {
        /* already gone */
      }
    }
    console.log("Done. You can run: npm run whatsapp-bridge");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
} else {
  try {
    const pid = execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim();
    if (pid) {
      execSync(`kill -9 ${pid}`, { stdio: "inherit" });
      console.log("Done.");
    } else {
      console.log(`No process on port ${port}.`);
    }
  } catch {
    console.log(`No process on port ${port} (or nothing to kill).`);
  }
}
