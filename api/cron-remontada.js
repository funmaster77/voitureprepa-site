// Vercel Cron — Pack Remontada
// Tourne 1 fois par jour à 06h00 UTC (voir vercel.json crons).
// Pour chaque annonce active avec un Pack Remontada en cours :
//  - Quotidien    : 30 remontées max, intervalle 24h
//  - Hebdo court  :  8 remontées max, intervalle 7 jours (168h)
//  - Hebdo long   : 12 remontées max, intervalle 7 jours (168h)
// Si l'intervalle est écoulé ET bumps_done < bumps_max, on met created_at à NOW()
// (l'annonce remonte en tête de liste) et on incrémente bumps_done.
//
// Sécurité : vérifie le header Authorization Vercel Cron (CRON_SECRET).
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  // Vérification du secret cron Vercel
  const authHeader = req.headers["authorization"] || "";
  const expected = "Bearer " + (process.env.CRON_SECRET || "");
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const stats = { scanned: 0, bumped: 0, finished: 0, skipped: 0, errors: 0 };

  try {
    // Lecture des ads avec un Pack Remontada actif (payment.pack_key === "remontada")
    // et qui ne sont pas vendues / supprimées par l'admin
    const { data: ads, error } = await supa
      .from("ads")
      .select("id, titre, created_at, payment, status")
      .not("payment", "is", null)
      .in("status", ["approved", "published"]);

    if (error) {
      console.error("[cron-remontada] fetch ads error:", error);
      return res.status(500).json({ error: "Fetch ads failed", details: error.message });
    }

    for (const ad of (ads || [])) {
      stats.scanned++;
      const p = ad.payment || {};
      // Filtre : seulement les Pack Remontada
      if (p.pack_key !== "remontada") { stats.skipped++; continue; }
      const done = Number(p.bumps_done) || 0;
      const max = Number(p.bumps_max) || 0;
      const intervalH = Number(p.bumps_interval_hours) || 0;
      if (max <= 0 || intervalH <= 0) { stats.skipped++; continue; }
      if (done >= max) { stats.finished++; continue; }

      const last = new Date(p.last_bump_at || p.paid_at || ad.created_at || 0);
      const elapsedH = (now - last) / (1000 * 60 * 60);
      if (elapsedH < intervalH) { stats.skipped++; continue; }

      // Cette annonce est due pour une remontée
      const newPayment = Object.assign({}, p, {
        bumps_done: done + 1,
        last_bump_at: nowIso
      });
      const { error: updErr } = await supa
        .from("ads")
        .update({ created_at: nowIso, payment: newPayment })
        .eq("id", ad.id);
      if (updErr) {
        console.warn("[cron-remontada] update ad", ad.id, updErr);
        stats.errors++;
      } else {
        stats.bumped++;
        console.log("[cron-remontada] bumped ad", ad.id, ad.titre,
          "(" + (done + 1) + "/" + max + ")");
      }
    }

    console.log("[cron-remontada] done", stats);
    return res.status(200).json({ ok: true, stats });
  } catch (e) {
    console.error("[cron-remontada] fatal:", e);
    return res.status(500).json({ error: "Fatal", details: e.message });
  }
};
