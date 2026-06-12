// Vercel Serverless Function — Webhook Stripe
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (jamais expose cote client)

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
        const cd = session.customer_details || {};
        const buyerEmail = cd.email || session.customer_email || "";

        // 1) Recette comptable dans `revenues` (toutes catégories)
        const { error: revErr } = await supa.from("revenues").insert({
          category: meta.kind || "boost",
          label: meta.label || "Paiement Stripe",
          amount: amountEuros,
          payer: buyerEmail,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString()
        });
        if (revErr) console.warn("[stripe-webhook] revenues insert error", revErr);
        else console.log("[stripe-webhook] revenues insert OK", session.id);

        // 2) Achat d'annonce — transition de la transaction en "paid" + ad "sold"
        if (meta.transaction_id) {
          const { error: txErr } = await supa.from("transactions").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id
          }).eq("id", meta.transaction_id);
          if (txErr) console.warn("[stripe-webhook] transactions update error", txErr);
          else console.log("[stripe-webhook] transaction marked paid", meta.transaction_id);

          // Marque l'annonce comme vendue (n'efface pas la fiche, juste le statut)
          if (meta.ad_id) {
            const { error: adErr } = await supa.from("ads").update({
              status: "sold",
              sold_at: new Date().toISOString()
            }).eq("id", meta.ad_id);
            if (adErr) console.warn("[stripe-webhook] ad mark sold error", adErr);
            else console.log("[stripe-webhook] ad marked sold", meta.ad_id);
          }
        }

        // 3) Pack Pro (Premium/Performance) — activation/renouvellement du pack
        if (meta.kind === "pro_pack" && meta.user_id && meta.pack) {
          const months = parseInt(meta.duree_mois, 10) ||
                         (meta.pack === "performance" ? 12 : 6);
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

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const lastErr = pi.last_payment_error;
        console.log("[stripe-webhook] payment_intent.payment_failed",
                    pi.id,
                    lastErr ? lastErr.message : "");
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
  }

  return res.status(200).json({ received: true });
};
