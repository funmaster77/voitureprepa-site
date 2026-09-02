// /api/reply-contact.js
// v29 — Envoie par email la réponse de l'administrateur à l'auteur d'un message
// de contact, et lui fournit un lien pour poursuivre la conversation.
//
// POURQUOI UN LIEN PLUTÔT QU'UNE SIMPLE RÉPONSE PAR EMAIL :
//   Une réponse envoyée directement depuis la boîte email de l'administrateur
//   n'atterrit nulle part dans le site : l'échange se poursuit hors de l'outil
//   et l'historique est perdu. Le lien à jeton ouvre une page où le visiteur
//   répond sans avoir besoin d'un compte, et sa réponse revient dans l'onglet
//   « Messages » de l'administration.
//
// Variables d'environnement requises côté Vercel :
//   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SITE_URL

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey      = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "contact@voitureprepa.fr";
  const senderName  = process.env.BREVO_SENDER_NAME  || "VoiturePrepa";
  const siteUrl     = (process.env.SITE_URL || "https://voitureprepa.fr").replace(/\/+$/, "");

  if (!apiKey) {
    console.error("[reply-contact] BREVO_API_KEY manquante");
    return res.status(500).json({ error: "Brevo non configuré" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const to      = String(body.to || "").toLowerCase().trim();
  const nom     = String(body.nom || "").trim();
  const sujet   = String(body.sujet || "votre message").trim();
  const reponse = String(body.reponse || "").trim();
  const token   = String(body.token || "").trim();
  const original = String(body.message_original || "").trim();

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: "Adresse destinataire invalide" });
  }
  if (!reponse) return res.status(400).json({ error: "Réponse vide" });

  const lienReponse = token ? `${siteUrl}/repondre.html?t=${encodeURIComponent(token)}` : null;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Réponse de VoiturePrepa</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">

        <tr><td align="center" style="padding:24px 24px 12px;border-bottom:1px solid #e2e8f0;">
          <img src="${siteUrl}/assets/img/logo.png" alt="VoiturePrepa.fr" width="240" style="display:block;max-width:240px;height:auto;border:0;">
        </td></tr>

        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#0f172a;">Réponse de l'équipe VoiturePrepa</h1>
          <p style="margin:0 0 6px;font-size:15px;color:#334155;">Bonjour${nom ? " " + escapeHtml(nom) : ""},</p>
          <p style="margin:0 0 18px;font-size:15px;color:#334155;">
            Voici notre réponse concernant <strong>${escapeHtml(sujet)}</strong>&nbsp;:
          </p>

          <div style="background:#f8fafc;border-left:4px solid #2a3bd0;padding:14px 16px;border-radius:6px;margin:0 0 22px;">
            <div style="font-size:15px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${escapeHtml(reponse)}</div>
          </div>
        </td></tr>

        ${lienReponse ? `
        <tr><td align="center" style="padding:0 32px 24px;">
          <a href="${lienReponse}" style="display:inline-block;padding:14px 32px;background:#2a3bd0;color:#fff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;">
            Répondre à ce message
          </a>
          <p style="margin:12px 0 0;font-size:12.5px;color:#64748b;line-height:1.5;">
            Ce lien vous permet de poursuivre la conversation directement sur le site,
            sans avoir besoin d'un compte. Ne le transmettez à personne.
          </p>
        </td></tr>` : ""}

        ${original ? `
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Votre message initial</p>
          <div style="font-size:13.5px;color:#64748b;line-height:1.55;white-space:pre-wrap;border-left:2px solid #e2e8f0;padding-left:12px;">${escapeHtml(original.slice(0, 800))}</div>
        </td></tr>` : ""}

        <tr><td align="center" style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 6px;font-size:12px;color:#64748b;line-height:1.5;">
            <strong style="color:#0f172a;">VoiturePrepa.fr</strong> — La référence des voitures préparées
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            <a href="${siteUrl}" style="color:#2a3bd0;text-decoration:none;">voitureprepa.fr</a> ·
            <a href="${siteUrl}/mentions.html" style="color:#2a3bd0;text-decoration:none;">Mentions légales</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender:  { name: senderName, email: senderEmail },
        to:      [{ email: to, name: nom || to }],
        replyTo: { name: senderName, email: senderEmail },
        subject: "Réponse VoiturePrepa — " + sujet,
        htmlContent: html
      })
    });
    const txt = await r.text();
    if (r.status < 200 || r.status >= 300) {
      console.warn("[reply-contact] Brevo HTTP", r.status, txt.slice(0, 300));
      return res.status(502).json({ error: "Brevo error", status: r.status, detail: txt.slice(0, 400) });
    }
  } catch (e) {
    console.error("[reply-contact] fetch", e);
    return res.status(502).json({ error: "Brevo injoignable", detail: String(e) });
  }

  console.log("[reply-contact] envoyé à", to);
  return res.status(200).json({ ok: true });
};
