// VoiturePrepa.fr — Couche d'abstraction de paiement
// ----------------------------------------------------
// Ce fichier est le SEUL point d'entrée pour tous les paiements du site.
// Tout le code applicatif (app.js, deposer.html, annonce.html, etc.) doit
// passer par window.vpPay(opts) et JAMAIS appeler directement Stripe.
//
// Avantages :
//   1. Migrer vers un autre PSP (MangoPay, Stripe Connect avec wallet,
//      Adyen, etc.) = changer UNIQUEMENT ce fichier, pas le reste du site.
//   2. A/B testing entre PSPs possible (router une partie des paiements
//      vers un provider, l'autre vers un autre).
//   3. Couche idéale pour ajouter de la télémétrie / logs métier sans
//      polluer chaque page.
//
// Aujourd'hui (juin 2026) : VoiturePrepa.fr utilise Stripe Checkout en
// mode TEST. Le wrapper délègue à window.payWithStripeCheckout (défini
// dans stripe-checkout.js).
//
// Demain : pour basculer vers MangoPay, il suffira d'écrire un nouveau
// helper window.payWithMangoPay et de modifier UNIQUEMENT le corps de
// vpPay ci-dessous (les appelants n'ont rien à changer).
//
// ----------------------------------------------------
// Signature attendue :
//
//   vpPay({
//     amount: 200,                       // € (sera converti en cents par le helper)
//     label: "Pack Inspection Or",       // libellé visible sur la page de paiement
//     kind: "inspection",                // "boost" / "inspection" / "pro_pack" / "purchase"
//     metadata: { user_id, pack, ... },  // données passées au webhook (max 500 chars par valeur)
//     customer_email: "user@x.fr",       // pré-rempli sur la page Stripe
//     success_path: "/confirmation.html",
//     cancel_path:  "/tarifs.html"
//   })
//
// Le helper redirige automatiquement vers la page de paiement hébergée.
// Le webhook côté Vercel s'occupe ensuite de mettre à jour Supabase
// (revenues, transactions, profiles, etc.) en s'appuyant sur les metadata.
// ----------------------------------------------------

(function () {
  // Provider actif — pourra devenir une variable d'environnement ou un
  // launch_flag admin pour basculer dynamiquement.
  const ACTIVE_PROVIDER = "stripe"; // "stripe" | "mangopay" (futur)

  /**
   * Lance un paiement via le provider actif.
   * @param {Object} opts - voir la signature au début du fichier
   * @returns {Promise<void>} — redirige le navigateur vers la page de paiement
   */
  async function vpPay(opts) {
    if (!opts || !opts.amount || !opts.label) {
      throw new Error("vpPay: amount et label requis");
    }

    if (ACTIVE_PROVIDER === "stripe") {
      if (typeof window.payWithStripeCheckout !== "function") {
        alert("⚠ Module de paiement Stripe non chargé.\n\n" +
              "Vérifiez que <script src=\"assets/js/stripe-checkout.js\"></script> " +
              "est bien inclus dans la page.");
        return;
      }
      return window.payWithStripeCheckout(opts);
    }

    // ----- Futur : MangoPay -----
    // if (ACTIVE_PROVIDER === "mangopay") {
    //   if (typeof window.payWithMangoPay !== "function") {
    //     alert("⚠ Module de paiement MangoPay non chargé.");
    //     return;
    //   }
    //   return window.payWithMangoPay(opts);
    // }

    throw new Error("vpPay: provider inconnu '" + ACTIVE_PROVIDER + "'");
  }

  // Expose globalement
  window.vpPay = vpPay;
  window.VP_PAYMENT = { provider: ACTIVE_PROVIDER };
})();
