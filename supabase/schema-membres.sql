-- =====================================================================
-- Ekko of Beyond — ajouts pour la gestion des membres
-- =====================================================================
-- A executer dans Supabase (SQL Editor > New query), en plus du schema.sql
-- deja en place. Peut etre relance sans risque (if not exists partout).
--
-- Ce que ça ajoute :
--   1. Deux colonnes sur profiles pour le temps passe et la derniere
--      activite (voir heartbeat() plus bas).
--   2. La fonction heartbeat(), appelee regulierement par le navigateur
--      de chaque membre pendant qu'il utilise l'app.
--   3. Une regle RLS pour que les admins puissent lire (mais pas
--      modifier) la collection de n'importe quel membre — necessaire
--      pour afficher "nb d'Ekko collectes" dans l'outil de gestion.
-- =====================================================================

alter table public.profiles add column if not exists total_seconds integer not null default 0;
alter table public.profiles add column if not exists last_seen_at timestamptz;

comment on column public.profiles.total_seconds is
  'Temps cumule passe sur l''app, en secondes. Incremente par petits pas via heartbeat() — pas une mesure exacte a la seconde, mais fiable a la minute pres.';
comment on column public.profiles.last_seen_at is
  'Dernier heartbeat recu : une mesure de derniere activite reelle, pas seulement de derniere connexion (qui ne bouge pas si quelqu''un reste ouvert sans se reconnecter).';

-- Chaque page authentifiee appelle ceci toutes les ~30s (voir
-- js/supa.js, startHeartbeat) tant qu'elle est visible. security invoker
-- (pas definer) : la fonction agit avec les droits de l'appelant, donc
-- la clause where limite deja tout a sa propre ligne — pas besoin de
-- contourner RLS ici.
create or replace function public.heartbeat(seconds_elapsed integer)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set total_seconds = total_seconds + greatest(0, least(seconds_elapsed, 120)),
      last_seen_at = now()
  where id = auth.uid();
$$;

-- Un admin peut lire la collection de n'importe qui (pour les
-- statistiques), jamais la modifier depuis cet outil.
drop policy if exists "user_ekko_admin_read" on public.user_ekko;
create policy "user_ekko_admin_read" on public.user_ekko
  for select using (public.is_admin());
