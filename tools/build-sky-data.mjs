#!/usr/bin/env node
/**
 * build-sky-data.mjs — Ekko of Beyond
 * ------------------------------------------------------------------
 * Génère `data/ekko-sky.json`, la source de vérité astronomique du player.
 *
 * Entrées
 *   1. skyculture/ekko/index.json  (topologie des 53 figures, noms FR)
 *   2. le catalogue HYG v4.x       (positions J2000, magnitudes, indices B-V)
 *      → https://github.com/astronexus/HYG-Database
 *        fichier hyg/CURRENT/hygdata_v41.csv
 *
 * Sortie
 *   Un seul JSON contenant :
 *     - `stars`   : { [hip]: { ra, dec, mag, ci, name?, bayer?, con? } }
 *                   RA et Dec en degrés J2000. Uniquement les HIP réellement
 *                   utilisés par une figure Ekko (≈ 520 étoiles).
 *     - `figures` : { [iau]: { id, name, lines, hips, center, radius } }
 *                   `center` = barycentre angulaire de la figure
 *                   `radius` = rayon angulaire en degrés (pour cadrer la vue)
 *
 * Usage
 *   node tools/build-sky-data.mjs \
 *     --skyculture skyculture/ekko/index.json \
 *     --hyg vendor/hygdata_v41.csv \
 *     --out data/ekko-sky.json
 *
 * Le script est idempotent : à relancer après toute modification du
 * skyculture. Il échoue bruyamment si un HIP référencé est introuvable.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* ------------------------------------------------------------ catégories */

/**
 * Type affiché dans la puce du player et dans la collection.
 *
 * Cette table est la copie de `CATS` dans index.html. Elle vit ici pour que
 * la catégorie parte dans `ekko-sky.json` et devienne lisible par le player
 * et par les outils, au lieu d'être dupliquée dans chaque écran.
 * Si tu la modifies, modifie les deux — ou mieux, fais lire ekko-sky.json à
 * index.html et supprime sa copie.
 */
const CATEGORIES = {
  uma: 'Circumpolaires', umi: 'Circumpolaires', cas: 'Circumpolaires',
  cep: 'Circumpolaires', dra: 'Circumpolaires',

  ari: 'Zodiaque', tau: 'Zodiaque', gem: 'Zodiaque', cnc: 'Zodiaque',
  leo: 'Zodiaque', vir: 'Zodiaque', lib: 'Zodiaque', sco: 'Zodiaque',
  sgr: 'Zodiaque', cap: 'Zodiaque', aqr: 'Zodiaque', psc: 'Zodiaque',

  ori: 'Hiver', cma: 'Hiver', cmi: 'Hiver', aur: 'Hiver', eri: 'Hiver',
  lep: 'Hiver', mon: 'Hiver', col: 'Hiver',

  boo: 'Printemps', hya: 'Printemps', crv: 'Printemps', crt: 'Printemps',
  com: 'Printemps', cvn: 'Printemps',

  her: 'Été', crb: 'Été', cyg: 'Été', lyr: 'Été', aql: 'Été', oph: 'Été',
  ser: 'Été', del: 'Été', sge: 'Été',

  and: 'Automne', per: 'Automne', peg: 'Automne', cet: 'Automne',
  tri: 'Automne', psa: 'Automne',

  cru: 'Ciel austral', cen: 'Ciel austral', car: 'Ciel austral',
  lmc: 'Ciel austral',

  tde: 'Astérisme', tdh: 'Astérisme', hdh: 'Astérisme',
};

/* ---------------------------------------------------------------- args */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SKYCULTURE = args.skyculture ?? 'skyculture/ekko/index.json';
const HYG = args.hyg ?? 'vendor/hygdata_v41.csv';
const OUT = args.out ?? 'data/ekko-sky.json';
const PRECISION = Number(args.precision ?? 5);

/* ------------------------------------------------------------ csv utils */

/** Parseur CSV minimal mais correct (gère les guillemets et les virgules internes). */
function splitCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field); field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

const round = (n, p = PRECISION) => {
  const f = 10 ** p;
  return Math.round(n * f) / f;
};

/* ------------------------------------------------- 1. lire le skyculture */

const sky = JSON.parse(readFileSync(SKYCULTURE, 'utf8'));

/** Noms propres FR : le skyculture les stocke sous la clé `english`. */
const properNames = new Map();
for (const [key, entries] of Object.entries(sky.common_names ?? {})) {
  const hip = Number(String(key).replace(/^HIP\s*/i, ''));
  const label = entries?.[0]?.english;
  if (Number.isFinite(hip) && label) properNames.set(hip, label);
}

const neededHips = new Set();
const figures = {};
const skippedFigures = [];
const missingCategories = [];

for (const con of sky.constellations ?? []) {
  const iau = con.iau ?? con.id;
  const lines = (con.lines ?? []).map((seg) => seg.map(Number));

  if (lines.length === 0) {
    // Figure purement illustrée (pas de tracé) → hors périmètre du player.
    skippedFigures.push(iau);
    continue;
  }

  const hips = [...new Set(lines.flat())];
  hips.forEach((h) => neededHips.add(h));

  const category = CATEGORIES[String(iau).toLowerCase()];
  if (!category) missingCategories.push(iau);

  figures[iau] = {
    id: con.id,
    name: con.common_name?.english ?? iau,
    category: category ?? null,
    lines,
    hips,
    // center / radius calculés plus bas, une fois les positions connues
  };
}

/* ---------------------------------------------------- 2. lire le HYG CSV */

const csv = readFileSync(HYG, 'utf8');
const nl = csv.indexOf('\n');
const header = splitCsvLine(csv.slice(0, nl).replace(/\r$/, ''));
const col = Object.fromEntries(header.map((h, i) => [h.replace(/"/g, ''), i]));

for (const required of ['hip', 'ra', 'dec', 'mag']) {
  if (col[required] === undefined) {
    throw new Error(`Colonne "${required}" absente du CSV HYG (${HYG}).`);
  }
}

const stars = {};
let cursor = nl + 1;

while (cursor < csv.length) {
  let end = csv.indexOf('\n', cursor);
  if (end === -1) end = csv.length;
  const raw = csv.slice(cursor, end);
  cursor = end + 1;
  if (!raw) continue;

  // Filtre rapide avant de payer le coût du parse complet.
  const comma = raw.indexOf(',');
  const hipField = raw.slice(comma + 1, raw.indexOf(',', comma + 1));
  if (!hipField) continue;
  const hip = Number(hipField);
  if (!neededHips.has(hip) || stars[hip]) continue;

  const f = splitCsvLine(raw.replace(/\r$/, ''));
  const raHours = Number(f[col.ra]);
  const dec = Number(f[col.dec]);
  const mag = Number(f[col.mag]);
  if (!Number.isFinite(raHours) || !Number.isFinite(dec)) continue;

  const ci = Number(f[col.ci]);
  const entry = {
    ra: round(raHours * 15),               // heures → degrés
    dec: round(dec),
    mag: round(mag, 2),
  };
  if (Number.isFinite(ci)) entry.ci = round(ci, 3);

  const name = properNames.get(hip) ?? (f[col.proper] || null);
  if (name) entry.name = name;

  const bayer = f[col.bayer];
  if (bayer) entry.bayer = bayer;
  const con = f[col.con];
  if (con) entry.con = con;

  stars[hip] = entry;
}

const missing = [...neededHips].filter((h) => !stars[h]);
if (missing.length) {
  console.error(`\n✗ ${missing.length} HIP introuvables dans le catalogue :`);
  console.error(`  ${missing.join(', ')}`);
  process.exitCode = 1;
}

/* ------------------------------------- 3. barycentre et rayon par figure */

const DEG = Math.PI / 180;

function toVec3(ra, dec) {
  const a = ra * DEG;
  const d = dec * DEG;
  const cd = Math.cos(d);
  return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
}

function toRaDec([x, y, z]) {
  const ra = (Math.atan2(y, x) / DEG + 360) % 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) / DEG;
  return { ra, dec };
}

for (const [iau, fig] of Object.entries(figures)) {
  const vecs = fig.hips
    .map((h) => stars[h])
    .filter(Boolean)
    .map((s) => toVec3(s.ra, s.dec));

  if (vecs.length === 0) {
    console.error(`✗ Figure ${iau} : aucune étoile résolue.`);
    continue;
  }

  // Barycentre : moyenne des vecteurs unitaires, renormalisée.
  // Robuste au passage par RA = 0h, contrairement à une moyenne des angles.
  let [sx, sy, sz] = [0, 0, 0];
  for (const [x, y, z] of vecs) { sx += x; sy += y; sz += z; }
  const norm = Math.hypot(sx, sy, sz) || 1;
  const centerVec = [sx / norm, sy / norm, sz / norm];
  const center = toRaDec(centerVec);

  // Rayon angulaire : plus grande séparation entre le centre et une étoile.
  let radius = 0;
  for (const v of vecs) {
    const dot = Math.max(-1, Math.min(1, v[0] * centerVec[0] + v[1] * centerVec[1] + v[2] * centerVec[2]));
    radius = Math.max(radius, Math.acos(dot) / DEG);
  }

  fig.center = { ra: round(center.ra, 4), dec: round(center.dec, 4) };
  fig.radius = round(radius, 3);
}

/* ------------------------------------------------------------ 4. écrire */

const payload = {
  $schema: 'ekko-sky/1',
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    skyculture: sky.id ?? 'ekko',
    catalogue: 'HYG Database v4.1 (astronexus), positions J2000',
    categories: 'table CATS de index.html',
  },
  counts: {
    figures: Object.keys(figures).length,
    stars: Object.keys(stars).length,
  },
  figures,
  stars,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');

console.log(`✓ ${OUT}`);
console.log(`  ${payload.counts.figures} figures, ${payload.counts.stars} étoiles`);
if (skippedFigures.length) {
  console.log(`  ignorées (sans tracé) : ${skippedFigures.join(', ')}`);
}
if (missingCategories.length) {
  console.error(`✗ figures sans catégorie : ${missingCategories.join(', ')}`);
  process.exitCode = 1;
}
