import { describe, expect, it } from "vitest";
import { summarizeAudioHeuristics } from "./audioHeuristics";
import type { AudioForensicsClient } from "./mediaTypes";

describe("summarizeAudioHeuristics", () => {
  it("flags clipped waveforms when peak is saturated and crest is low", () => {
    const f: AudioForensicsClient = {
      durationSec: 5,
      sampleRate: 44100,
      rmsEnergy: 0.2,
      peak: 0.99,
      zeroCrossingRate: 0.08,
      crestFactor: 2.0,
      channels: 1,
    };
    expect(summarizeAudioHeuristics(f)).toContain("brickwalled");
  });

  it("returns duration and numeric summaries", () => {
    const f: AudioForensicsClient = {
      durationSec: 2.5,
      sampleRate: 48000,
      rmsEnergy: 0.05,
      peak: 0.4,
      zeroCrossingRate: 0.12,
      crestFactor: 6,
      channels: 2,
    };
    const s = summarizeAudioHeuristics(f);
    expect(s).toContain("2.50s");
    expect(s).toContain("48000");
  });
});
