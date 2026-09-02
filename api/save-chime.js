/**
 * api/save-chime.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Téléverse un carillon dans `assets/audio/chimes/` et liste ceux déjà
 * présents. Les carillons sont globaux, pas propres à une constellation :
 * on en essaie plusieurs, on en garde un.
 *
 * Mêmes variables d'environnement et même en-tête `x-ekko-key` que les
 * autres fonctions.
 *
 *   GET                        → état de configuration + liste des carillons
 *   POST { name, base64 }      → écrit le fichier, renvoie son chemin
 *   POST { name, delete: true } → supprime le fichier
 *
 * Un carillon est un son de moins d'une seconde : la limite de 512 Ko est
 * large, et elle évite qu'une piste entière parte ici par erreur.
 */

const GH = 'https://api.github.com';
const DIR = 'assets/audio/chimes';
const MAX_BYTES = 512 * 1024;
const EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];

const json = (res, code, body) => res.status(code).json(body);

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ekko-of-beyond',
  'Content-Type': 'application/json',
});

/** Nom de fichier sûr : minuscules, tirets, extension connue. */
function safeName(raw) {
  const input = String(raw ?? '').trim();
  const dot = input.lastIndexOf('.');
  if (dot < 1) return null;

  const ext = input.slice(dot + 1).toLowerCase();
  if (!EXTENSIONS.includes(ext)) return null;

  const base = input.slice(0, dot)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return base ? `${base}.${ext}` : null;
}

async function listChimes(repo, branch, token) {
  const r = await fetch(`${GH}/repos/${repo}/contents/${DIR}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Listage GitHub : ${r.status}`);
  const items = await r.json();
  if (!Array.isArray(items)) return [];
  return items
    .filter((f) => f.type === 'file' && EXTENSIONS.includes(f.name.split('.').pop().toLowerCase()))
    .map((f) => ({ name: f.name, path: f.path, size: f.size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function currentSha(repo, branch, token, path) {
  const r = await fetch(`${GH}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Lecture GitHub : ${r.status}`);
  return (await r.json()).sha;
}

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
    const base = {
      route: 'ok',
      configured: missing.length === 0,
      missing,
      repo: repo || null,
      branch,
      dir: DIR,
      maxBytes: MAX_BYTES,
      extensions: EXTENSIONS,
    };
    if (missing.length) return json(res, 200, { ...base, chimes: [] });
    try {
      return json(res, 200, { ...base, chimes: await listChimes(repo, branch, token) });
    } catch (e) {
      return json(res, 200, { ...base, chimes: [], listError: e.message });
    }
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

  const name = safeName(body.name);
  if (!name) {
    return json(res, 400, {
      error: 'Nom de fichier invalide.',
      detail: `Extensions acceptées : ${EXTENSIONS.join(', ')}.`,
    });
  }
  const path = `${DIR}/${name}`;

  try {
    /* ------------------------------------------------------- suppression */
    if (body.delete === true) {
      const sha = await currentSha(repo, branch, token, path);
      if (!sha) return json(res, 404, { error: `${path} est absent du dépôt.` });
      const r = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
        method: 'DELETE',
        headers: ghHeaders(token),
        body: JSON.stringify({ message: `player: retire le carillon ${name}`, branch, sha }),
      });
      if (!r.ok) throw new Error(`Suppression GitHub : ${r.status}`);
      const result = await r.json();
      return json(res, 200, {
        message: `${name} supprimé.`,
        path,
        chimes: await listChimes(repo, branch, token),
        commit: result.commit?.sha ?? null,
        commitUrl: result.commit?.html_url ?? null,
      });
    }

    /* -------------------------------------------------------- écriture */
    const base64 = String(body.base64 ?? '').replace(/^data:[^,]*,/, '');
    if (!base64) return json(res, 400, { error: 'Aucun contenu à écrire.' });

    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0) return json(res, 400, { error: 'Contenu illisible : base64 invalide.' });
    if (bytes.length > MAX_BYTES) {
      return json(res, 413, {
        error: 'Fichier trop lourd pour un carillon.',
        detail: `${Math.round(bytes.length / 1024)} Ko reçus, ${Math.round(MAX_BYTES / 1024)} Ko maximum.`,
      });
    }

    const sha = await currentSha(repo, branch, token, path);
    const payload = {
      message: `player: ${sha ? 'remplace' : 'ajoute'} le carillon ${name}`,
      branch,
      content: bytes.toString('base64'),
    };
    if (sha) payload.sha = sha;

    const r = await fetch(`${GH}/repos/${repo}/contents/${path}`, {
      method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw new Error(`Écriture GitHub : ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    }
    const result = await r.json();

    return json(res, 200, {
      message: `${name} ${sha ? 'remplacé' : 'ajouté'} (${Math.round(bytes.length / 1024)} Ko).`,
      path,
      name,
      bytes: bytes.length,
      created: !sha,
      chimes: await listChimes(repo, branch, token),
      commit: result.commit?.sha ?? null,
      commitUrl: result.commit?.html_url ?? null,
    });
  } catch (e) {
    return json(res, 502, { error: "L'opération sur le dépôt a échoué.", detail: e.message });
  }
}
