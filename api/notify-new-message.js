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

  // Template HTML — couleurs site (orange #ff6b00 + bleu #0a2540)
  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a2238;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0a2540;padding:20px 28px;">
              <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                VoiturePrepa<span style="color:#ff6b00;">.</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px 28px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#0a2540;font-weight:700;">
                ✉️ Vous avez un nouveau message
              </h1>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#41506b;">
                Bonjour${recipient_name ? " " + escapeHtml(recipient_name) : ""},
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#41506b;">
                <strong>${escapeHtml(sender_display_name)}</strong> vous a envoyé un message${ad_title ? " concernant <strong>" + escapeHtml(ad_title) + "</strong>" : ""} sur VoiturePrepa.
              </p>

              <div style="background:#f6f7fb;border-left:4px solid #ff6b00;padding:14px 16px;border-radius:4px;margin:0 0 24px;">
                <div style="font-size:13px;color:#7d8aa3;margin-bottom:6px;">Aperçu du message :</div>
                <div style="font-size:14px;color:#1a2238;line-height:1.5;white-space:pre-wrap;">${escapeHtml(message_preview)}</div>
              </div>

              ${adUrl ? `<p style="margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#41506b;">
                Annonce concernée : <a href="${adUrl}" style="color:#ff6b00;font-weight:600;">${escapeHtml(ad_title || "voir l'annonce")}</a>
              </p>` : ""}
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#41506b;">
                Pour répondre, ouvrez la conversation :
              </p>
              <p style="margin:0 0 28px;text-align:center;">
                <a href="${inboxUrl}" style="display:inline-block;background:#ff6b00;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:6px;font-weight:600;font-size:15px;">
                  Répondre au message
                </a>
              </p>

            </td>
          </tr>
          <tr>
            <td style="background:#f6f7fb;padding:18px 28px;border-top:1px solid #e5e9f2;font-size:12px;color:#7d8aa3;line-height:1.5;">
              <p style="margin:0 0 6px;">
                ⚠️ <strong>Sécurité</strong> — Ne communiquez jamais vos coordonnées bancaires en messagerie. Tout paiement doit passer par la Protection des Achats du site.
              </p>
              <p style="margin:0;">
                Vous recevez cet email parce que vous êtes membre de VoiturePrepa.fr. <a href="${siteUrl}/mentions.html" style="color:#7d8aa3;">Mentions légales</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
        htmlContent: htmlContent
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
