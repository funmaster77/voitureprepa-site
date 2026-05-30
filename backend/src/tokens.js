// Tokens à usage unique pour la vérification d'email et la récupération de mot
// de passe. On ne stocke jamais le token en clair : on garde son hash SHA-256.
// Le token original n'existe que dans l'email envoyé à l'utilisateur.

import crypto from 'node:crypto';
import { get, run } from './db.js';

const VERIFY_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;

function plusIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

// Token cryptographiquement aléatoire, encodé en hex (URL-safe, 64 caractères)
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Crée un token et retourne sa valeur EN CLAIR. À transmettre dans l'email.
export function createAuthToken({ userId, type, ip }) {
  if (type !== 'verify_email' && type !== 'reset_password') {
    throw new Error('Type de token invalide');
  }
  // Invalide les éventuels tokens précédents du même type (un seul actif à la fois)
  run(
    `UPDATE auth_tokens SET used_at = datetime('now')
     WHERE user_id = ? AND type = ? AND used_at IS NULL`,
    [userId, type]
  );
  const ttl = type === 'verify_email'
    ? VERIFY_TTL_HOURS * 3600 * 1000
    : RESET_TTL_MINUTES * 60 * 1000;
  const token = generateToken();
  run(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at, ip)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, hashToken(token), plusIso(ttl), ip || null]
  );
  return token;
}

// Consomme un token (l'invalide définitivement). Retourne la ligne user_id+type si OK.
export function consumeAuthToken({ token, type }) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  const row = get(
    `SELECT id, user_id, type, expires_at, used_at
     FROM auth_tokens WHERE token_hash = ? AND type = ?`,
    [hashToken(token), type]
  );
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;
  run(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`, [row.id]);
  return { userId: row.user_id, type: row.type };
}

// Nettoyage périodique des tokens expirés non utilisés (à appeler chaque heure)
export function purgeExpiredTokens() {
  const result = run(
    `DELETE FROM auth_tokens WHERE expires_at <= datetime('now', '-7 days')`
  );
  return result.changes;
}
