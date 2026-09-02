/**
 * api/save-view.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Écrit `data/player-view.json` dans le dépôt via l'API Contents de GitHub.
 * Vercel redéploie derrière : les réglages validés dans le banc d'essai
 * deviennent littéralement le code du projet.
 *
 * Endpoint séparé de `api/save.js` à dessein : celui-là fonctionne, autant
 * ne pas y toucher. Mêmes variables d'environnement, même en-tête `x-ekko-key`,
 * même convention de sonde GET — donc rien de plus à configurer.
 *
 * Deux scopes :
 *   POST { scope: 'common', values: {...} }
 *   POST { scope: 'figure', id: 'Ori', values: { rotation, padding } }
 *
 * Chaque appel est une lecture-fusion-écriture côté serveur : enregistrer une
 * figure ne peut pas écraser les réglages communs, ni l'inverse.
 */

import {
  sanitize,
  emptySettings,
  COMMON_KEYS,
  FIGURE_KEYS,
  PARAMS,
} from '../js/view-settings.js';

const FILE_PATH = 'data/player-view.json';
const GH = 'https://api.github.com';

const json = (res, code, body) => res.status(code).json(body);

/* ------------------------------------------------------------ GitHub I/O */

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ekko-of-beyond',
    'Content-Type': 'application/json',
  };
}

async function readFile(repo, branch, token) {
  const url = `${GH}/repos/${repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });

  if (r.status === 404) return { sha: null, content: null };
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw Object.assign(new Error(`Lecture GitHub : ${r.status}`), { detail: detail.slice(0, 300) });
  }

  const meta = await r.json();
  const text = Buffer.from(meta.content ?? '', 'base64').toString('utf8');
  let content = null;
  try { content = JSON.parse(text); } catch { /* fichier corrompu : on repart de zéro */ }
  return { sha: meta.sha, content };
}

async function writeFile(repo, branch, token, sha, settings, message) {
  const body = {
    message,
    branch,
    content: Buffer.from(`${JSON.stringify(settings, null, 1)}\n`, 'utf8').toString('base64'),
  };
  if (sha) body.sha = sha;

  const r = await fetch(`${GH}/repos/${repo}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw Object.assign(new Error(`Écriture GitHub : ${r.status}`), { detail: detail.slice(0, 300) });
  }
  return r.json();
}

/* ------------------------------------------------------------ formatting */

function describe(values) {
  return Object.entries(values)
    .map(([k, v]) => {
      const p = PARAMS[k];
      if (!p) return `${k} ${v}`;
      const shown = p.type === 'enum' ? (p.labels?.[v] ?? v) : v;
      return `${p.label.toLowerCase()} ${shown}${p.unit ?? ''}`;
    })
    .join(', ');
}

/* -------------------------------------------------------------- handler */

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

  // Sonde de configuration. Ne renvoie aucun secret, juste les noms manquants.
  if (req.method === 'GET') {
    return json(res, 200, {
      route: 'ok',
      configured: missing.length === 0,
      missing,
      repo: repo || null,
      branch,
      path: FILE_PATH,
      keys: { common: COMMON_KEYS, figure: FIGURE_KEYS },
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
  if (!given) {
    return json(res, 401, { error: "Clé d'administration absente : saisissez-la dans le panneau." });
  }
  if (given !== adminKey) {
    return json(res, 401, { error: "Clé d'administration incorrecte." });
  }

  /* ------------------------------------------------------ corps de requête */

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { error: 'Corps de requête illisible : JSON attendu.' });
  }

  const { scope, id } = body;
  if (scope !== 'common' && scope !== 'figure') {
    return json(res, 400, { error: "Le champ `scope` doit valoir 'common' ou 'figure'." });
  }

  if (scope === 'figure' && !/^[A-Za-z]{3}$/.test(String(id ?? ''))) {
    return json(res, 400, {
      error: 'Identifiant de figure invalide.',
      detail: 'Un code IAU de trois lettres est attendu, par exemple Ori ou UMa.',
    });
  }

  const { values, rejected } = sanitize(scope, body.values);
  if (Object.keys(values).length === 0) {
    return json(res, 400, {
      error: 'Aucune valeur exploitable.',
      detail: rejected.length
        ? `Clés refusées : ${rejected.join(', ')}.`
        : `Clés attendues : ${(scope === 'common' ? COMMON_KEYS : FIGURE_KEYS).join(', ')}.`,
    });
  }

  /* ------------------------------------------------ lecture, fusion, écriture */

  try {
    const { sha, content } = await readFile(repo, branch, token);
    const settings = content && typeof content === 'object' ? content : emptySettings();

    settings.$schema ??= 'ekko-player-view/1';
    settings.common ??= {};
    settings.figures ??= {};

    if (scope === 'common') {
      Object.assign(settings.common, values);
    } else {
      settings.figures[id] = { ...(settings.figures[id] ?? {}), ...values };
    }

    settings.updatedAt = new Date().toISOString();

    const message = scope === 'common'
      ? `player: réglages communs (${describe(values)})`
      : `player: vue ${id} (${describe(values)})`;

    const result = await writeFile(repo, branch, token, sha, settings, message);

    return json(res, 200, {
      message: scope === 'common'
        ? 'Réglages communs enregistrés dans le dépôt.'
        : `Réglages de ${id} enregistrés dans le dépôt.`,
      updatedAt: settings.updatedAt,
      commit: result.commit?.sha ?? null,
      commitUrl: result.commit?.html_url ?? null,
      created: !sha,
      rejected,
    });
  } catch (e) {
    return json(res, 502, {
      error: "L'écriture dans le dépôt a échoué.",
      detail: [e.message, e.detail].filter(Boolean).join(' — '),
    });
  }
}
