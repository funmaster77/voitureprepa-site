// Schémas Zod réutilisables pour valider les payloads.

import { z } from 'zod';

export const emailSchema = z.string().email().trim().toLowerCase().max(190);

export const passwordSchema = z.string()
  .min(8, '8 caractères minimum')
  .max(200)
  .refine(s => /[A-Z]/.test(s), 'au moins une majuscule')
  .refine(s => /[0-9]/.test(s), 'au moins un chiffre');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['particulier', 'pro']).default('particulier'),
  pro_pack: z.enum(['gratuit', 'premium', 'performance']).optional(),
  prenom: z.string().trim().min(1).max(100).optional(),
  nom: z.string().trim().min(1).max(100).optional(),
  raison_sociale: z.string().trim().min(1).max(200).optional(),
  telephone: z.string().trim().regex(/^[\d\s+().-]{6,20}$/, 'téléphone invalide').optional(),
  siret: z.string().trim().regex(/^\d{14}$/).optional(),
  cgu_version: z.string().max(20).default('1.0'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  twofa_code: z.string().regex(/^\d{6}$/).optional(),
});

// Récupération de mot de passe : on ne contrôle pas l'existence du compte ici
// (anti-énumération) — le service répond toujours 200.
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// Réinitialisation : token + nouveau mot de passe (la robustesse est revérifiée
// côté route via passwordIsStrong en plus du schéma).
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: passwordSchema,
});

export const adCreateSchema = z.object({
  type: z.enum(['voiture', 'piece']),
  titre: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional().default(''),
  prix: z.number().int().nonnegative(),
  marque: z.string().trim().max(100).optional(),
  modele: z.string().trim().max(100).optional(),
  annee: z.number().int().gte(1900).lte(2100).optional(),
  km: z.number().int().nonnegative().optional(),
  carburant: z.string().max(50).optional(),
  boite: z.string().max(50).optional(),
  couleur: z.string().max(50).optional(),
  categorie: z.string().max(100).optional(),
  etat: z.string().max(100).optional(),
  stage: z.string().max(50).optional(),
  puissance_origine: z.number().int().nonnegative().nullable().optional(),
  puissance_actuelle: z.number().int().nonnegative().nullable().optional(),
  couple_origine: z.number().int().nonnegative().nullable().optional(),
  couple_actuel: z.number().int().nonnegative().nullable().optional(),
  pieces_perf: z.array(z.string()).optional(),
  cat_piece: z.string().max(100).optional(),
  sous_piece: z.string().max(100).optional(),
  ville: z.string().max(100).optional(),
  departement: z.string().max(10).optional(),
  vente_en_ligne: z.boolean().optional().default(false),
});

export const adUpdateSchema = adCreateSchema.partial();

export const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const settingsUpdateSchema = z.record(
  z.string().regex(/^[a-z_]+$/),
  z.number().nonnegative()
);
