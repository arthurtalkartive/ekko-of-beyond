/**
 * Ekko of Beyond — invite un nouveau membre depuis l'outil de gestion.
 *
 * Fonction serverless Vercel. Utilise la clé service_role de Supabase
 * (jamais envoyée au navigateur) pour créer le compte côté serveur, après
 * avoir vérifié que l'appelant est bien un admin.
 *
 * Variables d'environnement à définir dans Vercel :
 *   SUPABASE_URL               URL du projet (https://xxxx.supabase.co)
 *   SUPABASE_ANON_KEY          clé publique (déjà utilisée par le site)
 *   SUPABASE_SERVICE_ROLE_KEY  clé secrète — Project Settings → API →
 *                              service_role. Ne JAMAIS la mettre dans du
 *                              code envoyé au navigateur.
 */

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function json(res, code, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(code).json(body);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Verifie le jeton fourni par le navigateur et confirme que son
   profil a bien le role admin. Utilise le jeton de l'appelant lui-meme
   pour cette lecture (RLS l'autorise deja a lire sa propre ligne) —
   pas besoin de la cle service_role pour cette seule verification. */
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
      error: 'Invitation non configurée sur ce déploiement.',
      detail: 'Définissez ces variables dans Vercel (Settings → Environment Variables), puis redéployez.',
      missing,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || body.accessToken;

  const admin = await verifyAdmin(SUPABASE_URL, ANON_KEY, accessToken);
  if (!admin) return json(res, 403, { error: 'Réservé aux admins.' });

  const email = String(body.email || '').trim().toLowerCase();
  const first_name = String(body.first_name || '').trim();
  const last_name = String(body.last_name || '').trim();
  const role = body.role === 'admin' ? 'admin' : 'member';

  if (!EMAIL_RE.test(email)) {
    return json(res, 400, { error: 'Adresse email invalide.' });
  }

  try {
    /* Cree le compte ET envoie l'email d'invitation (lien pour choisir
       son mot de passe) en une seule etape — c'est l'API prevue par
       Supabase pour exactement ce cas : un admin ajoute quelqu'un sans
       lui imposer de mot de passe initial. */
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, data: { first_name, last_name } }),
    });
    const inviteJson = await inviteRes.json().catch(() => ({}));
    if (!inviteRes.ok) {
      const msg = inviteJson.msg || inviteJson.error_description || inviteJson.error || 'Échec de l\'invitation.';
      return json(res, inviteRes.status, { error: msg });
    }
    const newUserId = inviteJson.id;

    /* Le profil se cree tout seul en "member" via le declencheur SQL
       (handle_new_user) : on ne le repasse en admin qu'ici, apres coup,
       si c'etait demande a la creation. Un echec a cette etape n'est
       pas bloquant : le compte existe, on pourra toujours changer son
       role depuis la liste. */
    if (role === 'admin' && newUserId) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${newUserId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ role: 'admin' }),
      }).catch(() => {});
    }

    return json(res, 200, {
      ok: true, id: newUserId, email,
      message: `Invitation envoyée à ${email}.`,
    });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
