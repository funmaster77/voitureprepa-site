/* ==========================================================
   VoiturePrepa.fr — Client Supabase
   Couche d'accès aux données : remplace progressivement localStorage.
   ========================================================== */

// Configuration — clés publiques (publishable) — sûres côté navigateur
const SUPABASE_URL = "https://nuarxylvrvqxzynozkbg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ecDzjXGsClWvEs7TuHAfag_dlzcSigx";

// Le SDK Supabase est chargé via <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
const sb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

// Marker global pour basculer entre localStorage et Supabase
window.VP_USE_SUPABASE = !!sb;

// ============================================================
// AUTH — Inscription / Connexion / Session
// ============================================================
async function sbSignUp({ email, password, type, prenom, nom, raison_sociale, siret, telephone }) {
  return sb.auth.signUp({
    email, password,
    options: {
      data: { type, prenom, nom, raison_sociale, siret, telephone },
      emailRedirectTo: location.origin + "/confirmation.html"
    }
  });
}
async function sbSignIn(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}
async function sbSignOut() {
  return sb.auth.signOut();
}
async function sbGetUser() {
  const { data } = await sb.auth.getUser();
  return data.user;
}
async function sbGetSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
async function sbResetPassword(email) {
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + "/nouveau-mot-de-passe.html"
  });
}

// ============================================================
// PROFILES
// ============================================================
async function sbGetMyProfile() {
  const user = await sbGetUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
}
async function sbUpdateMyProfile(patch) {
  const user = await sbGetUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").update(patch).eq("id", user.id).select().maybeSingle();
  if (error) console.warn("sbUpdateMyProfile", error);
  return data;
}
async function sbGetProfileById(id) {
  const { data } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
}
async function sbProSiretTaken(siret) {
  if (!siret) return false;
  const { data } = await sb.from("profiles").select("id").eq("siret", siret).eq("type", "pro").maybeSingle();
  return !!data;
}

// ============================================================
// ADS
// ============================================================
async function sbListAds(filters = {}) {
  let q = sb.from("ads").select("*").eq("status", "published").order("created_at", { ascending: false });
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.marque) q = q.eq("marque", filters.marque);
  if (filters.modele) q = q.eq("modele", filters.modele);
  if (filters.region) q = q.eq("region", filters.region);
  if (filters.departement) q = q.eq("departement", filters.departement);
  if (filters.prix_min) q = q.gte("prix", filters.prix_min);
  if (filters.prix_max) q = q.lte("prix", filters.prix_max);
  if (filters.km_max) q = q.lte("km", filters.km_max);
  if (filters.annee_min) q = q.gte("annee", filters.annee_min);
  if (filters.ch_min) q = q.gte("puissance_actuelle", filters.ch_min);
  if (filters.ch_max) q = q.lte("puissance_actuelle", filters.ch_max);
  const { data, error } = await q.limit(filters.limit || 200);
  if (error) { console.warn("sbListAds", error); return []; }
  return data || [];
}
async function sbGetAd(id) {
  const { data } = await sb.from("ads").select("*").eq("id", id).maybeSingle();
  return data;
}
async function sbCreateAd(ad) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const payload = Object.assign({}, ad, { owner_id: user.id, status: "pending" });
  const { data, error } = await sb.from("ads").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbUpdateAd(id, patch) {
  const { data, error } = await sb.from("ads").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbDeleteAd(id) {
  const { error } = await sb.from("ads").delete().eq("id", id);
  if (error) throw error;
}
async function sbMyAds() {
  const user = await sbGetUser();
  if (!user) return [];
  const { data } = await sb.from("ads").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
  return data || [];
}

// ============================================================
// INSPECTIONS
// ============================================================
async function sbCreateInspection(payload) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const { data, error } = await sb.from("inspections").insert(Object.assign({}, payload, { owner_id: user.id })).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbMyInspections() {
  const user = await sbGetUser();
  if (!user) return [];
  const { data } = await sb.from("inspections").select("*").eq("owner_id", user.id).order("requested_at", { ascending: false });
  return data || [];
}
async function sbAllInspections() {
  const { data } = await sb.from("inspections").select("*").order("requested_at", { ascending: false });
  return data || [];
}
async function sbUpdateInspection(id, patch) {
  const { data, error } = await sb.from("inspections").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================
// TRANSACTIONS
// ============================================================
async function sbCreateTransaction(t) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const payload = Object.assign({}, t, { buyer_id: user.id });
  const { data, error } = await sb.from("transactions").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbMyTransactions() {
  const user = await sbGetUser();
  if (!user) return [];
  const { data } = await sb.from("transactions").select("*").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at", { ascending: false });
  return data || [];
}

// ============================================================
// MESSAGERIE
// ============================================================
async function sbGetOrCreateConversation(otherUserId, adId) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const [a, b] = [user.id, otherUserId].sort();
  let q = sb.from("conversations").select("*").eq("participant_a", a).eq("participant_b", b);
  if (adId) q = q.eq("ad_id", adId); else q = q.is("ad_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb.from("conversations").insert({ participant_a: a, participant_b: b, ad_id: adId || null }).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbListMyConversations() {
  const user = await sbGetUser();
  if (!user) return [];
  const { data } = await sb.from("conversations").select("*").or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`).order("last_message_at", { ascending: false });
  return data || [];
}
async function sbListMessages(conversationId) {
  const { data } = await sb.from("messages").select("*").eq("conversation_id", conversationId).order("created_at");
  return data || [];
}
async function sbSendMessage(conversationId, body) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const { data, error } = await sb.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body }).select().maybeSingle();
  if (error) throw error;
  await sb.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  return data;
}

// ============================================================
// AVIS
// ============================================================
async function sbCreateReview(r) {
  const user = await sbGetUser();
  if (!user) throw new Error("Non connecté");
  const { data, error } = await sb.from("reviews").insert(Object.assign({}, r, { reviewer_id: user.id })).select().maybeSingle();
  if (error) throw error;
  return data;
}
async function sbReviewsFor(userId) {
  const { data } = await sb.from("reviews").select("*").eq("reviewee_id", userId).order("created_at", { ascending: false });
  return data || [];
}

// ============================================================
// PARAMÈTRES / FEATURE FLAGS
// ============================================================
async function sbLoadSiteSettings() {
  const { data } = await sb.from("site_settings").select("*").eq("key", "pricing").maybeSingle();
  return (data && data.value) || {};
}
async function sbSaveSiteSettings(value) {
  const { error } = await sb.from("site_settings").upsert({ key: "pricing", value }, { onConflict: "key" });
  if (error) throw error;
}
async function sbLoadLaunchFlags() {
  const { data } = await sb.from("launch_flags").select("*");
  const map = {};
  (data || []).forEach(r => { map[r.key] = r.enabled; });
  return map;
}
async function sbSetLaunchFlag(key, enabled) {
  const { error } = await sb.from("launch_flags").upsert({ key, enabled }, { onConflict: "key" });
  if (error) throw error;
}

// ============================================================
// COMPTABILITÉ
// ============================================================
async function sbAddRevenue(r) {
  const { error } = await sb.from("revenues").insert(r);
  if (error) console.warn("sbAddRevenue", error);
}
async function sbListRevenues() {
  const { data } = await sb.from("revenues").select("*").order("created_at", { ascending: false });
  return data || [];
}

// ============================================================
// GARAGES
// ============================================================
async function sbListGarages() {
  const { data } = await sb.from("garages").select("*").eq("active", true).order("nom");
  return data || [];
}

// ============================================================
// CONTACT / SIGNALEMENTS
// ============================================================
async function sbSendContact(payload) {
  const { error } = await sb.from("contact_messages").insert(payload);
  if (error) throw error;
}
async function sbReportAd(adId, reason) {
  const user = await sbGetUser();
  const { error } = await sb.from("reports").insert({ ad_id: adId, reporter_id: user ? user.id : null, reason });
  if (error) throw error;
}

// ---------- Storage (photos d'annonces) ----------
// Upload d'une photo de voiture/pièce dans le bucket 'ad-photos'.
// `file` peut être un File/Blob (formulaire) ou un dataURL base64.
// Renvoie l'URL publique en cas de succès.
async function sbUploadAdPhoto(file, opts) {
  opts = opts || {};
  const { data: u } = await sb.auth.getUser();
  if (!u || !u.user) throw new Error("Non connecté");
  const userId = u.user.id;

  // dataURL → Blob
  let blob = file;
  let ext = "jpg";
  if (typeof file === "string" && file.startsWith("data:")) {
    const m = file.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
    if (!m) throw new Error("dataURL invalide");
    const mime = m[1];
    ext = (mime.split("/")[1] || "jpg").replace("+xml", "").replace("jpeg", "jpg");
    const bytes = atob(m[2]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    blob = new Blob([arr], { type: mime });
  } else if (file && file.name) {
    const dot = file.name.lastIndexOf(".");
    if (dot >= 0) ext = file.name.slice(dot + 1).toLowerCase();
  }

  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now()}_${rand}.${ext}`;

  const { error } = await sb.storage
    .from("ad-photos")
    .upload(path, blob, { cacheControl: "31536000", upsert: false, contentType: blob.type || undefined });
  if (error) throw error;
  const { data: pub } = sb.storage.from("ad-photos").getPublicUrl(path);
  return pub.publicUrl;
}

// Export pour app.js
window.VP_SB = {
  client: sb,
  // auth
  signUp: sbSignUp, signIn: sbSignIn, signOut: sbSignOut,
  getUser: sbGetUser, getSession: sbGetSession, resetPassword: sbResetPassword,
  // profiles
  getMyProfile: sbGetMyProfile, updateMyProfile: sbUpdateMyProfile,
  getProfileById: sbGetProfileById, proSiretTaken: sbProSiretTaken,
  // ads
  listAds: sbListAds, getAd: sbGetAd, createAd: sbCreateAd,
  updateAd: sbUpdateAd, deleteAd: sbDeleteAd, myAds: sbMyAds,
  // inspections
  createInspection: sbCreateInspection, myInspections: sbMyInspections,
  allInspections: sbAllInspections, updateInspection: sbUpdateInspection,
  // transactions
  createTransaction: sbCreateTransaction, myTransactions: sbMyTransactions,
  // messages
  getOrCreateConversation: sbGetOrCreateConversation,
  listMyConversations: sbListMyConversations,
  listMessages: sbListMessages, sendMessage: sbSendMessage,
  // reviews
  createReview: sbCreateReview, reviewsFor: sbReviewsFor,
  // settings / flags
  loadSiteSettings: sbLoadSiteSettings, saveSiteSettings: sbSaveSiteSettings,
  loadLaunchFlags: sbLoadLaunchFlags, setLaunchFlag: sbSetLaunchFlag,
  // accounting
  addRevenue: sbAddRevenue, listRevenues: sbListRevenues,
  // garages
  listGarages: sbListGarages,
  // contact
  sendContact: sbSendContact, reportAd: sbReportAd,
  // storage
  uploadAdPhoto: sbUploadAdPhoto,
  // admin — bannissement
  banUser: async (uid, reason) => {
    const { error } = await sb.rpc("ban_user", { target: uid, reason: reason || null });
    if (error) throw error;
  },
  unbanUser: async (uid) => {
    const { error } = await sb.rpc("unban_user", { target: uid });
    if (error) throw error;
  },
  // admin — liste de tous les profils (RLS contrôle l'accès)
  listAllProfiles: async () => {
    const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { console.warn("listAllProfiles", error); return []; }
    return data || [];
  }
};
