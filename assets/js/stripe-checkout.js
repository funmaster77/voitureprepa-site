// v17 — Helper Stripe Checkout côté client
// Appelle /api/create-checkout-session puis redirige vers la page Stripe sécurisée.
// L'utilisateur paie chez Stripe (mode test = pas de débit réel),
// puis revient sur le site via success_url. Le webhook serveur a déjà
// mis à jour Supabase entre temps.
//
// Cartes de test Stripe (mode test) :
//   4242 4242 4242 4242 → succès
//   4000 0000 0000 0002 → carte refusée
//   4000 0025 0000 3155 → 3D Secure requise (modale supplémentaire)
//   N'importe quelle date future, n'importe quel CVC

(function () {
  // URL de l'API serverless — relative pour fonctionner partout (dev, prod, custom domain)
  const API_URL = "/api/create-checkout-session";

  /**
   * Lance un paiement Stripe Checkout.
   * @param {Object} opts
   * @param {number} opts.amount         Montant en € (ex: 200)
   * @param {string} opts.label          Libellé visible (ex: "Pack Inspection Or")
   * @param {string} [opts.kind]         "boost" / "inspection" / "pro_pack" / "purchase"
   * @param {Object} [opts.metadata]     Champs custom (ex: { ad_id: 14, user_id: "abc" })
   * @param {string} [opts.customer_email] Email pré-rempli sur Stripe
   * @param {string} [opts.success_path] Chemin de retour après succès
   * @param {string} [opts.cancel_path]  Chemin de retour après annulation
   * @returns {Promise<void>} Redirige automatiquement vers Stripe Checkout
   */
  async function payWithStripeCheckout(opts) {
    if (!opts || !opts.amount || !opts.label) {
      throw new Error("payWithStripeCheckout: amount et label requis");
    }
    let session = null;
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: opts.amount,
          label: opts.label,
          kind: opts.kind || "boost",
          metadata: opts.metadata || {},
          customer_email: opts.customer_email || "",
          success_path: opts.success_path || "/confirmation.html",
          cancel_path:  opts.cancel_path  || window.location.pathname
        })
      });
      session = await r.json();
      if (!r.ok || !session.url) {
        throw new Error(session.error || ("HTTP " + r.status));
      }
    } catch (e) {
      console.error("Stripe Checkout - création de session KO:", e);
      alert("❌ Impossible de démarrer le paiement Stripe.\n\n" +
            (e.message || e) + "\n\n" +
            "Vérifiez que la clé Stripe est configurée côté serveur.");
      return;
    }
    // Redirection vers la page Stripe hébergée
    window.location.assign(session.url);
  }

  // Export global
  window.payWithStripeCheckout = payWithStripeCheckout;

  // Détection du retour après paiement réussi (querystring ?stripe_session=cs_test_...)
  // Affiche un message de confirmation sur la page d'arrivée.
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("stripe_session");
      const cancelled = params.get("stripe_cancelled");
      if (sid) {
        // Affiche un toast de succès
        const toast = document.createElement("div");
        toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);" +
          "background:#127a36;color:#fff;padding:14px 22px;border-radius:8px;" +
          "box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:9999;font-weight:600;font-size:15px;";
        toast.textContent = "✅ Paiement reçu — merci ! Stripe nous a confirmé la transaction.";
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = "opacity .4s"; toast.style.opacity = "0"; }, 5000);
        setTimeout(() => toast.remove(), 5500);
      } else if (cancelled) {
        const toast = document.createElement("div");
        toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);" +
          "background:#a02018;color:#fff;padding:14px 22px;border-radius:8px;" +
          "box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:9999;font-weight:600;font-size:15px;";
        toast.textContent = "Paiement annulé. Vous pouvez réessayer quand vous voulez.";
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = "opacity .4s"; toast.style.opacity = "0"; }, 4000);
        setTimeout(() => toast.remove(), 4500);
      }
    });
  }
})();
