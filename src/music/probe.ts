/**
 * Spike: a timing probe rendered in the page. Short B5 beeps (988 Hz) at the
 * given seconds, so an exported file can be measured against the picture.
 */
export async function renderProbe(seconds: number, beeps: number[]): Promise<AudioBuffer> {
  // Loaded here, not at the top: server rendering of the app never touches Web Audio.
  const Tone = await import("tone");
  const rendered = await Tone.Offline(
    () => {
      const synth = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 } }).toDestination();
      for (const t of beeps) synth.triggerAttackRelease("B5", 0.05, t);
    },
    seconds,
    2,
    48000,
  );
  const buffer = rendered.get();
  if (!buffer) throw new Error("Tone.Offline rendered no audio.");
  return buffer;
}
