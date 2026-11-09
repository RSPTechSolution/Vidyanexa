// Sound effects for the Reels, synthesised here (no sample files, nothing to license): a tap click, keyboard ticks,
// a caption pop, a success chime and a whoosh. mixdown() places them on a timeline and writes a WAV.
//
//   import { mixdown } from "./sfx.mjs";
//   mixdown("out.wav", 12.5, [{ kind: "tap", t: 1.2 }, { kind: "chime", t: 3.4 }]);
import fs from "node:fs";

const RATE = 48000;
const TAU = Math.PI * 2;

// A seeded random, so a re-render sounds exactly the same.
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise = () => rnd() * 2 - 1;

function buffer(seconds, fn) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / RATE, i);
  return out;
}

/** A soft, glassy tap: a short high blip with a little air. */
function tap() {
  let lp = 0;
  return buffer(0.06, (t) => {
    const env = Math.exp(-t / 0.008);
    lp += 0.35 * (noise() - lp);
    return env * (0.55 * Math.sin(TAU * 1650 * t) + 0.25 * Math.sin(TAU * 3300 * t) + 0.25 * lp);
  });
}

/** One key of a phone keyboard: quieter and shorter than a tap, pitch varies a little. */
function key() {
  const f = 2300 + rnd() * 700;
  return buffer(0.035, (t) => Math.exp(-t / 0.004) * (0.5 * Math.sin(TAU * f * t) + 0.3 * noise()) * 0.35);
}

/** A bubble pop for a caption: a quick upward pitch sweep. */
function pop() {
  let phase = 0;
  return buffer(0.12, (t) => {
    const f = 380 + 900 * Math.min(1, t / 0.07);
    phase += TAU * f / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.035);
    return env * Math.sin(phase) * 0.55;
  });
}

/** Success: two bell notes, C6 then G6. */
function chime() {
  const note = (f, start) => (t) => {
    const x = t - start;
    if (x < 0) return 0;
    const env = Math.min(1, x / 0.005) * Math.exp(-x / 0.28);
    return env * (Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * f * 2 * x) + 0.12 * Math.sin(TAU * f * 3.01 * x));
  };
  const a = note(1046.5, 0), b = note(1568, 0.11);
  return buffer(1.1, (t) => 0.26 * (a(t) + b(t)));
}

/** A soft whoosh between scenes: filtered noise that swells and fades, its brightness sweeping up. */
function whoosh() {
  let lp = 0, lp2 = 0;
  const len = 0.6;
  return buffer(len, (t) => {
    const k = t / len;
    const env = Math.sin(Math.PI * k) ** 2;
    const cut = 0.03 + 0.25 * k;
    lp += cut * (noise() - lp);
    lp2 += cut * (lp - lp2);
    return env * lp2 * 1.6;
  });
}

const MAKERS = { tap, key, pop, chime, whoosh };
const GAIN = { tap: 1.5, key: 1.3, pop: 1.0, chime: 1.0, whoosh: 1.8 };

/** Writes a mono 16-bit WAV of `seconds`, with each event's sound starting at its time `t`. */
export function mixdown(file, seconds, events) {
  seed = 1;
  const mix = new Float32Array(Math.ceil(seconds * RATE));
  for (const e of events) {
    const s = MAKERS[e.kind]();
    const at = Math.round(e.t * RATE), g = GAIN[e.kind] * (e.gain ?? 1);
    for (let i = 0; i < s.length && at + i < mix.length; i++) if (at + i >= 0) mix[at + i] += s[i] * g;
  }
  const data = Buffer.alloc(mix.length * 2);
  for (let i = 0; i < mix.length; i++) data.writeInt16LE(Math.round(Math.tanh(mix[i] * 0.9) * 32000), i * 2); // soft limit
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
