import { useSyncExternalStore } from "react";

// Game sounds, made in the browser with the Web Audio API (no sound files to download)

export type SoundName = "card" | "slap" | "wrong" | "win" | "turn";

let ctx: AudioContext | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted() {
  try {
    return localStorage.getItem("ers-muted") === "1";
  } catch {
    return false; // storage blocked: default to sound on
  }
}

// Recorded sounds (in client/public/sounds). They load once sound is unlocked;
// until then, the synth versions below play instead.
const SAMPLE_FILES: Partial<Record<SoundName, string>> = {
  card: "sounds/card-swish.mp3",
};
const samples: Partial<Record<SoundName, AudioBuffer>> = {};

function loadSamples(c: AudioContext) {
  for (const [name, file] of Object.entries(SAMPLE_FILES) as [SoundName, string][]) {
    fetch(import.meta.env.BASE_URL + file)
      .then((res) => res.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((buffer) => {
        samples[name] = buffer;
      })
      .catch(() => {
        // Couldn't load it; the synth version keeps playing instead
      });
  }
}

function playSample(c: AudioContext, buffer: AudioBuffer, start: number, vol: number) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 0.96 + Math.random() * 0.08; // tiny pitch change so repeats don't sound robotic
  const gain = c.createGain();
  gain.gain.value = vol;
  src.connect(gain).connect(c.destination);
  src.start(start);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    loadSamples(ctx);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Browsers only allow sound after the person has clicked or pressed a key once
if (typeof window !== "undefined") {
  const unlock = () => {
    audio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// A short note that fades out
function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number, endFreq?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// A burst of filtered noise (sounds like paper or a hand hitting a table)
function noise(c: AudioContext, start: number, dur: number, vol: number, filter: BiquadFilterType, freq: number) {
  const length = Math.ceil(c.sampleRate * dur);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = vol;
  src.connect(f).connect(gain).connect(c.destination);
  src.start(start);
}

// Backup swish made from noise, like a card sliding across felt: airy noise that swells in and fades out,
// with the filter sliding upward so it sounds like movement
function swish(c: AudioContext, start: number) {
  const dur = 0.2;
  const length = Math.ceil(c.sampleRate * dur);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const x = i / length;
    const envelope = Math.sin(Math.PI * Math.pow(x, 0.6)); // quick, gentle rise, longer fade
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.7; // wide, so it sounds soft instead of hissy
  f.frequency.setValueAtTime(700, start);
  f.frequency.exponentialRampToValueAtTime(2200, start + dur);
  const soften = c.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 3500; // take the sharp edge off
  const gain = c.createGain();
  gain.gain.value = 0.22;
  src.connect(f).connect(soften).connect(gain).connect(c.destination);
  src.start(start);
}

export function playSound(name: SoundName) {
  if (muted) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  const t = c.currentTime;
  switch (name) {
    case "card": // a card swishing onto the pile
      if (samples.card) playSample(c, samples.card, t, 0.9);
      else swish(c, t);
      break;
    case "slap": // a hand hitting the pile
      noise(c, t, 0.14, 0.9, "lowpass", 1200);
      tone(c, 140, t, 0.12, "sine", 0.5, 60);
      break;
    case "wrong": // a low two-note buzz
      tone(c, 220, t, 0.14, "square", 0.07);
      tone(c, 165, t + 0.13, 0.2, "square", 0.07);
      break;
    case "win": // a quick rising chime
      [523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, t + i * 0.07, 0.18, "triangle", 0.18));
      break;
    case "turn": // a soft ping when it's your turn
      tone(c, 880, t, 0.12, "sine", 0.1);
      break;
  }
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem("ers-muted", muted ? "1" : "0");
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  listeners.forEach((l) => l());
  if (!muted) playSound("card"); // a little click so you know sound is back on
}

// useMuted(): true while sound is off. The page updates when it changes.
export function useMuted() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => muted
  );
}
