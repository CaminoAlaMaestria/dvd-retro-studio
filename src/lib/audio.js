/* ============================================================
   Consola multipista de audio (WebAudio):
   canales VOZ (micrófono en directo), VOZ EN OFF (toma grabada)
   y MÚSICA (archivo propio o pista libre), cada uno con su
   fader, silencio/solo y medidor. Todo se mezcla en local.
   ============================================================ */

let ctx = null;
export function getAudioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export const CHANNELS = ["voice", "voiceover", "music"];

export class Mixer {
  constructor() {
    this.ctx = getAudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.monitor = this.ctx.createGain();
    this.monitor.gain.value = 1;
    this.master.connect(this.masterAnalyser);
    this.master.connect(this.monitor);
    this.monitor.connect(this.ctx.destination);

    this.ch = {};
    for (const id of CHANNELS) {
      const input = this.ctx.createGain(); // entrada del canal (fuentes)
      const fader = this.ctx.createGain(); // fader del canal
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      input.connect(fader);
      fader.connect(analyser);
      analyser.connect(this.master);
      this.ch[id] = { input, fader, analyser, volume: 0.8, duck: 1, muted: false, solo: false, sources: [], streamSources: [] };
    }
    this.applySoloMute();
  }

  setMonitor(on) {
    this.monitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
  }

  applySoloMute() {
    const anySolo = CHANNELS.some((id) => this.ch[id].solo);
    for (const id of CHANNELS) {
      const c = this.ch[id];
      const audible = !c.muted && (!anySolo || c.solo);
      c.fader.gain.setTargetAtTime(audible ? c.volume * c.duck : 0, this.ctx.currentTime, 0.04);
    }
  }

  setDuck(id, factor) {
    if (!this.ch[id]) return;
    const next = Math.max(0.1, Math.min(1, factor));
    if (Math.abs(this.ch[id].duck - next) < 0.02) return;
    this.ch[id].duck = next;
    this.applySoloMute();
  }

  setVolume(id, v) {
    this.ch[id].volume = Math.max(0, Math.min(1, v));
    this.applySoloMute();
  }
  setMuted(id, m) {
    this.ch[id].muted = m;
    this.applySoloMute();
  }
  setSolo(id, s) {
    this.ch[id].solo = s;
    this.applySoloMute();
  }
  setMaster(v) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.03);
  }

  /** Nivel actual (0..1) de un canal o del master, para los medidores. */
  level(id) {
    const an = id === "master" ? this.masterAnalyser : this.ch[id].analyser;
    const data = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.2);
  }

  /** Conecta el micrófono en directo al canal de voz. */
  connectMic(stream) {
    return this.replaceStreamSource(stream, "voice");
  }

  /** Reemplaza la fuente MediaStream de un canal (p. ej. micro, capturadora VHS o audio de pantalla). */
  replaceStreamSource(stream, channelId = "voice") {
    const c = this.ch[channelId];
    if (!c) return null;
    for (const prev of c.streamSources) {
      try {
        prev.disconnect();
      } catch {
        /* ya desconectado */
      }
    }
    c.streamSources = [];
    if (!stream || !stream.getAudioTracks().length) return null;
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(c.input);
    c.streamSources.push(src);
    c.sources.push(src);
    return src;
  }

  /** Conecta un elemento <audio> (voz en off o música propia) a un canal. */
  connectElement(el, channelId) {
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.ch[channelId].input);
    this.ch[channelId].sources.push(src);
    return src;
  }

  /** Conecta cualquier nodo (p. ej. la música libre) a un canal. */
  connectNode(node, channelId) {
    node.connect(this.ch[channelId].input);
  }

  /** Destino de grabación: mezcla todo el master en un MediaStream. */
  recordDestination() {
    return this.ctx.createMediaStreamDestination();
  }
  connectRecord(dest) {
    this.master.connect(dest);
  }

  dispose() {
    for (const id of CHANNELS) {
      this.ch[id].sources.forEach((s) => {
        try {
          s.disconnect();
        } catch {
          /* ya desconectado */
        }
      });
    }
    try {
      this.master.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** Grabación de audio con el micrófono (voz en off) → Blob. */
export function recordMicAudio(stream, onStop) {
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => onStop(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
  rec.start();
  return rec;
}
