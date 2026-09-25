// /api/annonce-validee.js
// v30 — Prévient un vendeur que son annonce a été validée par la modération
// et qu'elle est désormais visible par les acheteurs.
//
// C'est le moment où le vendeur doit revenir sur le site : son annonce est
// en ligne, il peut la partager et surveiller ses messages. Sans cet email,
// il faut qu'il pense à revenir vérifier de lui-même.
//
// Notification transactionnelle : elle part toujours, elle n'est pas soumise
// aux interrupteurs de campagnes automatiques de l'administration.
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

  if (!apiKey) return res.status(500).json({ error: "Brevo non configuré" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const to     = String(body.to || "").toLowerCase().trim();
  const prenom = String(body.prenom || "").trim();
  const titre  = String(body.titre || "Votre annonce").trim();
  const adId   = String(body.ad_id || "").trim();
  const photo  = String(body.photo || "").trim();
  const prix   = Number(body.prix) || 0;

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: "Adresse destinataire invalide" });
  }

  const lienAnnonce = adId ? (siteUrl + "/annonce.html?id=" + encodeURIComponent(adId)) : siteUrl;
  const lienMesAnnonces = siteUrl + "/profil.html?tab=annonces";
  const subject = "Votre annonce est en ligne : " + titre;

  const prixTxt = prix > 0 ? prix.toLocaleString("fr-FR") + " €" : "";
  const photoHtml = /^https?:\/\//i.test(photo)
    ? `<tr><td style="padding:0 36px 20px;">
         <img src="${escapeHtml(photo)}" alt="" width="488"
              style="display:block;width:100%;max-width:488px;height:auto;border-radius:8px;border:0;">
       </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">

        <tr><td align="center" style="background:#fff;padding:28px 24px 12px;border-bottom:1px solid #e2e8f0;">
          <img src="${siteUrl}/assets/img/logo.png" alt="VoiturePrepa.fr" width="260" style="display:block;max-width:260px;height:auto;border:0;">
        </td></tr>

        <tr><td style="padding:30px 36px 10px;">
          <h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#0f172a;line-height:1.3;">
            Votre annonce est en ligne
          </h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
            Bonjour${prenom ? " " + escapeHtml(prenom) : ""},
          </p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
            Votre annonce <strong>${escapeHtml(titre)}</strong>${prixTxt ? " — " + escapeHtml(prixTxt) : ""}
            vient d'être validée par notre équipe. Elle est désormais visible par
            tous les acheteurs sur VoiturePrepa.fr.
          </p>
        </td></tr>

        ${photoHtml}

        <tr><td align="center" style="padding:0 36px 26px;">
          <a href="${lienAnnonce}" style="display:inline-block;padding:14px 36px;background:#1c4f86;color:#fff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;">
            Voir mon annonce en ligne
          </a>
          <p style="margin:12px 0 0;font-size:12.5px;color:#64748b;line-height:1.5;">
            Gérer vos annonces : <a href="${lienMesAnnonces}" style="color:#1c4f86;">Mon compte › Mes annonces</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 36px 26px;">
          <div style="background:#f8fafc;border-left:4px solid #1c4f86;padding:12px 16px;border-radius:6px;">
            <p style="margin:0 0 6px;font-size:13px;color:#41506b;line-height:1.55;">
              <strong>Pour vendre plus vite</strong>
            </p>
            <p style="margin:0;font-size:13px;color:#41506b;line-height:1.6;">
              • Partagez le lien de votre annonce sur vos réseaux et dans vos groupes de passionnés<br>
              • Répondez vite aux messages : les acheteurs contactent souvent plusieurs vendeurs
            </p>
          </div>
        </td></tr>

        <tr><td align="center" style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 6px;font-size:12px;color:#64748b;line-height:1.5;">
            <strong style="color:#0f172a;">VoiturePrepa.fr</strong> — La référence des voitures préparées
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            <a href="${siteUrl}" style="color:#1c4f86;text-decoration:none;">voitureprepa.fr</a> ·
            <a href="${siteUrl}/mentions.html" style="color:#1c4f86;text-decoration:none;">Mentions légales</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    "Votre annonce est en ligne\n\n"
    + "Bonjour" + (prenom ? " " + prenom : "") + ",\n\n"
    + "Votre annonce « " + titre + " »" + (prixTxt ? " — " + prixTxt : "")
    + " vient d'être validée par notre équipe. Elle est désormais visible par tous "
    + "les acheteurs sur VoiturePrepa.fr.\n\n"
    + "Voir mon annonce : " + lienAnnonce + "\n"
    + "Gérer mes annonces : " + lienMesAnnonces + "\n\n"
    + "Pour vendre plus vite : partagez le lien de votre annonce et répondez vite "
    + "aux messages.\n\n"
    + "VoiturePrepa.fr — La référence des voitures préparées\n" + siteUrl + "\n";

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender:  { name: senderName, email: senderEmail },
        to:      [{ email: to, name: prenom || to }],
        replyTo: { name: senderName, email: senderEmail },
        subject: subject,
        htmlContent: html,
        textContent: text,
        headers: {
          "List-Unsubscribe": "<" + siteUrl + "/profil.html>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      })
    });
    const txt = await r.text();
    if (r.status < 200 || r.status >= 300) {
      console.warn("[annonce-validee] Brevo HTTP", r.status, txt.slice(0, 300));
      return res.status(502).json({ error: "Brevo error", status: r.status, detail: txt.slice(0, 400) });
    }
  } catch (e) {
    console.error("[annonce-validee] fetch", e);
    return res.status(502).json({ error: "Brevo injoignable", detail: String(e) });
  }

  console.log("[annonce-validee] envoyé à", to, "pour l'annonce", adId);
  return res.status(200).json({ ok: true });
};
