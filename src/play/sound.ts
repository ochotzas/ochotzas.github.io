type Voice = { at: number; hz: number; to?: number; ms: number; gain?: number; type?: OscillatorType };

let context: AudioContext | null = null;
let muted = localStorage.getItem("arcade-muted") === "1";

export const unlock = () => {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
};

export const setMuted = (value: boolean) => {
  muted = value;
  localStorage.setItem("arcade-muted", value ? "1" : "0");
  if (!value) unlock();
};

export const isMuted = () => muted;

const play = (voices: Voice[]) => {
  if (muted) return;
  unlock();
  if (!context || context.state !== "running") return;

  const now = context.currentTime;
  voices.forEach((voice) => {
    const osc = context!.createOscillator();
    const amp = context!.createGain();
    const start = now + voice.at / 1000;
    const end = start + voice.ms / 1000;
    const peak = voice.gain ?? 0.05;

    osc.type = voice.type ?? "triangle";
    osc.frequency.setValueAtTime(voice.hz, start);
    if (voice.to) osc.frequency.exponentialRampToValueAtTime(voice.to, end);

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp).connect(context!.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
};

export const sfx = {
  move: () => play([{ at: 0, hz: 1180, ms: 45, gain: 0.035 }]),
  press: () => play([{ at: 0, hz: 760, to: 900, ms: 60, gain: 0.05 }]),
  select: () => play([{ at: 0, hz: 880, ms: 55 }, { at: 45, hz: 1320, ms: 90 }]),
  back: () => play([{ at: 0, hz: 700, to: 420, ms: 110, gain: 0.04 }]),
  start: () => play([
    { at: 0, hz: 660, ms: 70 },
    { at: 60, hz: 880, ms: 70 },
    { at: 120, hz: 1320, ms: 140 },
  ]),
  win: () => play([
    { at: 0, hz: 523, ms: 110 },
    { at: 90, hz: 659, ms: 110 },
    { at: 180, hz: 784, ms: 220, gain: 0.06 },
  ]),
  refuse: () => play([{ at: 0, hz: 240, to: 180, ms: 160, gain: 0.05, type: "square" }]),
  join: () => play([{ at: 0, hz: 990, ms: 60 }, { at: 55, hz: 1480, ms: 90, gain: 0.04 }]),
};
