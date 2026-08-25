// /api/og.js
// v29 — Aperçu riche lors du partage d'une annonce (WhatsApp, Facebook, Messenger, X, LinkedIn…)
//
// PROBLÈME RÉSOLU :
//   Les robots de prévisualisation (WhatsApp, Facebook…) ne lisent QUE le HTML brut renvoyé
//   par le serveur — ils n'exécutent pas le JavaScript. Or annonce.html met à jour ses balises
//   Open Graph en JS après chargement. Résultat : ces robots voyaient toujours les valeurs par
//   défaut (logo + "Détail annonce") au lieu de la photo et du titre de l'annonce.
//
// SOLUTION :
//   Cette fonction serverless lit l'annonce dans Supabase et renvoie un HTML minimal contenant
//   les VRAIES balises OG (photo, titre, prix, description). Les visiteurs humains sont
//   redirigés instantanément vers la page annonce classique.
//
// Variables d'environnement requises côté Vercel :
//   SUPABASE_URL                — URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — clé service role (lecture des annonces)
//   SITE_URL                    — URL publique (ex: https://voitureprepa.fr)

const { createClient } = require("@supabase/supabase-js");

const SITE_URL = (process.env.SITE_URL || "https://voitureprepa.fr").replace(/\/+$/, "");

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Détecte les robots de prévisualisation des réseaux sociaux / messageries
function isCrawler(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  return /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest|redditbot|skypeuripreview|googlebot|bingbot|applebot|vkshare|embedly|quora link preview|showyoubot|outbrain|nuzzel|w3c_validator|snapchat|instagram/.test(ua);
}

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) ? String(req.query.id) : "";
  const targetUrl = SITE_URL + "/annonce.html" + (id ? "?id=" + encodeURIComponent(id) : "");

  // Pas d'id → redirection simple vers la liste des annonces
  if (!id) {
    res.writeHead(302, { Location: SITE_URL + "/annonces.html" });
    return res.end();
  }

  // Visiteur humain → redirection immédiate vers la vraie page (pas de flash)
  if (!isCrawler(req.headers && req.headers["user-agent"])) {
    res.writeHead(302, { Location: targetUrl });
    return res.end();
  }

  // ---- Robot de prévisualisation : on génère un HTML avec les vraies balises OG ----
  let ad = null;
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await sb
        .from("ads")
        .select("id,titre,prix,description,photos,type,marque,modele,annee,km,ville,departement,status,deleted_by_owner")
        .eq("id", Number(id))
        .single();
      if (!error && data && !data.deleted_by_owner) ad = data;
    }
  } catch (e) {
    // On tombera sur le fallback générique ci-dessous
  }

  // Valeurs par défaut si l'annonce n'est pas trouvée
  let ogTitle = "Annonce — VoiturePrepa.fr";
  let ogDesc  = "Voitures préparées et pièces performance sur VoiturePrepa.fr";
  let ogImage = SITE_URL + "/assets/img/logo.png";

  if (ad) {
    const prix = (Number(ad.prix) || 0).toLocaleString("fr-FR") + " €";
    ogTitle = (ad.titre || "Annonce") + " — " + prix;

    // Description : caractéristiques clés puis extrait de la description vendeur
    const bits = [];
    if (ad.type === "voiture") {
      if (ad.marque)  bits.push(ad.marque + (ad.modele ? " " + ad.modele : ""));
      if (ad.annee)   bits.push(String(ad.annee));
      if (ad.km)      bits.push((Number(ad.km) || 0).toLocaleString("fr-FR") + " km");
    }
    if (ad.ville || ad.departement) bits.push(ad.ville || ad.departement);
    const head = bits.length ? bits.join(" · ") + " — " : "";
    const desc = String(ad.description || "").replace(/\s+/g, " ").trim();
    ogDesc = (head + (desc || "Voir l'annonce complète sur VoiturePrepa.fr")).slice(0, 200);

    // Image : première photo de l'annonce si disponible
    if (Array.isArray(ad.photos) && ad.photos.length && typeof ad.photos[0] === "string"
        && ad.photos[0].indexOf("http") === 0) {
      ogImage = ad.photos[0];
    }
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ogTitle)}</title>
<link rel="canonical" href="${escapeHtml(targetUrl)}">

<meta property="og:type" content="product">
<meta property="og:site_name" content="VoiturePrepa.fr">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogDesc)}">
<meta property="og:url" content="${escapeHtml(targetUrl)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(ogTitle)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogDesc)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}">
</head>
<body>
<p>Redirection vers l'annonce…
   <a href="${escapeHtml(targetUrl)}">Cliquez ici si rien ne se passe</a>.</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache court côté CDN : l'aperçu se met à jour si l'annonce change
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(200).send(html);
};
