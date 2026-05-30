// Création des données minimales à la première exécution :
//   - un compte administrateur de démonstration (à changer immédiatement)
//   - les paramètres du site avec leurs valeurs par défaut

import { get, run } from './db.js';
import { hashPassword } from './auth.js';

const DEFAULT_SETTINGS = {
  pack_gratuit_prix: 0,        pack_gratuit_max: 3,    pack_gratuit_duree: 3,
  pack_premium_prix: 200,      pack_premium_max: 10,   pack_premium_duree: 6,
  pack_performance_prix: 400,  pack_performance_max: 999, pack_performance_duree: 12,
  particulier_duree: 3,
  email_suggestion_jours: 14,
  email_renouvellement_jours: 14,
  prix_min_voiture_bon: 6000,
  prix_min_voiture_endommage: 2000,
  prix_min_piece: 5,
  prix_photos_plus: 4.99,
  prix_urgence: 5.99,
  prix_remontada_quotidien: 34.99,
  prix_remontada_hebdo_court: 9.99,
  prix_remontada_hebdo_long: 14.99,
  prix_inspection_bronze: 150,
  prix_inspection_argent: 300,
  prix_inspection_or: 500,
};

export async function seedIfEmpty(log) {
  // ---------- Compte admin ----------
  const existing = get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (!existing) {
    const hash = await hashPassword('Admin2026!');
    run(
      `INSERT INTO users (email, password_hash, role, prenom, nom, email_verifie, actif)
       VALUES (?, ?, 'admin', 'Administrateur', 'VoiturePrepa', 1, 1)`,
      ['admin@voitureprepa.fr', hash]
    );
    log.info('  ✓ Compte admin de démo créé : admin@voitureprepa.fr / Admin2026!');
    log.warn('  ⚠ Change ce mot de passe immédiatement en production.');
  }

  // ---------- Paramètres ----------
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const row = get(`SELECT key FROM site_settings WHERE key = ?`, [key]);
    if (!row) {
      run(
        `INSERT INTO site_settings (key, value) VALUES (?, ?)`,
        [key, JSON.stringify(value)]
      );
    }
  }
}
