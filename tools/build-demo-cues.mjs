#!/usr/bin/env node
/**
 * build-demo-cues.mjs — Ekko of Beyond
 * ------------------------------------------------------------------
 * Crée un `content/<id>/cues.json` de démonstration pour chaque figure qui
 * n'en a pas encore, afin que « Collecter l'ekko » mène à un player vivant
 * sur les 52 constellations avant que les audios existent.
 *
 * Le contenu n'est PAS inventé : chaque info-bulle ne dit que ce que le
 * catalogue affirme — nom, désignation de Bayer, magnitude apparente, teinte
 * déduite de l'indice B-V. Aucune prose astronomique fabriquée, donc rien de
 * faux ne risque de passer en production par oubli.
 *
 * Chaque fichier porte `_demo: true`. L'outil de calibration l'écrase au
 * premier enregistrement.
 *
 * Usage
 *   node tools/build-demo-cues.mjs                  # n'écrase rien
 *   node tools/build-demo-cues.mjs --force          # régénère tout
 *   node tools/build-demo-cues.mjs --only ori,uma
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? new Set(args[i + 1].split(',').map((s) => s.trim().toLowerCase())) : null;
})();

const SKY = 'data/ekko-sky.json';
const DURATION = 240;       // durée fictive, en secondes
const MAX_CUES = 5;
const LEAD = 20;            // silence avant le premier repère
const CUE_LEN = 16;

const BAYER = {
  Alp: 'Alpha', Bet: 'Bêta', Gam: 'Gamma', Del: 'Delta', Eps: 'Epsilon',
  Zet: 'Zêta', Eta: 'Êta', The: 'Thêta', Iot: 'Iota', Kap: 'Kappa',
  Lam: 'Lambda', Mu: 'Mu', Nu: 'Nu', Xi: 'Xi', Omi: 'Omicron', Pi: 'Pi',
  Rho: 'Rhô', Sig: 'Sigma', Tau: 'Tau', Ups: 'Upsilon', Phi: 'Phi',
  Chi: 'Chi', Psi: 'Psi', Ome: 'Oméga',
};

/** Teinte, déduite de l'indice de couleur B-V du catalogue. */
function hue(ci) {
  if (!Number.isFinite(ci)) return null;
  if (ci < 0) return 'bleutée';
  if (ci < 0.3) return 'blanc-bleu';
  if (ci < 0.6) return 'blanche';
  if (ci < 0.9) return 'jaune';
  if (ci < 1.3) return 'orangée';
  return 'rouge orangé';
}

const fr = (n, d = 2) => n.toFixed(d).replace('.', ',');

const sky = JSON.parse(readFileSync(SKY, 'utf8'));
const written = [];
const skipped = [];

for (const [iau, figure] of Object.entries(sky.figures)) {
  const id = iau.toLowerCase();
  if (ONLY && !ONLY.has(id)) continue;

  const path = `content/${id}/cues.json`;
  if (existsSync(path) && !FORCE) {
    // On ne touche jamais à un fichier réel. Une démo, en revanche, se remplace.
    const current = JSON.parse(readFileSync(path, 'utf8'));
    if (current._demo !== true) { skipped.push(`${id} (réel)`); continue; }
  }

  // Les plus brillantes d'abord, celles qui portent un nom en priorité.
  const stars = figure.hips
    .map((h) => ({ hip: h, ...sky.stars[h] }))
    .filter((s) => Number.isFinite(s.mag))
    .sort((a, b) => (Number(Boolean(b.name)) - Number(Boolean(a.name))) || a.mag - b.mag)
    .slice(0, MAX_CUES);

  if (stars.length === 0) { skipped.push(`${id} (aucune étoile)`); continue; }

  const step = (DURATION - LEAD * 2) / stars.length;
  const cues = stars.map((s, i) => {
    const start = Number((LEAD + i * step).toFixed(2));
    const bayer = s.bayer ? `${BAYER[s.bayer] ?? s.bayer} ${s.con ?? iau}` : null;
    const tint = hue(s.ci);

    const facts = [`Magnitude apparente ${fr(s.mag)}.`];
    if (bayer) facts.push(`Désignation ${bayer}.`);
    if (tint) facts.push(`Teinte ${tint} (indice B-V ${fr(s.ci)}).`);
    facts.push('Contenu de démonstration, à réécrire dans l\'outil de calibration.');

    return {
      id: `demo-${i + 1}`,
      start,
      end: Number((start + CUE_LEN).toFixed(2)),
      hips: [s.hip],
      card: {
        title: s.name ?? `HIP ${s.hip}`,
        subtitle: bayer ?? `HIP ${s.hip}`,
        body: facts.join(' '),
      },
    };
  });

  const track = {
    $schema: 'ekko-cues/1',
    constellation: id,
    iau,
    _demo: true,
    _note: `Généré par tools/build-demo-cues.mjs. Dépose la piste dans `
      + `content/${id}/audio.mp3 puis recale les repères dans /calibration.`,
    updatedAt: '1970-01-01T00:00:00.000Z',
    audioSrc: `content/${id}/audio.mp3`,
    duration: DURATION,
    chime: { enabled: true, offset: 0.25, gain: 0.45, url: null },
    cues,
  };

  mkdirSync(`content/${id}`, { recursive: true });
  writeFileSync(path, `${JSON.stringify(track, null, 1)}\n`, 'utf8');
  written.push(`${id}:${cues.length}`);
}

console.log(`✓ ${written.length} fichiers de démonstration écrits`);
if (written.length) console.log(`  ${written.join(' ')}`);
if (skipped.length) console.log(`  conservés : ${skipped.join(', ')}`);
