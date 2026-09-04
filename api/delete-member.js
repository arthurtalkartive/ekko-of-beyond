/**
 * Ekko of Beyond — supprime un membre depuis l'outil de gestion.
 *
 * Mêmes variables d'environnement que api/create-member.js. La
 * suppression du compte auth entraîne automatiquement celle de son
 * profil, de sa collection et de ses rappels (clés étrangères en
 * "on delete cascade" dans le schéma).
 */

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function json(res, code, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(code).json(body);
}

async function verifyAdmin(SUPABASE_URL, ANON_KEY, accessToken) {
  if (!accessToken) return null;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    { headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON_KEY } },
  );
  if (!profRes.ok) return null;
  const profs = await profRes.json();
  if (!profs[0] || profs[0].role !== 'admin') return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const SUPABASE_URL = env('SUPABASE_URL');
  const ANON_KEY = env('SUPABASE_ANON_KEY');
  const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !ANON_KEY && 'SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (req.method === 'GET') {
    return json(res, 200, { route: 'ok', configured: missing.length === 0, missing });
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Méthode non autorisée : utilisez GET ou POST.' });
  }
  if (missing.length) {
    return json(res, 503, {
      error: 'Suppression non configurée sur ce déploiement.',
      detail: 'Définissez ces variables dans Vercel (Settings → Environment Variables), puis redéployez.',
      missing,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || body.accessToken;

  const admin = await verifyAdmin(SUPABASE_URL, ANON_KEY, accessToken);
  if (!admin) return json(res, 403, { error: 'Réservé aux admins.' });

  const targetId = String(body.id || '').trim();
  if (!targetId) return json(res, 400, { error: 'Identifiant manquant.' });
  if (targetId === admin.id) {
    return json(res, 400, { error: 'Impossible de te supprimer toi-même depuis cet outil.' });
  }

  try {
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!delRes.ok) {
      const j = await delRes.json().catch(() => ({}));
      return json(res, delRes.status, { error: j.msg || 'Échec de la suppression.' });
    }
    return json(res, 200, { ok: true, id: targetId, message: 'Membre supprimé.' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
