# VoiturePrepa.fr — Passage en v30

*Sauvegarde de la v29 effectuée le 3 septembre 2026 dans `archives/Site v29` et `archives/Site v29.zip`.*

---

## ⚠️ Migrations SQL à appliquer

À exécuter dans le [SQL Editor Supabase](https://supabase.com/dashboard/project/nuarxylvrvqxzynozkbg/sql/new), dans cet ordre. Chacune est indépendante et sans effet si elle a déjà été passée.

| Fichier | Objet | État |
|---|---|---|
| `sql/migration_turbo_columns.sql` | Colonnes turbo (type / marque / modèle) | à vérifier |
| `sql/migration_pneus_chrono.sql` | Type de pneus + chrono 100-200 | à vérifier |
| `sql/migration_submitted_at.sql` | Date de dépôt immuable des annonces | à vérifier |
| `sql/migration_page_views.sql` | Statistiques de trafic du site | à vérifier |
| `sql/migration_contact_messages.sql` | Messagerie de contact + fil + jeton public | appliquée |
| `sql/migration_suppression_conversation.sql` | Masquage / suppression de conversation | appliquée |
| `sql/migration_messages_lus.sql` | Marquage « lu » des messages | à vérifier |

**Vérification rapide de l'ensemble :**

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='ads' AND column_name IN
      ('turbo_type','pneus','chrono_100_200','submitted_at'))      AS colonnes_annonces_sur_4,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='messages' AND column_name='read_at')          AS messages_read_at,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='conversations' AND column_name LIKE 'hidden%') AS masquage_sur_2,
  to_regclass('public.page_views')      AS table_trafic,
  to_regclass('public.contact_replies') AS table_fil_contact;
```

Résultat attendu : `4`, `1`, `2`, `page_views`, `contact_replies`.

---

## Ce qui a été fait en v29

### Annonces

- Cascade turbo au dépôt : Type → Marque → Modèle
- Type de pneus (route / semi-slicks / slicks) et chrono 100-200 km/h
- Chrono affiché en pastille sur la photo des cartes du listing
- Badge Stage bleu à côté du prix
- État du véhicule en pastille colorée : vert, orange, rouge
- Galerie : photo entière, swipe tactile, hauteur adaptée aux photos verticales
- Bouton de partage avec aperçu enrichi (fonction Vercel `/api/og`)
- Aperçu du rendu réel des photos au moment du dépôt
- Filtres pneus, turbo et chrono, panneau latéral réorganisé et sections colorées

### Messagerie — cinq défauts corrigés

Le symptôme était unique — « le destinataire ne reçoit rien » — mais les causes étaient indépendantes et se masquaient les unes les autres :

1. **Brevo bloquait l'adresse IP de Vercel** — aucun email ne partait, quel que soit le déclencheur
2. **La redirection interrompait l'enregistrement de la conversation** — le message restait dans le navigateur de l'expéditeur
3. **Le vendeur était cherché dans un cache non chargé sur mobile** — conversation jamais créée depuis un téléphone
4. **Le cache des conversations n'était jamais initialisé au chargement** — le destinataire ne voyait rien tant qu'il n'écrivait pas lui-même
5. **Le masquage n'était pas appliqué à l'affichage** — l'historique supprimé réapparaissait

Ajouts : suppression de conversation (masquage par participant, purge définitive côté admin), marquage « lu » enregistré en base, pastille de messages non lus dans l'en-tête, affichage du prénom seul.

### Formulaire de contact

Le formulaire n'écrivait **que** dans le navigateur du visiteur : `VP_SB.sendContact` existait mais n'était jamais appelé. Aucun message de visiteur n'est donc parvenu à l'administration depuis le lancement.

Désormais : enregistrement réel en base, fil de discussion, réponse par email, et page `repondre.html` permettant au visiteur de répondre sans compte — sa réponse revient dans l'administration.

### Administration

- Statistiques de trafic : pages vues, visites, visiteurs uniques, pages par visite
- Graphique d'évolution jour par jour, en SVG natif sans bibliothèque
- Correction de comptages faussés : chaque annonce était comptée **deux fois**
- Délai de modération enfin calculable grâce à `submitted_at` (`created_at` étant réécrit à chaque validation)
- Suppression définitive des annonces refusées et supprimées
- Interrupteurs : masquer les onglets de services, masquer les espaces publicitaires
- **Correctif de sécurité** : l'interface d'administration était présente dans la page sous l'écran de connexion. Les données restaient protégées, mais la structure est désormais entièrement masquée.

---

## Nouveautés v30

### Statut légal et pays d'immatriculation

Deux champs **obligatoires** au dépôt d'une annonce voiture, affichés dans les
caractéristiques de l'annonce :

- **Statut légal** — « Homologué / conforme pour la route » (pastille verte) ou
  « Modifié – homologation à vérifier » (pastille orange). Pas de rouge :
  « à vérifier » n'est pas une faute, c'est un point à contrôler avant d'acheter.
- **Pays d'immatriculation / de circulation** — parmi les dix pays desservis.

Sur ce marché, la question qui décide de l'achat n'est pas « combien de
chevaux ? » mais « est-ce que je peux rouler avec ? ». Elle restait noyée dans la
description quand elle était posée ; elle devient une information à part entière,
qui engage le vendeur. Migration : `sql/migration_statut_legal.sql`.

Le partage des responsabilités est rappelé **sur l'annonce elle-même** — pièces à
la charge de l'acheteur, exactitude des informations véhicule à la charge du
vendeur — et détaillé dans les CGU et les mentions légales, désormais explicites
sur le fait qu'un véhicule homologué dans son pays ne l'est pas automatiquement
ailleurs. Le bandeau « Rappel légal » précise l'usage circuit fermé / voie privée,
sauf mise en conformité et homologation.

### Suppression d'un compte depuis l'administration

Onglet Utilisateurs → fiche d'un membre : bouton **Supprimer le compte**, à côté
du bannissement. Réservé aux comptes **sans activité** — comptes de test,
inscriptions jamais utilisées, doublons.

C'est la base qui tranche (`sql/migration_suppression_compte.sql`) : elle
recense annonces, transactions, avis, inspections, conversations et fiches
garage, et refuse en indiquant précisément ce qui bloque. Pour un compte actif,
le bannissement reste l'outil adapté : il coupe l'accès sans faire disparaître
des ventes de l'historique ni laisser des avis sans interlocuteur.

Un administrateur ne peut être supprimé, ni par un autre, ni par lui-même.

### Ouverture à l'Europe de l'Ouest

Un sélecteur **Pays** apparaît au dépôt d'annonce et dans les filtres. Dix pays
sont couverts :

| Pays | Régions | Subdivisions |
|---|---|---|
| France | 18 | 96 départements |
| Belgique | 3 | 11 provinces |
| Luxembourg | 3 | 12 cantons |
| Pays-Bas | 4 | 12 provinces |
| Suisse | 7 | 26 cantons |
| Allemagne | 4 | 16 Länder |
| Italie | 5 | 20 régions |
| Espagne | 7 | 19 communautés |
| Portugal | 6 | 20 districts |
| Autriche | 3 | 9 Länder |

Toute subdivision étrangère se comporte exactement comme un département
français : même colonne en base, mêmes filtres, marqueur sur la carte
(coordonnées fournies pour les 145 subdivisions ajoutées), géocodage des villes
basculé sur le bon pays. Le pays se lit dans le code — `BE-LIE`, `CH-GE`,
`IT-LOM` — sans colonne supplémentaire. **Aucune migration SQL.**

Ajouter un pays de plus ne demande qu'une entrée dans les tables de référence :
les sélecteurs Pays des pages se remplissent d'eux-mêmes.

Pour les villes : la France garde sa liste officielle et exhaustive
(geo.api.gouv.fr), chargée en une fois et utilisable hors connexion. Les neuf
autres pays n'ont pas d'équivalent commun — le champ Ville devient une **saisie
assistée** appuyée sur Photon (OpenStreetMap), sans clé d'API. La recherche est
orientée par les coordonnées de la subdivision choisie (taper « Mila » en
Lombardie propose Milan en premier) et filtrée sur le pays, ce qui écarte les
homonymes. Les coordonnées de la ville retenue sont conservées : le marqueur de
la carte est posé au bon endroit sans second appel réseau. On reste libre
d'écrire un nom non proposé — un service indisponible ne doit jamais empêcher de
publier.

Enfin, le libellé « Toute la France » devient **« Tous pays »** — l'ancienne
valeur reste acceptée pour ne pas casser les recherches déjà sauvegardées.

### Favoris rattachés au compte

Les favoris ne vivaient que dans le `localStorage` du navigateur : le même
compte affichait 5 favoris sur téléphone et 0 sur ordinateur, et tout
disparaissait au moindre nettoyage du navigateur. Ils sont désormais enregistrés
en base (`sql/migration_favoris.sql`) et suivent le compte d'un appareil à
l'autre.

Le cœur répond toujours instantanément — la base est mise à jour en arrière-plan
— et les favoris déjà posés sur un appareil sont repris automatiquement à la
première synchronisation : rien n'est perdu.

### Défilement des photos depuis la liste

Les cartes du listing (voitures et pièces) et de l'accueil embarquent une
mini-galerie : flèches au survol sur ordinateur, balayage du doigt sur mobile,
pastilles de position. L'acheteur juge plusieurs vues sans ouvrir l'annonce —
c'est ce qui fait rester sur la page de résultats.

Seule la première photo est chargée au rendu ; les voisines le sont à la
demande. Huit vues au maximum par carte.

---

## Correctifs v30

### Annonces invisibles pour certains visiteurs

Symptôme : « 27 annonces trouvées » s'affiche, mais aucune carte n'apparaît — et
seulement chez certaines personnes.

Cause : les cartes portaient les classes `ad-card`, `ad-grid`, `ad-title`,
`ad-price`… Les bloqueurs de publicité (uBlock, AdGuard, le bloqueur intégré de
Samsung Internet ou de Brave) masquent d'office tout élément dont la classe
commence par `ad-`. Le compteur, lui, n'était pas concerné : d'où un nombre
correct au-dessus d'une grille vide. Le site marche donc parfaitement… sauf pour
les visiteurs équipés d'un bloqueur, qui sont nombreux sur mobile.

Correctif : toutes les classes et identifiants d'annonces passent du préfixe
`ad-` au préfixe `an-` (annonce). Les vrais encarts publicitaires gardent
`ad-slot` / `ad-leaderboard` : eux, il est normal qu'ils soient bloqués.

En complément, le listing rend désormais chaque carte isolément : une annonce
malformée ne peut plus vider toute la grille.

### Onglets de services visibles alors qu'ils sont masqués

Les drapeaux (`nav_services_hidden`) arrivent de Supabase **après** le premier
rendu de l'en-tête. Sur la première page ouverte dans un navigateur neuf, le
cache local était vide : la valeur par défaut s'appliquait et Inspection,
Protection achats, Garages et Boost annonce s'affichaient.

Correctif : tant que la réponse du serveur n'est pas connue, les onglets sont
masqués ; ils sont réaffichés — sans reconstruire l'en-tête — dès que les
drapeaux arrivent. Les pages correspondantes attendent, elles, la réponse réelle
avant de décider d'un éventuel blocage.

---

## Points de vigilance pour la v30

**Deux notions de « connecté » coexistent** — la session locale et le jeton Supabase. Elles peuvent diverger. Un correctif a été posé sur le lien Administration, mais la source du problème demeure : ce serait un bon chantier de fond.

**Les conversations vivent à deux endroits** — base et `localStorage`. Une remontée automatique existe, mais tout nettoyage doit se faire des deux côtés.

**Délivrabilité des emails** — la configuration est saine, mais le domaine est jeune : Microsoft classe encore en indésirables les boîtes sans historique. Cela se règle avec le temps et les interactions, pas par du code.

**Le catalogue reste le sujet numéro un.** 9 annonces au 3 septembre 2026. Le plan d'amorçage est dans `VoiturePrepa-Plan-contenu-30-jours.md`, à la racine du projet. Le point de bascule est à 50 annonces.
