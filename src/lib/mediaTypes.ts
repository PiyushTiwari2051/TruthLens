export type VideoMeta = {
  width: number;
  height: number;
  durationSec: number;
};

export type AudioForensicsClient = {
  durationSec: number;
  sampleRate: number;
  rmsEnergy: number;
  peak: number;
  zeroCrossingRate: number;
  crestFactor: number;
  channels: number;
};
