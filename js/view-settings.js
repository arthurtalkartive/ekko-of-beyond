/**
 * view-settings.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Source unique de vérité des réglages de la vue constellation.
 *
 * Ce fichier est importé par TROIS consommateurs :
 *   1. constellation-lab.html → construit ses curseurs à partir de PARAMS
 *   2. api/save-view.js       → valide et borne ce que le navigateur envoie
 *   3. le player              → fabrique les options de ConstellationView
 *
 * Conséquence : aucun DOM, aucune dépendance. Ajouter un réglage se fait
 * ici et nulle part ailleurs — l'interface, la validation serveur et le
 * rendu suivent automatiquement.
 */

export const SETTINGS_PATH = 'data/player-view.json';

/**
 * `scope: 'common'`  → identique pour les 52 figures
 * `scope: 'figure'`  → réglé constellation par constellation
 *
 * `section` ne sert qu'au regroupement dans l'interface.
 */
export const PARAMS = {
  /* ------------------------------------------------ propres à une figure */

  rotation: {
    scope: 'figure',
    section: 'Cadrage',
    label: 'Rotation',
    type: 'number',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    decimals: 0,
  },
  padding: {
    scope: 'figure',
    section: 'Cadrage',
    label: 'Marge',
    type: 'number',
    min: 0,
    max: 240,
    step: 2,
    default: 64,
    unit: ' px',
    decimals: 0,
  },

  /* ------------------------------------------------------------ communs */

  projection: {
    scope: 'common',
    section: 'Projection',
    label: 'Projection',
    type: 'enum',
    values: ['stereographic', 'gnomonic'],
    labels: { stereographic: 'Stéréographique', gnomonic: 'Gnomonique' },
    default: 'stereographic',
  },

  starRadiusMin: {
    scope: 'common', section: 'Étoiles', label: 'Rayon min',
    type: 'number', min: 0.4, max: 4, step: 0.1, default: 1.1, decimals: 1,
  },
  starRadiusMax: {
    scope: 'common', section: 'Étoiles', label: 'Rayon max',
    type: 'number', min: 2, max: 16, step: 0.2, default: 6, decimals: 1,
  },
  starGamma: {
    scope: 'common', section: 'Étoiles', label: 'Contraste des magnitudes',
    type: 'number', min: 1, max: 4, step: 0.1, default: 2.2, decimals: 1,
  },
  colorSaturation: {
    scope: 'common', section: 'Étoiles', label: 'Saturation B-V',
    type: 'number', min: 0, max: 1, step: 0.05, default: 0.35, decimals: 2,
  },
  glowScale: {
    scope: 'common', section: 'Étoiles', label: 'Rayon du halo',
    type: 'number', min: 1.5, max: 10, step: 0.2, default: 4.2, unit: '×', decimals: 1,
  },

  lineOpacity: {
    scope: 'common', section: 'Tracés', label: 'Opacité',
    type: 'number', min: 0, max: 1, step: 0.02, default: 0.42, decimals: 2,
  },
  lineWidth: {
    scope: 'common', section: 'Tracés', label: 'Épaisseur',
    type: 'number', min: 0.5, max: 3, step: 0.1, default: 1, decimals: 1,
  },

  dim: {
    scope: 'common', section: 'Mise en avant', label: 'Étoiles éteintes',
    type: 'number', min: 0, max: 1, step: 0.02, default: 0.2, decimals: 2,
  },
  dimLines: {
    scope: 'common', section: 'Mise en avant', label: 'Tracés éteints',
    type: 'number', min: 0, max: 1, step: 0.02, default: 0.45, decimals: 2,
  },
  focusScale: {
    scope: 'common', section: 'Mise en avant', label: 'Grossissement',
    type: 'number', min: 1, max: 2.5, step: 0.05, default: 1.35, unit: '×', decimals: 2,
  },
  transitionMs: {
    scope: 'common', section: 'Mise en avant', label: 'Durée de transition',
    type: 'number', min: 80, max: 1200, step: 20, default: 480, unit: ' ms', decimals: 0,
  },
};

export const COMMON_KEYS = Object.keys(PARAMS).filter((k) => PARAMS[k].scope === 'common');
export const FIGURE_KEYS = Object.keys(PARAMS).filter((k) => PARAMS[k].scope === 'figure');

/** Ordre d'affichage des sections dans l'interface. */
export const SECTIONS = {
  figure: ['Cadrage'],
  common: ['Étoiles', 'Tracés', 'Mise en avant', 'Projection'],
};

/* ------------------------------------------------------------ validation */

/**
 * Ramène une valeur dans son domaine, ou renvoie `undefined` si elle est
 * irrécupérable. Utilisé côté serveur : rien de ce qui vient du navigateur
 * n'est écrit dans le dépôt sans passer par ici.
 */
export function coerce(key, raw) {
  const p = PARAMS[key];
  if (!p) return undefined;

  if (p.type === 'enum') {
    return p.values.includes(raw) ? raw : undefined;
  }

  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;

  const clamped = Math.min(p.max, Math.max(p.min, n));
  // On aligne sur le pas pour éviter d'écrire 0.4200000000000001 dans le dépôt.
  const decimals = p.decimals ?? 2;
  return Number(clamped.toFixed(Math.max(decimals, String(p.step).split('.')[1]?.length ?? 0)));
}

/**
 * Filtre un objet de valeurs sur les clés autorisées pour un scope donné.
 * @returns {{ values: object, rejected: string[] }}
 */
export function sanitize(scope, input) {
  const allowed = scope === 'common' ? COMMON_KEYS : FIGURE_KEYS;
  const values = {};
  const rejected = [];

  for (const [key, raw] of Object.entries(input ?? {})) {
    if (!allowed.includes(key)) { rejected.push(key); continue; }
    const v = coerce(key, raw);
    if (v === undefined) { rejected.push(key); continue; }
    values[key] = v;
  }

  return { values, rejected };
}

/* --------------------------------------------------------------- defaults */

export function defaultsFor(scope) {
  const keys = scope === 'common' ? COMMON_KEYS : FIGURE_KEYS;
  return Object.fromEntries(keys.map((k) => [k, PARAMS[k].default]));
}

/** Fichier de réglages vierge, tel qu'il est créé au premier enregistrement. */
export function emptySettings() {
  return {
    $schema: 'ekko-player-view/1',
    updatedAt: new Date().toISOString(),
    common: defaultsFor('common'),
    figures: {},
  };
}

/* ------------------------------------------------------------- résolution */

/**
 * Valeurs effectives pour une figure : défauts, écrasés par les communs,
 * écrasés par le spécifique. Une figure jamais réglée retombe donc sur des
 * valeurs correctes plutôt que sur du vide.
 */
export function resolve(settings, iau) {
  return {
    ...defaultsFor('common'),
    ...defaultsFor('figure'),
    ...(settings?.common ?? {}),
    ...(settings?.figures?.[iau] ?? {}),
  };
}

/**
 * Traduit les réglages en options `ConstellationView`.
 * C'est le seul endroit où `rotation` devient `roll` et où les clés plates
 * redeviennent l'arborescence attendue par le composant.
 */
export function toViewOptions(settings, iau) {
  const v = resolve(settings, iau);
  return {
    roll: v.rotation,
    padding: v.padding,
    projection: v.projection,
    lineOpacity: v.lineOpacity,
    lineWidth: v.lineWidth,
    glowScale: v.glowScale,
    dim: v.dim,
    dimLines: v.dimLines,
    focusScale: v.focusScale,
    transitionMs: v.transitionMs,
    star: { rMin: v.starRadiusMin, rMax: v.starRadiusMax, gamma: v.starGamma },
    color: { saturation: v.colorSaturation },
  };
}
