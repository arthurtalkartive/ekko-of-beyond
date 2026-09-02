/**
 * api/save-cues.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Écrit `content/<id>/cues.json` dans le dépôt via l'API Contents de GitHub,
 * à côté des fiches `science.json` / `mytho.json` / `astro.json`.
 *
 * Mêmes variables d'environnement et même en-tête `x-ekko-key` que
 * `api/save.js` et `api/save-view.js` : rien de plus à configurer.
 *
 *   POST { id: 'ori', track: { … } }
 *
 * Contrairement aux réglages de vue, ici on remplace le fichier entier :
 * l'outil de calibration détient toujours l'état complet de la piste.
 * Le contenu est intégralement revalidé côté serveur.
 */

const GH = 'https://api.github.com';
const MAX_CUES = 80;
const LIMITS = { title: 120, subtitle: 160, body: 1200, image: 500, audioSrc: 500, id: 40 };

const json = (res, code, body) => res.status(code).json(body);

/* ------------------------------------------------------------- validation */

const num = (v, lo, hi, decimals = 3) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(Math.min(hi, Math.max(lo, n)).toFixed(decimals));
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sanitizeTrack(raw, id) {
  if (!raw || typeof raw !== 'object') throw new Error('Piste illisible.');

  const duration = num(raw.duration, 0, 86400, 3) ?? 0;
  const cues = Array.isArray(raw.cues) ? raw.cues.slice(0, MAX_CUES) : [];

  const clean = [];
  for (const c of cues) {
    const start = num(c.start, 0, 86400, 3);
    if (start === null) continue;
    const end = num(c.end, 0, 86400, 3);

    const hips = Array.isArray(c.hips)
      ? [...new Set(c.hips.map((h) => parseInt(h, 10)).filter((h) => h > 0 && h < 200000))].slice(0, 12)
      : [];

    const card = {
      title: str(c.card?.title, LIMITS.title),
      subtitle: str(c.card?.subtitle, LIMITS.subtitle),
      body: str(c.card?.body, LIMITS.body),
      image: str(c.card?.image, LIMITS.image),
    };
    for (const k of Object.keys(card)) if (!card[k]) delete card[k];

    clean.push({
      id: str(c.id, LIMITS.id) || `c${clean.length + 1}`,
      start,
      end: end !== null && end > start ? end : Number((start + 8).toFixed(3)),
      ...(c.chime === false ? { chime: false } : {}),
      ...(num(c.offset, 0, 5, 3) !== null && c.offset !== undefined
        ? { offset: num(c.offset, 0, 5, 3) } : {}),
      hips,
      card,
    });
  }

  clean.sort((a, b) => a.start - b.start);

  // Identifiants uniques : l'outil peut en produire des doublons après copie.
  const seen = new Set();
  for (const c of clean) {
    let key = c.id;
    let n = 2;
    while (seen.has(key)) key = `${c.id}-${n++}`;
    c.id = key;
    seen.add(key);
  }

  return {
    $schema: 'ekko-cues/1',
    constellation: id,
    iau: str(raw.iau, 8),
    updatedAt: new Date().toISOString(),
    audioSrc: str(raw.audioSrc, LIMITS.audioSrc),
    duration,
    group: str(raw.group, 60),
    chime: {
      enabled: raw.chime?.enabled !== false,
      offset: num(raw.chime?.offset, 0, 5, 3) ?? 0.25,
      gain: num(raw.chime?.gain, 0, 1, 3) ?? 0.45,
      url: str(raw.chime?.url, LIMITS.image) || null,
    },
    cues: clean,
  };
}

/* ------------------------------------------------------------- GitHub I/O */

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ekko-of-beyond',
  'Content-Type': 'application/json',
});

async function currentSha(repo, branch, token, path) {
  const r = await fetch(`${GH}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error(`Lecture GitHub : ${r.status}`),
    { detail: (await r.text().catch(() => '')).slice(0, 300) });
  return (await r.json()).sha;
}

/* ---------------------------------------------------------------- handler */

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const adminKey = process.env.EKKO_ADMIN_KEY;

  const missing = [
    !token && 'GITHUB_TOKEN',
    !repo && 'GITHUB_REPO',
    !adminKey && 'EKKO_ADMIN_KEY',
  ].filter(Boolean);

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return json(res, 200, {
      route: 'ok',
      configured: missing.length === 0,
      missing,
      repo: repo || null,
      branch,
      pathPattern: 'content/<id>/cues.json',
      maxCues: MAX_CUES,
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Méthode non autorisée : utilisez GET ou POST.' });
  }

  if (missing.length) {
    return json(res, 503, {
      error: 'Écriture non configurée sur ce déploiement.',
      detail: 'Définissez ces variables dans Vercel (Settings → Environment Variables), '
        + 'puis redéployez.',
      missing,
    });
  }

  const given = req.headers['x-ekko-key'];
  if (!given) return json(res, 401, { error: "Clé d'administration absente." });
  if (given !== adminKey) return json(res, 401, { error: "Clé d'administration incorrecte." });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { error: 'Corps de requête illisible : JSON attendu.' });
  }

  const id = String(body.id ?? '').toLowerCase();
  if (!/^[a-z]{3}$/.test(id)) {
    return json(res, 400, {
      error: 'Identifiant de constellation invalide.',
      detail: 'Trois lettres minuscules attendues, par exemple ori ou uma.',
    });
  }

  let track;
  try { track = sanitizeTrack(body.track, id); } catch (e) {
    return json(res, 400, { error: e.message });
  }

  const path = `content/${id}/cues.json`;

  try {
    const sha = await currentSha(repo, branch, token, path);
    const payload = {
      message: `player: ${track.cues.length} repère${track.cues.length > 1 ? 's' : ''} pour ${id}`,
      branch,
      content: Buffer.from(`${JSON.stringify(track, null, 1)}\n`, 'utf8').toString('base64'),
    };
    if (sha) payload.sha = sha;

    const r = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
      method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw Object.assign(new Error(`Écriture GitHub : ${r.status}`),
        { detail: (await r.text().catch(() => '')).slice(0, 300) });
    }
    const result = await r.json();

    return json(res, 200, {
      message: `${track.cues.length} repère${track.cues.length > 1 ? 's' : ''} enregistré${track.cues.length > 1 ? 's' : ''} dans ${path}.`,
      path,
      updatedAt: track.updatedAt,
      count: track.cues.length,
      created: !sha,
      commit: result.commit?.sha ?? null,
      commitUrl: result.commit?.html_url ?? null,
      track,
    });
  } catch (e) {
    return json(res, 502, {
      error: "L'écriture dans le dépôt a échoué.",
      detail: [e.message, e.detail].filter(Boolean).join(' — '),
    });
  }
}
