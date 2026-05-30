-- ============================================================
-- VoiturePrepa.fr — schéma initial
-- ============================================================
-- Conçu pour SQLite (foundation). À porter sur PostgreSQL pour
-- la production (types : INTEGER → BIGSERIAL/INT, TEXT → TEXT/VARCHAR,
-- types JSON → JSONB, contraintes CHECK identiques).

PRAGMA foreign_keys = ON;

-- ---------- Utilisateurs ----------
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,           -- argon2id, jamais en clair
    role            TEXT NOT NULL DEFAULT 'particulier'
                        CHECK(role IN ('particulier','pro','garage','admin')),
    pro_pack        TEXT CHECK(pro_pack IN ('gratuit','premium','performance')),
    prenom          TEXT,
    nom             TEXT,
    raison_sociale  TEXT,
    telephone       TEXT,
    siret           TEXT,
    email_verifie   INTEGER NOT NULL DEFAULT 0,
    actif           INTEGER NOT NULL DEFAULT 1,
    cgu_version     TEXT,                    -- version des CGU acceptées
    consentement_at TEXT,                    -- ISO 8601
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ---------- Sessions (rapide à invalider, alternative au seul cookie chiffré) ----------
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,            -- UUID v4
    user_id     INTEGER NOT NULL,
    role        TEXT NOT NULL,
    twofa_ok    INTEGER NOT NULL DEFAULT 0,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    ip          TEXT,
    user_agent  TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---------- Annonces ----------
CREATE TABLE IF NOT EXISTS ads (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id            INTEGER NOT NULL,
    type                TEXT NOT NULL CHECK(type IN ('voiture','piece')),
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','approved','rejected','sold')),
    titre               TEXT NOT NULL,
    description         TEXT,
    prix                INTEGER NOT NULL CHECK(prix >= 0),

    -- Champs voiture
    marque              TEXT,
    modele              TEXT,
    annee               INTEGER,
    km                  INTEGER,
    carburant           TEXT,
    boite               TEXT,
    couleur             TEXT,
    categorie           TEXT,
    etat                TEXT,
    stage               TEXT,
    puissance_origine   INTEGER,
    puissance_actuelle  INTEGER,
    couple_origine      INTEGER,
    couple_actuel       INTEGER,
    pieces_perf         TEXT,                 -- JSON sérialisé

    -- Champs pièce
    cat_piece           TEXT,
    sous_piece          TEXT,

    -- Localisation
    ville               TEXT,
    departement         TEXT,

    -- Options et badges (JSON sérialisé)
    options             TEXT NOT NULL DEFAULT '[]',
    badges              TEXT NOT NULL DEFAULT '[]',

    -- Vente en ligne sécurisée
    vente_en_ligne      INTEGER NOT NULL DEFAULT 0,

    -- Modération
    reject_reason       TEXT,
    was_modified        INTEGER NOT NULL DEFAULT 0,
    is_renewal          INTEGER NOT NULL DEFAULT 0,
    modif_changes       TEXT,                 -- JSON

    -- Durée et expiration
    duration_months     INTEGER NOT NULL DEFAULT 3,
    first_published_at  TEXT,
    submitted_at        TEXT NOT NULL DEFAULT (datetime('now')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),   -- date effective de mise en ligne
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ads_owner ON ads(owner_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_type ON ads(type);
CREATE INDEX IF NOT EXISTS idx_ads_created ON ads(created_at DESC);

-- ---------- Photos d'annonces (séparé pour scaler) ----------
CREATE TABLE IF NOT EXISTS ad_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id       INTEGER NOT NULL,
    storage_key TEXT NOT NULL,                -- clé S3 ou chemin
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ad_photos_ad ON ad_photos(ad_id, position);

-- ---------- Documents sensibles (CT / CNI / carte grise) ----------
-- En prod : chemins S3 chiffrés, jamais le contenu en base.
CREATE TABLE IF NOT EXISTS ad_documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id           INTEGER NOT NULL UNIQUE,
    ct_storage_key  TEXT,
    cni_storage_key TEXT,
    cg_storage_key  TEXT,
    uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
    purge_at        TEXT,                     -- effacement programmé (30 j après vente)
    FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);

-- ---------- Transactions (vente en ligne sécurisée) ----------
CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id           INTEGER NOT NULL,
    buyer_id        INTEGER NOT NULL,
    seller_id       INTEGER NOT NULL,
    montant         INTEGER NOT NULL,         -- en centimes
    commission      INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','paid','shipped','received','refunded','disputed')),
    stripe_pi_id    TEXT UNIQUE,              -- PaymentIntent
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at         TEXT,
    received_at     TEXT,
    FOREIGN KEY (ad_id) REFERENCES ads(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_txn_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_txn_seller ON transactions(seller_id);

-- ---------- Paramètres du site (équivalent du localStorage en maquette) ----------
CREATE TABLE IF NOT EXISTS site_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,                -- JSON
    updated_by  INTEGER,                      -- user_id admin
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- ---------- Audit log admin ----------
CREATE TABLE IF NOT EXISTS admin_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL,
    action      TEXT NOT NULL,                -- ex. "ad.approve", "user.suspend", "document.view"
    target_id   TEXT,                         -- id de l'entité affectée (string pour flexibilité)
    payload     TEXT,                         -- JSON contextuel
    ip          TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit(admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit(target_id);

-- ---------- Garages partenaires ----------
CREATE TABLE IF NOT EXISTS partner_garages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT NOT NULL,
    ville       TEXT NOT NULL,
    dept        TEXT NOT NULL,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    prestations TEXT,
    custom      INTEGER NOT NULL DEFAULT 1,   -- 0 = garage par défaut, 1 = ajouté admin
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
