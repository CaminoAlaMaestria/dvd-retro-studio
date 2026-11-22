import { getAudioCtx } from "./audio.js";

/* ============================================================
   Música libre de derechos generada en el dispositivo (WebAudio).
   Tres pistas originales compuestas por código: sin descargas,
   sin licencias y sin coste. Se reproducen en bucle.
   ============================================================ */

const mf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* Cada pista: tempo, acordes (notas MIDI) y melodía por pasos de corchea. */
const TRACKS = {
  amanecer: {
    bpm: 72,
    chords: [
      [48, 52, 55], // C
      [45, 48, 52], // Am
      [41, 45, 48], // F
      [43, 47, 50], // G
    ],
    melody: [72, null, 67, null, 64, null, 67, null, 69, null, 67, 64, null, 62, null, null],
    bassOctave: -12,
    padType: "triangle",
    melType: "sine",
  },
  noche: {
    bpm: 60,
    chords: [
      [45, 48, 52], // Am
      [41, 45, 48], // F
      [48, 52, 55], // C
      [43, 47, 50], // G
    ],
    melody: [69, 64, 67, 64, 65, 60, 64, 60, 67, 64, 67, 71, 69, 67, 64, null],
    bassOctave: -12,
    padType: "sine",
    melType: "triangle",
    arpeggio: true,
  },
  aventura: {
    bpm: 104,
    chords: [
      [43, 47, 50], // G
      [48, 52, 55], // C
      [50, 54, 57], // D
      [40, 43, 47], // Em
    ],
    melody: [71, null, 74, null, 72, 74, null, 71, 69, null, 71, 74, null, 76, 74, null],
    bassOctave: -12,
    padType: "triangle",
    melType: "square",
    bouncy: true,
  },
};

const STEPS_PER_CHORD = 16; // 2 compases de 4/4 en corcheas

/**
 * Reproduce una pista libre en bucle.
 * @param {string} trackId
 * @param {{ destination?: AudioNode, volume?: number }} opts
 * @returns {{ stop: () => void, setVolume: (v:number)=>void }}
 */
export function startFreeMusic(trackId, opts = {}) {
  const track = TRACKS[trackId] || TRACKS.amanecer;
  const ctx = getAudioCtx();
  const out = ctx.createGain();
  out.gain.value = opts.volume ?? 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  filter.connect(out);
  out.connect(opts.destination ?? ctx.destination);

  const stepDur = 60 / track.bpm / 2; // corchea
  let step = 0;
  let nextTime = ctx.currentTime + 0.1;
  let stopped = false;

  const pad = (notes, t, dur) => {
    notes.forEach((n) => {
      const o = ctx.createOscillator();
      o.type = track.padType;
      o.frequency.value = mf(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.setValueAtTime(0.05, t + Math.max(0.5, dur - 0.6));
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(filter);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  };

  const bass = (midi, t, dur) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = mf(midi + track.bassOctave);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(filter);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const pluck = (midi, t, dur, vol = 0.09) => {
    const o = ctx.createOscillator();
    o.type = track.melType;
    o.frequency.value = mf(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(filter);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const scheduleStep = (s, t) => {
    const chordIdx = Math.floor(s / STEPS_PER_CHORD) % track.chords.length;
    const chord = track.chords[chordIdx];
    const pos = s % STEPS_PER_CHORD;
    if (pos === 0) pad(chord, t, stepDur * STEPS_PER_CHORD);
    if (pos % 4 === 0) bass(chord[0], t, stepDur * 3.4);
    if (track.bouncy && pos % 4 === 2) bass(chord[0] + 7, t, stepDur * 1.6);
    if (track.arpeggio) {
      const arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
      pluck(arp[pos % 4], t, stepDur * 2.2, 0.05);
    }
    const m = track.melody[pos];
    if (m != null) pluck(m, t, stepDur * 2.6);
  };

  const timer = setInterval(() => {
    if (stopped) return;
    while (nextTime < ctx.currentTime + 0.35) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += stepDur;
    }
  }, 90);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      try {
        out.disconnect();
      } catch {
        /* noop */
      }
    },
    setVolume(v) {
      out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    },
  };
}
