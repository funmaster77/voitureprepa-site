# Backend VoiturePrepa.fr — squelette

Foundation Node.js pour le backend de VoiturePrepa.fr. Ce projet est un point de départ : il implémente proprement les **briques de sécurité critiques** (authentification, sessions, contrôle d'accès admin, en-têtes de sécurité, rate limiting) et expose les **endpoints essentiels** (comptes, annonces, modération, paramètres). Il ne couvre **pas** l'intégralité du cahier des charges — voir la section « Ce qui reste à faire » en bas.

## Stack

- **Runtime** : Node.js ≥ 20 LTS
- **Framework HTTP** : Fastify 4
- **Base de données** : SQLite via `better-sqlite3` (synchrone, simple, monofichier)
- **Hachage de mots de passe** : argon2id (`argon2`)
- **Sessions** : cookies signés et chiffrés (`@fastify/secure-session`)
- **Validation** : Zod
- **Sécurité HTTP** : Helmet, CORS configurable, rate-limit

## Installation

```bash
cd backend
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run migrate
npm run dev
```

Le serveur écoute sur `http://localhost:3000`. Un compte administrateur de démo est créé au premier lancement :

- **Email** : `admin@voitureprepa.fr`
- **Mot de passe** : `Admin2026!`

## Endpoints authentification

| Méthode | URL | Description | Auth |
|---------|-----|-------------|------|
| POST | `/api/auth/register` | Inscription — envoie un email de vérification | publique |
| GET | `/api/auth/verify-email?token=…` | Confirme l'adresse email | publique |
| POST | `/api/auth/resend-verification` | Renvoie l'email de vérification | session |
| POST | `/api/auth/login` | Connexion | publique |
| POST | `/api/auth/logout` | Déconnexion | session |
| GET | `/api/auth/me` | Renvoie le profil courant | session |
| POST | `/api/auth/forgot-password` | Démarre une réinitialisation (réponse 200 systématique) | publique |
| POST | `/api/auth/reset-password` | Consomme le token + nouveau mot de passe | publique |

## Emails (vérification & réinitialisation)

Le backend envoie deux types d'emails :

- **Confirmation d'inscription** (token valable 24 h) — lien `GET /api/auth/verify-email?token=…`.
- **Réinitialisation de mot de passe** (token valable 60 min) — lien `/reinitialisation.html?token=…` (à câbler côté front).

**Mode développement** (par défaut) : aucun envoi réel. Les emails sont écrits dans `backend/data/emails/` au format HTML horodaté pour pouvoir être ouverts dans un navigateur.

**Mode production** : renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` dans `.env`. Le transport est créé via `nodemailer` (`port 465 = SSL`, `587 = STARTTLS`).

**Anti-énumération** : `/api/auth/forgot-password` répond toujours `{ ok: true }`. Les tokens sont stockés **hashés en SHA-256**. À la réinitialisation, **toutes les sessions** ouvertes du compte sont invalidées.

## Sécurité — ce qui est en place

- **Hachage argon2id** des mots de passe (paramètres OWASP)
- **Sessions** : `HttpOnly` + `SameSite=Strict` + `Secure` (en prod) + signature et chiffrement applicatif
- **Validation** : Zod sur tous les payloads
- **En-têtes** : HSTS, CSP, X-Frame-Options, X-Content-Type-Options (Helmet)
- **Rate limiting** : différencié par route
- **CORS** : liste d'origines explicite
- **Politique de mots de passe** : 8+ caractères, majuscule, chiffre
- **Tokens à usage unique** SHA-256 hashés en BDD (verify_email + reset_password)

## Ce qui reste à faire

- [x] Vérification d'email + récupération de mot de passe
- [ ] 2FA TOTP obligatoire pour l'admin (actuellement code de démo `123456`)
- [ ] Endpoints RGPD (export, effacement)
- [ ] Intégration Stripe Connect + webhooks signés
- [ ] Stockage S3 chiffré pour les documents
- [ ] Inspections, messagerie, avis, signalements, recherches, garages, statistiques
- [ ] CSRF, CSP stricte, audit log admin
- [ ] Migration vers PostgreSQL pour la production

## Tests

```bash
npm run test:smoke
```

Vérifie le démarrage, l'inscription, la connexion, le dépôt d'annonce, et les routes de vérification d'email et de mot de passe oublié.

## Licence

Propriétaire. Ne pas diffuser sans accord.
