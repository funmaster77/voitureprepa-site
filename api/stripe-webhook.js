// Vercel Serverless Function — Webhook Stripe
// Reçoit les événements Stripe (paiement réussi, échoué, expiré, etc.)
// Met à jour Supabase pour synchroniser les transactions / packs / abonnements.
//
// Variables d'environnement requises sur Vercel :
//   STRIPE_SECRET_KEY        = sk_test_xxxxxxxxxxxx
//   STRIPE_WEBHOOK_SECRET    = whsec_xxxxxxxxxxxx
//   SUPABASE_URL             = https://nuarxylvrvqxzynozkbg.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = eyJhb... (cle service_role, JAMAIS exposee cote client)

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end("Method not allowed");

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  if (!webhookSecret || !sig) {
    return res.status(400).send("Missing webhook secret or signature");
  }

  let event;
  let rawBody;
  try {
    rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", e.message);
    return res.status(400).send("Invalid signature");
  }

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        const amountEuros = (session.amount_total || 0) / 100;
        const buyerEmail = session.customer_details?.email || session.customer_email || "";

        // IMPORTANT : supabase-js v2 ne supporte pas .catch() directement sur insert/update.
        // Il faut destructurer { error } depuis le resultat awaite.
        const { error: revErr } = await supa.from("revenues").insert({
          category: meta.kind || "boost",
          label: meta.label || (session.metadata && session.metadata.label) || "Paiement Stripe",
          amount: amountEuros,
          payer: buyerEmail,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString()
        });
        if (revErr) console.warn("[stripe-webhook] revenues insert error", revErr);
        else console.log("[stripe-webhook] revenues insert OK", session.id);

        if (meta.transaction_id) {
          const { error: txErr } = await supa.from("transactions").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id
          }).eq("id", meta.transaction_id);
          if (txErr) console.warn("[stripe-webhook] transactions update error", txErr);
        }

        if (meta.kind === "pro_pack" && meta.user_id && meta.pack) {
          const months = (meta.pack === "performance") ? 12 : 6;
          const expires = new Date();
          expires.setMonth(expires.getMonth() + months);
          const { error: profErr } = await supa.from("profiles").update({
            pack: meta.pack,
            pack_expires_at: expires.toISOString()
          }).eq("id", meta.user_id);
          if (profErr) console.warn("[stripe-webhook] profiles update error", profErr);
        }

        console.log("[stripe-webhook] checkout.session.completed", session.id, amountEuros, "EUR");
        break;
      }

      case "checkout.session.expired":
        console.log("[stripe-webhook] checkout.session.expired", event.data.object.id);
        break;

      case "payment_intent.payment_failed":
        console.log("[stripe-webhook] payment_intent.payment_failed",
                    event.data.object.id,
                    event.data.object.last_payment_error?.message || "");
        break;

      default:
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
  }

  return res.status(200).json({ received: true });
};
