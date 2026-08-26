-- =====================================================================
-- Migration : compteurs vues/favoris globaux (Supabase)
-- Version : v29
-- Contexte : les compteurs étaient stockés en localStorage → chaque
--            navigateur avait son propre compteur, résultat incohérent
--            entre appareils. On centralise sur les colonnes ads.vues
--            et ads.favoris + une RPC atomique pour l'incrément.
-- À appliquer dans Supabase Studio → SQL Editor
-- =====================================================================

-- 1) S'assurer que les colonnes existent (déjà utilisées par le code)
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS vues     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favoris  INTEGER NOT NULL DEFAULT 0;

-- 2) Fonction RPC atomique pour incrémenter les vues.
--    SECURITY DEFINER = s'exécute avec les droits du propriétaire de la
--    fonction (bypass RLS SELECT ne concernant que l'annonce visible).
--    Rate limit léger géré côté client (throttle par session localStorage).
CREATE OR REPLACE FUNCTION public.increment_ad_view(target_ad_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On incrémente uniquement si l'annonce est publiée / approuvée et non supprimée
  UPDATE public.ads
     SET vues = COALESCE(vues, 0) + 1
   WHERE id = target_ad_id
     AND deleted_by_owner = false
     AND status = ANY(ARRAY['published','approved','sold']);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ad_view(BIGINT) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_ad_view(BIGINT) TO anon, authenticated;

-- 3) Fonction RPC atomique pour les favoris (delta = +1 ou -1)
CREATE OR REPLACE FUNCTION public.adjust_ad_favoris(target_ad_id BIGINT, delta INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF delta NOT IN (1, -1) THEN
    RAISE EXCEPTION 'delta doit valoir 1 ou -1';
  END IF;
  UPDATE public.ads
     SET favoris = GREATEST(0, COALESCE(favoris, 0) + delta)
   WHERE id = target_ad_id
     AND deleted_by_owner = false;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_ad_favoris(BIGINT, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_ad_favoris(BIGINT, INTEGER) TO anon, authenticated;

-- =====================================================================
-- APRÈS APPLICATION :
--   1) Vérifier dans Supabase Studio → Database → Functions que les
--      2 fonctions sont bien listées.
--   2) Vider le localStorage du navigateur (F12 → Application →
--      Local Storage → clic droit "Clear") pour repartir sur les
--      compteurs base plutôt que sur les vieilles vues locales.
--   3) Les compteurs actuellement affichés (base + localStorage) vont
--      basculer sur la seule valeur base — donc plus bas d'un coup,
--      puis remonter en temps réel avec les vraies visites.
-- =====================================================================
