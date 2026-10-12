/** What encodeWav reads: the shape of a Web Audio AudioBuffer. */
export type PcmSource = { sampleRate: number; numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array };

/** Encodes audio as a 16-bit PCM WAV file; samples outside -1..1 are clamped. */
export function encodeWav(audio: PcmSource): Blob {
  const channels = audio.numberOfChannels;
  const bytes = audio.length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, c) => audio.getChannelData(c));
  let o = 44;
  for (let i = 0; i < audio.length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
