/**
 * sky-projection.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Transforme une figure du skyculture `ekko` en géométrie 2D prête à peindre.
 *
 * Ce module est VOLONTAIREMENT sans dépendance et sans DOM : il ne connaît ni
 * SVG, ni canvas, ni navigateur. C'est lui qui portera tel quel vers React
 * Native — seule la couche de rendu sera à réécrire (react-native-svg).
 *
 * Tout est en degrés côté entrée, en pixels côté sortie.
 */

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ============================================================== projection */

/**
 * Projette un point du ciel sur le plan tangent au centre de la vue.
 *
 * - `stereographic` : conforme, préserve les angles, encaisse les grandes
 *   figures (Hydre, Éridan) sans les étirer. C'est aussi la projection par
 *   défaut de Stellarium Web, donc la forme reste cohérente avec la carte.
 * - `gnomonic` : plus « photographique » sur les petits champs, mais explose
 *   au-delà de ~60° de rayon. Réservée aux petites figures.
 *
 * Retourne des coordonnées en unités de plan tangent (sans échelle), déjà
 * orientées écran : x vers la droite, y vers le bas.
 */
export function projectPoint(ra, dec, ra0, dec0, kind = 'stereographic', mirror = true) {
  const d = dec * DEG;
  const d0 = dec0 * DEG;
  const delta = (ra - ra0) * DEG;

  const sinD = Math.sin(d);
  const cosD = Math.cos(d);
  const sinD0 = Math.sin(d0);
  const cosD0 = Math.cos(d0);
  const cosDelta = Math.cos(delta);

  const cosC = sinD0 * sinD + cosD0 * cosD * cosDelta;

  let k;
  if (kind === 'gnomonic') {
    if (cosC <= 1e-6) return null; // point derrière le plan tangent
    k = 1 / cosC;
  } else {
    k = 2 / (1 + cosC);
  }

  const east = k * cosD * Math.sin(delta);          // + = ascension droite croissante
  const north = k * (cosD0 * sinD - sinD0 * cosD * cosDelta);

  // Vue depuis l'intérieur de la sphère céleste (on regarde le ciel, pas un
  // globe) : l'ascension droite croissante va vers la GAUCHE. Sans ce miroir,
  // Orion apparaît inversée par rapport à ce que l'utilisateur voit sur la carte.
  return {
    x: mirror ? -east : east,
    y: -north, // l'axe écran descend
  };
}

/* ============================================ apparence dérivée du catalogue */

/**
 * Rayon du disque d'une étoile, en pixels, dérivé de sa magnitude apparente.
 *
 * Courbe volontairement non linéaire (gamma) : sans elle, tout l'écart utile
 * se joue entre mag 4 et 6 et les étoiles vedettes ne ressortent pas.
 * Les quatre paramètres sont les curseurs de direction artistique.
 */
export function magnitudeToRadius(mag, opts = {}) {
  const {
    magBright = -1.5,  // magnitude à laquelle on atteint rMax
    magFaint = 6.0,    // magnitude à laquelle on atteint rMin
    rMin = 1.1,
    rMax = 6.0,
    gamma = 2.2,
  } = opts;

  const t = clamp((magFaint - mag) / (magFaint - magBright), 0, 1);
  return rMin + (rMax - rMin) * t ** gamma;
}

// Table B-V → RGB, interpolée. Approximation standard des couleurs stellaires.
const BV_TABLE = [
  [-0.40, [155, 176, 255]],
  [-0.20, [170, 191, 255]],
  [0.00, [202, 215, 255]],
  [0.20, [225, 235, 255]],
  [0.40, [248, 247, 255]],
  [0.60, [255, 244, 234]],
  [0.80, [255, 235, 209]],
  [1.00, [255, 225, 189]],
  [1.20, [255, 213, 160]],
  [1.40, [255, 204, 138]],
  [1.60, [255, 196, 121]],
  [2.00, [255, 187, 105]],
];

const toHex = (rgb) => `#${rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/**
 * Couleur d'une étoile à partir de son indice de couleur B-V.
 *
 * `saturation` mélange la couleur physique vers `tint`, la teinte parchemin
 * d'Ekko. À 0 toutes les étoiles sont uniformes, à 1 on a la vraie palette
 * stellaire. Autour de 0.35 on garde une chaleur subtile sans virer au sapin
 * de Noël.
 */
export function colorFromBV(ci, opts = {}) {
  const { saturation = 0.35, tint = '#F2EEDD' } = opts;
  const base = hexToRgb(tint);
  if (!Number.isFinite(ci) || saturation <= 0) return tint;

  const v = clamp(ci, BV_TABLE[0][0], BV_TABLE[BV_TABLE.length - 1][0]);
  let i = 0;
  while (i < BV_TABLE.length - 2 && BV_TABLE[i + 1][0] < v) i += 1;
  const [v0, c0] = BV_TABLE[i];
  const [v1, c1] = BV_TABLE[i + 1];
  const t = (v - v0) / (v1 - v0);
  const physical = c0.map((c, k) => c + (c1[k] - c) * t);

  return toHex(base.map((b, k) => b + (physical[k] - b) * clamp(saturation, 0, 1)));
}

/* ================================================================== layout */

/**
 * Calcule la géométrie complète d'une figure dans un viewport donné.
 *
 * @param {object}  o
 * @param {object}  o.figure      entrée `figures[iau]` de ekko-sky.json
 * @param {object}  o.stars       table `stars` de ekko-sky.json
 * @param {number}  o.width       largeur du viewport en px
 * @param {number}  o.height      hauteur du viewport en px
 * @param {number} [o.padding=48] marge intérieure en px
 * @param {number} [o.roll=0]     rotation de la figure en degrés (sens horaire)
 * @param {string} [o.projection='stereographic']
 * @param {boolean}[o.mirror=true]
 * @param {number} [o.maxScale]   plafond de px par unité de plan tangent
 * @param {object} [o.star]       options passées à magnitudeToRadius
 * @param {object} [o.color]      options passées à colorFromBV
 *
 * @returns {{
 *   stars: Array<{hip:number,x:number,y:number,r:number,mag:number,name:?string,color:string}>,
 *   segments: Array<{a:number,b:number,x1:number,y1:number,x2:number,y2:number}>,
 *   scale: number,
 *   bounds: {minX:number,minY:number,maxX:number,maxY:number},
 *   missing: number[]
 * }}
 */
export function layoutFigure({
  figure,
  stars,
  width,
  height,
  padding = 48,
  roll = 0,
  projection = 'stereographic',
  mirror = true,
  maxScale = Infinity,
  star: starOpts = {},
  color: colorOpts = {},
}) {
  if (!figure) throw new Error('layoutFigure: figure manquante');
  if (!(width > 0) || !(height > 0)) {
    return { stars: [], segments: [], scale: 0, bounds: null, missing: [] };
  }

  const { ra: ra0, dec: dec0 } = figure.center;
  const theta = roll * DEG;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // 1. projection + roulis, en unités de plan tangent
  const raw = new Map();
  const missing = [];

  for (const hip of figure.hips) {
    const s = stars[hip];
    if (!s) { missing.push(hip); continue; }
    const p = projectPoint(s.ra, s.dec, ra0, dec0, projection, mirror);
    if (!p) { missing.push(hip); continue; }
    raw.set(hip, {
      x: p.x * cosT - p.y * sinT,
      y: p.x * sinT + p.y * cosT,
      mag: s.mag,
      name: s.name ?? null,
      ci: s.ci,
    });
  }

  if (raw.size === 0) {
    return { stars: [], segments: [], scale: 0, bounds: null, missing };
  }

  // 2. rayons en px (indépendants de l'échelle : c'est un choix graphique)
  for (const v of raw.values()) v.r = magnitudeToRadius(v.mag, starOpts);
  const maxR = Math.max(...[...raw.values()].map((v) => v.r));

  // 3. cadrage : on tient compte du rayon des disques pour ne rien rogner
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const v of raw.values()) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  const pad = padding + maxR;
  const availW = Math.max(1, width - pad * 2);
  const availH = Math.max(1, height - pad * 2);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const scale = Math.min(
    maxScale,
    spanX > 1e-9 ? availW / spanX : Infinity,
    spanY > 1e-9 ? availH / spanY : Infinity,
  );
  const finalScale = Number.isFinite(scale) ? scale : 1;

  const offsetX = width / 2 - ((minX + maxX) / 2) * finalScale;
  const offsetY = height / 2 - ((minY + maxY) / 2) * finalScale;

  // 4. sortie
  const out = new Map();
  for (const [hip, v] of raw) {
    out.set(hip, {
      hip,
      x: v.x * finalScale + offsetX,
      y: v.y * finalScale + offsetY,
      r: v.r,
      mag: v.mag,
      name: v.name,
      color: colorFromBV(v.ci, colorOpts),
    });
  }

  const segments = [];
  const seen = new Set();
  for (const line of figure.lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i];
      const b = line[i + 1];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue; // les tracés se recoupent souvent
      const pa = out.get(a);
      const pb = out.get(b);
      if (!pa || !pb) continue;
      seen.add(key);
      segments.push({ a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
    }
  }

  return {
    stars: [...out.values()].sort((p, q) => q.r - p.r), // les grosses d'abord
    segments,
    scale: finalScale,
    bounds: { minX, minY, maxX, maxY },
    missing,
  };
}
