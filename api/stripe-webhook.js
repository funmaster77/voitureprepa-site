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

        // 1) Recette comptable dans `revenues` (toutes categories)
        // v20 — Extrait l'ad_id (premier de la liste si multi-ad) pour permettre
        //       le bouton "Voir l'annonce" dans le suivi comptable.
        var revAdId = null;
        if (meta.ad_id) {
          revAdId = parseInt(meta.ad_id, 10) || null;
        } else if (meta.ad_ids) {
          var first = String(meta.ad_ids).split(",")[0].trim();
          revAdId = parseInt(first, 10) || null;
        }
        const revRow = {
          category: meta.kind || "boost",
          label: meta.label || "Paiement Stripe",
          amount: amountEuros,
          payer: buyerEmail,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString()
        };
        if (revAdId) revRow.ad_id = revAdId;
        const { error: revErr } = await supa.from("revenues").insert(revRow);
        if (revErr) console.warn("[stripe-webhook] revenues insert error", revErr);
        else console.log("[stripe-webhook] revenues insert OK", session.id);

        // 2) Achat d'annonce
        if (meta.transaction_id) {
          const { error: txErr } = await supa.from("transactions").update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id
          }).eq("id", meta.transaction_id);
          if (txErr) console.warn("[stripe-webhook] transactions update error", txErr);
          else console.log("[stripe-webhook] transaction marked paid", meta.transaction_id);

          if (meta.ad_id) {
            const { error: adErr } = await supa.from("ads").update({
              status: "sold",
              sold_at: new Date().toISOString()
            }).eq("id", meta.ad_id);
            if (adErr) console.warn("[stripe-webhook] ad mark sold error", adErr);
            else console.log("[stripe-webhook] ad marked sold", meta.ad_id);
          }
        }

        // 3) Boost options au depot — paiement OK
        // NB: la table ads n'a PAS de colonnes paid/paid_at au niveau racine.
        // On stocke tout dans le JSONB payment + la colonne payment_status.
        if (meta.kind === "boost" && (meta.ad_id || meta.ad_ids)) {
          const nowIso = new Date().toISOString();
          // v26 — Boucle sur ad_ids (pluriel) si présent, sinon ad_id (singulier).
          const boostAdIds = meta.ad_ids
            ? String(meta.ad_ids).split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
            : (meta.ad_id ? [parseInt(meta.ad_id, 10)] : []);
          const paymentJson = {
            required: true,
            amount: amountEuros,
            status: "accepte",
            reason: "",
            stripe_session_id: session.id,
            options: meta.options || "",
            pack_key: meta.pack_key || "",
            paid_at: nowIso
          };
          // v26 — Pack Remontada : initialise les compteurs pour la remontée périodique
          // (lue par api/cron-remontada.js qui tourne 1x/jour).
          if (meta.pack_key === "remontada") {
            const formule = meta.formule || "Hebdo court";
            paymentJson.formule = formule;
            paymentJson.bumps_max = formule === "Quotidien" ? 30
                                  : formule === "Hebdo court" ? 8
                                  : 12; // Hebdo long
            paymentJson.bumps_interval_hours = formule === "Quotidien" ? 24 : 168;
            paymentJson.bumps_done = 1;        // la remontée initiale (paiement) compte comme 1
            paymentJson.last_bump_at = nowIso; // empêche une double remontée immédiate par le cron
          }
          const updates = { payment: paymentJson, payment_status: "accepte" };
          // Pack Urgence/Remontada : on remet aussi created_at à maintenant (remontée initiale).
          if (meta.pack_key === "urgence" || meta.pack_key === "remontada") {
            updates.created_at = nowIso;
          }
          // v26 — Boucle sur toutes les annonces achetées dans la même session.
          for (const aid of boostAdIds) {
            const { error: boostErr } = await supa.from("ads").update(updates).eq("id", aid);
            if (boostErr) console.warn("[stripe-webhook] boost ad payment update error", aid, boostErr);
            else console.log("[stripe-webhook] ad boost payment OK", aid);
          }
        }

        // 5) v25 — Inspection : créer la demande directement côté serveur
        // pour ne pas dépendre du retour navigateur (user peut fermer l'onglet).
        if (meta.kind === "inspection" && meta.ad_ids) {
          try {
            // Résout owner_id depuis l'email du payeur
            const { data: payer } = await supa.from("profiles")
              .select("id, email, prenom, nom, raison_sociale")
              .eq("email", buyerEmail).maybeSingle();
            const ownerId = payer ? payer.id : null;
            const niveau = meta.niveau || "Bronze";
            const formule = niveau === "Or" ? "Inspection Complète" :
                            niveau === "Argent" ? "Inspection Premium" : "Inspection Standard";
            const garage = meta.garage || "";
            const adIds = String(meta.ad_ids).split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            const prixUnit = adIds.length ? Math.round(amountEuros / adIds.length) : amountEuros;
            for (const adId of adIds) {
              // Vérifie qu'on n'a pas déjà créé cette inspection (idempotence webhook)
              const { data: existing } = await supa.from("inspections")
                .select("id").eq("ad_id", adId).eq("owner_id", ownerId).eq("niveau", niveau).eq("paid", true)
                .maybeSingle();
              if (existing) {
                console.log("[stripe-webhook] inspection déjà créée, skip", existing.id);
                continue;
              }
              const { data: ad } = await supa.from("ads").select("titre").eq("id", adId).maybeSingle();
              const payload = {
                status: "pending",
                requested_at: new Date().toISOString(),
                niveau: niveau,
                formule: formule,
                prix: prixUnit,
                vehicule: (ad && ad.titre) || ("#" + adId),
                ad_id: adId,
                garage: garage,
                paid: true,
                source: "Webhook Stripe",
                owner_id: ownerId,
                creneaux: [],
                chosen: null
              };
              const { error: inspErr } = await supa.from("inspections").insert(payload);
              if (inspErr) console.warn("[stripe-webhook] inspection insert error", inspErr);
              else console.log("[stripe-webhook] inspection créée pour ad", adId);
            }
          } catch (e) {
            console.error("[stripe-webhook] inspection block error:", e);
          }
        }

        // 4) Pack Pro (Premium/Performance)
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
