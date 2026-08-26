-- =====================================================================
-- Migration v29 : colonnes turbo sur la table ads
-- Cascade "Type de turbo" → "Marque" → "Modèle" au dépôt d'annonce voiture
-- À exécuter dans Supabase Studio → SQL Editor (comme pour `poids`)
-- =====================================================================

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS turbo_type   TEXT,
  ADD COLUMN IF NOT EXISTS turbo_marque TEXT,
  ADD COLUMN IF NOT EXISTS turbo_modele TEXT;

COMMENT ON COLUMN public.ads.turbo_type   IS 'Catégorie de turbo : TURBOS PERFORMANCE ou TURBOS HYBRIDES';
COMMENT ON COLUMN public.ads.turbo_marque IS 'Marque du turbo (ex : Garrett GT / GTX / G-Series, TTE, LOBA...)';
COMMENT ON COLUMN public.ads.turbo_modele IS 'Modèle du turbo (ex : GTX3076R, TTE480, LO500...)';
