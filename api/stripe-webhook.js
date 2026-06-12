// Vercel Serverless Function — Webhook Stripe
// Reçoit les événements Stripe (paiement réussi, échoué, expiré, etc.)
// Met à jour Supabase pour synchroniser les transactions / packs / abonnements.
//
// Variables d'environnement requises sur Vercel :
//   STRIPE_SECRET_KEY        = sk_test_xxxxxxxxxxxx
//   STRIPE_WEBHOOK_SECRET    = whsec_xxxxxxxxxxxx  (créé via Stripe dashboard → Webhooks)
//   SUPABASE_URL             = https://nuarxylvrvqxzynozkbg.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = eyJhb... (clé service_role, JAMAIS exposée côté client)

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// Vercel doit nous laisser lire le body brut (pour la signature)
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

  // Client Supabase avec la clé service_role (bypass RLS) — UNIQUEMENT côté serveur
  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {

      // Paiement réussi via Stripe Checkout
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        const amountEuros = (session.amount_total || 0) / 100;
        const buyerEmail = session.customer_details?.email || session.customer_email || "";

        // Enregistre la recette dans la table `revenues`
        await supa.from("revenues").insert({
          category: meta.kind || "boost",
          label: meta.label || (session.metadata && session.metadata.label) || "Paiement Stripe",
          amount: amountEuros,
          payer: buyerEmail,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString()
        }).catch(e => console.warn("revenues insert", e));

        // Si le paiement concerne une transaction d'achat d'annonce, on met à jour la transaction
        if (meta.transaction_id) {
          await supa.from("transactions").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id
          }).eq("id", meta.transaction_id);
        }

        // Si le paiement concerne un pack pro (Premium/Performance), on met à jour le profil
        if (meta.kind === "pro_pack" && meta.user_id && meta.pack) {
          const months = (meta.pack === "performance") ? 12 : 6;
          const expires = new Date();
          expires.setMonth(expires.getMonth() + months);
          await supa.from("profiles").update({
            pack: meta.pack,
            pack_expires_at: expires.toISOString()
          }).eq("id", meta.user_id);
        }

        console.log("[stripe-webhook] checkout.session.completed", session.id, amountEuros, "€");
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        console.log("[stripe-webhook] checkout.session.expired", session.id);
        break;
      }

      // Échec de paiement (carte refusée, fonds insuffisants…)
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log("[stripe-webhook] payment_intent.payment_failed", pi.id,
                    pi.last_payment_error?.message || "");
        break;
      }

      default:
        // Pas d'action spécifique pour les autres événements
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    // On renvoie 200 quand même : Stripe re-essaiera si on renvoie 5xx,
    // et on ne veut pas spammer en cas d'erreur applicative bénigne.
  }

  return res.status(200).json({ received: true });
};
