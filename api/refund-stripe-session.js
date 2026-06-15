// Vercel Serverless Function — Remboursement Stripe
// Appelé par l'admin quand une annonce avec pack payé est refusée.
//
// Body JSON attendu :
//   { session_id: "cs_test_xxx", reason: "Annonce refusée par l'admin" }
//
// Retourne :
//   { ok: true, refund_id: "re_xxx", amount: 599 } (montant en centimes)
//   { error: "..." } en cas d'échec

const Stripe = require("stripe");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY non configuree sur Vercel" });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { session_id, reason } = body;
    if (!session_id) {
      return res.status(400).json({ error: "session_id requis" });
    }

    // Recupere la session pour trouver le payment_intent associe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session.payment_intent) {
      return res.status(404).json({ error: "Aucun payment_intent trouve sur cette session" });
    }

    // Cree le remboursement integral via Stripe
    const refund = await stripe.refunds.create({
      payment_intent: session.payment_intent,
      reason: "requested_by_customer",
      metadata: {
        admin_reason: (reason || "").slice(0, 500),
        source: "voitureprepa_admin_refuse_ad"
      }
    });

    return res.status(200).json({
      ok: true,
      refund_id: refund.id,
      amount: refund.amount,           // en centimes
      amount_euros: refund.amount / 100,
      status: refund.status
    });
  } catch (e) {
    console.error("[refund-stripe-session]", e);
    return res.status(500).json({ error: e.message || "Stripe refund error" });
  }
};
