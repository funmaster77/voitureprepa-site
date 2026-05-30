# VoiturePrepa.fr — Marketplace voitures préparées

Maquette **v14** du marketplace VoiturePrepa.fr — dédiée aux voitures sportives préparées pour le circuit et aux pièces performance.

## Structure

- **Frontend** : pages HTML statiques + CSS + JavaScript vanilla (localStorage pour la persistance maquette).
- **Backend** (`backend/`) : API Node.js + Fastify + SQLite (inscription, activation email, récupération mot de passe).

## Pages principales

| Page | Fichier | Description |
|------|---------|-------------|
| Accueil | `index.html` | Hero, recherche rapide, cartes thématiques |
| Annonces | `annonces.html` | Liste + filtres + carte Leaflet |
| Annonce | `annonce.html` | Détail + Protection des Achats |
| Dépôt | `deposer.html` | Création d'annonce voiture/pièce |
| Tarifs | `tarifs.html` | Particulier (Photos+/Urgence/Remontada) · Pro (Gratuit/Premium/Performance) |
| Inspection | `inspection.html` | Or / Argent / Bronze |
| Mon compte | `profil.html` | Annonces, messages, inspections, transactions |
| Admin | `admin.html` | Modération, comptes, comptabilité, SLA inspections |
| CGU | `cgu.html` | Marketplace, remboursements, responsabilité, litiges |

## Fonctionnalités clés

- 🔐 Comptes Particulier / Professionnel (SIRET unique) / Garage
- 💳 Modèle économique : commission 2 % acheteur + 3 % vendeur · abonnements Pro · boosts à l'unité
- 🛡️ Protection des Achats — fonds conservés jusqu'à validation
- 🔍 Inspection par garages partenaires avec rapport en PJ
- 🚀 Pack Performance : remontée mensuelle automatique des annonces du pro
- 🚨 Alertes SLA admin (72 h proposition / 48 h validation / 48 h rapport)
- 🚧 Feature flags de lancement pilotables depuis l'admin

## Reste à faire

- [ ] Mise en ligne (hébergement, nom de domaine, HTTPS)
- [ ] Création de la micro-entreprise
- [ ] Intégration paiement réel (Stripe / Mangopay)

## Auteur 

Thomas Ralet — 2026
