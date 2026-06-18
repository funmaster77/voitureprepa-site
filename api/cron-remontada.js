// Vercel Cron — Pack Remontada + Pack Performance
// Tourne 1 fois par jour à 06h00 UTC (voir vercel.json crons).
//
// PASS 1 — Pack Remontada (ads individuelles) :
//  - Quotidien    : 30 remontées max, intervalle 24h
//  - Hebdo court  :  8 remontées max, intervalle 7 jours (168h)
//  - Hebdo long   : 12 remontées max, intervalle 7 jours (168h)
//
// PASS 2 — Pack Performance (comptes pro) :
//  - 1 remontée par mois de TOUTES les ads voiture du compte
//  - Tant que pack_expires_at n'est pas dépassé (12 mois max)
//
// Sécurité : vérifie le header Authorization Vercel Cron (CRON_SECRET).
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
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
  const stats = {
    remontada: { scanned: 0, bumped: 0, finished: 0, skipped: 0, errors: 0 },
    performance: { scanned: 0, bumped_profiles: 0, bumped_ads: 0, skipped: 0, expired: 0, errors: 0 }
  };

  // ===== PASS 1 — Pack Remontada =====
  try {
    const { data: ads, error } = await supa
      .from("ads")
      .select("id, titre, created_at, payment, status")
      .not("payment", "is", null)
      .in("status", ["approved", "published"]);
    if (error) {
      console.error("[cron-remontada] PASS1 fetch ads error:", error);
    } else {
      for (const ad of (ads || [])) {
        stats.remontada.scanned++;
        const p = ad.payment || {};
        if (p.pack_key !== "remontada") { stats.remontada.skipped++; continue; }
        const done = Number(p.bumps_done) || 0;
        const max = Number(p.bumps_max) || 0;
        const intervalH = Number(p.bumps_interval_hours) || 0;
        if (max <= 0 || intervalH <= 0) { stats.remontada.skipped++; continue; }
        if (done >= max) { stats.remontada.finished++; continue; }
        const last = new Date(p.last_bump_at || p.paid_at || ad.created_at || 0);
        const elapsedH = (now - last) / (1000 * 60 * 60);
        if (elapsedH < intervalH) { stats.remontada.skipped++; continue; }
        const newPayment = Object.assign({}, p, {
          bumps_done: done + 1,
          last_bump_at: nowIso
        });
        const { error: updErr } = await supa
          .from("ads")
          .update({ created_at: nowIso, payment: newPayment })
          .eq("id", ad.id);
        if (updErr) {
          console.warn("[cron-remontada] PASS1 update ad", ad.id, updErr);
          stats.remontada.errors++;
        } else {
          stats.remontada.bumped++;
          console.log("[cron-remontada] PASS1 bumped ad", ad.id, ad.titre,
            "(" + (done + 1) + "/" + max + ")");
        }
      }
    }
  } catch (e) {
    console.error("[cron-remontada] PASS1 fatal:", e);
  }

  // ===== PASS 2 — Pack Performance (mensuel, toutes ads voiture du compte) =====
  const THIRTY_DAYS_H = 30 * 24;
  try {
    const { data: profiles, error: pErr } = await supa
      .from("profiles")
      .select("id, email, pack, pack_expires_at, last_perf_bump_at")
      .eq("pack", "performance");
    if (pErr) {
      console.error("[cron-remontada] PASS2 fetch profiles error:", pErr);
    } else {
      for (const prof of (profiles || [])) {
        stats.performance.scanned++;
        if (!prof.pack_expires_at || new Date(prof.pack_expires_at) <= now) {
          stats.performance.expired++;
          continue;
        }
        const lastBump = prof.last_perf_bump_at ? new Date(prof.last_perf_bump_at) : null;
        if (lastBump) {
          const elapsedH = (now - lastBump) / (1000 * 60 * 60);
          if (elapsedH < THIRTY_DAYS_H) { stats.performance.skipped++; continue; }
        }
        const { data: bumpedAds, error: bumpErr } = await supa
          .from("ads")
          .update({ created_at: nowIso, bumped_at: nowIso, bumped_by: "pack_performance" })
          .eq("owner_id", prof.id)
          .eq("type", "voiture")
          .in("status", ["approved", "published", "sold"])
          .select("id");
        if (bumpErr) {
          console.warn("[cron-remontada] PASS2 bump ads error", prof.id, bumpErr);
          stats.performance.errors++;
          continue;
        }
        const adsCount = (bumpedAds || []).length;
        const { error: profUpdErr } = await supa
          .from("profiles")
          .update({ last_perf_bump_at: nowIso })
          .eq("id", prof.id);
        if (profUpdErr) {
          console.warn("[cron-remontada] PASS2 update profile error", prof.id, profUpdErr);
          stats.performance.errors++;
          continue;
        }
        stats.performance.bumped_profiles++;
        stats.performance.bumped_ads += adsCount;
        console.log("[cron-remontada] PASS2 bumped profile", prof.email, "(" + adsCount + " ads voiture)");
      }
    }
  } catch (e) {
    console.error("[cron-remontada] PASS2 fatal:", e);
  }

  console.log("[cron-remontada] done", stats);
  return res.status(200).json({ ok: true, stats });
};
