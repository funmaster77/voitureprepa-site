// Vercel Serverless Function — Cree une session Stripe Checkout
// Mode TEST tant que STRIPE_SECRET_KEY commence par sk_test_
// Mode LIVE quand on remplace par sk_live_ (jour J du lancement)
//
// Variables d'environnement requises sur Vercel :
//   STRIPE_SECRET_KEY = sk_test_xxxxxxxxxxxx
//   PUBLIC_SITE_URL   = https://voitureprepa-site.vercel.app (ou domaine final)

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
    const {
      amount,
      label,
      kind,
      metadata,
      customer_email,
      success_path,
      cancel_path
    } = body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }
    if (!label || typeof label !== "string") {
      return res.status(400).json({ error: "Libelle manquant" });
    }

    const baseUrl = process.env.PUBLIC_SITE_URL ||
                    (req.headers.origin) ||
                    "https://voitureprepa-site.vercel.app";

    // On ajoute `label` aux metadata Stripe pour que le webhook le retrouve.
    // Stripe limite les valeurs metadata a 500 caracteres : on tronque par precaution.
    const safeLabel = String(label).slice(0, 500);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: label },
          unit_amount: Math.round(Number(amount) * 100)
        },
        quantity: 1
      }],
      customer_email: customer_email || undefined,
      metadata: Object.assign(
        { kind: kind || "boost", label: safeLabel },
        metadata || {}
      ),
      success_url: baseUrl + (success_path || "/confirmation.html") +
                   "?stripe_session=" + "{CHECKOUT_SESSION_ID}",
      cancel_url:  baseUrl + (cancel_path  || "/tarifs.html") + "?stripe_cancelled=1",
      locale: "fr"
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (e) {
    console.error("[create-checkout-session]", e);
    return res.status(500).json({ error: e.message || "Stripe error" });
  }
};
