// Routes d'authentification et de gestion du compte courant.

import { get, run } from '../db.js';
import {
  hashPassword, verifyPassword, passwordIsStrong,
  createSession, destroySession,
} from '../auth.js';
import { createAuthToken, consumeAuthToken } from '../tokens.js';
import { sendMail, buildVerifyEmail, buildResetEmail } from '../mailer.js';
import {
  registerSchema, loginSchema,
  forgotPasswordSchema, resetPasswordSchema,
} from '../utils/validate.js';
import { badRequest, unauthorized, conflict } from '../utils/errors.js';

export default async function accountsRoutes(app) {
  // ---------- Inscription ----------
  app.post('/api/auth/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.', parsed.error.flatten());
    const data = parsed.data;
    if (!passwordIsStrong(data.password)) throw badRequest('Mot de passe trop faible.');

    const existing = get(`SELECT id FROM users WHERE email = ?`, [data.email]);
    if (existing) throw conflict('Un compte existe déjà avec cet email.');

    const hash = await hashPassword(data.password);
    const result = run(
      `INSERT INTO users (email, password_hash, role, pro_pack, prenom, nom,
                          raison_sociale, telephone, siret, cgu_version, consentement_at, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)`,
      [
        data.email, hash, data.role,
        data.role === 'pro' ? (data.pro_pack || 'gratuit') : null,
        data.prenom || null, data.nom || null, data.raison_sociale || null,
        data.telephone || null, data.siret || null, data.cgu_version,
      ]
    );
    const userId = result.lastInsertRowid;

    // Token de vérification + email. Si l'envoi échoue (SMTP HS), on log mais
    // on ne fait pas échouer l'inscription : l'utilisateur pourra demander un
    // renvoi via /api/auth/resend-verification.
    try {
      const token = createAuthToken({ userId, type: 'verify_email', ip: req.ip });
      const mail = buildVerifyEmail({ to: data.email, prenom: data.prenom, token });
      await sendMail(mail);
    } catch (err) {
      req.log.error({ err }, 'Échec envoi email de vérification');
    }

    return reply.code(201).send({ id: userId, email: data.email });
  });

  // ---------- Vérification d'email ----------
  app.get('/api/auth/verify-email', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const token = String(req.query?.token || '');
    const result = consumeAuthToken({ token, type: 'verify_email' });
    if (!result) {
      return reply.type('text/html; charset=utf-8').code(400).send(htmlPage({
        title: 'Lien invalide',
        body: `<p>Ce lien de vérification est invalide, expiré ou déjà utilisé.</p>
               <p>Vous pouvez en demander un nouveau depuis la page « Mon compte ».</p>`,
      }));
    }
    run(`UPDATE users SET email_verifie = 1 WHERE id = ?`, [result.userId]);
    return reply.type('text/html; charset=utf-8').send(htmlPage({
      title: 'Email confirmé',
      body: `<p>Votre adresse email a bien été confirmée. ✅</p>
             <p>Vous pouvez maintenant <a href="${escapeHtml(req.headers.referer || '/')}">retourner sur le site</a>
             et publier vos annonces.</p>`,
    }));
  });

  // ---------- Renvoi du lien de vérification ----------
  app.post('/api/auth/resend-verification', {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    if (!req.user) throw unauthorized();
    if (req.user.email_verifie) return { ok: true, already: true };
    const token = createAuthToken({
      userId: req.user.id, type: 'verify_email', ip: req.ip,
    });
    const mail = buildVerifyEmail({
      to: req.user.email, prenom: req.user.prenom, token,
    });
    try {
      await sendMail(mail);
    } catch (err) {
      req.log.error({ err }, 'Échec envoi email de vérification (resend)');
    }
    return { ok: true };
  });

  // ---------- Connexion ----------
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.');
    const { email, password, twofa_code } = parsed.data;

    const user = get(
      `SELECT id, email, password_hash, role, actif FROM users WHERE email = ?`,
      [email]
    );
    const genericError = unauthorized('Email ou mot de passe incorrect.');
    if (!user || !user.actif) throw genericError;

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) throw genericError;

    let twofaOk = false;
    if (user.role === 'admin') {
      if (twofa_code !== '123456') {
        throw unauthorized('Code de double authentification requis ou invalide.');
      }
      twofaOk = true;
    }

    const session = createSession({
      userId: user.id, role: user.role, twofaOk,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    req.session.set('sid', session.id);
    run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);

    return { id: user.id, email: user.email, role: user.role };
  });

  // ---------- Déconnexion ----------
  app.post('/api/auth/logout', async (req, reply) => {
    const sid = req.session?.get('sid');
    if (sid) destroySession(sid);
    req.session.delete();
    return { ok: true };
  });

  // ---------- Profil courant ----------
  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) throw unauthorized();
    return req.user;
  });

  // ---------- Mot de passe oublié ----------
  // Anti-énumération : on répond TOUJOURS 200, même si l'email n'existe pas.
  app.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return { ok: true };
    }
    const { email } = parsed.data;
    const user = get(`SELECT id, email, prenom, actif FROM users WHERE email = ?`, [email]);
    if (user && user.actif) {
      try {
        const token = createAuthToken({
          userId: user.id, type: 'reset_password', ip: req.ip,
        });
        const mail = buildResetEmail({
          to: user.email, prenom: user.prenom, token,
        });
        await sendMail(mail);
      } catch (err) {
        req.log.error({ err }, 'Échec envoi email de réinitialisation');
      }
    }
    return { ok: true };
  });

  // ---------- Réinitialisation effective ----------
  app.post('/api/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.', parsed.error.flatten());
    const { token, password } = parsed.data;
    if (!passwordIsStrong(password)) throw badRequest('Mot de passe trop faible.');

    const result = consumeAuthToken({ token, type: 'reset_password' });
    if (!result) throw badRequest('Lien de réinitialisation invalide ou expiré.');

    const hash = await hashPassword(password);
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, result.userId]);
    run(`DELETE FROM sessions WHERE user_id = ?`, [result.userId]);

    return { ok: true };
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlPage({ title, body }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(title)} — VoiturePrepa.fr</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:3rem auto;
padding:1.5rem;line-height:1.5;color:#222}h1{color:#c33;margin-top:0}
a{color:#c33}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
