// Authentification, hachage, sessions, et middlewares de contrôle d'accès.
// La session est stockée à la fois dans le cookie chiffré (via @fastify/secure-session)
// ET dans la table `sessions` (pour pouvoir invalider sans attendre l'expiration).

import argon2 from 'argon2';
import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run, all } from './db.js';

// ---------- Hachage des mots de passe ----------
// argon2id avec paramètres OWASP. Ne JAMAIS stocker un mot de passe en clair.
export async function hashPassword(plain) {
  return argon2.hash(plain, config.argon2);
}
export async function verifyPassword(hash, plain) {
  try { return await argon2.verify(hash, plain); }
  catch { return false; }
}

// ---------- Politique de mot de passe ----------
// 8+ caractères, au moins une majuscule, au moins un chiffre.
// (Alignée avec validatePassword() de la maquette.)
export function passwordIsStrong(pwd) {
  return typeof pwd === 'string'
    && pwd.length >= 8
    && /[A-Z]/.test(pwd)
    && /[0-9]/.test(pwd);
}

// ---------- Sessions ----------
function nowIso() { return new Date().toISOString(); }
function plusSecondsIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function createSession({ userId, role, twofaOk, ip, userAgent }) {
  const id = crypto.randomUUID();
  const duration = role === 'admin'
    ? config.adminSessionDuration
    : config.sessionDuration;
  run(
    `INSERT INTO sessions (id, user_id, role, twofa_ok, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, role, twofaOk ? 1 : 0, plusSecondsIso(duration), ip || null, userAgent || null]
  );
  return { id, expiresAt: plusSecondsIso(duration) };
}

export function findSession(sessionId) {
  if (!sessionId) return null;
  const row = get(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    return null;
  }
  return row;
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

// Nettoyage périodique des sessions expirées (à appeler au démarrage et toutes les heures)
export function purgeExpiredSessions() {
  const result = run(`DELETE FROM sessions WHERE expires_at <= ?`, [nowIso()]);
  return result.changes;
}

// ---------- Hooks Fastify ----------

// Attache req.user et req.session à la requête. Toujours appelé (preHandler global).
export async function loadSessionHook(req, reply) {
  const sessionId = req.session?.get('sid') || null;
  if (!sessionId) {
    req.session_db = null;
    req.user = null;
    return;
  }
  const sess = findSession(sessionId);
  if (!sess) {
    req.session.set('sid', null);
    req.session_db = null;
    req.user = null;
    return;
  }
  const user = get(`SELECT id, email, role, pro_pack, prenom, nom, raison_sociale,
                           telephone, email_verifie, actif
                    FROM users WHERE id = ? AND actif = 1`, [sess.user_id]);
  req.session_db = sess;
  req.user = user || null;
}

// Exige une session valide
export function requireAuth(req, reply, done) {
  if (!req.user) {
    reply.code(401).send({ error: 'Authentification requise.' });
    return;
  }
  done();
}

// Exige un rôle particulier (ou admin par défaut). Vérifie à CHAQUE requête,
// jamais en se fiant à une valeur côté client.
export function requireRole(role) {
  return (req, reply, done) => {
    if (!req.user) {
      reply.code(401).send({ error: 'Authentification requise.' });
      return;
    }
    if (req.user.role !== role) {
      reply.code(403).send({ error: 'Accès refusé.' });
      return;
    }
    // Sécurité supplémentaire pour l'admin : la 2FA doit être validée
    if (role === 'admin' && !req.session_db?.twofa_ok) {
      reply.code(403).send({ error: 'Double authentification requise.' });
      return;
    }
    done();
  };
}
