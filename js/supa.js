/* ============================================================
   Client Supabase partagé par toutes les pages qui en ont besoin
   (inscription, connexion, mot de passe, et plus tard le portail et
   l'outil de gestion des membres).

   Un seul fichier, importé partout via <script type="module"> — déjà
   le mécanisme utilisé par player.html, donc rien de nouveau à
   apprendre au reste du projet.
   ============================================================ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* À remplacer par les deux valeurs de ton projet Supabase (voir
   supabase/README.md, étape 2). Ni l'une ni l'autre n'est un secret :
   elles sont faites pour vivre dans du code côté navigateur, la
   sécurité vient des règles RLS côté base, pas du secret de la clé. */
export const SUPABASE_URL = 'https://buxafiplrvdwnqyyufzc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eGFmaXBscnZkd25xeXl1ZnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDAxOTMsImV4cCI6MjEwNDAxNjE5M30.Q5wIVKqJWbniUBZgoaP-ndk6ROqpbnCR98SQ-3CeGZQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Session en cours, ou null si personne n'est connecté. */
export async function getSession(){
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/** Ligne de la table profiles pour cet utilisateur (nom, rôle...). */
export async function getProfile(userId){
  if(!userId) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if(error){ console.warn('[ekko] profil introuvable :', error.message); return null; }
  return data;
}

/** À appeler en haut des pages réservées aux membres connectés :
    renvoie la session, ou renvoie vers le portail si personne n'est
    connecté. */
export async function requireAuth(){
  const session = await getSession();
  if(!session){ location.href = '/'; return null; }
  return session;
}

/** Même chose, mais réservé aux admins (outils, gestion des membres). */
export async function requireAdmin(){
  const session = await requireAuth();
  if(!session) return null;
  const profile = await getProfile(session.user.id);
  if(!profile || profile.role !== 'admin'){ location.href = '/'; return null; }
  return { session, profile };
}

/** Déconnexion : coupe la session et ramène au portail (logo + les deux
    boutons "Démarrer l'aventure" / "Connexion"). */
export async function signOut(){
  try{ await supabase.auth.signOut(); }catch(e){}
  location.href = '/';
}

/** Message d'erreur Supabase traduit dans les grandes lignes. La liste
    n'a pas besoin d'être exhaustive : les cas non couverts retombent
    sur le message d'origine, en anglais mais toujours comprehensible. */
export function friendlyAuthError(error){
  const msg = error?.message || '';
  if(/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if(/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet email.';
  if(/Password should be at least/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if(/Unable to validate email address/i.test(msg)) return 'Adresse email invalide.';
  if(/rate limit/i.test(msg)) return 'Trop de tentatives — réessaie dans quelques minutes.';
  return msg || 'Une erreur est survenue.';
}

/** Fait l'appel authentifie vers une fonction serverless (api/*.js),
    avec le jeton de la session en cours en en-tete — c'est lui qui
    permet a la fonction de verifier cote serveur que l'appelant est
    bien admin. */
export async function callAdminApi(path, payload){
  const session = await getSession();
  if(!session) return { error: 'Non connecté.' };
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(payload || {}),
  });
  let data = {};
  try{ data = await res.json(); }catch(e){}
  if(!res.ok) return { error: data.error || ('Erreur ' + res.status) };
  return data;
}

/** Suivi du temps passe sur l'app : un signal toutes les ~30s tant que
    l'onglet est visible, additionne cote base (voir la fonction SQL
    heartbeat()). Rien n'est envoye pendant que l'onglet est en arriere-
    plan — ce n'est pas une mesure a la seconde, mais elle ne compte pas
    non plus le temps ou l'appli est juste restee ouverte sans etre
    regardee. À appeler une fois par page, apres avoir confirme la
    session (voir index.html). */
export function startHeartbeat(intervalMs){
  const period = intervalMs || 30000;
  let last = Date.now();
  async function ping(){
    if(document.hidden) return;
    const elapsed = Math.round((Date.now() - last) / 1000);
    last = Date.now();
    try{ await supabase.rpc('heartbeat', { seconds_elapsed: elapsed }); }catch(e){}
  }
  const timer = setInterval(ping, period);
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) last = Date.now(); // ne compte pas le temps cache
  });
  addEventListener('beforeunload', ping);
  return function stop(){ clearInterval(timer); };
}
