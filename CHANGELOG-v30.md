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
