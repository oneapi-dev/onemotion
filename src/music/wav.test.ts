import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("encodeWav", () => {
  it("writes a 16-bit PCM WAV header and interleaved, clamped samples", async () => {
    const left = new Float32Array([0, 1, -1, 2]);
    const right = new Float32Array([0.5, -0.5, 0, -2]);
    const blob = encodeWav({ sampleRate: 48000, numberOfChannels: 2, length: 4, getChannelData: (c: number) => (c === 0 ? left : right) });
    const view = new DataView(await blob.arrayBuffer());
    const text = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect([s(0), s(1), s(2), s(3), s(4), s(5), s(6), s(7)]).toEqual([0, 16384, 32767, -16384, -32768, 0, 32767, -32768]);
  });
});
