/* ==========================================================
   VoiturePrepa.fr - Logique partagée
   ========================================================== */

// ---------- Paramètres du site éditables via l'admin (Tarifs & formules) ----------
const SITE_SETTINGS_KEY = "voitureprepa_site_settings";
const SITE_SETTINGS_DEFAULTS = {
  // Abonnements professionnels
  pack_gratuit_prix: 0,     pack_gratuit_max: 3,    pack_gratuit_duree: 3,
  pack_premium_prix: 200,   pack_premium_max: 10,   pack_premium_duree: 6,
  pack_performance_prix: 400, pack_performance_max: 999, pack_performance_duree: 12,
  // Particulier
  particulier_duree: 3,
  // Emails automatiques
  email_suggestion_jours: 14,
  email_renouvellement_jours: 14,
  // Prix minimum
  prix_min_voiture_bon: 6000,
  prix_min_voiture_endommage: 2000,
  prix_min_piece: 5,
  // Options à l'unité
  prix_photos_plus: 4.99,
  prix_urgence: 5.99,
  prix_remontada_quotidien: 34.99,
  prix_remontada_hebdo_court: 9.99,
  prix_remontada_hebdo_long: 14.99,
  // Inspections
  prix_inspection_bronze: 150,
  prix_inspection_argent: 300,
  prix_inspection_or: 500
};
function loadSiteSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) || "{}"); } catch (e) {}
  return Object.assign({}, SITE_SETTINGS_DEFAULTS, saved);
}
function saveSiteSettings(map) {
  try { localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(map)); } catch (e) {}
}

// ---------- v14 — Feature flags de lancement ----------
const LAUNCH_FLAGS_KEY = "voitureprepa_launch_flags";
const LAUNCH_FLAGS_DEFAULTS = {
  inspection_enabled: false,
  garages_enabled: false,
  pack_remontada_enabled: false,
  pack_urgence_enabled: false,
  pack_photos_paid: false,
  pack_pro_premium_enabled: false,
  pack_pro_performance_enabled: false
};
// Source de vérité = table Supabase `launch_flags`. localStorage sert de cache
// pour les checks synchrones (UX). Au chargement on revalide via _refreshLaunchFlagsFromDb.
let _flagsMemCache = null;
async function _refreshLaunchFlagsFromDb() {
  if (!window.VP_SB) return null;
  try {
    const flags = await VP_SB.loadLaunchFlags();
    if (flags && typeof flags === "object") {
      _flagsMemCache = Object.assign({}, LAUNCH_FLAGS_DEFAULTS, flags);
      try { localStorage.setItem(LAUNCH_FLAGS_KEY, JSON.stringify(_flagsMemCache)); } catch (e) {}
      try { if (typeof applyDisplayedPrices === "function") applyDisplayedPrices(); } catch(e){}
      return _flagsMemCache;
    }
  } catch (e) { console.warn("flags refresh:", e); }
  return null;
}
function loadLaunchFlags() {
  if (_flagsMemCache) return _flagsMemCache;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LAUNCH_FLAGS_KEY) || "{}"); } catch (e) {}
  return Object.assign({}, LAUNCH_FLAGS_DEFAULTS, saved);
}
async function saveLaunchFlags(map) {
  const old = loadLaunchFlags();
  const next = Object.assign({}, LAUNCH_FLAGS_DEFAULTS, map);
  _flagsMemCache = next;
  try { localStorage.setItem(LAUNCH_FLAGS_KEY, JSON.stringify(next)); } catch (e) {}
  if (window.VP_SB) {
    for (const k of Object.keys(next)) {
      if (next[k] !== old[k]) {
        try { await VP_SB.setLaunchFlag(k, !!next[k]); }
        catch (e) { console.error("setLaunchFlag KO:", k, e); }
      }
    }
  }
}
function isFeatureEnabled(name) { return !!loadLaunchFlags()[name]; }
const LAUNCH_DEV_MSG = "🚧 Ce service est en cours de développement. Il sera disponible prochainement.";
function gateLaunchPage(flagName, pageTitle) {
  if (isFeatureEnabled(flagName)) return;
  const container = document.querySelector(".container");
  if (!container) return;
  const bread = container.querySelector(".breadcrumb");
  container.innerHTML = "";
  if (bread) container.appendChild(bread);
  const box = document.createElement("main");
  box.style.cssText = "max-width:640px;margin:60px auto;background:#fff;padding:50px 40px;border-radius:10px;box-shadow:var(--shadow);text-align:center;";
  box.innerHTML = '<div style="font-size:64px;margin-bottom:16px;">🚧</div>' +
    '<h1 style="margin-bottom:14px;">' + (pageTitle || "Service") + '</h1>' +
    '<p style="font-size:18px;color:var(--text-muted);margin-bottom:8px;"><strong>En cours de développement</strong></p>' +
    '<p style="color:var(--text-muted);margin-top:18px;">Ce service sera disponible prochainement. Merci de votre patience.</p>' +
    '<p style="margin-top:30px;"><a href="index.html" class="btn btn-primary">← Retour à l\'accueil</a></p>';
  container.appendChild(box);
}
const PACK_LAUNCH_FLAG = {
  urgence: "pack_urgence_enabled",
  remontada: "pack_remontada_enabled",
  bronze: "inspection_enabled",
  silver: "inspection_enabled",
  gold: "inspection_enabled"
};
// ---------- fin v14 flags ----------

// v14 — applique l'état des flags sur les cartes de packs visibles
// Cartes marquées via data-launch-card="photos|urgence|remontada"
// Action (bouton/checkbox) marquée via data-launch-action
function applyLaunchFlagsToPacks() {
  const flags = loadLaunchFlags();
  // Mapping carte -> flag de disponibilité (true = service actif)
  const cardAvailable = {
    photos: true, // toujours disponible (juste gratuit ou payant selon flag)
    urgence: !!flags.pack_urgence_enabled,
    remontada: !!flags.pack_remontada_enabled,
    inspection: !!flags.inspection_enabled,
    pro_premium: !!flags.pack_pro_premium_enabled,
    pro_performance: !!flags.pack_pro_performance_enabled
  };
  document.querySelectorAll('[data-launch-card]').forEach(card => {
    const which = card.getAttribute('data-launch-card');
    // Pour les cartes inspection (.medal-card), le prix est dans .price (pas .price-tag)
    const priceEl = card.querySelector('.price-tag') || card.querySelector('.price') || card.querySelector('.launch-photos-price');
    const action = card.querySelector('[data-launch-action]');
    if (which === 'photos') {
      if (!flags.pack_photos_paid && priceEl) {
        priceEl.innerHTML = '0 €<small style="display:block;margin-top:2px;color:#1a7f37;">Offert au lancement</small>';
      }
    } else if (!cardAvailable[which]) {
      if (priceEl) {
        priceEl.innerHTML = '<span style="font-size:14px;font-weight:600;color:#a55;">🚧 En cours<br>de développement</span>';
        priceEl.style.lineHeight = '1.25';
      }
      if (action) {
        if (action.tagName === 'BUTTON') {
          action.disabled = true;
          action.style.opacity = '0.55';
          action.style.cursor = 'not-allowed';
          action.textContent = 'Indisponible';
        } else if (action.tagName === 'A') {
          action.removeAttribute('href');
          action.style.opacity = '0.55';
          action.style.cursor = 'not-allowed';
          action.style.pointerEvents = 'none';
          action.textContent = 'Indisponible';
        } else {
          const btn = action.querySelector('input,button,a');
          if (btn) { btn.disabled = true; btn.style.opacity = '0.55'; btn.style.cursor = 'not-allowed'; }
        }
      }
      // Cartes Pro Premium/Performance (tarifs.html) : masquer aussi le badge "Recommandé"
      const featuredTag = card.querySelector('.featured-tag');
      if (featuredTag) featuredTag.style.display = 'none';
      // Cas particulier des cartes inspection (.medal-card) avec onclick inline
      if (card.classList.contains('medal-card')) {
        card.removeAttribute('onclick');
        card.style.cursor = 'not-allowed';
        card.style.pointerEvents = 'none';
      }
      card.style.opacity = '0.85';
    }
  });
}




// ---------- Coordonnées des préfectures par département ----------
const DEPT_COORDS = {
  "01":[46.20,5.23],"02":[49.57,3.62],"03":[46.34,3.43],"04":[44.10,6.24],"05":[44.56,6.08],
  "06":[43.71,7.26],"07":[44.74,4.60],"08":[49.76,4.72],"09":[42.99,1.61],"10":[48.30,4.08],
  "11":[43.21,2.35],"12":[44.35,2.57],"13":[43.30,5.37],"14":[49.18,-0.37],"15":[44.93,2.45],
  "16":[45.65,0.16],"17":[45.75,-0.63],"18":[47.08,2.40],"19":[45.27,1.77],"2A":[41.92,8.74],
  "2B":[42.70,9.45],"21":[47.32,5.04],"22":[48.51,-2.78],"23":[46.17,1.87],"24":[45.18,0.72],
  "25":[47.24,6.02],"26":[44.93,4.89],"27":[49.02,1.15],"28":[48.44,1.49],"29":[48.39,-4.49],
  "30":[43.84,4.36],"31":[43.60,1.44],"32":[43.65,0.59],"33":[44.84,-0.58],"34":[43.61,3.88],
  "35":[48.12,-1.68],"36":[46.81,1.69],"37":[47.39,0.69],"38":[45.19,5.72],"39":[46.67,5.55],
  "40":[43.89,-0.50],"41":[47.59,1.33],"42":[45.43,4.39],"43":[45.04,3.88],"44":[47.22,-1.55],
  "45":[47.90,1.91],"46":[44.45,1.44],"47":[44.20,0.62],"48":[44.52,3.50],"49":[47.47,-0.55],
  "50":[49.11,-1.09],"51":[49.25,4.03],"52":[48.11,5.14],"53":[48.07,-0.77],"54":[48.69,6.18],
  "55":[48.99,5.37],"56":[47.66,-2.76],"57":[49.12,6.18],"58":[47.00,3.16],"59":[50.63,3.06],
  "60":[49.43,2.83],"61":[48.43,0.09],"62":[50.43,2.83],"63":[45.78,3.09],"64":[43.30,-0.37],
  "65":[43.23,0.08],"66":[42.70,2.90],"67":[48.57,7.75],"68":[47.75,7.34],"69":[45.76,4.84],
  "70":[47.62,6.16],"71":[46.78,4.85],"72":[48.00,0.20],"73":[45.57,5.92],"74":[46.07,6.40],
  "75":[48.86,2.35],"76":[49.44,1.10],"77":[48.54,2.66],"78":[48.80,2.13],"79":[46.32,-0.47],
  "80":[49.89,2.30],"81":[43.93,2.15],"82":[44.02,1.36],"83":[43.46,6.41],"84":[44.00,4.85],
  "85":[46.67,-1.43],"86":[46.58,0.34],"87":[45.84,1.27],"88":[48.17,6.45],"89":[47.80,3.57],
  "90":[47.64,6.86],"91":[48.63,2.34],"92":[48.83,2.27],"93":[48.91,2.45],"94":[48.78,2.45],
  "95":[49.05,2.08]
};

// Extrait les coords (lat, lng) d'une annonce avec un petit jitter aléatoire pour éviter les marqueurs empilés
function getAdCoords(ad) {
  if (ad.lat != null && ad.lng != null) return [ad.lat, ad.lng];
  if (!ad.departement) return null;
  // Le code de département peut être écrit « 6 », « 06 », « 75 », « 2A », « 971 »…
  const m = String(ad.departement).trim().match(/^(2A|2B|\d{1,3})/i);
  if (!m) return null;
  let code = m[1].toUpperCase();
  if (/^\d$/.test(code)) code = "0" + code;   // « 6 » → « 06 » (format de DEPT_COORDS)
  const c = DEPT_COORDS[code];
  if (!c) return null;
  // Jitter ±0.04° (≈ 4 km) basé sur l'id pour rester stable entre rechargements
  const s = String(ad.id);
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  const jLat = ((h % 200) - 100) / 2500;          // ~±0.04
  const jLng = ((Math.floor(h/200) % 200) - 100) / 2500;
  return [c[0] + jLat, c[1] + jLng];
}

// ---------- Régions françaises → codes de départements ----------
// Sert à filtrer les annonces par région (les annonces portent un département).
const REGION_DEPTS = {
  "Île-de-France": ["75","77","78","91","92","93","94","95"],
  "Auvergne-Rhône-Alpes": ["1","3","7","15","26","38","42","43","63","69","73","74"],
  "Bourgogne-Franche-Comté": ["21","25","39","58","70","71","89","90"],
  "Bretagne": ["22","29","35","56"],
  "Centre-Val de Loire": ["18","28","36","37","41","45"],
  "Corse": ["2A","2B"],
  "Grand Est": ["8","10","51","52","54","55","57","67","68","88"],
  "Hauts-de-France": ["2","59","60","62","80"],
  "Normandie": ["14","27","50","61","76"],
  "Nouvelle-Aquitaine": ["16","17","19","23","24","33","40","47","64","79","86","87"],
  "Occitanie": ["9","11","12","30","31","32","34","46","48","65","66","81","82"],
  "Pays de la Loire": ["44","49","53","72","85"],
  "Provence-Alpes-Côte d'Azur": ["4","5","6","13","83","84"],
  "Guadeloupe": ["971"],
  "Martinique": ["972"],
  "Guyane": ["973"],
  "La Réunion": ["974"],
  "Mayotte": ["976"]
};

// Extrait le code de département d'un libellé (« 75 Paris », « 06 - Alpes-Maritimes · Nice » → « 75 », « 6 »)
function deptCodeOf(departementLabel) {
  if (!departementLabel) return "";
  const first = String(departementLabel).trim().split(/[\s·]+/)[0].toUpperCase();
  if (first === "2A" || first === "2B") return first;
  return first.replace(/^0+/, "") || first; // retire les zéros de tête (« 06 » → « 6 »)
}

// Vérifie qu'une annonce appartient à la région sélectionnée
function adInRegion(ad, region) {
  if (!region || region === "Toute la France") return true;
  const depts = REGION_DEPTS[region];
  if (!depts) return true; // région inconnue : on ne filtre pas
  return depts.includes(deptCodeOf(ad && ad.departement));
}

// ============================================================
// ENVOI D'EMAILS (EmailJS) — envoi réel de mails depuis le navigateur
// ------------------------------------------------------------
// POUR ACTIVER L'ENVOI RÉEL :
//   1. Créez un compte gratuit sur https://www.emailjs.com (200 emails/mois)
//   2. Connectez une boîte mail (Gmail, Outlook…) → vous obtenez un "Service ID"
//   3. Créez un template d'email → vous obtenez un "Template ID"
//      Variables à utiliser dans le template : {{to_email}} {{to_name}} {{account_type}} {{message}}
//   4. Dans Account → API Keys, copiez votre "Public Key"
//   5. Renseignez les 3 valeurs ci-dessous. L'envoi devient alors automatique et réel.
// Tant que ces champs sont vides, un email de confirmation SIMULÉ est affiché.
// ============================================================
const EMAILJS_CONFIG = {
  publicKey:  "",   // ex : "AbCdEf123456GhIjK"
  serviceId:  "",   // ex : "service_xxxxxxx"
  templateId: ""    // ex : "template_xxxxxxx"
};

function emailJsConfigured() {
  return !!(EMAILJS_CONFIG.publicKey && EMAILJS_CONFIG.serviceId && EMAILJS_CONFIG.templateId);
}

// Envoie un email. Renvoie une Promise : true = envoyé réellement, null = simulé, false = échec
function sendEmail(params) {
  if (emailJsConfigured() && typeof emailjs !== "undefined") {
    try { emailjs.init(EMAILJS_CONFIG.publicKey); } catch(e){}
    return emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, params)
      .then(() => true)
      .catch(err => { console.error("Erreur EmailJS :", err); return false; });
  }
  // EmailJS non configuré → mode simulation
  return Promise.resolve(null);
}

// Construit le corps de l'email de confirmation d'inscription
function buildWelcomeEmail(prenom, accountType) {
  return "Bonjour " + (prenom || "") + ",\n\n"
    + "Bienvenue sur VoiturePrepa.fr ! Votre compte " + accountType + " a bien été créé.\n\n"
    + "Vous pouvez dès maintenant déposer des annonces, échanger des messages, "
    + "suivre vos favoris et sauvegarder vos recherches.\n\n"
    + "À très vite sur la plateforme,\nL'équipe VoiturePrepa.fr";
}

// ---------- Comptes utilisateurs (inscription + activation par email) ----------
const ACCOUNTS_KEY = "voitureprepa_accounts";

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveAccounts(a) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); } catch(e){}
}
function findAccount(email) {
  email = (email || "").toLowerCase().trim();
  return loadAccounts().find(a => (a.email || "").toLowerCase() === email);
}

// Règle de mot de passe : 8 caractères minimum, au moins 1 majuscule et 1 chiffre
function validatePassword(pwd) {
  return typeof pwd === "string" && pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);
}

// Enregistre un nouveau compte (non confirmé) et génère un jeton d'activation
function registerAccount(acc) {
  const accounts = loadAccounts();
  acc.token = "tok-" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  acc.confirmed = false;
  acc.created_at = new Date().toISOString();
  // Si l'email est déjà enregistré, on remplace l'ancien compte (maquette)
  const idx = accounts.findIndex(a => (a.email||"").toLowerCase() === (acc.email||"").toLowerCase());
  if (idx >= 0) accounts[idx] = acc; else accounts.push(acc);
  saveAccounts(accounts);
  return acc;
}

// Active un compte à partir de son jeton de confirmation
function confirmAccountByToken(token) {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.token === token);
  if (acc) { acc.confirmed = true; saveAccounts(accounts); return acc; }
  return null;
}

// ---------- Session / authentification (simulation) ----------
const SESSION_KEY = "voitureprepa_session";

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch(e) { return null; }
}
function isLoggedIn() { return !!getSession(); }
function loginAs(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function logout() { localStorage.removeItem(SESSION_KEY); }

// Limite du nombre d'annonces selon le type de compte / pack professionnel
function getAdLimit() {
  const s = getSession();
  if (!s) return 0;
  if (s.type === "pro") {
    const st = loadSiteSettings();
    if (s.pack === "performance") return st.pack_performance_max >= 999 ? Infinity : st.pack_performance_max;
    if (s.pack === "premium")     return st.pack_premium_max;
    return st.pack_gratuit_max;                    // pack gratuit pro
  }
  return Infinity; // particulier : pas de limite (dépôt gratuit illimité)
}
// Annonces appartenant au compte connecté (filtre sur owner_id Supabase ou owner_email legacy)
function loadMyAds() {
  const s = getSession();
  if (!s) return [];
  const email = (s.email || "").toLowerCase().trim();
  const myId = s.id || null;
  return loadUserAds().filter(a => {
    if (myId && a.owner_id === myId) return true;
    return (a.owner_email || "").toLowerCase().trim() === email;
  });
}
// Nombre d'annonces actuellement déposées par le compte connecté (hors refusées)
function countMyAds() {
  return loadMyAds().filter(a => {
    const st = getAdStatus(a);
    return st !== "rejected" && st !== "sold";
  }).length;
}

// Durée de mise en ligne (en mois) d'une annonce selon le compte
//  Particulier & Pro Gratuit : 3 mois · Pro Premium : 6 mois · Pro Performance : 12 mois
function getAdDurationMonths() {
  const st = loadSiteSettings();
  const s = getSession();
  if (s && s.type === "pro") {
    if (s.pack === "performance") return st.pack_performance_duree;
    if (s.pack === "premium")     return st.pack_premium_duree;
    return st.pack_gratuit_duree; // pro gratuit
  }
  return st.particulier_duree; // particulier
}

// Formules d'abonnement professionnel (rang croissant : gratuit < premium < performance)
const PRO_PACKS = {
  gratuit:     { label:"Pack Gratuit",     prixLabel:"0 € / an",   annoncesLabel:"3 annonces en ligne",  duree:3,  photos:3,  rang:0 },
  premium:     { label:"Pack Premium",     prixLabel:"200 € / an", annoncesLabel:"10 annonces en ligne", duree:6,  photos:10, rang:1 },
  performance: { label:"Pack Performance", prixLabel:"400 € / an", annoncesLabel:"Annonces illimitées",  duree:12, photos:20, rang:2 }
};
// Change le pack du compte professionnel connecté (mise à niveau simulée)
function upgradeProPack(packKey) {
  if (packKey === "premium" && !isFeatureEnabled("pack_pro_premium_enabled")) {
    alert("🚧 Le Pack Premium est en cours de développement. Il sera disponible prochainement.");
    return false;
  }
  if (packKey === "performance" && !isFeatureEnabled("pack_pro_performance_enabled")) {
    alert("🚧 Le Pack Performance est en cours de développement. Il sera disponible prochainement.");
    return false;
  }
  const s = getSession();
  if (!s || s.type !== "pro" || !PRO_PACKS[packKey]) return false;
  s.pack = packKey;
  loginAs(s);
  // Met aussi à jour le compte enregistré
  const accounts = loadAccounts();
  const acc = accounts.find(a => (a.email || "").toLowerCase() === (s.email || "").toLowerCase());
  if (acc) { acc.pack = packKey; saveAccounts(accounts); }
  return true;
}

// v14 — Pack pro effectif (avec bascule auto vers Gratuit si expiré)
function getEffectiveProPack(session) {
  const s = session || getSession();
  if (!s || s.type !== "pro") return null;
  const exp = s.pack_expires_at;
  if (exp && Date.now() > exp && s.pack !== "gratuit") {
    s.pack = "gratuit";
    s.pack_expires_at = null;
    loginAs(s);
    try {
      const accounts = loadAccounts();
      const acc = accounts.find(a => (a.email || "").toLowerCase() === (s.email || "").toLowerCase());
      if (acc) { acc.pack = "gratuit"; acc.pack_expires_at = null; saveAccounts(accounts); }
    } catch (e) {}
    return "gratuit";
  }
  return s.pack || "gratuit";
}


// v14 — Remontée mensuelle des annonces des comptes Pack Performance
// À chaque chargement de page (ou DOMContentLoaded), si > 30 jours depuis la
// dernière remontée pour ce compte, on rafraîchit created_at de toutes ses
// annonces (effet : remises en tête de liste). Géré côté localStorage.
const PERF_BUMP_KEY = "voitureprepa_perf_last_bump";
function _loadPerfBumps() {
  try { return JSON.parse(localStorage.getItem(PERF_BUMP_KEY) || "{}"); }
  catch(e) { return {}; }
}
function _savePerfBumps(m) {
  try { localStorage.setItem(PERF_BUMP_KEY, JSON.stringify(m)); } catch(e){}
}
function bumpPerformanceAdsIfDue() {
  const s = (typeof getSession === "function") ? getSession() : null;
  if (!s || s.type !== "pro") return;
  const cur = (typeof getEffectiveProPack === "function") ? getEffectiveProPack(s) : (s.pack || "gratuit");
  if (cur !== "performance") return;
  const email = (s.email || "").toLowerCase().trim();
  if (!email) return;
  const bumps = _loadPerfBumps();
  const last = bumps[email] || 0;
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  if (now - last < THIRTY_DAYS) return;
  // Remontée : on remet created_at à maintenant pour toutes les annonces du compte
  try {
    const ads = (typeof loadUserAds === "function") ? loadUserAds() : [];
    let touched = 0;
    const iso = new Date(now).toISOString();
    ads.forEach(a => {
      if ((a.owner_email || "").toLowerCase().trim() === email) {
        a.created_at = iso;
        a.bumped_at = iso;
        a.bumped_by = "pack_performance";
        touched++;
      }
    });
    if (touched > 0 && typeof saveUserAds === "function") {
      saveUserAds(ads);
    }
    bumps[email] = now;
    _savePerfBumps(bumps);
    console.info("[VP] Remontée mensuelle Performance — " + touched + " annonces");
  } catch (e) { console.warn("bump perf erreur", e); }
}

// v14 — Souscription / renouvellement d'un pack pro depuis la page Tarifs
function subscribeProPack(packKey) {
  if (packKey !== "premium" && packKey !== "performance") return;
  const flag = "pack_pro_" + packKey + "_enabled";
  if (!isFeatureEnabled(flag)) {
    alert("🚧 Le " + (PRO_PACKS[packKey] && PRO_PACKS[packKey].label) + " est en cours de développement.");
    return;
  }
  const s = getSession();
  if (!s || s.type !== "pro") {
    alert("Connectez-vous à votre compte professionnel pour souscrire.");
    return;
  }
  const cur = getEffectiveProPack(s);
  if (cur === "performance" && packKey === "premium") {
    alert("Vous êtes déjà abonné au Pack Performance.\n\nLe Pack Premium n'est pas souscriptible tant que votre Pack Performance est actif.");
    return;
  }
  const settings = loadSiteSettings();
  const montant = (packKey === "premium" ? settings.pack_premium_prix : settings.pack_performance_prix) || 0;
  const labelMap = { premium: "Pack Premium", performance: "Pack Performance" };
  const isRenewal = (cur === packKey);
  const titre = "Abonnement Pro — " + labelMap[packKey] + (isRenewal ? " (renouvellement)" : "");
  // Durée d'abonnement : on prend la durée définie pour le pack (6 mois Premium / 12 mois Performance)
  // L'expiration part de la date de souscription (pas de cumul avec une éventuelle expiration restante).
  const settingsForDuree = loadSiteSettings();
  const dureeMois = (packKey === "premium" ? settingsForDuree.pack_premium_duree : settingsForDuree.pack_performance_duree) || (PRO_PACKS[packKey] && PRO_PACKS[packKey].duree) || 12;
  openPaymentModal(montant, titre, function () {
    // Nouvelle expiration = date de souscription + duree (en mois, calculée en jours ≈ 30.4375)
    const newExpiry = Date.now() + Math.round(dureeMois * 30.4375 * 24 * 60 * 60 * 1000);
    s.pack = packKey;
    s.pack_expires_at = newExpiry;
    loginAs(s);
    try {
      const accounts = loadAccounts();
      const acc = accounts.find(a => (a.email || "").toLowerCase() === (s.email || "").toLowerCase());
      if (acc) { acc.pack = packKey; acc.pack_expires_at = newExpiry; saveAccounts(accounts); }
    } catch (e) {}
    addRevenue({ category: "abonnement", label: labelMap[packKey] + (isRenewal ? " (renouvellement)" : " (souscription)"), amount: montant, payer: s.email });
    const expDate = new Date(newExpiry).toLocaleDateString('fr-FR');
    alert("✅ " + labelMap[packKey] + (isRenewal ? " prolongé" : " activé") + " jusqu'au " + expDate + ".");
    location.reload();
  }, null, {
    breakdown: [{ label: labelMap[packKey] + " (" + dureeMois + " mois)", value: montant.toLocaleString('fr-FR') + " €" }],
    footnote: isRenewal ? ("Renouvellement — la nouvelle date d'expiration sera dans " + dureeMois + " mois.") : ("Abonnement professionnel — durée " + dureeMois + " mois.")
  });
}

// Nombre de photos autorisées selon le compte
//  Particulier : 3 (extensible à 10 via Pack Photos+) · Pro Gratuit : 3 · Premium : 10 · Performance : 20
function getPhotoLimit() {
  const s = getSession();
  if (s && s.type === "pro") {
    if (s.pack === "performance") return 20;
    if (s.pack === "premium")     return 10;
    return 3; // pro gratuit
  }
  return 3; // particulier (base)
}

// Nombre de photos autorisé pour une annonce donnée (le Pack Photos+ débloque 10 photos)
function adPhotoLimit(ad) {
  const s = getSession();
  if (s && s.type === "pro") return getPhotoLimit(); // 3 / 10 / 20 selon le pack pro
  const hasPhotosPack = ((ad && ad.options) || []).some(o => o.indexOf("Pack Photos+") === 0);
  return hasPhotosPack ? 10 : 3;
}

// Exige une connexion pour une action ; renvoie true si OK, sinon affiche un message et renvoie false
function requireLogin(actionLabel) {
  if (isLoggedIn()) return true;
  const go = confirm("🔒 " + (actionLabel || "Cette action") + " nécessite un compte.\n\n" +
    "L'inscription est gratuite. Voulez-vous vous inscrire / vous connecter maintenant ?");
  if (go) window.location.href = "connexion.html";
  return false;
}

// ---------- Persistance des favoris (propres à chaque compte connecté) ----------
const USER_FAVS_KEY = "voitureprepa_user_favs"; // base — la clé réelle est suffixée par le compte

// Clé de stockage des favoris du compte connecté (null si personne n'est connecté)
function favsKey() {
  const s = getSession();
  if (!s) return null;
  const id = (s.email && s.email.toLowerCase().trim()) || s.provider || "membre";
  return USER_FAVS_KEY + "_" + id;
}

function loadFavs() {
  const key = favsKey();
  if (!key) return []; // non connecté : aucun favori
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch(e) { return []; }
}
function saveFavs(favs) {
  const key = favsKey();
  if (!key) return; // non connecté : rien n'est enregistré
  try { localStorage.setItem(key, JSON.stringify(favs)); } catch(e){}
}
function isFav(id) { return loadFavs().some(x => String(x) === String(id)); }
function toggleFav(id) {
  let favs = loadFavs().map(x => String(x));
  const sId = String(id);
  if (favs.includes(sId)) favs = favs.filter(x => x !== sId);
  else favs.push(sId);
  saveFavs(favs);
  const nowFav = favs.includes(sId);
  // Met à jour le compteur de favoris de l'annonce (+1 ajout, -1 retrait)
  bumpAdFav(id, nowFav ? 1 : -1);
  return nowFav;
}
function countFavs() { return loadFavs().length; }

// Bascule le favori depuis une carte et met à jour le compteur du header
function toggleFavCard(id, btn) {
  if (!requireLogin("L'ajout aux favoris")) return;
  const nowFav = toggleFav(id);
  if (btn) {
    btn.textContent = nowFav ? "❤" : "♡";
    btn.classList.toggle("active", nowFav);
  }
  const counter = document.getElementById("hdr-fav-count");
  if (counter) counter.textContent = countFavs();
}

// ---------- Recherches sauvegardées (propres à chaque compte connecté) ----------
const USER_SEARCHES_KEY = "voitureprepa_user_searches"; // base — suffixée par le compte

// Clé de stockage des recherches du compte connecté (null si personne connecté)
function searchesKey() {
  const s = getSession();
  if (!s) return null;
  const id = (s.email && s.email.toLowerCase().trim()) || s.provider || "membre";
  return USER_SEARCHES_KEY + "_" + id;
}
function loadSearches() {
  const key = searchesKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch(e) { return []; }
}
function saveSearches(list) {
  const key = searchesKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch(e){}
}
// Enregistre une recherche ; renvoie l'objet créé, ou null si non connecté
function addSavedSearch(data) {
  const key = searchesKey();
  if (!key) return null;
  const list = loadSearches();
  const item = Object.assign({
    id: "search-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    created_at: new Date().toISOString()
  }, data);
  list.unshift(item);
  saveSearches(list);
  return item;
}
function deleteSavedSearch(id) {
  saveSearches(loadSearches().filter(s => String(s.id) !== String(id)));
}
function countSavedSearches() { return loadSearches().length; }

// Construit l'URL annonces.html correspondant à une recherche sauvegardée
function savedSearchUrl(s) {
  const p = new URLSearchParams();
  p.set("type", s.type || "voiture");
  ["q","marque","modele","prix_min","prix_max","region","departement",
   "km_min","km_max","stage","cat_piece","sous_piece","sort"].forEach(k => {
    if (s[k]) p.set(k, s[k]);
  });
  if (s.carburants && s.carburants.length) p.set("carburants", s.carburants.join(","));
  if (s.etats && s.etats.length) p.set("etats", s.etats.join(","));
  if (s.inspections && s.inspections.length) p.set("inspections", s.inspections.join(","));
  if (s.urgent)  p.set("urgent", "1");
  if (s.premium) p.set("premium", "1");
  return "annonces.html?" + p.toString();
}

// ---------- Statistiques d'annonces : vues et favoris ----------
const AD_STATS_KEY = "voitureprepa_ad_stats";
function loadAdStats() {
  try { return JSON.parse(localStorage.getItem(AD_STATS_KEY) || "{}"); }
  catch(e) { return {}; }
}
function saveAdStats(s) {
  try { localStorage.setItem(AD_STATS_KEY, JSON.stringify(s)); } catch(e){}
}
// Incrémente le compteur de vues d'une annonce (à chaque consultation)
function bumpAdView(adId) {
  const s = loadAdStats();
  const k = String(adId);
  s[k] = s[k] || { vues:0, favs:0 };
  s[k].vues = (s[k].vues || 0) + 1;
  saveAdStats(s);
}
// Ajuste le compteur de favoris d'une annonce (+1 ajout, -1 retrait)
function bumpAdFav(adId, delta) {
  const s = loadAdStats();
  const k = String(adId);
  s[k] = s[k] || { vues:0, favs:0 };
  s[k].favs = Math.max(0, (s[k].favs || 0) + delta);
  saveAdStats(s);
}
// Nombre de vues affiché : base (démo / création) + consultations réelles
function getAdVues(ad) {
  const st = loadAdStats()[String(ad && ad.id)];
  return (Number(ad && ad.vues) || 0) + ((st && st.vues) || 0);
}
// Nombre de personnes ayant mis l'annonce en favori
function getAdFavoris(ad) {
  const st = loadAdStats()[String(ad && ad.id)];
  return (Number(ad && ad.favoris) || 0) + ((st && st.favs) || 0);
}

// ---------- Persistance des annonces : Supabase + cache mémoire ----------
// v14 — migré sur Supabase. Le cache mémoire `_adsCache` permet de garder
// les signatures sync attendues partout dans le code (loadUserAds → tableau direct).
// Un appel `_refreshAdsCache()` au DOMContentLoaded charge la version DB.
let _adsCache = [];
let _adsCacheLoaded = false;

function _adFromDb(r) {
  // Mappe une ligne Supabase vers le format attendu par le code legacy
  if (!r) return r;
  return Object.assign({}, r, {
    // owner_email enrichi par le join (ou laissé tel quel si déjà présent)
    owner_email: (r.owner && r.owner.email) || r.owner_email || "",
    // options et photos sont déjà des tableaux (jsonb)
    options: Array.isArray(r.options) ? r.options : [],
    photos: Array.isArray(r.photos) ? r.photos : [],
    documents: Array.isArray(r.documents) ? r.documents : []
  });
}

async function _refreshAdsCache() {
  if (typeof VP_SB === "undefined" || !VP_SB.client) return;
  try {
    const { data, error } = await VP_SB.client
      .from("ads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { console.warn("loadAds err", error); return; }
    _adsCache = (data || []).map(_adFromDb);
    _adsCacheLoaded = true;
    // Repaint toutes les vues qui consomment _adsCache
    if (typeof renderResults === "function")     { try { renderResults(); } catch(e) {} }     // annonces.html
    if (typeof refreshDashboard === "function")  { try { refreshDashboard(); } catch(e) {} }  // profil.html
    if (typeof renderInspections === "function") { try { renderInspections(); } catch(e) {} } // admin.html
    if (typeof renderPublished === "function")   { try { renderPublished(); } catch(e) {} }   // admin.html
    if (typeof renderRejected === "function")    { try { renderRejected(); } catch(e) {} }    // admin.html
    if (typeof renderModQueue === "function")    { try { renderModQueue(); } catch(e) {} }    // admin.html
    if (typeof renderSold === "function")        { try { renderSold(); } catch(e) {} }        // admin.html
    if (typeof renderStats === "function")       { try { renderStats(); } catch(e) {} }       // admin.html
    if (typeof initPage === "function" && typeof PAGE_ACTIVE !== "undefined" && PAGE_ACTIVE === "accueil") {
      try { initPage(); } catch(e) {}
    }
  } catch (e) { console.warn("refreshAdsCache", e); }
}

function loadUserAds() {
  return _adsCache.slice();
}

async function saveUserAd(ad) {
  // Ajout local immédiat (UX réactive)
  _adsCache.unshift(ad);
  // Push BLOQUANT vers Supabase pour que les erreurs remontent à l'appelant
  try {
    if (typeof VP_SB === "undefined") return ad;
    const user = await VP_SB.getUser();
    if (!user) {
      alert("⚠ Vous n'êtes pas connecté à Supabase.\n\nDéconnectez-vous puis reconnectez-vous via la page Connexion pour synchroniser votre compte.");
      return null;
    }
    const payload = Object.assign({}, ad);
    delete payload.owner;
    // owner_email reste en base (on l'a ajouté à la table)
    if (typeof payload.id === "number" || (typeof payload.id === "string" && !payload.id.startsWith("00"))) {
      delete payload.id;
    }
    payload.owner_id = user.id;
    const { data, error } = await VP_SB.client.from("ads").insert(payload).select("*").maybeSingle();
    if (error) {
      console.error("insertAd err", error);
      alert("❌ Enregistrement de l'annonce impossible :\n" + (error.message || error.code || JSON.stringify(error)));
      // Retire l'entrée optimiste pour ne pas mentir à l'utilisateur
      const i = _adsCache.findIndex(a => a === ad);
      if (i >= 0) _adsCache.splice(i, 1);
      return null;
    }
    if (data) {
      const i = _adsCache.findIndex(a => a === ad);
      if (i >= 0) _adsCache[i] = _adFromDb(data);
      return _adFromDb(data);
    }
    return ad;
  } catch (e) {
    console.error("saveUserAd push", e);
    alert("❌ Erreur technique lors de l'enregistrement : " + (e.message || e));
    return null;
  }
}

function deleteUserAd(id) {
  _adsCache = _adsCache.filter(a => String(a.id) !== String(id));
  (async () => {
    try {
      if (typeof VP_SB === "undefined" || !VP_SB.client) return;
      const { error } = await VP_SB.client.from("ads").delete().eq("id", id);
      if (error) console.warn("deleteAd err", error);
    } catch (e) { console.warn("deleteUserAd push", e); }
  })();
}

function updateUserAd(id, patch) {
  const ad = _adsCache.find(a => String(a.id) === String(id));
  if (!ad) return false;
  Object.assign(ad, patch);
  (async () => {
    try {
      if (typeof VP_SB === "undefined" || !VP_SB.client) return;
      const payload = Object.assign({}, patch);
      delete payload.owner;
      delete payload.owner_email;
      const { error } = await VP_SB.client.from("ads").update(payload).eq("id", id);
      if (error) console.warn("updateAd err", error);
    } catch (e) { console.warn("updateUserAd push", e); }
  })();
  return true;
}

// ---------- Annonces ----------
// La maquette ne contient aucune annonce de démonstration : seules les
// annonces réellement déposées par l'utilisateur (enregistrées dans le
// navigateur) sont affichées.
const MOCK_ADS = [];
loadUserAds().forEach(a => MOCK_ADS.unshift(a));

// ---------- Durée de mise en ligne puis expiration ----------
const AD_DURATION_MONTHS = 3; // valeur par défaut (particulier / annonces démo)

function getAdExpiry(ad) {
  if (!ad || !ad.created_at) return null;
  const d = new Date(ad.created_at);
  if (isNaN(d.getTime())) return null;
  // Chaque annonce porte sa propre durée (3 / 6 / 12 mois selon le pack au dépôt)
  const months = ad.duration_months || loadSiteSettings().particulier_duree;
  d.setMonth(d.getMonth() + months);
  return d;
}
function isAdExpired(ad) {
  const exp = getAdExpiry(ad);
  return exp ? (new Date() > exp) : false;
}
function adDaysLeft(ad) {
  const exp = getAdExpiry(ad);
  if (!exp) return null;
  return Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
}
function formatExpiry(ad) {
  const exp = getAdExpiry(ad);
  if (!exp) return "";
  const mois = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
  return exp.getDate() + " " + mois[exp.getMonth()] + " " + exp.getFullYear();
}
// Renouvelle gratuitement une annonce utilisateur (réinitialise la date de mise en ligne)
function renewUserAd(id) {
  const ads = loadUserAds();
  const ad = ads.find(a => String(a.id) === String(id));
  if (ad) {
    ad.created_at = new Date().toISOString();
    try { localStorage.setItem(USER_ADS_KEY, JSON.stringify(ads)); } catch(e){}
    return true;
  }
  return false;
}

// ---------- Statut de modération des annonces ----------
// "pending" = en attente de validation admin · "approved" = publiée · "rejected" = refusée
// Les annonces démo (MOCK_ADS sans champ status) sont considérées déjà approuvées.
function getAdStatus(ad) {
  return ad && ad.status ? ad.status : "approved";
}
// Une annonce est visible publiquement si approuvée ET non expirée
function isAdPublic(ad) {
  return getAdStatus(ad) === "approved" && !isAdExpired(ad);
}
// L'admin met à jour le statut d'une annonce utilisateur (Supabase + cache)
function setUserAdStatus(id, status, reason) {
  const ad = _adsCache.find(a => String(a.id) === String(id));
  if (!ad) return false;
  // Construit le patch à pousser en base
  const patch = { status: status };
  if (reason !== undefined) patch.reject_reason = reason;
  if (status === "approved") {
    if (!ad.first_published_at) patch.first_published_at = new Date().toISOString();
    // Pro : durée court depuis la 1re mise en ligne. Particulier : chaque revalidation repart.
    patch.created_at = ad.pro ? (ad.first_published_at || patch.first_published_at) : new Date().toISOString();
    patch.was_modified = false;
    patch.is_renewal = false;
    patch.modif_changes = [];
  }
  // updateUserAd met à jour cache ET push vers Supabase
  return updateUserAd(id, patch);
}

// ---------- Demandes d'inspection (rendez-vous à valider par l'administrateur) ----------
const INSPECTIONS_KEY = "voitureprepa_inspections";

// Détail des 3 niveaux d'inspection (prix lus depuis les paramètres admin)
function computeInspectionNiveaux() {
  const s = loadSiteSettings();
  return {
    or:     { niveau:"Or",     formule:"Inspection Complète", prix:s.prix_inspection_or,     badge:"or" },
    argent: { niveau:"Argent", formule:"Inspection Premium",  prix:s.prix_inspection_argent, badge:"argent" },
    bronze: { niveau:"Bronze", formule:"Inspection Standard", prix:s.prix_inspection_bronze, badge:"bronze" }
  };
}
let INSPECTION_NIVEAUX = computeInspectionNiveaux();
// Politique d'engagement du rendez-vous d'inspection (affichée au vendeur et à l'admin)
const INSPECTION_POLICY =
  "En acceptant le créneau proposé, le vendeur s'engage à se présenter au rendez-vous à l'heure convenue. " +
  "Toute séance annulée moins de 48 h à l'avance ou non honorée est facturée à hauteur de 30 % du tarif initial.";

// Normalise une clé d'inspection (gold→or, silver→argent)
function normInspKey(k) {
  if (k === "gold")   return "or";
  if (k === "silver") return "argent";
  return k;
}

function loadInspections() {
  let list;
  try { list = JSON.parse(localStorage.getItem(INSPECTIONS_KEY) || "[]"); }
  catch(e) { return []; }
  // Migration de l'ancien format (rendez-vous unique rdv_* → tableau creneaux[])
  let changed = false;
  list.forEach(r => {
    if (!Array.isArray(r.creneaux)) {
      r.creneaux = r.rdv_date
        ? [{ date:r.rdv_date, heure:r.rdv_heure || "", garage:r.rdv_garage || "", note:r.rdv_note || "" }]
        : [];
      if (r.status === "scheduled") r.status = "proposed";
      if (r.chosen === undefined) r.chosen = null;
      changed = true;
    }
  });
  if (changed) saveInspections(list);
  return list;
}
function saveInspections(list) {
  try { localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(list)); } catch(e){}
}
// Crée une demande d'inspection « en attente » de validation de rendez-vous par l'admin
function addInspectionRequest(data) {
  const list = loadInspections();
  const req = Object.assign({
    id: "insp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    status: "pending",   // pending → proposed → confirmed / declined ; ou refused
    requested_at: new Date().toISOString(),
    garage: "",          // garage partenaire choisi par le vendeur
    paid: false,         // paiement de l'inspection effectué par le vendeur
    creneaux: [],        // créneaux proposés par l'administrateur
    chosen: null         // index du créneau accepté par le vendeur
  }, data);
  list.unshift(req);
  saveInspections(list);
  return req;
}
// Met à jour une demande d'inspection enregistrée (par id)
function updateInspection(id, patch) {
  const list = loadInspections();
  const r = list.find(x => x.id === id);
  if (!r) return false;
  Object.assign(r, patch);
  saveInspections(list);
  return true;
}
// Demandes d'inspection du compte connecté
function loadMyInspections() {
  const s = getSession();
  if (!s) return [];
  const email = (s.email || "").toLowerCase().trim();
  return loadInspections().filter(r => (r.owner_email || "").toLowerCase().trim() === email);
}

// ---------- Checkout sécurisé façon Stripe (simulation) ----------
// Maquette : aucun débit réel. Le formulaire reproduit fidèlement le
// comportement de Stripe (validation de carte, cartes de test, refus/acceptation).
// Une vraie intégration Stripe nécessiterait un serveur (clés secrètes, PaymentIntents).
let _payOnPaid = null, _payOnCancel = null, _payAmount = 0, _payBtnLabel = "Payer";
let _lastPaymentDecline = ""; // dernier motif de refus de carte — repris côté admin
function lastPaymentDecline() { return _lastPaymentDecline; }

// Cartes de test : un numéro listé ici => paiement REFUSÉ avec le motif indiqué.
// Tout autre numéro valide (ex. 4242 4242 4242 4242) => paiement ACCEPTÉ.
const STRIPE_TEST_CARDS = {
  "4000000000000002": "Votre carte a été refusée.",
  "4000000000009995": "Paiement refusé : fonds insuffisants.",
  "4000000000000069": "Paiement refusé : la carte a expiré.",
  "4000000000000127": "Paiement refusé : le code de sécurité (CVC) est incorrect.",
  "4000000000000119": "Le paiement n'a pas pu être traité. Veuillez réessayer."
};

function formatEuro(n) {
  return (Number(n) || 0).toLocaleString('fr-FR') + " €";
}

// Validation de numéro de carte par l'algorithme de Luhn
function luhnValid(num) {
  num = (num || "").replace(/\D/g, "");
  if (num.length < 12 || num.length > 19) return false;
  let sum = 0, dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i], 10);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}
function cardBrand(digits) {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  return "";
}
function updateCardBrand(digits) {
  const el = document.getElementById("sc-brand");
  if (!el) return;
  const b = cardBrand(digits);
  el.textContent = b || "💳";
  el.className = "stripe-brand" + (b ? " has-brand" : "");
}
function formatCardNumber(input) {
  const v = input.value.replace(/\D/g, "").slice(0, 19);
  input.value = v.replace(/(.{4})/g, "$1 ").trim();
  updateCardBrand(v);
}
function formatCardExpiry(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + " / " + v.slice(2);
  input.value = v;
}
function setStripeFormDisabled(disabled) {
  ["sc-email","sc-number","sc-exp","sc-cvc","sc-name"].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.disabled = disabled;
  });
}

// Cartes de test pré-remplies — permet de payer en un clic dans la maquette.
// « ok » → paiement accepté ; les autres numéros déclenchent un refus.
const _TEST_CARD_FILL = {
  ok:      "4242424242424242",
  refused: "4000000000000002",
  funds:   "4000000000009995"
};
function fillTestCard(kind) {
  const num = _TEST_CARD_FILL[kind];
  if (!num) return;
  const numEl   = document.getElementById("sc-number");
  const expEl   = document.getElementById("sc-exp");
  const cvcEl   = document.getElementById("sc-cvc");
  const nameEl  = document.getElementById("sc-name");
  const emailEl = document.getElementById("sc-email");
  const s = getSession();
  if (numEl) { numEl.value = num; formatCardNumber(numEl); }
  if (expEl) { expEl.value = "1230"; formatCardExpiry(expEl); } // expire 12 / 30
  if (cvcEl) cvcEl.value = "123";
  if (nameEl && !nameEl.value.trim()) {
    nameEl.value = (s && ([s.prenom, s.nom].filter(Boolean).join(" ") || s.raison)) || "Client Démo";
  }
  if (emailEl && !emailEl.value.trim()) {
    emailEl.value = (s && s.email) || "client@demo.fr";
  }
  const err = document.getElementById("sc-error");
  if (err) err.style.display = "none";
}

function injectPaymentModal() {
  if (document.getElementById("payment-modal")) return;
  const html = `
  <div class="modal-backdrop" id="payment-modal" onclick="if(event.target===this)closePaymentModal()">
    <div class="stripe-sheet">
      <div class="stripe-head">
        <div class="stripe-head-row">
          <span class="stripe-lock">🔒</span>
          <span class="stripe-head-title">Paiement sécurisé</span>
          <button class="stripe-close" onclick="closePaymentModal()" aria-label="Fermer">✕</button>
        </div>
        <div id="pay-label" class="stripe-merchant"></div>
      </div>
      <div class="stripe-body">
        <div class="stripe-amount">
          <div class="lbl">Montant à payer</div>
          <div id="pay-amount" class="amt"></div>
        </div>
        <div id="pay-breakdown" class="stripe-breakdown" style="display:none;"></div>
        <div id="pay-protection" class="stripe-protect" style="display:none;"></div>

        <form id="stripe-form" onsubmit="event.preventDefault();processStripePayment();">
          <label class="stripe-label" for="sc-email">E-mail</label>
          <input type="email" id="sc-email" class="stripe-input" placeholder="vous@email.fr" autocomplete="email">

          <label class="stripe-label" for="sc-number">Informations de carte</label>
          <div class="stripe-card-group">
            <div class="stripe-card-num">
              <input type="text" id="sc-number" class="stripe-input" placeholder="1234 1234 1234 1234"
                     inputmode="numeric" autocomplete="cc-number" maxlength="23" oninput="formatCardNumber(this)">
              <span id="sc-brand" class="stripe-brand">💳</span>
            </div>
            <div class="stripe-card-row">
              <input type="text" id="sc-exp" class="stripe-input" placeholder="MM / AA"
                     inputmode="numeric" autocomplete="cc-exp" maxlength="7" oninput="formatCardExpiry(this)">
              <input type="text" id="sc-cvc" class="stripe-input" placeholder="CVC"
                     inputmode="numeric" autocomplete="cc-csc" maxlength="4"
                     oninput="this.value=this.value.replace(/\\D/g,'')">
            </div>
          </div>

          <label class="stripe-label" for="sc-name">Nom du titulaire</label>
          <input type="text" id="sc-name" class="stripe-input" placeholder="Nom et prénom" autocomplete="cc-name">

          <div id="sc-error" class="stripe-error" style="display:none;"></div>

          <button type="submit" id="sc-pay-btn" class="stripe-pay-btn">Payer</button>
        </form>

        <div class="stripe-footer">
          <span class="stripe-lock">🔒</span> Paiement chiffré — Propulsé par <span class="stripe-wordmark">stripe</span>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
}

// Ouvre le checkout. options = { breakdown:[{label,value,muted}], footnote:"..." }
function openPaymentModal(montant, label, onPaid, onCancel, options) {
  injectPaymentModal();
  _payOnPaid = onPaid || null;
  _payOnCancel = onCancel || null;
  _lastPaymentDecline = "";
  options = options || {};
  _payAmount = Number(montant) || 0;

  document.getElementById("pay-label").textContent = label || "";
  document.getElementById("pay-amount").textContent = formatEuro(_payAmount);

  // Récapitulatif détaillé (frais de plateforme, versement au vendeur…)
  const bd = document.getElementById("pay-breakdown");
  if (options.breakdown && options.breakdown.length) {
    bd.innerHTML = options.breakdown.map(l =>
      `<div class="stripe-bd-line ${l.muted ? 'muted' : ''}"><span>${l.label}</span><span>${l.value}</span></div>`
    ).join("") + (options.footnote ? `<div class="stripe-bd-note">${options.footnote}</div>` : "");
    bd.style.display = "block";
  } else {
    bd.innerHTML = ""; bd.style.display = "none";
  }

  // Encart « Protection des Achats » — rassurance affichée au moment de payer
  const pp = document.getElementById("pay-protection");
  if (pp) {
    if (options.protectionHtml) {
      pp.innerHTML = options.protectionHtml;
      pp.style.display = "block";
    } else {
      pp.innerHTML = ""; pp.style.display = "none";
    }
  }

  // Réinitialise le formulaire
  ["sc-number","sc-exp","sc-cvc","sc-name"].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = "";
  });
  const emailEl = document.getElementById("sc-email");
  if (emailEl) { const s = getSession(); emailEl.value = (s && s.email) || ""; }
  updateCardBrand("");
  const err = document.getElementById("sc-error");
  if (err) err.style.display = "none";
  setStripeFormDisabled(false);
  _payBtnLabel = "Payer " + formatEuro(_payAmount);
  const btn = document.getElementById("sc-pay-btn");
  btn.className = "stripe-pay-btn";
  btn.disabled = false;
  btn.textContent = _payBtnLabel;

  document.getElementById("payment-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

// Traite le paiement : valide la carte puis accepte ou refuse (cartes de test)
function processStripePayment() {
  const errBox = document.getElementById("sc-error");
  const btn = document.getElementById("sc-pay-btn");
  const showErr = msg => { errBox.textContent = msg; errBox.style.display = "block"; };
  errBox.style.display = "none";

  const numEl = document.getElementById("sc-number");
  const expEl = document.getElementById("sc-exp");
  const cvcEl = document.getElementById("sc-cvc");
  const nameEl = document.getElementById("sc-name");
  const emailEl = document.getElementById("sc-email");
  const digits = (numEl.value || "").replace(/\D/g, "");

  // --- Validation du format de la carte ---
  if (emailEl && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((emailEl.value || "").trim())) {
    showErr("Veuillez saisir une adresse e-mail valide."); emailEl.focus(); return;
  }
  if (!luhnValid(digits)) {
    showErr("Le numéro de carte est invalide."); numEl.focus(); return;
  }
  const expDigits = (expEl.value || "").replace(/\D/g, "");
  if (expDigits.length !== 4) {
    showErr("La date d'expiration est incomplète."); expEl.focus(); return;
  }
  const mm = parseInt(expDigits.slice(0, 2), 10);
  const yy = 2000 + parseInt(expDigits.slice(2), 10);
  if (mm < 1 || mm > 12) {
    showErr("Le mois d'expiration est invalide."); expEl.focus(); return;
  }
  const expEnd = new Date(yy, mm, 0, 23, 59, 59); // dernier jour du mois
  if (expEnd < new Date()) {
    showErr("La carte a expiré."); expEl.focus(); return;
  }
  if (!/^\d{3,4}$/.test((cvcEl.value || "").trim())) {
    showErr("Le code de sécurité (CVC) est invalide."); cvcEl.focus(); return;
  }
  if (!(nameEl.value || "").trim()) {
    showErr("Veuillez indiquer le nom du titulaire de la carte."); nameEl.focus(); return;
  }

  // --- État « traitement en cours » ---
  setStripeFormDisabled(true);
  btn.disabled = true;
  btn.className = "stripe-pay-btn processing";
  btn.innerHTML = `<span class="stripe-spinner"></span> Traitement du paiement…`;

  setTimeout(function () {
    const declineMsg = STRIPE_TEST_CARDS[digits];
    if (declineMsg) {
      // PAIEMENT REFUSÉ → aucun achat
      _lastPaymentDecline = declineMsg;
      setStripeFormDisabled(false);
      btn.disabled = false;
      btn.className = "stripe-pay-btn";
      btn.textContent = _payBtnLabel;
      showErr("⚠ " + declineMsg + " Aucun montant n'a été débité — l'achat n'est pas effectué.");
      return;
    }
    // PAIEMENT ACCEPTÉ → on confirme puis on déclenche l'achat
    btn.className = "stripe-pay-btn ok";
    btn.innerHTML = "✓ Paiement accepté";
    setTimeout(function () {
      const m = document.getElementById("payment-modal");
      if (m) m.classList.remove("open");
      document.body.style.overflow = "";
      const cb = _payOnPaid;
      _payOnPaid = null; _payOnCancel = null;
      if (cb) cb();
    }, 750);
  }, 1700);
}

function closePaymentModal() {
  const m = document.getElementById("payment-modal");
  if (m) m.classList.remove("open");
  document.body.style.overflow = "";
  const cb = _payOnCancel;
  _payOnPaid = null; _payOnCancel = null;
  if (cb) cb();
}

// ============================================================
// PROGRAMME « PROTECTION DES ACHATS VOITUREPREPA »
// ------------------------------------------------------------
// Protection nommée et concrète : l'acheteur sait exactement ce que
// la commission lui achète. Réutilisé sur protection.html, dans la
// modale de contact et dans la modale de paiement.
// ============================================================

// Les garanties concrètes incluses dans la Protection des Achats
const PROTECTION_PROMISES = [
  { ico:"🔒", titre:"Argent bloqué jusqu'au bout",
    desc:"Votre paiement est conservé jusqu'à validation et n'est versé au vendeur qu'une fois le véhicule reçu ou récupéré et les papiers de vente signés." },
  { ico:"📄", titre:"Contrôle des documents",
    desc:"Vérification de la carte grise, du contrôle technique et de la carte d'identité du vendeur." },
  { ico:"🛡️", titre:"Vérification administrative HistoVec",
    desc:"Contrôle officiel du véhicule via HistoVec : gage, vol déclaré, historique des sinistres." }
];

// Liste HTML des garanties (page Protection + modales)
function protectionPromisesHtml() {
  return PROTECTION_PROMISES.map(p =>
    `<div class="protect-promise">
       <span class="protect-promise-ico">${p.ico}</span>
       <div><strong>${p.titre}</strong><span>${p.desc}</span></div>
     </div>`).join("");
}

// Bloc de contraste « sur la plateforme = protégé / en dehors = aucun rempart »
function protectionContrastHtml() {
  return `
  <div class="protect-contrast">
    <div class="protect-col protect-col--safe">
      <div class="protect-col-head">✅ Sur VoiturePrepa</div>
      <ul>
        <li>Paiement sécurisé, fonds conservés jusqu'à validation</li>
        <li>Contrôle des documents (carte grise, CT, identité)</li>
        <li>Vérification HistoVec : gage, vol, sinistres</li>
        <li>En cas de litige, vous êtes accompagné</li>
      </ul>
    </div>
    <div class="protect-col protect-col--danger">
      <div class="protect-col-head">⚠️ En dehors de la plateforme</div>
      <ul>
        <li>Aucun rempart contre les fraudes</li>
        <li>Virement perdu : aucun recours possible</li>
        <li>Aucune vérification du véhicule ni du vendeur</li>
        <li>Vous êtes seul face à l'arnaque</li>
      </ul>
    </div>
  </div>
  <p class="protect-stat">
    📈 Les fraudes au virement (faux RIB), typiques des arnaques entre particuliers sur
    Leboncoin ou Vinted, ont progressé de <strong>+196 % en 2025</strong>.
    <span>Source : Cybermalveillance.gouv.fr — rapport 2025.</span>
  </p>`;
}

// Encart « Protection incluse » affiché dans la modale de paiement
function protectionCheckoutHtml() {
  return `<div class="protect-checkout">
    <div class="protect-checkout-head">🛡️ Protection des Achats VoiturePrepa incluse</div>
    <ul>
      <li>🔒 Argent bloqué jusqu'à réception ou récupération du véhicule</li>
      <li>📄 Contrôle des documents : carte grise, contrôle technique, identité</li>
      <li>🛡️ Vérification HistoVec : gage, vol, sinistres</li>
    </ul>
  </div>`;
}

// ---------- Modale d'avertissement avant de contacter un vendeur ----------
let _protectOnContinue = null;
function injectProtectionModal() {
  if (document.getElementById("protection-modal")) return;
  const html = `
  <div class="modal-backdrop" id="protection-modal" onclick="if(event.target===this)closeProtectionNotice()">
    <div class="modal">
      <div class="modal-head">
        <h3>🛡️ Restez protégé : échangez via VoiturePrepa</h3>
        <button class="close" onclick="closeProtectionNotice()" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:6px;font-size:14px;">
          Gardez la conversation et le paiement <strong>sur la plateforme</strong>.
          Tout paiement réalisé en dehors (virement, espèces avant remise…)
          vous fait perdre <strong>l'intégralité de la Protection des Achats</strong>.
        </p>
        ${protectionContrastHtml()}
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeProtectionNotice()">Annuler</button>
        <button class="btn btn-primary" onclick="continueProtectionNotice()">Continuer vers la messagerie sécurisée</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
}
function openProtectionNotice(onContinue) {
  injectProtectionModal();
  _protectOnContinue = onContinue || null;
  document.getElementById("protection-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeProtectionNotice() {
  const m = document.getElementById("protection-modal");
  if (m) m.classList.remove("open");
  document.body.style.overflow = "";
  _protectOnContinue = null;
}
function continueProtectionNotice() {
  const cb = _protectOnContinue;
  const m = document.getElementById("protection-modal");
  if (m) m.classList.remove("open");
  document.body.style.overflow = "";
  _protectOnContinue = null;
  if (cb) cb();
}

// ---------- Mini-carte de France interactive pour le choix du garage d'inspection ----------
let _garageMaps = {}; // id de conteneur -> carte Leaflet

// Initialise (ou rafraîchit) une carte des garages partenaires dans un conteneur donné.
// Cliquer un marqueur renseigne le sélecteur <select id=selectId>.
function initGarageMiniMap(containerId, selectId) {
  if (typeof L === "undefined") return null; // Leaflet non chargé : le sélecteur suffit
  if (!document.getElementById(containerId)) return null;
  if (_garageMaps[containerId]) {
    const mp = _garageMaps[containerId];
    setTimeout(() => mp.invalidateSize(), 100);
    return mp;
  }
  const map = L.map(containerId).setView([46.6, 2.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap"
  }).addTo(map);
  const icon = L.divIcon({
    className: "garage-mini-marker",
    html: '<div style="background:var(--orange);border:2px solid #fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:#fff;font-size:12px;">🔧</span></div>',
    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -26]
  });
  getGarages().forEach(g => {
    L.marker([g.lat, g.lng], { icon: icon }).addTo(map)
      .bindPopup(`<strong>${g.nom}</strong><br><span style="color:#666;">${g.dept} · ${g.ville}</span><br>`
        + `<a href="#" onclick="pickGarageFromMap('${selectId}',${g.id});return false;">✓ Choisir ce garage</a>`);
  });
  // Lorsque le vendeur change le sélecteur, on recentre la carte sur le garage choisi
  const sel = document.getElementById(selectId);
  if (sel) {
    sel.addEventListener("change", () => {
      const g = getGarages().find(x => (x.nom + " — " + x.ville) === sel.value);
      if (g) map.setView([g.lat, g.lng], 10);
    });
  }
  _garageMaps[containerId] = map;
  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

// Sélectionne un garage depuis un marqueur de la carte
function pickGarageFromMap(selectId, garageId) {
  const g = getGarages().find(x => x.id === garageId);
  const sel = document.getElementById(selectId);
  if (g && sel) {
    sel.value = g.nom + " — " + g.ville;
    sel.dispatchEvent(new Event("change"));
  }
}

// ---------- Modèles d'emails automatiques (modifiables par l'administrateur) ----------
const EMAIL_TEMPLATES_KEY = "voitureprepa_email_templates";
const EMAIL_TEMPLATES_DEFAULT = [
  {
    id: "suggestion",
    titre: "Suggestion d'options",
    quand: "Envoyé 14 jours après le dépôt, si aucune option payante n'a été souscrite",
    objet: "Boostez votre annonce et vendez plus vite",
    corps: "Bonjour [Prénom],\n\n"
      + "Pour gagner en visibilité et capter un maximum d'acheteurs, plusieurs options sont disponibles :\n\n"
      + "⚡ Pack Urgence (5,99 €) — étiquette spéciale « Urgente » et filtre dédié dans les recherches, pendant 3 mois.\n"
      + "🚀 Pack Remontada — votre annonce remonte en tête de liste des résultats, avec l'étiquette « Premium ». "
      + "Formules : Quotidien 34,99 € / Hebdo court 9,99 € / Hebdo long 14,99 €.\n\n"
      + "Rendez-vous sur la page « Boost annonce » pour en profiter.\n\n"
      + "L'équipe VoiturePrepa.fr",
    cta_label: "Booster mon annonce",
    cta_url: "tarifs.html"
  },
  {
    id: "renouvellement",
    titre: "Rappel de renouvellement",
    quand: "Envoyé 2 semaines avant l'expiration de l'annonce — particuliers uniquement",
    objet: "Renouvelez gratuitement votre annonce",
    corps: "Bonjour [Prénom],\n\n"
      + "Votre annonce « [Titre de l'annonce] » arrive à expiration dans 14 jours.\n\n"
      + "Bonne nouvelle : le renouvellement est entièrement gratuit ! "
      + "Prolongez votre annonce de 3 mois supplémentaires en un seul clic.\n\n"
      + "⚠️ Les options payantes prises lors du dépôt doivent être reconduites séparément.\n\n"
      + "L'équipe VoiturePrepa.fr",
    cta_label: "Renouveler gratuitement",
    cta_url: "profil.html"
  }
];
function loadEmailTemplates() {
  try {
    const saved = JSON.parse(localStorage.getItem(EMAIL_TEMPLATES_KEY) || "null");
    if (Array.isArray(saved) && saved.length === EMAIL_TEMPLATES_DEFAULT.length) {
      // Les métadonnées (titre, quand) restent celles du défaut ; l'objet et le corps sont éditables
      return EMAIL_TEMPLATES_DEFAULT.map((def, i) => ({
        id: def.id, titre: def.titre, quand: def.quand,
        objet: (saved[i] && saved[i].objet) || def.objet,
        corps: (saved[i] && saved[i].corps != null) ? saved[i].corps : def.corps,
        cta_label: (saved[i] && saved[i].cta_label != null) ? saved[i].cta_label : def.cta_label,
        cta_url: (saved[i] && saved[i].cta_url) || def.cta_url
      }));
    }
  } catch (e) {}
  return EMAIL_TEMPLATES_DEFAULT.map(t => Object.assign({}, t));
}
function saveEmailTemplates(list) {
  try { localStorage.setItem(EMAIL_TEMPLATES_KEY, JSON.stringify(list)); } catch (e) {}
}

// ---------- Signalements d'annonces (à vérifier par l'administrateur) ----------
const REPORTS_KEY = "voitureprepa_reports";
function loadReports() {
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveReports(list) {
  try { localStorage.setItem(REPORTS_KEY, JSON.stringify(list)); } catch(e){}
}
// Enregistre un signalement d'annonce
function addReport(data) {
  const list = loadReports();
  const rep = Object.assign({
    id: "rep-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    status: "pending",   // pending → dismissed (classé) / handled (annonce retirée)
    reported_at: new Date().toISOString()
  }, data);
  list.unshift(rep);
  saveReports(list);
  return rep;
}
// Met à jour un signalement
function updateReport(id, patch) {
  const list = loadReports();
  const r = list.find(x => x.id === id);
  if (!r) return false;
  Object.assign(r, patch);
  saveReports(list);
  return true;
}

// ---------- Messages de contact (formulaire « Nous contacter ») ----------
const CONTACT_KEY = "voitureprepa_contact_messages";
function loadContactMessages() {
  try { return JSON.parse(localStorage.getItem(CONTACT_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveContactMessages(list) {
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify(list)); } catch(e){}
}
// Enregistre un message envoyé via le formulaire de contact
function addContactMessage(data) {
  const list = loadContactMessages();
  const msg = Object.assign({
    id: "contact-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    status: "nouveau",          // nouveau → repondu
    reply: "", replied_at: null,
    created_at: new Date().toISOString()
  }, data);
  list.unshift(msg);
  saveContactMessages(list);
  return msg;
}
// Met à jour un message de contact (ex. ajout d'une réponse)
function updateContactMessage(id, patch) {
  const list = loadContactMessages();
  const m = list.find(x => x.id === id);
  if (!m) return false;
  Object.assign(m, patch);
  saveContactMessages(list);
  return true;
}

// ---------- Avis acheteurs sur les vendeurs (après transaction finalisée) ----------
const REVIEWS_KEY = "voitureprepa_reviews";
function loadReviews() {
  try { return JSON.parse(localStorage.getItem(REVIEWS_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveReviews(list) {
  try { localStorage.setItem(REVIEWS_KEY, JSON.stringify(list)); } catch(e){}
}
// Enregistre un avis acheteur sur un vendeur
function addReview(data) {
  const list = loadReviews();
  const rev = Object.assign({
    id: "avis-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    created_at: new Date().toISOString()
  }, data);
  list.unshift(rev);
  saveReviews(list);
  return rev;
}
// Avis reçus par un vendeur (identifié par son email)
function reviewsForSeller(email) {
  email = (email || "").toLowerCase().trim();
  if (!email) return [];
  return loadReviews().filter(r => (r.seller_email || "").toLowerCase().trim() === email);
}
// Note moyenne d'un vendeur : { avg, count } ou null si aucun avis
function sellerRating(email) {
  const revs = reviewsForSeller(email);
  if (!revs.length) return null;
  const sum = revs.reduce((s, r) => s + (Number(r.note) || 0), 0);
  return { avg: Math.round((sum / revs.length) * 10) / 10, count: revs.length };
}
// Représentation en étoiles d'une note sur 5 (ex : 4 → ★★★★☆)
function starsHtml(note) {
  const n = Math.max(0, Math.min(5, Math.round(Number(note) || 0)));
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
}

// ---------- Transactions d'achat (vente en ligne sécurisée) ----------
const TXN_KEY = "voitureprepa_transactions";
function loadTransactions() {
  try { return JSON.parse(localStorage.getItem(TXN_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveTransactions(list) {
  try { localStorage.setItem(TXN_KEY, JSON.stringify(list)); } catch(e){}
}
// Commission prélevée par la plateforme sur chaque vente (en %)
const COMMISSION_RATES = { voiture: 3, piece: 10 };
// Taux applicable selon le type d'annonce (voiture = 3 %, pièce = 10 %)
function commissionRate(type) {
  return type === "voiture" ? COMMISSION_RATES.voiture : COMMISSION_RATES.piece;
}
// Montant de commission (€, arrondi) pour un prix et un type donnés
function commissionAmount(prix, type) {
  return Math.round((Number(prix) || 0) * commissionRate(type) / 100);
}

// Frais de protection acheteur — programme « Protection des Achats VoiturePrepa ».
// Payés par l'ACHETEUR, en plus du prix, clairement étiquetés « protection acheteur ».
const BUYER_PROTECTION_RATE = 2; // %
function buyerProtectionFee(prix) {
  return Math.round((Number(prix) || 0) * BUYER_PROTECTION_RATE / 100);
}
// Téléphone enregistré d'un compte — dévoilé uniquement une fois la transaction engagée
function userPhone(email) {
  const acc = findAccount(email);
  return (acc && acc.telephone) || "";
}

// Crée une transaction d'achat
//  Voiture : paid (fonds bloqués) → received (fonds débloqués par l'acheteur)
//  Pièce   : paid → shipped → received
function addTransaction(data) {
  const list = loadTransactions();
  const prix = Number(data.prix) || 0;
  const t = Object.assign({
    id: "txn-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    status: "paid",
    created_at: new Date().toISOString(),
    commission_rate: commissionRate(data.type),       // part vendeur (3 % / 10 %)
    commission: commissionAmount(prix, data.type),
    protection_rate: BUYER_PROTECTION_RATE,           // part acheteur (2 %)
    protection_fee: buyerProtectionFee(prix)
  }, data);
  list.unshift(t);
  saveTransactions(list);
  return t;
}
function updateTransaction(id, patch) {
  const list = loadTransactions();
  const t = list.find(x => x.id === id);
  if (!t) return false;
  Object.assign(t, patch);
  saveTransactions(list);
  return true;
}
// Transactions où le compte est acheteur
function myPurchases(email) {
  email = (email || "").toLowerCase().trim();
  if (!email) return [];
  return loadTransactions().filter(t => (t.buyer_email || "").toLowerCase().trim() === email);
}
// Transactions où le compte est vendeur
function mySales(email) {
  email = (email || "").toLowerCase().trim();
  if (!email) return [];
  return loadTransactions().filter(t => (t.seller_email || "").toLowerCase().trim() === email);
}

// ---------- Journal comptable : packs, abonnements et inspections payés ----------
// Sert au suivi comptable de l'administrateur (toutes les recettes de la plateforme).
const REVENUE_KEY = "voitureprepa_revenue";
function loadRevenue() {
  try { return JSON.parse(localStorage.getItem(REVENUE_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveRevenue(list) {
  try { localStorage.setItem(REVENUE_KEY, JSON.stringify(list)); } catch(e){}
}
// Enregistre une recette. category : "abonnement" | "pack" | "inspection"
function addRevenue(data) {
  if (!data || (Number(data.amount) || 0) <= 0) return null;
  const list = loadRevenue();
  const entry = Object.assign({
    id: "rev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    date: new Date().toISOString()
  }, data);
  list.unshift(entry);
  saveRevenue(list);
  return entry;
}

// ---------- Messagerie : conversations acheteur ↔ vendeur ----------
// Stockage global : acheteur et vendeur partagent la même conversation
// (le même navigateur), chacun la voit en se connectant à son compte.
const THREADS_KEY = "voitureprepa_threads";
const _emailEq = (a, b) => (a || "").toLowerCase().trim() === (b || "").toLowerCase().trim();

function loadThreads() {
  try { return JSON.parse(localStorage.getItem(THREADS_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveThreads(list) {
  try { localStorage.setItem(THREADS_KEY, JSON.stringify(list)); } catch(e){}
}

// Récupère (ou crée) la conversation entre un acheteur et un vendeur pour une annonce.
// data = { ad_id, ad_titre, ad_img, buyer_email, buyer_name, seller_email, seller_name }
function getOrCreateThread(data) {
  const list = loadThreads();
  let t = list.find(x => String(x.ad_id) === String(data.ad_id)
    && _emailEq(x.buyer_email, data.buyer_email)
    && _emailEq(x.seller_email, data.seller_email));
  if (t) return t;
  const now = new Date().toISOString();
  t = {
    id: "thread-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    ad_id: data.ad_id, ad_titre: data.ad_titre || "Annonce", ad_img: data.ad_img || "",
    buyer_email: (data.buyer_email || "").toLowerCase().trim(), buyer_name: data.buyer_name || "Acheteur",
    seller_email: (data.seller_email || "").toLowerCase().trim(), seller_name: data.seller_name || "Vendeur",
    messages: [], reads: {}, created_at: now, updated_at: now
  };
  list.unshift(t);
  saveThreads(list);
  return t;
}

function getThread(id) {
  return loadThreads().find(t => String(t.id) === String(id)) || null;
}

// Ajoute un message dans une conversation ; renvoie le message créé ou null
function addThreadMessage(threadId, fromEmail, fromName, text) {
  const list = loadThreads();
  const t = list.find(x => String(x.id) === String(threadId));
  if (!t || !(text || "").trim()) return null;
  const now = new Date().toISOString();
  const msg = {
    id: "m-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
    from_email: (fromEmail || "").toLowerCase().trim(),
    from_name: fromName || "Membre",
    text: text.trim(), at: now
  };
  t.messages.push(msg);
  t.updated_at = now;
  if (!t.reads) t.reads = {};
  t.reads[msg.from_email] = now; // l'expéditeur a « lu » son propre message
  saveThreads(list);
  return msg;
}

// Conversations où l'utilisateur est acheteur ou vendeur (plus récentes d'abord)
function threadsForUser(email) {
  email = (email || "").toLowerCase().trim();
  if (!email) return [];
  return loadThreads()
    .filter(t => _emailEq(t.buyer_email, email) || _emailEq(t.seller_email, email))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

// Marque une conversation comme lue par un utilisateur (horodatage)
function markThreadRead(threadId, email) {
  const list = loadThreads();
  const t = list.find(x => String(x.id) === String(threadId));
  if (!t) return;
  if (!t.reads) t.reads = {};
  t.reads[(email || "").toLowerCase().trim()] = new Date().toISOString();
  saveThreads(list);
}

// Nombre de messages non lus d'une conversation pour un utilisateur
function threadUnreadCount(t, email) {
  email = (email || "").toLowerCase().trim();
  const last = (t.reads && t.reads[email]) ? new Date(t.reads[email]) : new Date(0);
  return (t.messages || []).filter(m =>
    !_emailEq(m.from_email, email) && new Date(m.at) > last).length;
}

// Total de messages non lus pour un utilisateur (toutes conversations)
function unreadMessagesTotal(email) {
  return threadsForUser(email).reduce((s, t) => s + threadUnreadCount(t, email), 0);
}

// ---------- Formatage de date conviviale pour les annonces ----------
function formatAdDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hhmm = d.getHours().toString().padStart(2,"0") + "h" + d.getMinutes().toString().padStart(2,"0");
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return "il y a " + diffMin + " min";
  if (sameDay) return "Aujourd'hui à " + hhmm;
  if (isYesterday) return "Hier à " + hhmm;
  if (diffH < 24 * 7) return "il y a " + Math.floor(diffH / 24) + " jour" + (Math.floor(diffH/24)>1?"s":"");
  // Au-delà : date complète en français
  const mois = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
  return d.getDate() + " " + mois[d.getMonth()] + " " + d.getFullYear() + " à " + hhmm;
}

// ---------- Garages fictifs (mock) ----------
const MOCK_GARAGES = [
  { id:1, nom:"BR Performance Paris", ville:"Paris", dept:"75", lat:48.8566, lng:2.3522, prestations:"Reprogrammation, Stage 1 à 3, banc de puissance" },
  { id:2, nom:"GTI Tuning Lyon", ville:"Lyon", dept:"69", lat:45.7640, lng:4.8357, prestations:"Stage 1-2, échappement sur mesure" },
  { id:3, nom:"Auto Sport Méditerranée", ville:"Marseille", dept:"13", lat:43.2965, lng:5.3698, prestations:"Préparation moteur, suspension, covering" },
  { id:4, nom:"Garage du Nord Préparation", ville:"Lille", dept:"59", lat:50.6292, lng:3.0573, prestations:"Stage 1 à 4, échappement, admission" },
  { id:5, nom:"Atlantic Performance", ville:"Nantes", dept:"44", lat:47.2184, lng:-1.5536, prestations:"Reprogrammation éthanol, stages" },
  { id:6, nom:"Pyrénées Tuning", ville:"Toulouse", dept:"31", lat:43.6047, lng:1.4442, prestations:"Préparation rallye et circuit" },
  { id:7, nom:"Bretagne Sport Auto", ville:"Rennes", dept:"35", lat:48.1173, lng:-1.6778, prestations:"Préparation, échappement, suspensions" },
  { id:8, nom:"Strasbourg Performance", ville:"Strasbourg", dept:"67", lat:48.5734, lng:7.7521, prestations:"Stage 1 à 3, diagnostic, banc" },
  { id:9, nom:"Bordeaux Tuning", ville:"Bordeaux", dept:"33", lat:44.8378, lng:-0.5792, prestations:"Préparation moteur, covering" },
];

// ---------- Garages partenaires ajoutés par l'administrateur ----------
// MOCK_GARAGES est la liste de garages par défaut. L'administrateur peut en
// ajouter d'autres depuis l'espace admin ; ils sont conservés dans localStorage
// et apparaissent partout (annuaire, carte de France, choix d'inspection).
const PARTNER_GARAGES_KEY = "voitureprepa_partner_garages";

function loadPartnerGarages() {
  try { return JSON.parse(localStorage.getItem(PARTNER_GARAGES_KEY) || "[]"); }
  catch (e) { return []; }
}
function savePartnerGarages(list) {
  try { localStorage.setItem(PARTNER_GARAGES_KEY, JSON.stringify(list)); } catch (e) {}
}
// Liste complète : garages par défaut + garages ajoutés par l'administrateur
function getGarages() {
  return [...MOCK_GARAGES, ...loadPartnerGarages()];
}
// Ajoute un garage partenaire et renvoie l'objet créé
function addPartnerGarage(data) {
  const list = loadPartnerGarages();
  const g = {
    id: Date.now(),
    custom: true,
    nom: (data.nom || "").trim(),
    ville: (data.ville || "").trim(),
    dept: String(data.dept || "").trim(),
    lat: parseFloat(data.lat),
    lng: parseFloat(data.lng),
    prestations: (data.prestations || "").trim()
  };
  list.push(g);
  savePartnerGarages(list);
  return g;
}
// Supprime un garage ajouté par l'admin (les garages par défaut sont conservés)
function deletePartnerGarage(id) {
  savePartnerGarages(loadPartnerGarages().filter(g => g.id !== id));
}

// ---------- Échappement HTML — anti-XSS pour les chaînes saisies par l'utilisateur ----------
function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return escHtml(s).replace(/"/g, "&quot;");
}

// ---------- SEO : surcharges back-office des balises meta ----------
// Les valeurs éditées dans l'onglet admin « SEO » sont stockées ici et appliquées
// au chargement de chaque page (title, meta description, OG, Twitter Card).
// Sur un site en production, ces valeurs seraient stockées en base et servies
// directement par le serveur (le navigateur ne ferait pas de surcharge en JS).
const SEO_OVERRIDES_KEY = "voitureprepa_seo_overrides";

function loadSeoOverrides() {
  try { return JSON.parse(localStorage.getItem(SEO_OVERRIDES_KEY) || "{}"); }
  catch (e) { return {}; }
}
function saveSeoOverrides(map) {
  try { localStorage.setItem(SEO_OVERRIDES_KEY, JSON.stringify(map)); } catch (e) {}
}
function currentPageId() {
  const p = (location.pathname || "").split("/").pop() || "";
  return p || "index.html";
}
function applySeoOverrides() {
  const map = loadSeoOverrides();
  const ov = map[currentPageId()];
  if (!ov) return;
  if (ov.title) {
    const t = document.querySelector("title");
    if (t) t.textContent = ov.title;
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]')
      .forEach(m => m.setAttribute("content", ov.title));
  }
  if (ov.description) {
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute("content", ov.description);
    document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]')
      .forEach(m => m.setAttribute("content", ov.description));
  }
}

// ---------- Espace administrateur : auth réelle via Supabase + role=admin ----------
// Le contrôle réel est côté serveur (RLS Supabase + helper SQL is_admin()).
// Côté client, on vérifie au chargement de admin.html que la session Supabase
// courante appartient à un profil avec role='admin'. Un flag local sert juste
// à éviter de re-fetcher le profil à chaque clic.
const ADMIN_LOCAL_FLAG = "vp_admin_session_ok";

async function isAdminAuthed() {
  try {
    if (!window.VP_SB) return false;
    const { user } = await VP_SB.getUser();
    if (!user) { localStorage.removeItem(ADMIN_LOCAL_FLAG); return false; }
    const profile = await VP_SB.getMyProfile();
    const isAdmin = !!(profile && profile.role === "admin");
    if (isAdmin) localStorage.setItem(ADMIN_LOCAL_FLAG, "1");
    else         localStorage.removeItem(ADMIN_LOCAL_FLAG);
    return isAdmin;
  } catch (e) {
    console.warn("isAdminAuthed:", e);
    return false;
  }
}

// Version synchrone optimiste pour les UI qui ne peuvent pas await
// (ex: rendu d'un bouton). Le vrai contrôle reste async + serveur.
function isAdminAuthedSync() {
  return localStorage.getItem(ADMIN_LOCAL_FLAG) === "1";
}

// Étape 1 du 2FA : vérifier email + password + role=admin, puis déconnecter
// (on ne crée pas de session tant que l'OTP n'est pas vérifié)
async function adminVerifyCredentials(email, pwd) {
  email = (email || "").trim().toLowerCase();
  pwd   = pwd || "";
  if (!email || !pwd) return "Email et mot de passe requis.";
  if (!window.VP_SB) return "Supabase non chargé. Rechargez la page.";
  try {
    const { error } = await VP_SB.signIn(email, pwd);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("invalid login")) return "Email ou mot de passe incorrect.";
      if (msg.includes("not confirmed")) return "Email non confirmé. Vérifiez votre boîte mail.";
      return error.message || "Connexion impossible.";
    }
    const profile = await VP_SB.getMyProfile();
    await VP_SB.signOut(); // On déconnecte : la session sera créée à la fin du flux OTP
    if (!profile || profile.role !== "admin") {
      return "Ce compte n'a pas les droits administrateur.";
    }
    return "";
  } catch (e) {
    console.error("adminVerifyCredentials:", e);
    return "Connexion impossible : " + (e.message || e);
  }
}

// Étape 2 : envoie un code OTP à 6 chiffres par email (via Supabase + Brevo)
async function adminSendOtp(email) {
  if (!window.VP_SB || !VP_SB.client) return "Supabase non chargé.";
  try {
    const { error } = await VP_SB.client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("rate")) return "Trop de tentatives, réessayez dans une minute.";
      return "Envoi du code échoué : " + error.message;
    }
    return "";
  } catch (e) {
    return "Envoi du code échoué : " + (e.message || e);
  }
}

// Étape 3 : valide le code OTP et crée la session
async function adminVerifyOtp(email, code) {
  if (!window.VP_SB || !VP_SB.client) return "Supabase non chargé.";
  if (!code) return "Saisissez le code reçu par email.";
  try {
    const { error } = await VP_SB.client.auth.verifyOtp({
      email, token: code, type: "email"
    });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("expired")) return "Code expiré. Recommencez la connexion.";
      if (msg.includes("invalid") || msg.includes("token")) return "Code invalide.";
      return "Code invalide : " + error.message;
    }
    // Re-vérifie role=admin (sécurité supplémentaire)
    const profile = await VP_SB.getMyProfile();
    if (!profile || profile.role !== "admin") {
      await VP_SB.signOut();
      return "Ce compte n'a pas les droits administrateur.";
    }
    localStorage.setItem(ADMIN_LOCAL_FLAG, "1");
    return "";
  } catch (e) {
    console.error("adminVerifyOtp:", e);
    return "Vérification échouée : " + (e.message || e);
  }
}

// Compat : ancien nom (au cas où d'autres pages l'appellent encore)
async function adminLoginAttempt(email, pwd) {
  return adminVerifyCredentials(email, pwd);
}

async function adminLogout() {
  localStorage.removeItem(ADMIN_LOCAL_FLAG);
  try { if (window.VP_SB) await VP_SB.signOut(); } catch (e) {}
}

// ---------- Helpers ----------
function $(s, p=document){ return p.querySelector(s); }
function $$(s, p=document){ return Array.from(p.querySelectorAll(s)); }

function fillSelect(sel, opts, placeholder) {
  if (!sel) return;
  sel.innerHTML = "";
  if (placeholder) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = placeholder; sel.appendChild(o);
  }
  opts.forEach(v => {
    const o = document.createElement("option");
    if (typeof v === "object") { o.value = v.value; o.textContent = v.label; }
    else { o.value = v; o.textContent = v; }
    sel.appendChild(o);
  });
}

// ---------- Recherche depuis la barre du header ----------
function doHeaderSearch() {
  const q = document.getElementById("hdr-search-q").value.trim();
  const cat = document.getElementById("hdr-search-cat").value;
  const reg = document.getElementById("hdr-search-reg").value;
  // v15 : plus d'option "Tout" ni "garage", cat vaut "voiture" ou "piece"
  let url = (cat === "piece") ? "annonces.html?type=piece" : "annonces.html?type=voiture";
  const params = [];
  if (q) params.push("q=" + encodeURIComponent(q));
  if (reg && reg !== "Toute la France") params.push("region=" + encodeURIComponent(reg));
  if (params.length) url += (url.includes("?") ? "&" : "?") + params.join("&");
  window.location = url;
}

// Adapte le placeholder selon la catégorie
function updateHeaderPlaceholder(cat) {
  const inp = document.getElementById("hdr-search-q");
  if (!inp) return;
  // v15 : uniquement voiture ou piece
  if (cat === "piece") inp.placeholder = "Turbo, échappement, suspension, jantes...";
  else inp.placeholder = "Marque, modèle, stage, type de préparation...";
  fitHeaderCat();
}

// Ajuste la largeur d'un <select> de l'en-tête à l'option choisie, pour que le
// texte s'affiche en entier sans rogner les autres champs ni le bouton « Rechercher ».
function fitHeaderSelect(selId, padding) {
  const sel = document.getElementById(selId);
  if (!sel || !sel.options[sel.selectedIndex]) return;
  let meas = document.getElementById("hdr-sel-measure");
  if (!meas) {
    meas = document.createElement("span");
    meas.id = "hdr-sel-measure";
    meas.style.cssText = "position:absolute;left:-9999px;top:-9999px;white-space:nowrap;" +
      "font-weight:700;font-size:14px;";
    document.body.appendChild(meas);
  }
  meas.textContent = sel.options[sel.selectedIndex].text;
  // box-sizing:border-box : la largeur inclut le padding ; +padding pour la flèche
  sel.style.width = (meas.offsetWidth + padding) + "px";
}
// « Tout / Voitures / Pièces » et « Localisation » s'ajustent chacun à l'option
// choisie, pour rester lisibles sans rogner le bouton « Rechercher ».
function fitHeaderCat() { fitHeaderSelect("hdr-search-cat", 56); }
function fitHeaderReg() { fitHeaderSelect("hdr-search-reg", 52); }

// ---------- Header / Footer injection ----------
function renderHeader(active) {
  const _gs = getSession();
  if (_gs && _gs.type === "garage") {
    document.body.insertAdjacentHTML("afterbegin", `
  <header class="site-header">
    <div class="header-top">
      <a href="espace-garage.html" class="logo">
        <img src="assets/img/logo.png" alt="VoiturePrepa.fr" class="logo-img"
             onerror="this.style.display='none';var f=this.parentNode.querySelector('.logo-fallback');if(f)f.style.display='inline-flex';">
        <span class="logo-fallback" style="display:none;"><span class="logo-icon">VP</span>voitureprepa.fr</span>
      </a>
      <div class="header-actions">
        <a href="espace-garage.html" class="btn-login" title="Espace garage">🔧 ${_gs.prenom || "Mon garage"}</a>
        <a href="#" class="btn-login" style="font-size:13px;" onclick="logout();location.href='index.html';return false;">Déconnexion</a>
      </div>
    </div>
  </header>`);
    return;
  }
  const html = `
  <header class="site-header">
    <div class="header-top">
      <a href="index.html" class="logo">
        <img src="assets/img/logo.png" alt="VoiturePrepa.fr" class="logo-img"
             onerror="this.style.display='none';var f=this.parentNode.querySelector('.logo-fallback');if(f)f.style.display='inline-flex';">
        <span class="logo-fallback" style="display:none;"><span class="logo-icon">VP</span>voitureprepa.fr</span>
      </a>
      <form class="search-bar" onsubmit="event.preventDefault(); doHeaderSearch();">
        <select id="hdr-search-cat" class="search-cat" onchange="updateHeaderPlaceholder(this.value)">
          <option value="voiture" selected>Voitures</option>
          <option value="piece">Pièces</option>
        </select>
        <input id="hdr-search-q" type="text" placeholder="Rechercher une voiture, une pièce, un garage..." />
        <select id="hdr-search-reg" onchange="fitHeaderReg()">
          <option>Toute la France</option>
          ${DATA.regions.map(r=>`<option>${r}</option>`).join("")}
        </select>
        <button type="submit">Rechercher</button>
      </form>
      <div class="header-actions">
        ${(() => {
          const s = getSession();
          if (s) {
            const accLink = (s.type === "garage")
              ? `<a href="espace-garage.html" class="btn-login" title="Espace garage">🔧 ${s.prenom || "Mon garage"}</a>`
              : `<a href="profil.html" class="btn-login" title="Mon compte">👤 ${s.prenom || "Mon compte"}</a>`;
            return accLink +
              `<a href="#" class="btn-login" style="font-size:13px;" onclick="logout();location.href='index.html';return false;">Déconnexion</a>`;
          }
          return `<a href="connexion.html" class="btn-login">Se connecter</a>`;
        })()}
        ${(getSession() && getSession().type === "garage") ? "" : `<a href="deposer.html" class="btn-deposer">+ Déposer une annonce</a>`}
      </div>
    </div>
    <nav class="nav-cats">
      <div class="nav-cats-inner">
        <a href="annonces.html?type=voiture" class="${active==='voitures'?'active':''}"><svg viewBox="0 0 32 19" width="22" height="13" aria-hidden="true" style="vertical-align:-2px;margin-right:4px;"><path fill="currentColor" d="M2.6 13.7 L2.6 11 C2.6 10 3.2 9.3 4.2 9.1 L10 8 L13 4.2 C13.7 3.4 14.7 3 15.8 3 L19.7 3 C20.8 3 21.8 3.4 22.6 4.2 L25.7 7.5 L27.7 8.2 C28.6 8.5 29.2 9.3 29.2 10.3 L29.2 12.7 C29.2 13.3 28.8 13.7 28.2 13.7 Z"/><circle cx="9" cy="14" r="3.4" fill="currentColor"/><circle cx="22.5" cy="14" r="3.4" fill="currentColor"/><circle cx="9" cy="14" r="1.25" fill="#fff"/><circle cx="22.5" cy="14" r="1.25" fill="#fff"/></svg>Voitures</a>
        <a href="annonces.html?type=piece" class="${active==='pieces'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><rect x="7.5" y="2.5" width="9" height="7.6" rx="2.2" fill="currentColor"/><rect x="8.4" y="4.5" width="7.2" height="1.4" fill="#fff"/><rect x="8.4" y="6.8" width="7.2" height="1.4" fill="#fff"/><path fill="currentColor" d="M9.8 10.1 L14.2 10.1 L13.1 16.2 L10.9 16.2 Z"/><circle cx="12" cy="18.7" r="3.4" fill="currentColor"/><circle cx="12" cy="18.7" r="1.3" fill="#fff"/></svg>Pièces</a>
        <a href="inspection.html" class="${active==='inspection'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><circle cx="10" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="2.6"/><line x1="14.7" y1="14.7" x2="21" y2="21" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>Inspection voiture</a>
        <a href="protection.html" class="${active==='protection'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><path fill="currentColor" d="M12 2.2 L20 5.2 L20 11 C20 16.4 16.6 20.7 12 22 C7.4 20.7 4 16.4 4 11 L4 5.2 Z"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M8.2 11.9 L11 14.7 L15.9 8.9"/></svg>Protection achats</a>
        <a href="garages.html" class="${active==='garages'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><path fill="currentColor" d="M2.6 11 L12 3.8 L21.4 11 Z"/><rect x="4.6" y="10.4" width="14.8" height="10.8" fill="currentColor"/><rect x="8.4" y="13.4" width="7.2" height="7.8" fill="#fff"/><rect x="8.4" y="15.4" width="7.2" height="1.1" fill="currentColor"/><rect x="8.4" y="17.6" width="7.2" height="1.1" fill="currentColor"/></svg>Garages spécialisés</a>
        <a href="tarifs.html" class="${active==='tarifs'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><path fill="currentColor" d="M12 2.4 L21 12 L16 12 L16 21.4 L8 21.4 L8 12 L3 12 Z"/></svg>Boost annonce</a>
        <a href="profil.html" class="${active==='profil'?'active':''}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><circle cx="12" cy="7.8" r="4.3" fill="currentColor"/><path fill="currentColor" d="M3.6 21.2 C3.6 16 7.5 13 12 13 C16.5 13 20.4 16 20.4 21.2 Z"/></svg>Mon compte</a>
        ${getSession() ? `<a href="profil.html?tab=favoris" class="nav-fav ${active==='favoris'?'active':''}" title="Mes favoris"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><path fill="currentColor" d="M12 21 C12 21 3 14.8 3 8.7 C3 5.5 5.5 3.2 8.5 3.2 C10.3 3.2 11.4 4.3 12 5.4 C12.6 4.3 13.7 3.2 15.5 3.2 C18.5 3.2 21 5.5 21 8.7 C21 14.8 12 21 12 21 Z"/></svg>Favoris <span class="fav-count" id="hdr-fav-count">${countFavs()}</span></a>` : ""}
        ${getSession() ? `<a href="profil.html?tab=messages" class="${active==='messages'?'active':''}" title="Ma messagerie"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-3px;margin-right:4px;"><rect x="2.5" y="3.6" width="19" height="13" rx="3.2" fill="currentColor"/><path fill="currentColor" d="M7.6 16.4 L7.6 21.6 L14.2 16.4 Z"/></svg>Messagerie</a>` : ""}
      </div>
    </nav>
  </header>`;
  document.body.insertAdjacentHTML("afterbegin", html);

  // Restaure la recherche depuis l'URL : le mot saisi reste dans la case « Recherche »
  const sp = new URLSearchParams(location.search);
  const qVal = sp.get("q");
  if (qVal) {
    const qi = document.getElementById("hdr-search-q");
    if (qi) qi.value = qVal;
  }
  const regVal = sp.get("region");
  if (regVal) {
    const ri = document.getElementById("hdr-search-reg");
    if (ri) ri.value = regVal;
  }
  const typeVal = sp.get("type");
  if (typeVal === "voiture" || typeVal === "piece") {
    const ci = document.getElementById("hdr-search-cat");
    if (ci) { ci.value = typeVal; updateHeaderPlaceholder(typeVal); }
  }
  // Ajuste la largeur des sélecteurs (catégorie + localisation) aux options choisies
  fitHeaderCat();
  fitHeaderReg();
}

function renderFooter() {
  const html = `
  <footer class="site-footer">
    <div class="footer-cols">
      <div>
        <h4 style="color:var(--orange);">VoiturePrepa.fr</h4>
        <p style="font-size:14px;color:#bbb;margin-top:8px;">
          La plateforme spécialisée dans les voitures préparées,
          sportives et pièces de performance.
          Mise en relation sécurisée entre passionnés.
        </p>
      </div>
      <div>
        <h4>Acheter</h4>
        <a href="annonces.html?type=voiture">Voitures préparées</a>
        <a href="annonces.html?type=piece">Pièces détachées</a>
        <a href="garages.html">Annuaire garages</a>
        <a href="inspection.html">Inspection véhicule</a>
        <a href="protection.html">Protection des achats</a>
      </div>
      <div>
        <h4>Vendre</h4>
        <a href="deposer.html">Déposer une annonce</a>
        <a href="tarifs.html">Boost mon annonce</a>
        <a href="abonnement-pro.html">Devenir Pro</a>
        <a href="profil.html">Mon compte</a>
      </div>
      <div>
        <h4>Aide & légal</h4>
        <a href="apropos.html">À propos</a>
        <a href="contact.html">Contact</a>
        <a href="cgu.html">CGU / CGV</a>
        <a href="confidentialite.html">Politique de confidentialité</a>
        <a href="mentions.html">Mentions légales</a>
        <a href="admin.html">🔧 Administration</a>
        <a href="reinitialiser.html">🔄 Réinitialiser la maquette</a>
      </div>
    </div>
    <div class="footer-bottom">
      © ${new Date().getFullYear()} VoiturePrepa.fr — Paiement sécurisé Stripe / Mangopay — RGPD compliant
    </div>
  </footer>`;
  document.body.insertAdjacentHTML("beforeend", html);
}

// ---------- Renderers ----------
// Image neutre « Pas de photo » — utilisée quand aucune photo n'est fournie
function noPhotoPlaceholder() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">'
    + '<rect width="600" height="400" fill="#e9e9ec"/>'
    + '<g transform="translate(300,170)" fill="none" stroke="#b4b4bd" stroke-width="6">'
    + '<rect x="-48" y="-28" width="96" height="64" rx="8"/>'
    + '<circle cx="0" cy="6" r="17"/>'
    + '<rect x="-34" y="-42" width="32" height="16" rx="4"/>'
    + '</g>'
    + '<text x="300" y="258" font-size="22" text-anchor="middle" fill="#9a9aa3" font-family="sans-serif">Pas de photo</text>'
    + '</svg>';
  return "data:image/svg+xml;base64," + btoa(svg);
}

function renderAdCard(ad) {
  const badges = (ad.badges||[]).map(b=>{
    const lbl = {urgent:"⚡ Urgente",premium:"⭐ Premium",pro:"PRO",or:"🥇 Or",argent:"🥈 Argent",bronze:"🥉 Bronze"}[b]||b;
    return `<span class="badge badge-${b}">${lbl}</span>`;
  }).join("");
  const url = `annonce.html?id=${ad.id}`;
  const chTxt = (ad.puissance_actuelle != null && ad.puissance_actuelle !== "") ? `<span>⚡ ${parseInt(ad.puissance_actuelle)} ch</span>` : "";
  const sub = ad.type==="voiture"
    ? `<span>${ad.annee}</span><span>${(ad.km||0).toLocaleString('fr-FR')} km</span><span>${ad.carburant||''}</span>${chTxt}`
    : `<span>${ad.cat||''}</span><span>${ad.sous||''}</span>`;
  const fav = isFav(ad.id);
  const prix = (Number(ad.prix)||0).toLocaleString('fr-FR');
  // La carte est un <div> : le lien (titre) est « étiré » sur toute la carte via CSS,
  // ce qui évite d'imbriquer le bouton favori dans un <a> (HTML invalide).
  return `
    <div class="ad-card">
      <div class="ad-img" style="background-image:url('${ad.img}');" role="img" aria-label="Photo : ${ad.titre}">
        <div class="ad-badges">${badges}</div>
        <button class="fav ${fav?'active':''}" onclick="toggleFavCard(${ad.id},this);" aria-label="Ajouter aux favoris" title="Ajouter aux favoris">${fav?'❤':'♡'}</button>
      </div>
      <div class="ad-body">
        <div class="ad-price">${prix} €</div>
        <a class="ad-title ad-card-link" href="${url}">${ad.titre}</a>
        <div class="ad-meta">${sub}<span>${ad.departement||''}</span></div>
        ${ad.created_at ? `<div class="ad-date">📅 ${formatAdDate(ad.created_at)}</div>` : ""}
      </div>
    </div>`;
}

// ---------- URL params helper ----------
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ============================================================
// MODALE "Souscrire / Commander un pack" partagée Tarifs+Inspection
// ============================================================

// Catalogue des packs/services proposés
function computePacks() {
  const s = loadSiteSettings();
  return {
    // Packs Boost annonce (particuliers)
    photos:    { name:"Pack Photos+",          price:(isFeatureEnabled("pack_photos_paid") ? s.prix_photos_plus : 0),           kind:"boost",      cta:"Souscrire" },
    urgence:   { name:"Pack Urgence",          price:s.prix_urgence,               kind:"boost",      cta:"Souscrire" },
    remontada: { name:"Pack Remontada",        price:s.prix_remontada_hebdo_court, kind:"boost",      cta:"Souscrire" },
    // Inspections véhicule (réservé aux véhicules "Projet terminé / Bon")
    bronze:    { name:"Inspection Standard",   price:s.prix_inspection_bronze,     kind:"inspection", cta:"Commander", filter:"bon" },
    silver:    { name:"Inspection Premium",    price:s.prix_inspection_argent,     kind:"inspection", cta:"Commander", filter:"bon" },
    gold:      { name:"Inspection Complète",   price:s.prix_inspection_or,         kind:"inspection", cta:"Commander", filter:"bon" }
  };
}
let PACKS = computePacks();

// Les 3 formules du Pack Remontada (choisies au moment de la souscription)
function computeRemontada() {
  const s = loadSiteSettings();
  return {
    "Quotidien":   { price:s.prix_remontada_quotidien,   desc:"Remontée en tête de liste chaque jour pendant 30 jours" },
    "Hebdo court": { price:s.prix_remontada_hebdo_court, desc:"Remontée en tête de liste chaque semaine pendant 8 semaines" },
    "Hebdo long":  { price:s.prix_remontada_hebdo_long,  desc:"Remontée en tête de liste chaque semaine pendant 12 semaines" }
  };
}
let REMONTADA_FORMULES = computeRemontada();

let _currentPack = null;
let _currentPackKey = null;            // clé du pack courant ("remontada", "urgence"...)
let _packTypeFilter = null;            // v14 : "piece" ou "voiture" pour ne montrer que ces annonces dans openPackModal
let _currentFormule = "Hebdo court";   // formule Remontada sélectionnée
let _packTarget = "existing"; // "new" | "existing"
let _preSelectedAdId = null;  // si ?boost=<id> dans l'URL

// Prix unitaire courant : tient compte de la formule choisie pour le Pack Remontada
function getPackUnitPrice() {
  if (!_currentPack) return 0;
  if (_currentPackKey === "remontada") {
    return (REMONTADA_FORMULES[_currentFormule] || {}).price || _currentPack.price;
  }
  return _currentPack.price;
}

// Renvoie true si l'annonce a déjà, en cours, le pack actuellement sélectionné
function adAlreadyHasCurrentPack(ad) {
  if (!ad) return false;
  if (_currentPack && _currentPack.kind === "inspection") {
    // Une demande d'inspection est déjà en cours (non clôturée) pour cette annonce
    return loadMyInspections().some(r =>
      String(r.ad_id) === String(ad.id) && r.status !== "refused");
  }
  const opts = ad.options || [];
  if (_currentPackKey === "urgence")   return opts.some(o => o.indexOf("Pack Urgence") === 0);
  if (_currentPackKey === "remontada") return opts.some(o => o.indexOf("Pack Remontada") === 0);
  if (_currentPackKey === "photos")    return opts.some(o => o.indexOf("Pack Photos+") === 0);
  return false;
}

// Injecte la modale HTML une seule fois en bas du body
function injectPackModal() {
  if (document.getElementById("pack-modal")) return;
  const html = `
  <div class="modal-backdrop" id="pack-modal" onclick="if(event.target===this)closePackModal()">
    <div class="modal">
      <div class="modal-head">
        <h3 id="pm-title">Souscrire au pack</h3>
        <button class="close" onclick="closePackModal()" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body">
        <p class="text-muted" id="pm-intro" style="margin-bottom:14px;"></p>
        <div id="pm-formule-block" style="display:none;margin-bottom:18px;">
          <label class="form-label" style="font-size:14px;font-weight:600;">Choisissez votre formule de remontée :</label>
          <div id="pm-formule-list" style="margin-top:8px;"></div>
        </div>
        <div id="pm-garage-block" style="display:none;margin-bottom:18px;">
          <label class="form-label" style="font-size:14px;font-weight:600;">Garage partenaire où réaliser l'inspection :</label>
          <select id="pm-garage" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;margin:6px 0;font-size:14px;">
            <option value="">Sélectionner un garage</option>
          </select>
          <div id="pm-garage-map" style="height:240px;border-radius:8px;overflow:hidden;z-index:1;"></div>
          <p class="form-hint" style="margin-top:4px;">Cliquez sur un marqueur de la carte pour choisir le garage.</p>
        </div>
        <div id="pm-inspection-mention" style="display:none;margin-bottom:16px;background:#fff8e8;border:1px solid #e6cf9a;border-radius:8px;padding:12px 14px;">
          <strong style="font-size:13px;display:block;margin-bottom:6px;">⚠️ Ce que comprend — et ne comprend pas — l'inspection</strong>
          <p style="margin:0 0 7px;font-size:12.5px;line-height:1.55;color:#5a4a20;">
            L'inspection VoiturePrepa.fr est un <strong>constat de l'état apparent du véhicule</strong>
            réalisé à une date donnée, à partir des éléments visibles, accessibles et testables sans
            démontage. Le rapport décrit des observations : il ne constitue <strong>ni une
            certification, ni une garantie de bon fonctionnement</strong>, et ne se substitue pas à la
            garantie légale des vices cachés due par le vendeur. Il n'engage le garage que pour un
            examen réalisé avec soin et compétence.
          </p>
          <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.55;color:#5a4a20;">
            <li>La mention « Contrôlé par un professionnel » signifie que le véhicule a été vérifié selon une liste précise de points de contrôle — non qu'il est garanti.</li>
            <li>La responsabilité du garage s'arrête à la réalisation du contrôle ; la vente reste sous l'entière responsabilité du vendeur particulier.</li>
            <li>En clair : le garage ne garantit pas que le véhicule ne tombera pas en panne après la vente.</li>
          </ul>
        </div>
        <div class="pack-choice">
          <div class="pchoice" id="ch-new" onclick="selectPackTarget('new')">
            <div class="ico">➕</div>
            <strong id="pm-ch-new-title">Nouvelle annonce</strong>
            <small id="pm-ch-new-sub">Je vais déposer une annonce maintenant</small>
          </div>
          <div class="pchoice active" id="ch-existing" onclick="selectPackTarget('existing')">
            <div class="ico">📋</div>
            <strong id="pm-ch-existing-title">Annonce(s) déjà en ligne</strong>
            <small id="pm-ch-existing-sub">J'ai une ou plusieurs annonces actives</small>
          </div>
        </div>
        <div id="pm-existing-block">
          <label class="form-label" id="pm-pick-label" style="font-size:14px;">Sélectionnez la ou les annonces :</label>
          <div class="ad-pick-list" id="pm-ad-list"></div>
          <p id="pm-no-eligible" class="text-muted" style="font-size:13px;margin-top:8px;display:none;">
            Aucune de vos annonces actuelles ne remplit les conditions pour ce service.
          </p>
          <div class="total-box">
            <span class="lbl"><span id="pm-count">0</span> annonce(s) sélectionnée(s)</span>
            <span class="amt" id="pm-total">0,00 €</span>
          </div>
        </div>
        <div id="pm-new-block" style="display:none;">
          <div class="alert alert-info" style="margin:8px 0;">
            Vous allez être redirigé vers la page de dépôt d'annonce. Le service sera automatiquement
            associé après la publication.
          </div>
        </div>
        <p class="form-hint mt-2">💡 Paiement sécurisé via notre partenaire (Stripe / Mangopay).</p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closePackModal()">Annuler</button>
        <button class="btn btn-primary" id="pm-confirm" onclick="confirmPack()">Continuer</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
}

function openPackModal(packKey, typeFilter) {
  // v14 : garde flag de lancement
  const _flag = PACK_LAUNCH_FLAG[packKey];
  if (_flag && !isFeatureEnabled(_flag)) { alert(LAUNCH_DEV_MSG); return; }
  injectPackModal();
  _currentPack = PACKS[packKey];
  _currentPackKey = packKey;
  _packTypeFilter = typeFilter || null;
  if (!_currentPack) return;

  const isInspection = _currentPack.kind === "inspection";

  // Pack Remontada : choix de la formule (Quotidien / Hebdo court / Hebdo long)
  const formuleBlock = document.getElementById("pm-formule-block");
  if (packKey === "remontada") {
    _currentFormule = "Hebdo court"; // formule par défaut
    formuleBlock.style.display = "block";
    document.getElementById("pm-formule-list").innerHTML =
      Object.keys(REMONTADA_FORMULES).map(name => {
        const f = REMONTADA_FORMULES[name];
        const active = name === _currentFormule;
        return `<div class="pm-formule${active ? ' active' : ''}" data-formule="${name}" onclick="selectRemontadaFormule('${name}')">
          <div class="pm-formule-radio"></div>
          <div class="pm-formule-info">
            <strong>${name} — ${f.price.toFixed(2).replace(".", ",")} €</strong>
            <span>${f.desc}</span>
          </div>
        </div>`;
      }).join("");
  } else {
    formuleBlock.style.display = "none";
  }

  // Inspection : choix du garage partenaire par le vendeur
  const garageBlock = document.getElementById("pm-garage-block");
  const inspMention = document.getElementById("pm-inspection-mention");
  if (isInspection) {
    garageBlock.style.display = "block";
    if (inspMention) inspMention.style.display = "block";
    document.getElementById("pm-garage").innerHTML =
      `<option value="">Sélectionner un garage</option>` +
      getGarages().map(g => `<option value="${g.nom} — ${g.ville}">${g.nom} (${g.ville})</option>`).join("");
  } else {
    garageBlock.style.display = "none";
    if (inspMention) inspMention.style.display = "none";
  }

  refreshPackPriceDisplay();
  document.getElementById("pm-intro").textContent = isInspection
    ? "Pour quel véhicule souhaitez-vous commander cette inspection ?"
    : "À quelle annonce souhaitez-vous appliquer ce pack ?";
  document.getElementById("pm-ch-new-title").textContent = isInspection
    ? "Nouveau véhicule à vendre" : "Nouvelle annonce";
  document.getElementById("pm-ch-new-sub").textContent = isInspection
    ? "Je vais déposer une annonce et commander l'inspection" : "Je vais déposer une annonce maintenant";
  document.getElementById("pm-ch-existing-title").textContent = isInspection
    ? "Véhicule(s) déjà en ligne" : "Annonce(s) déjà en ligne";
  document.getElementById("pm-ch-existing-sub").textContent = isInspection
    ? "J'ai une ou plusieurs annonces de véhicules actives" : "J'ai une ou plusieurs annonces actives";
  document.getElementById("pm-pick-label").textContent = isInspection
    ? "Sélectionnez le(s) véhicule(s) à inspecter :" : "Sélectionnez la ou les annonces à booster :";

  // Filtre éventuel : inspection réservée aux véhicules en bon état
  let eligible = loadMyAds();
  if (_currentPack.filter === "bon") {
    eligible = eligible.filter(a => a.etat === "Projet terminé / Bon");
  }
  // v14 : filtre par type d'annonce (voiture / piece) — utilisé par les sous-onglets pro
  if (_packTypeFilter === "piece") {
    eligible = eligible.filter(a => a.type === "piece");
  } else if (_packTypeFilter === "voiture") {
    eligible = eligible.filter(a => a.type !== "piece");
  }
  const list = document.getElementById("pm-ad-list");
  if (!eligible.length) {
    list.innerHTML = "";
    document.getElementById("pm-no-eligible").style.display = "block";
  } else {
    document.getElementById("pm-no-eligible").style.display = "none";
    list.innerHTML = eligible.map(a => {
      // Un pack déjà souscrit et en cours ne peut pas être repris une 2e fois
      const taken = adAlreadyHasCurrentPack(a);
      return `
      <label class="ad-pick" data-id="${a.id}" style="${taken ? 'opacity:.6;background:#f4f4f4;cursor:not-allowed;' : ''}">
        <input type="checkbox" onchange="updatePackTotal()" ${taken ? 'disabled' : ''}>
        <img src="${a.img}" alt="">
        <div class="info">
          <strong>${a.titre}</strong>
          <span>${taken
            ? '✓ Pack déjà actif sur cette annonce'
            : ((a.prix||0).toLocaleString('fr-FR') + ' € · ' + (a.etat || a.cat || ''))}</span>
        </div>
      </label>`;
    }).join("");
  }

  _packTarget = "existing";
  selectPackTarget("existing");

  // Si l'utilisateur vient avec ?boost=<id> dans l'URL, on coche cette annonce
  if (_preSelectedAdId) {
    const cb = document.querySelector('#pm-ad-list .ad-pick[data-id="'+_preSelectedAdId+'"] input[type="checkbox"]');
    if (cb && !cb.disabled) { cb.checked = true; updatePackTotal(); }
  }

  document.getElementById("pack-modal").classList.add("open");
  document.body.style.overflow = "hidden";

  // Inspection : carte de France interactive pour choisir le garage
  if (isInspection) initGarageMiniMap("pm-garage-map", "pm-garage");
}

function closePackModal() {
  const m = document.getElementById("pack-modal");
  if (m) m.classList.remove("open");
  document.body.style.overflow = "";
}

function selectPackTarget(target) {
  _packTarget = target;
  document.getElementById("ch-new").classList.toggle("active", target === "new");
  document.getElementById("ch-existing").classList.toggle("active", target === "existing");
  document.getElementById("pm-new-block").style.display = (target === "new") ? "block" : "none";
  document.getElementById("pm-existing-block").style.display = (target === "existing") ? "block" : "none";
}

function updatePackTotal() {
  const checked = document.querySelectorAll('#pm-ad-list input[type="checkbox"]:checked');
  const n = checked.length;
  document.getElementById("pm-count").textContent = n;
  document.getElementById("pm-total").textContent = (n * getPackUnitPrice()).toFixed(2).replace(".", ",") + " €";
}

// Met à jour le titre (avec le prix de la formule) et recalcule le total
function refreshPackPriceDisplay() {
  if (!_currentPack) return;
  const isInspection = _currentPack.kind === "inspection";
  const priceStr = getPackUnitPrice().toFixed(2).replace(".", ",") + " €";
  const titleEl = document.getElementById("pm-title");
  if (titleEl) titleEl.textContent =
    (isInspection ? "Commander : " : "Souscrire au ") + _currentPack.name + " (" + priceStr + ")";
  updatePackTotal();
}

// Sélection d'une formule du Pack Remontada
function selectRemontadaFormule(name) {
  if (!REMONTADA_FORMULES[name]) return;
  _currentFormule = name;
  document.querySelectorAll("#pm-formule-list .pm-formule").forEach(el => {
    el.classList.toggle("active", el.dataset.formule === name);
  });
  refreshPackPriceDisplay();
}

function confirmPack() {
  // Libellé du pack, complété de la formule choisie pour le Pack Remontada
  const packLabel = _currentPack.name +
    (_currentPackKey === "remontada" ? " — formule " + _currentFormule : "");
  if (_packTarget === "new") {
    closePackModal();
    const param = (_currentPack.kind === "inspection" ? "inspection" : "pack");
    let url = "deposer.html?" + param + "=" + encodeURIComponent(_currentPack.name);
    if (_currentPackKey === "remontada") url += "&formule=" + encodeURIComponent(_currentFormule);
    window.location.href = url;
    return;
  }
  const checked = document.querySelectorAll('#pm-ad-list input[type="checkbox"]:checked');
  if (!checked.length) {
    alert("Veuillez sélectionner au moins une annonce.");
    return;
  }
  const selectedAds = Array.from(checked).map(c => {
    const id = c.closest(".ad-pick").dataset.id;
    return loadMyAds().find(a => a.id == id);
  }).filter(Boolean);
  const titres = selectedAds.map(a => "• " + a.titre).join("\n");
  const total = (selectedAds.length * getPackUnitPrice()).toFixed(2).replace(".", ",");

  // Souscription d'une inspection : choix du garage, paiement, puis demande de rendez-vous
  if (_currentPack.kind === "inspection") {
    const ni = INSPECTION_NIVEAUX[normInspKey(_currentPackKey)];
    const garage = (document.getElementById("pm-garage") || {}).value || "";
    if (!garage) {
      alert("Veuillez sélectionner le garage partenaire où réaliser l'inspection.");
      return;
    }
    const s = getSession();
    const montant = selectedAds.length * ni.prix;
    closePackModal();
    openPaymentModal(montant,
      "Inspection " + ni.niveau + " — " + selectedAds.length + " véhicule(s)",
      function () {
        selectedAds.forEach(a => {
          addInspectionRequest({
            niveau: ni.niveau, formule: ni.formule, prix: ni.prix,
            vehicule: a.titre, ad_id: a.id,
            owner_email: (s && s.email) || "", owner_name: (s && (s.prenom || s.raison)) || "",
            source: "Annonce déjà en ligne", garage: garage, paid: true
          });
          addRevenue({ category:"inspection", label:"Inspection " + ni.niveau, amount:ni.prix, payer:(s && s.email) || "" });
        });
        alert("✅ Inspection " + ni.niveau + " réglée pour " + selectedAds.length +
          " véhicule(s) :\n\n" + titres + "\n\nTotal : " + total + " €\n\n" +
          "L'administrateur vous proposera des créneaux de rendez-vous au garage choisi.\n\n" +
          INSPECTION_POLICY);
      });
    return;
  }

  // Souscription d'un pack de boost (Photos+, Urgence, Remontada) : paiement puis application
  const montant = selectedAds.length * getPackUnitPrice();
  const boostBadge = _currentPackKey === "urgence" ? "urgent"
                   : (_currentPackKey === "remontada" ? "premium" : null);
  closePackModal();

  // Fonction d'application du pack (commune au cas payant et gratuit)
  function _applyPack() {
    selectedAds.forEach(a => {
      if (adAlreadyHasCurrentPack(a)) return;
      const opts = (a.options || []).slice();
      opts.push(packLabel);
      const patch = { options: opts };
      if (boostBadge) {
        const bdg = (a.badges || []).slice();
        if (bdg.indexOf(boostBadge) === -1) bdg.push(boostBadge);
        patch.badges = bdg;
      }
      updateUserAd(a.id, patch);
      addRevenue({ category:"pack", label:packLabel, amount:getPackUnitPrice(), payer:(getSession() && getSession().email) || "" });
    });
    const photosNote = _currentPackKey === "photos"
      ? "\n\n📷 Pour ajouter vos photos supplémentaires, ouvrez « Modifier » sur l'annonce depuis « Mon compte »."
      : "";
    const totalLine = montant === 0
      ? "\n\n🎁 Pack offert au lancement — aucun paiement nécessaire."
      : "\n\nTotal payé : " + total + " €";
    alert("✅ " + packLabel + " appliqué à " + selectedAds.length + " annonce(s) :\n\n" + titres + totalLine + photosNote);
  }

  // v14 : si le pack est gratuit (Photos+ au lancement), on saute la modale de paiement
  if (montant === 0) { _applyPack(); return; }

  openPaymentModal(montant, packLabel + " — " + selectedAds.length + " annonce(s)", _applyPack);
}

// Détecte ?boost=<id> sur les pages où la modale est utilisée
function detectBoostParam() {
  const id = new URLSearchParams(location.search).get("boost");
  if (id) _preSelectedAdId = parseInt(id);
}


// ---------- Affichage dynamique des prix sur les pages vitrine ----------
function refreshPricesFromSettings() {
  PACKS = computePacks();
  REMONTADA_FORMULES = computeRemontada();
  INSPECTION_NIVEAUX = computeInspectionNiveaux();
}
function _fmtPrice(n) {
  const v = Number(n);
  const opts = (v % 1 !== 0)
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return v.toLocaleString('fr-FR', opts);
}

function applyDisplayedPrices() {
  const s = loadSiteSettings();
  document.querySelectorAll('[data-price]').forEach(el => {
    const key = el.getAttribute('data-price');
    if (s[key] == null) return;
    const fmt = el.getAttribute('data-format') || '{value} €';
    el.innerHTML = fmt.replace('{value}', _fmtPrice(s[key]));
  });
  document.querySelectorAll('[data-price-range]').forEach(el => {
    const parts = el.getAttribute('data-price-range').split(',');
    if (parts.length < 2 || s[parts[0]] == null || s[parts[1]] == null) return;
    const fmt = el.getAttribute('data-format') || '{min} € à {max} €';
    el.innerHTML = fmt
      .replace('{min}', _fmtPrice(s[parts[0]]))
      .replace('{max}', _fmtPrice(s[parts[1]]));
  });
  document.querySelectorAll('[data-settings]').forEach(el => {
    let map;
    try { map = JSON.parse(el.getAttribute('data-settings')); } catch (e) { return; }
    let txt = el.getAttribute('data-format') || '';
    for (const ph in map) {
      const v = s[map[ph]];
      if (v != null) txt = txt.replace('{' + ph + '}', _fmtPrice(v));
    }
    el.innerHTML = txt;
  });
  document.querySelectorAll('option[data-launch-flag]').forEach(opt => {
    const flag = opt.getAttribute('data-launch-flag');
    if (!flag) return;
    if (!isFeatureEnabled(flag)) {
      const base = (opt.getAttribute('data-original-label') || opt.textContent || '').split('—')[0].trim();
      opt.textContent = (base || 'Pack') + ' — 🚧 en cours de développement';
      opt.disabled = true;
      opt.style.color = '#999';
    }
  });
}

// ---------- Init on page load ----------
document.addEventListener("DOMContentLoaded", () => {
  applySeoOverrides();
  applyDisplayedPrices();
  if (typeof SKIP_CHROME === "undefined") {
    if (typeof PAGE_ACTIVE !== "undefined") renderHeader(PAGE_ACTIVE);
    else renderHeader();
    renderFooter();
  }
  detectBoostParam();
  if (typeof _refreshLaunchFlagsFromDb === "function") _refreshLaunchFlagsFromDb();
  if (typeof _refreshAdsCache === "function") _refreshAdsCache();
  try { if (typeof bumpPerformanceAdsIfDue === "function") bumpPerformanceAdsIfDue(); } catch(e){}
  if (typeof initPage === "function") initPage();
});
