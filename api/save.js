/**
 * Ekko of Beyond — écriture dans le dépôt depuis l'outil de vérification.
 *
 * Fonction serverless Vercel. Elle commite directement sur GitHub via
 * l'API Contents : l'angle validé ou l'illustration validée deviennent
 * donc le code du projet, et Vercel redéploie tout seul derrière.
 *
 * Variables d'environnement à définir dans Vercel :
 *   GITHUB_TOKEN     jeton fin avec « Contents: read and write » sur le dépôt
 *   GITHUB_REPO      « compte/nom-du-depot »
 *   GITHUB_BRANCH    « main » par défaut
 *   EKKO_ADMIN_KEY   mot de passe demandé par l'outil de vérification
 */

const GH = 'https://api.github.com';

/* Reponse JSON, toujours sans cache. */
function json(res, code, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(code).json(body);
}

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

async function gh(path, options = {}) {
  const repo = env('GITHUB_REPO');
  const token = env('GITHUB_TOKEN');
  const url = `${GH}/repos/${repo}/contents/${path}`;
  const res = await fetch(url + (options.query || ''), {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ekko-of-beyond',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* réponse non JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

/* Lit un fichier du dépôt. Renvoie { sha, content } ou null s'il n'existe pas. */
async function readFile(path, branch) {
  const r = await gh(path, { query: `?ref=${encodeURIComponent(branch)}` });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lecture de ${path} : ${r.status} ${r.text.slice(0, 200)}`);
  return { sha: r.json.sha, content: Buffer.from(r.json.content || '', 'base64') };
}

/* Écrit ou remplace un fichier, en fournissant le sha si le fichier existe. */
async function writeFile(path, buffer, message, branch, sha) {
  const body = {
    message,
    content: buffer.toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;
  const r = await gh(path, { method: 'PUT', body });
  if (!r.ok) throw new Error(`écriture de ${path} : ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}

const ANGLES_PATH = 'skyculture/ekko/roll-adjust.json';
const ID_RE = /^[a-z]{3}$/;
const CONTENT_DIR = 'content/';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const adminKey = env('EKKO_ADMIN_KEY');
  const token = env('GITHUB_TOKEN');
  const repo = env('GITHUB_REPO');
  const branch = env('GITHUB_BRANCH', 'main');

  const missing = [
    !token && 'GITHUB_TOKEN',
    !repo && 'GITHUB_REPO',
    !adminKey && 'EKKO_ADMIN_KEY',
  ].filter(Boolean);

  /* GET sert de sonde d'etat : l'outil de verification l'interroge au
     chargement pour savoir s'il peut ecrire, et afficher un diagnostic
     precis au lieu d'un echec muet. Aucun secret n'est renvoye, juste
     les noms des variables absentes. */
  if (req.method === 'GET') {
    return json(res, 200, {
      route: 'ok',
      configured: missing.length === 0,
      missing,
      repo: repo || null,
      branch,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée : utilisez GET ou POST.' });
  }

  if (missing.length) {
    return json(res, 503, {
      error: 'Écriture non configurée sur ce déploiement.',
      detail: 'Définissez ces variables dans Vercel (Settings → Environment Variables), ' +
              'puis redéployez.',
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

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { type, id } = body;

  if (!ID_RE.test(String(id || ''))) {
    return res.status(400).json({ error: 'Identifiant de figure invalide (trois lettres minuscules attendues).' });
  }

  try {
    /* ---------- angle de rotation ---------- */
    if (type === 'angle') {
      const angle = Number(body.angle);
      if (!isFinite(angle) || angle < -360 || angle > 360) {
        return res.status(400).json({ error: 'Angle hors bornes.' });
      }
      const existing = await readFile(ANGLES_PATH, branch);
      let table = {};
      if (existing) {
        try { table = JSON.parse(existing.content.toString('utf8')) || {}; } catch (e) { table = {}; }
      }
      const rounded = Math.round(angle * 10) / 10;
      if (rounded === 0) delete table[id];
      else table[id] = rounded;

      const ordered = {};
      Object.keys(table).sort().forEach((k) => { ordered[k] = table[k]; });
      const out = Buffer.from(JSON.stringify(ordered, null, 1) + '\n', 'utf8');

      await writeFile(
        ANGLES_PATH, out,
        `Angle de ${id} : ${rounded}°`,
        branch, existing ? existing.sha : undefined,
      );
      return res.status(200).json({
        ok: true, id, angle: rounded, table: ordered,
        message: `Angle de ${rounded}° enregistré dans le dépôt. Vercel redéploie, comptez une minute.`,
      });
    }

    /* ---------- contenu editorial d'une fiche ---------- */
    if (type === 'content') {
      const blocks = body.blocks;
      if (!blocks || typeof blocks !== 'object') {
        return json(res, 400, { error: "Contenu attendu sous forme d'objet." });
      }
      /* On refuse un contenu manifestement trop gros : il ne s'agit pas de
         stocker des images en base64 dans un fichier de texte. */
      const out = Buffer.from(JSON.stringify(blocks, null, 1) + '\n', 'utf8');
      if (out.length > 400000) {
        return json(res, 413, {
          error: `Contenu trop volumineux (${Math.round(out.length / 1024)} Ko, 400 Ko maximum).`,
        });
      }
      const path = CONTENT_DIR + id + '.json';
      const existing = await readFile(path, branch);
      await writeFile(path, out, `Fiche ${id}`, branch, existing ? existing.sha : undefined);
      return json(res, 200, {
        ok: true, id, bytes: out.length,
        message: `Fiche enregistrée (${Math.round(out.length / 1024)} Ko). ` +
                 'Vercel redéploie, comptez une minute.',
      });
    }

    /* ---------- illustration ---------- */
    if (type === 'illustration') {
      const data = String(body.dataUrl || '');
      const m = data.match(/^data:image\/(webp|png|jpeg);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'Image attendue en data URL WebP, PNG ou JPEG.' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3_500_000) {
        return res.status(413).json({ error: `Image trop lourde (${Math.round(buf.length / 1024)} Ko, 3,5 Mo maximum).` });
      }
      const path = `skyculture/ekko/illustrations/${id}.webp`;
      const existing = await readFile(path, branch);
      await writeFile(
        path, buf,
        `Illustration de ${id}`,
        branch, existing ? existing.sha : undefined,
      );
      return res.status(200).json({
        ok: true, id, bytes: buf.length,
        message: `Illustration enregistrée (${Math.round(buf.length / 1024)} Ko). ` +
                 'Vercel redéploie, comptez une minute.',
      });
    }

    return res.status(400).json({ error: 'Type inconnu : « angle », « illustration » ou « content » attendu.' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
