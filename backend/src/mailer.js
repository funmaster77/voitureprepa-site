// Envoi d'emails transactionnels (vérification d'adresse, récupération de mot
// de passe). Deux modes :
//   - développement : aucun envoi réel, on logue + on écrit l'HTML dans
//                     data/emails/ pour pouvoir l'ouvrir manuellement.
//   - production    : SMTP via nodemailer, configuré par variables d'env.
// nodemailer est importé dynamiquement pour rester optionnel en dev.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const EMAILS_DIR = path.resolve(config.backendRoot, 'data', 'emails');

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Logger d'email en mode dev : on persiste un fichier HTML horodaté pour
// pouvoir le rejouer dans un navigateur (utile sans accès à un SMTP).
function writeDevEmail({ to, subject, html, text }) {
  fs.mkdirSync(EMAILS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}_${slugify(to)}_${slugify(subject)}.html`;
  const fullPath = path.join(EMAILS_DIR, filename);
  const wrapped = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escape(subject)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:1rem;color:#222}
.meta{background:#f1f1f1;padding:.6rem 1rem;border-radius:6px;font-size:.85rem;margin-bottom:1rem}
.meta b{color:#444}.body{border:1px solid #ddd;padding:1rem;border-radius:6px}</style></head>
<body>
<div class="meta"><b>À :</b> ${escape(to)}<br>
<b>Sujet :</b> ${escape(subject)}<br>
<b>Date :</b> ${new Date().toISOString()}</div>
<div class="body">${html}</div>
${text ? `<hr><pre style="white-space:pre-wrap">${escape(text)}</pre>` : ''}
</body></html>`;
  fs.writeFileSync(fullPath, wrapped, 'utf8');
  return fullPath;
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Cache du transport SMTP, créé à la demande.
let _transport = null;
async function getTransport() {
  if (_transport) return _transport;
  if (!config.smtp.host) return null;
  const mod = await import('nodemailer');
  _transport = mod.default.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
  return _transport;
}

// API publique. Toujours fournir `text` en plus de `html` (clients sans HTML).
export async function sendMail({ to, subject, html, text }) {
  const from = config.smtp.from || 'no-reply@voitureprepa.fr';
  // Mode dev / pas de SMTP configuré : on logue + écrit le fichier.
  if (!config.smtp.host) {
    const file = writeDevEmail({ to, subject, html, text });
    console.log(`[mailer:dev] Email simulé pour ${to} — "${subject}"`);
    console.log(`             ${file}`);
    return { dev: true, file };
  }
  const transport = await getTransport();
  const info = await transport.sendMail({ from, to, subject, html, text });
  return { dev: false, messageId: info.messageId };
}

// Gabarits prêts à l'emploi. Liens absolus construits avec config.appUrl.

export function buildVerifyEmail({ to, prenom, token }) {
  const link = `${config.appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Confirmez votre adresse email — VoiturePrepa.fr';
  const hello = prenom ? `Bonjour ${escape(prenom)},` : 'Bonjour,';
  const html = `
    <p>${hello}</p>
    <p>Merci de votre inscription sur <b>VoiturePrepa.fr</b>. Pour activer votre
    compte, cliquez sur le lien ci-dessous (valable 24 heures) :</p>
    <p><a href="${link}" style="background:#c33;color:#fff;padding:.6rem 1rem;
       border-radius:6px;text-decoration:none">Confirmer mon adresse</a></p>
    <p>Ou copiez-collez ce lien dans votre navigateur :<br>
    <code style="word-break:break-all">${link}</code></p>
    <p>Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement ce
    message — aucun compte ne sera activé sans confirmation.</p>
    <p style="color:#777;font-size:.85rem">L'équipe VoiturePrepa.fr</p>`;
  const text = `${hello}\n\nMerci de votre inscription sur VoiturePrepa.fr.\n` +
    `Pour activer votre compte, ouvrez ce lien dans les 24 heures :\n${link}\n\n` +
    `Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`;
  return { to, subject, html, text };
}

export function buildResetEmail({ to, prenom, token }) {
  const link = `${config.appUrl}/reinitialisation.html?token=${encodeURIComponent(token)}`;
  const subject = 'Réinitialisation de votre mot de passe — VoiturePrepa.fr';
  const hello = prenom ? `Bonjour ${escape(prenom)},` : 'Bonjour,';
  const html = `
    <p>${hello}</p>
    <p>Une demande de réinitialisation de mot de passe a été faite pour votre
    compte sur <b>VoiturePrepa.fr</b>. Si vous êtes à l'origine de cette
    demande, cliquez sur le lien ci-dessous (valable 60 minutes) :</p>
    <p><a href="${link}" style="background:#c33;color:#fff;padding:.6rem 1rem;
       border-radius:6px;text-decoration:none">Réinitialiser mon mot de passe</a></p>
    <p>Ou copiez-collez ce lien :<br>
    <code style="word-break:break-all">${link}</code></p>
    <p><b>Vous n'êtes pas à l'origine de cette demande ?</b> Ignorez ce message :
    votre mot de passe actuel reste valide.</p>
    <p style="color:#777;font-size:.85rem">L'équipe VoiturePrepa.fr</p>`;
  const text = `${hello}\n\nUne réinitialisation de mot de passe a été demandée.\n` +
    `Lien valable 60 minutes :\n${link}\n\nSi ce n'est pas vous, ignorez ce message.`;
  return { to, subject, html, text };
}
