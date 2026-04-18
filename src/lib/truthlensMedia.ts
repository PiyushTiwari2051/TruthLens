import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import type { AudioForensicsClient, VideoMeta } from "./mediaTypes";

export type { AudioForensicsClient, VideoMeta } from "./mediaTypes";
export { summarizeAudioHeuristics } from "./audioHeuristics";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractDocumentText(file: File): Promise<{ text: string; pages?: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    return { text: (await file.text()).trim() };
  }
  if (name.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const numPages = doc.numPages;
    const parts: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      parts.push(line);
    }
    return { text: parts.join("\n").replace(/\s+\n/g, "\n").trim(), pages: numPages };
  }
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: value.trim() };
  }
  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc is not supported in the browser. Save as .docx or PDF and re-upload.");
  }
  throw new Error("Unsupported document type. Use PDF, DOCX, or TXT.");
}

export async function readVideoMeta(file: File): Promise<VideoMeta> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video metadata."));
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      durationSec: Number.isFinite(video.duration) ? video.duration : 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sample JPEG data URLs across the timeline for multimodal vision analysis. */
export async function extractVideoFrames(file: File, count = 6): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode video for frame sampling."));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available.");
    const maxW = 960;
    const scale = Math.min(1, maxW / Math.max(video.videoWidth, 1));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const frames: string[] = [];
    const steps = Math.max(1, count);
    for (let i = 0; i < steps; i++) {
      const t = duration * (i / Math.max(steps - 1, 1));
      video.currentTime = t;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.onseeked = done;
        setTimeout(done, 800);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.75));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export async function analyzeAudioFile(file: File): Promise<AudioForensicsClient> {
  const ctx = new AudioContext();
  try {
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
    const channel = audioBuf.getChannelData(0);
    const n = channel.length;
    let sumSq = 0;
    let peak = 0;
    let crossings = 0;
    for (let i = 0; i < n; i++) {
      const s = channel[i];
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      if (i > 0 && (channel[i - 1] >= 0) !== (s >= 0)) crossings++;
    }
    const rms = Math.sqrt(sumSq / Math.max(n, 1));
    const zcr = crossings / Math.max(n, 1);
    const crest = rms > 1e-10 ? peak / rms : 0;
    return {
      durationSec: audioBuf.duration,
      sampleRate: audioBuf.sampleRate,
      rmsEnergy: rms,
      peak,
      zeroCrossingRate: zcr,
      crestFactor: crest,
      channels: audioBuf.numberOfChannels,
    };
  } finally {
    await ctx.close();
  }
}
