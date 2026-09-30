"use client";

// Tiny synthesized sound effects (no audio files) plus haptics where the phone supports them.
// Everything is quiet by design and can be muted from "What I've learned about you".

type Sound = "save" | "pass" | "more" | "chime" | "tick" | "whoosh";

let ctx: AudioContext | null = null;
const KEY = "uncover:sound";

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(ac: AudioContext, start: number, dur: number, gain: number, from: number, to: number) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, start);
  f.frequency.exponentialRampToValueAtTime(to, start + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(start);
}

const HAPTICS: Partial<Record<Sound, number | number[]>> = { save: [12, 40, 18], pass: 8, more: 10, chime: [10, 30, 10, 30, 20], tick: 5 };

export function play(s: Sound) {
  try {
    const h = HAPTICS[s];
    if (h && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(h);
  } catch {
    /* ignore */
  }
  if (!soundOn()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  switch (s) {
    case "save": // warm two-note "pop"
      tone(ac, 660, t, 0.12, "sine", 0.12, 990);
      tone(ac, 990, t + 0.07, 0.18, "sine", 0.08);
      break;
    case "more":
      tone(ac, 520, t, 0.1, "triangle", 0.08, 780);
      tone(ac, 780, t + 0.06, 0.14, "triangle", 0.06, 1170);
      break;
    case "pass": // soft swish
      noise(ac, t, 0.18, 0.1, 1800, 500);
      break;
    case "whoosh":
      noise(ac, t, 0.5, 0.07, 400, 2600);
      break;
    case "chime": // sparkle arpeggio
      [784, 988, 1175, 1568].forEach((f, i) => tone(ac, f, t + i * 0.07, 0.5, "sine", 0.06));
      break;
    case "tick":
      tone(ac, 1400, t, 0.03, "square", 0.02);
      break;
  }
}
