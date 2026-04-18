import type { AudioForensicsClient } from "./mediaTypes";

export function summarizeAudioHeuristics(f: AudioForensicsClient): string {
  const flatness = f.peak > 0.98 && f.crestFactor < 2.5;
  const robotic = f.zeroCrossingRate < 0.02 && f.durationSec > 2;
  const hints = [
    `Duration ${f.durationSec.toFixed(2)}s @ ${Math.round(f.sampleRate)} Hz, ${f.channels} ch.`,
    `RMS ${f.rmsEnergy.toExponential(2)}, peak ${f.peak.toFixed(3)}, crest ${f.crestFactor.toFixed(2)}, ZCR ${f.zeroCrossingRate.toFixed(4)}.`,
    flatness ? "Heuristic: clipped / brickwalled waveform (common in aggressive compression or synthetic renders)." : "",
    robotic ? "Heuristic: unusually low zero-crossing rate vs duration (possible monotone TTS / heavy denoise)." : "",
  ].filter(Boolean);
  return hints.join(" ");
}
