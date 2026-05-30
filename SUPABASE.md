# Migration Supabase — État

## ✅ Phase 1 — Backend Supabase (TERMINÉE)

### Projet Supabase
- **URL** : `https://nuarxylvrvqxzynozkbg.supabase.co`
- **Région** : eu-west-1 (Irlande)
- **Clé publishable** (sûre côté navigateur, déjà câblée dans `assets/js/supabase-client.js`) :
  `sb_publishable_ecDzjXGsClWvEs7TuHAfag_dlzcSigx`

### Schéma déployé (15 tables, toutes en RLS)

| Table | Rôle |
|-------|------|
| `profiles` | Liée 1-1 à `auth.users`. Champs : type (particulier/pro/garage/admin), role, SIRET unique, pack, pack_expires_at, etc. |
| `ads` | Annonces voiture + pièces (tous les champs : puissance, stage, etc.) |
| `inspections` | Demandes d'inspection avec timestamps SLA (`proposed_at`, `seller_response_at`, `report_at`) |
| `transactions` | Achats sécurisés (commission acheteur/vendeur, status) |
| `conversations` + `messages` | Messagerie 1-1 entre acheteur et vendeur |
| `reviews` | Avis 5 étoiles |
| `saved_searches` | Recherches sauvegardées |
| `revenues` | Suivi comptable |
| `site_settings` | Tarifs et durées (clé `pricing` déjà seedée) |
| `launch_flags` | Feature flags v14 (7 flags seedés, tous OFF) |
| `email_templates` | Templates emails admin |
| `garages` | Garages partenaires |
| `contact_messages` | Formulaire de contact |
| `reports` | Signalements |

### Politiques RLS (résumé)
- **profiles** : lecture publique, mise à jour propre par chacun, admin tout.
- **ads** : lecture publique pour `status IN ('published','sold')`, lecture/écriture propre par le owner.
- **inspections / transactions / messages** : visibles uniquement par les parties concernées + admin.
- **site_settings / launch_flags / garages** : lecture publique, écriture admin uniquement.

### Auth
- Email + mot de passe (méthode choisie).
- Email de confirmation envoyé automatiquement par Supabase au signup.
- Trigger `on_auth_user_created` qui crée automatiquement la ligne `profiles` à partir des metadata.

## ⏳ Phase 2 — Couche client (EN COURS)

### Fait
- Création de `assets/js/supabase-client.js` exposant `window.VP_SB` avec toutes les méthodes nécessaires (auth, profiles, ads, inspections, transactions, messages, reviews, settings, flags, revenues, garages, contact, reports).
- SDK Supabase + client ajoutés à toutes les pages HTML (avant `app.js`).

### Reste à faire (par ordre de priorité)
1. **inscription.html** : remplacer `registerAccount(...)` par `VP_SB.signUp({...})`. L'email de confirmation sera envoyé par Supabase, plus besoin du flow EmailJS.
2. **connexion.html** : remplacer le mock par `VP_SB.signIn(email, password)`. Récupérer `getMyProfile()` après login.
3. **app.js** :
   - `getSession()` / `isLoggedIn()` → utiliser `VP_SB.getSession()` (asynchrone).
   - `loadAccounts/saveAccounts` → `getMyProfile / updateMyProfile`.
   - `loadUserAds / saveUserAds` → `listAds / createAd / updateAd`.
   - `loadInspections / addInspectionRequest` → `allInspections / createInspection`.
   - `loadSiteSettings / saveSiteSettings` → `loadSiteSettings / saveSiteSettings` (Supabase).
   - `loadLaunchFlags / saveLaunchFlags` → `loadLaunchFlags / setLaunchFlag`.
4. **deposer.html** : à la soumission, appeler `VP_SB.createAd(payload)` au lieu de pousser dans `voitureprepa_ads` localStorage.
5. **annonces.html** : `renderResults()` lit depuis `VP_SB.listAds(filters)` au lieu de filtrer en mémoire.
6. **annonce.html** : `VP_SB.getAd(id)` + `VP_SB.getProfileById(ownerId)` pour les infos vendeur.
7. **profil.html** : tabs Annonces / Inspections / Transactions / Messagerie consomment `VP_SB.myAds()` / `myInspections()` / `myTransactions()` / `listMyConversations()`.
8. **admin.html** : passer `loadInspections`, `loadAccounts`, `loadRevenues` etc. sur Supabase. Vérifier que l'admin connecté a `role='admin'` dans `profiles`.

### Patron de migration recommandé
```js
// AVANT (localStorage)
const ads = loadUserAds();
saveUserAds([...ads, newAd]);

// APRÈS (Supabase, asynchrone)
const newAd = await VP_SB.createAd({
  type: "voiture", titre: "BMW M3 E46", prix: 12500, marque: "BMW", ...
});
```

Toutes les méthodes `VP_SB.*` retournent des **Promises**. Il faut donc rendre les fonctions appelantes `async` et `await`er.

### Création d'un compte admin
Pour qu'un compte ait le rôle admin (et accès à toutes les RLS admin) :

```sql
-- Dans Supabase SQL editor, après que l'utilisateur se soit inscrit
UPDATE profiles SET role = 'admin' WHERE email = 'votre.email@exemple.fr';
```

### Stockage des images (next)
Les photos d'annonces sont actuellement en data URL en JSONB. Pour passer en production :
- Créer un bucket Supabase Storage `ad-photos` (public read, write authenticated).
- À l'upload : `sb.storage.from("ad-photos").upload(path, file)` puis stocker l'URL dans `ads.photos`.

## Console Supabase
- Dashboard : https://supabase.com/dashboard/project/nuarxylvrvqxzynozkbg
- SQL Editor pour requêtes directes
- Auth → Users pour gérer les comptes
- Table Editor pour parcourir les données

## Migration des données localStorage existantes
Si vous avez déjà testé la maquette en localStorage et voulez migrer ces données vers Supabase, exécutez côté navigateur (console) :

```js
// Export localStorage actuel
const dump = {
  ads: JSON.parse(localStorage.getItem("voitureprepa_user_ads") || "[]"),
  accounts: JSON.parse(localStorage.getItem("voitureprepa_accounts") || "[]"),
  inspections: JSON.parse(localStorage.getItem("voitureprepa_inspections") || "[]")
};
console.log(JSON.stringify(dump));
```
…puis importer manuellement via SQL editor. Pour une maquette de démo, partir de zéro est souvent plus propre.
