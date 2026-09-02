// /api/notify-new-message.js
// Envoie un email transactionnel via Brevo (Sendinblue) quand un nouveau message est posté.
// Appelé depuis app.js après addThreadMessage().
//
// Variables d'environnement requises côté Vercel :
//   BREVO_API_KEY          — clé API Brevo (Settings > SMTP & API > API Keys)
//   BREVO_SENDER_EMAIL     — adresse expéditeur vérifiée chez Brevo (ex: contact@voitureprepa.fr)
//   BREVO_SENDER_NAME      — nom expéditeur (ex: "VoiturePrepa")
//   SITE_URL               — URL publique du site (ex: https://www.voitureprepa.fr)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — pour le throttle log

const { createClient } = require("@supabase/supabase-js");

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = async (req, res) => {
  // CORS basique (au cas où)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "contact@voitureprepa.fr";
  const senderName = process.env.BREVO_SENDER_NAME || "VoiturePrepa";
  const siteUrl = (process.env.SITE_URL || "https://www.voitureprepa.fr").replace(/\/+$/, "");

  if (!apiKey) {
    console.error("[notify-new-message] BREVO_API_KEY missing");
    return res.status(500).json({ error: "Brevo not configured" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[notify-new-message] Supabase env missing");
    return res.status(500).json({ error: "Supabase not configured" });
  }

  // Récupère la payload — supporte JSON natif et body string
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const recipient_email = String(body.recipient_email || "").toLowerCase().trim();
  const recipient_name = String(body.recipient_name || "").trim();
  const sender_display_name = String(body.sender_name || "Un utilisateur").trim();
  const ad_title = String(body.ad_title || "").trim();
  const ad_id = body.ad_id || null;
  const thread_id = String(body.thread_id || "").trim();
  const message_preview = String(body.message_preview || "").substring(0, 500);

  if (!recipient_email || !/^[^@]+@[^@]+\.[^@]+$/.test(recipient_email)) {
    return res.status(400).json({ error: "Invalid recipient_email" });
  }
  if (!message_preview) {
    return res.status(400).json({ error: "Empty message" });
  }
  if (!thread_id) {
    return res.status(400).json({ error: "Missing thread_id" });
  }

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // Throttle : 1 email max par 5 min pour (recipient, thread, kind="new_message")
  const fiveMinAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    const { data: recent, error: thErr } = await supa
      .from("email_notifications_log")
      .select("id, sent_at")
      .eq("recipient_email", recipient_email)
      .eq("thread_id", thread_id)
      .eq("kind", "new_message")
      .gte("sent_at", fiveMinAgoIso)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (thErr) console.warn("[notify-new-message] throttle lookup error", thErr);
    if (recent) {
      console.log("[notify-new-message] throttled (déjà envoyé < 5min)", recipient_email, thread_id);
      return res.status(200).json({ ok: true, throttled: true, last_sent_at: recent.sent_at });
    }
  } catch (e) {
    console.warn("[notify-new-message] throttle exception", e);
    // on continue quand même
  }

  // v29 — Lien vers LA conversation concernée, et non vers la messagerie en
  //   général : le destinataire arrive directement sur l'échange, sans avoir à
  //   retrouver le bon fil parmi les autres.
  //   Les fils de contact (« contact-… ») n'existent pas dans la messagerie :
  //   pour eux on garde le lien générique.
  const estFilMessagerie = thread_id && !/^contact/i.test(thread_id) && !/^diag/i.test(thread_id);
  const inboxUrl = siteUrl + "/profil.html?tab=messages"
    + (estFilMessagerie ? "&thread=" + encodeURIComponent(thread_id) : "");
  const adUrl = ad_id ? (siteUrl + "/annonce.html?id=" + encodeURIComponent(String(ad_id))) : null;

  const subject = "Nouveau message" + (ad_title ? " — " + ad_title : "") + " | VoiturePrepa";

  /* v29 — Modèle aligné sur la charte VoiturePrepa (logo réel + bleu #1c4f86),
     identique aux emails de confirmation d'inscription et de réponse contact.
     L'ancien utilisait un logo textuel et un orange qui n'est plus la couleur
     du site. */
  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">

        <tr><td align="center" style="background:#ffffff;padding:28px 24px 12px;border-bottom:1px solid #e2e8f0;">
          <img src="${siteUrl}/assets/img/logo.png" alt="VoiturePrepa.fr" width="260" style="display:block;max-width:260px;height:auto;border:0;">
        </td></tr>

        <tr><td style="padding:30px 36px 10px;">
          <h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#0f172a;line-height:1.3;">
            Vous avez reçu un nouveau message
          </h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#334155;">
            Bonjour${recipient_name ? " " + escapeHtml(recipient_name) : ""},
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
            <strong>${escapeHtml(sender_display_name)}</strong> vous a écrit${ad_title ? " au sujet de <strong>" + escapeHtml(ad_title) + "</strong>" : ""}.
          </p>

          <div style="background:#f8fafc;border-left:4px solid #1c4f86;padding:14px 16px;border-radius:6px;margin:0 0 22px;">
            <div style="font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Aperçu du message</div>
            <div style="font-size:15px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message_preview)}</div>
          </div>

          ${adUrl ? `<p style="margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#334155;">
            Annonce concernée : <a href="${adUrl}" style="color:#1c4f86;font-weight:600;">${escapeHtml(ad_title || "voir l'annonce")}</a>
          </p>` : ""}
        </td></tr>

        <tr><td align="center" style="padding:0 36px 28px;">
          <a href="${inboxUrl}" style="display:inline-block;padding:14px 36px;background:#1c4f86;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;letter-spacing:.2px;">
            Répondre au message
          </a>
        </td></tr>

        <tr><td style="padding:0 36px 26px;">
          <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
            <p style="margin:0;font-size:13px;color:#7c4a03;line-height:1.55;">
              <strong>Sécurité</strong> — Ne communiquez jamais vos coordonnées bancaires par messagerie.
              Tout paiement doit passer par la Protection des Achats du site.
            </p>
          </div>
        </td></tr>

        <tr><td align="center" style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 6px;font-size:12px;color:#64748b;line-height:1.5;">
            <strong style="color:#0f172a;">VoiturePrepa.fr</strong> — La référence des voitures préparées
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
            <a href="${siteUrl}" style="color:#1c4f86;text-decoration:none;">voitureprepa.fr</a> ·
            <a href="${siteUrl}/mentions.html" style="color:#1c4f86;text-decoration:none;">Mentions légales</a> ·
            <a href="${siteUrl}/profil.html?tab=messages" style="color:#1c4f86;text-decoration:none;">Gérer mes notifications</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  /* v29 — Version TEXTE : un email uniquement HTML est un signal fort de
     courrier indésirable. Les filtres attendent les deux formats. */
  const textContent =
    "Vous avez reçu un nouveau message sur VoiturePrepa.fr\n\n"
    + "Bonjour" + (recipient_name ? " " + recipient_name : "") + ",\n\n"
    + sender_display_name + " vous a écrit"
    + (ad_title ? " au sujet de : " + ad_title : "") + ".\n\n"
    + "--- Message ---\n" + message_preview + "\n---\n\n"
    + "Répondre : " + inboxUrl + "\n"
    + (adUrl ? "Annonce : " + adUrl + "\n" : "")
    + "\nSécurité : ne communiquez jamais vos coordonnées bancaires par messagerie.\n\n"
    + "VoiturePrepa.fr — La référence des voitures préparées\n"
    + siteUrl + "\n";

  // Appel API Brevo
  let brevoStatus = 0;
  let brevoBodyText = "";
  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipient_email, name: recipient_name || recipient_email }],
        replyTo: { name: senderName, email: senderEmail },
        subject: subject,
        htmlContent: htmlContent,
        // v29 — Version texte + en-têtes de désabonnement : deux critères
        //   majeurs des filtres anti-spam.
        textContent: textContent,
        headers: {
          "List-Unsubscribe": "<" + siteUrl + "/profil.html?tab=messages>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      })
    });
    brevoStatus = brevoRes.status;
    brevoBodyText = await brevoRes.text();
  } catch (e) {
    console.error("[notify-new-message] Brevo fetch error", e);
    // Log de l'échec
    try {
      await supa.from("email_notifications_log").insert({
        recipient_email, thread_id, kind: "new_message",
        ok: false, error_msg: "fetch: " + String(e).slice(0, 200)
      });
    } catch (_) {}
    return res.status(502).json({ error: "Brevo unreachable", detail: String(e) });
  }

  if (brevoStatus < 200 || brevoStatus >= 300) {
    console.warn("[notify-new-message] Brevo HTTP", brevoStatus, brevoBodyText.slice(0, 300));
    try {
      await supa.from("email_notifications_log").insert({
        recipient_email, thread_id, kind: "new_message",
        ok: false, error_msg: ("HTTP " + brevoStatus + ": " + brevoBodyText).slice(0, 500)
      });
    } catch (_) {}
    return res.status(502).json({ error: "Brevo error", status: brevoStatus, detail: brevoBodyText.slice(0, 500) });
  }

  // Succès : log dans la table de throttle
  try {
    await supa.from("email_notifications_log").insert({
      recipient_email, thread_id, kind: "new_message", ok: true
    });
  } catch (e) {
    console.warn("[notify-new-message] log insert error", e);
  }

  console.log("[notify-new-message] sent OK", recipient_email, thread_id);
  return res.status(200).json({ ok: true });
};
