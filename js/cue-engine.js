/**
 * cue-engine.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Synchronise l'affichage sur l'audio.
 *
 * Principe : l'état visuel est DÉRIVÉ de `audio.currentTime`, il n'est jamais
 * accumulé à partir d'événements. À chaque tick on calcule quel cue est actif
 * à l'instant t et on réconcilie. Conséquence directe : le seek, le ±10 s, le
 * drag sur la barre, la pause et la reprise fonctionnent sans une ligne de code
 * supplémentaire, et il n'y a aucun drapeau « déjà déclenché » à maintenir.
 *
 * Le seul vrai événement est le carillon, qui doit sonner une fois au passage
 * du repère. On le distingue d'un saut en regardant le pas de temps : en
 * lecture continue il vaut ~16 ms, après un seek il vaut n'importe quoi.
 *
 * Aucun DOM : ce module part tel quel vers React Native, où seule la source de
 * `currentTime` change (expo-av au lieu de HTMLAudioElement).
 */

/** Pas de temps maximal considéré comme de la lecture continue. */
const CONTINUOUS_MAX = 0.5;

/* ================================================================ carillon */

/**
 * Carillon de synthèse. Deux raisons de ne pas le mixer dans la piste audio :
 * le timecode reste la seule source de vérité, donc aucun décalage possible
 * après un remontage ; et le volume reste réglable, donc désactivable.
 *
 * `url` permet de basculer sur un fichier quand tu en auras un, sans rien
 * changer ailleurs.
 */
export class Chime {
  constructor({ url = null, gain = 0.45 } = {}) {
    this.url = url;
    this.gain = gain;
    this.ctx = null;
    this.buffer = null;
  }

  /** À appeler dans le geste utilisateur qui démarre la lecture. */
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.url && !this.buffer) {
      try {
        const r = await fetch(this.url);
        this.buffer = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { this.buffer = null; }
    }
  }

  play() {
    if (!this.ctx || this.gain <= 0) return;

    if (this.buffer) {
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = this.gain;
      src.buffer = this.buffer;
      src.connect(g).connect(this.ctx.destination);
      src.start();
      return;
    }

    // Cloche courte : une fondamentale et deux partiels en quinte/octave,
    // attaque de 8 ms, décroissance exponentielle. Assez reconnaissable pour
    // dire « regarde l'écran » sans couvrir la voix.
    const t0 = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.value = this.gain;
    master.connect(this.ctx.destination);

    for (const [freq, level, decay] of [[1318.5, 1, 1.5], [1975.5, 0.42, 1.1], [2637, 0.2, 0.8]]) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(level, t0 + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      osc.connect(env).connect(master);
      osc.start(t0);
      osc.stop(t0 + decay + 0.05);
    }
  }
}

/* ================================================================== moteur */

export class CueEngine {
  /**
   * @param {object} o
   * @param {HTMLAudioElement} o.audio
   * @param {object} o.track            fichier de cues (voir data/cues.schema)
   * @param {(cue:?object,t:number)=>void} o.onCue  appelé au changement de cue actif
   * @param {(t:number,d:number)=>void} [o.onTime]  appelé à chaque tick
   * @param {Chime} [o.chime]
   */
  constructor({ audio, track, onCue, onTime, chime }) {
    this.audio = audio;
    this.onCue = onCue;
    this.onTime = onTime;
    this.chime = chime ?? null;

    this.setTrack(track);

    this._raf = null;
    this._lastT = 0;
    this._activeId = null;
    this._tick = this._tick.bind(this);
  }

  setTrack(track) {
    this.track = track ?? { cues: [] };
    this.offset = this.track.chime?.offset ?? 0.25;
    // Triés par début : l'ordre du fichier n'est pas garanti après édition.
    this.cues = [...(this.track.cues ?? [])]
      .filter((c) => Number.isFinite(c.start))
      .sort((a, b) => a.start - b.start);
    this._activeId = null;
    return this;
  }

  /** Cue affiché à l'instant t. Le dernier qui contient t l'emporte. */
  cueAt(t) {
    let hit = null;
    for (const c of this.cues) {
      const from = c.start + (c.offset ?? this.offset);
      const to = Number.isFinite(c.end) ? c.end : from + 8;
      if (t >= from && t < to) hit = c;
      else if (from > t) break;
    }
    return hit;
  }

  start() {
    if (this._raf !== null) return this;
    this._lastT = this.audio.currentTime;
    this._raf = requestAnimationFrame(this._tick);
    return this;
  }

  stop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    return this;
  }

  /** Force une réconciliation immédiate, par exemple après un seek à l'arrêt. */
  sync() {
    const t = this.audio.currentTime;
    this._lastT = t;
    this._reconcile(t);
    this.onTime?.(t, this.duration);
    return this;
  }

  get duration() {
    const d = this.audio.duration;
    return Number.isFinite(d) && d > 0 ? d : (this.track.duration ?? 0);
  }

  _tick() {
    const t = this.audio.currentTime;
    const dt = t - this._lastT;

    // Carillon : seulement en lecture continue vers l'avant. Un saut, un
    // retour arrière ou une reprise après pause ne doivent pas le déclencher.
    if (this.chime && dt > 0 && dt < CONTINUOUS_MAX && !this.audio.paused) {
      for (const c of this.cues) {
        if (c.chime === false) continue;
        if (c.start > this._lastT && c.start <= t) { this.chime.play(); break; }
      }
    }

    this._lastT = t;
    this._reconcile(t);
    this.onTime?.(t, this.duration);
    this._raf = requestAnimationFrame(this._tick);
  }

  _reconcile(t) {
    const active = this.cueAt(t);
    const id = active?.id ?? null;
    if (id === this._activeId) return;
    this._activeId = id;
    this.onCue(active, t);
  }
}

/* ================================================================= format */

export const CUE_SCHEMA = 'ekko-cues/1';

export function emptyTrack(iau, id) {
  return {
    $schema: CUE_SCHEMA,
    constellation: id,
    iau,
    audioSrc: '',
    duration: 0,
    chime: { enabled: true, offset: 0.25, gain: 0.45, url: null },
    cues: [],
  };
}

/** Contrôle de cohérence. Renvoie une liste de problèmes lisibles. */
export function validateTrack(track) {
  const issues = [];
  const cues = [...(track.cues ?? [])].sort((a, b) => a.start - b.start);

  if (!track.audioSrc) issues.push("Aucun chemin audio (`audioSrc`) n'est renseigné.");
  if (!(track.duration > 0)) issues.push('La durée de la piste est inconnue.');

  cues.forEach((c, i) => {
    const label = c.card?.title || c.id || `repère ${i + 1}`;
    if (!Number.isFinite(c.start)) issues.push(`${label} : début manquant.`);
    if (!Number.isFinite(c.end)) issues.push(`${label} : fin manquante.`);
    else if (c.end <= c.start) issues.push(`${label} : la fin précède le début.`);
    if (track.duration > 0 && c.end > track.duration + 0.5) {
      issues.push(`${label} : se termine après la fin de l'audio.`);
    }
    if (!c.hips?.length) issues.push(`${label} : aucune étoile associée.`);
    if (!c.card?.title) issues.push(`Repère ${i + 1} : pas de titre.`);

    const prev = cues[i - 1];
    if (prev && Number.isFinite(prev.end) && c.start < prev.end) {
      issues.push(`${label} chevauche « ${prev.card?.title || prev.id} ».`);
    }
  });

  return issues;
}
