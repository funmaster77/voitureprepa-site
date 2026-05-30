-- ============================================================
-- Migration 002 — Tokens d'authentification
-- ============================================================
-- Une seule table pour les tokens à usage unique :
--   - 'verify_email'   : confirmation de l'adresse à l'inscription
--   - 'reset_password' : récupération de mot de passe
--
-- On ne stocke pas le token en clair, mais son hash SHA-256. Ainsi une
-- fuite de la base ne suffit pas à activer un compte ou réinitialiser un
-- mot de passe : il faudrait connaître le token original (transmis par
-- email à l'utilisateur).

CREATE TABLE IF NOT EXISTS auth_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('verify_email','reset_password')),
    token_hash  TEXT NOT NULL UNIQUE,           -- sha256(token) en hex
    expires_at  TEXT NOT NULL,
    used_at     TEXT,                            -- timestamp d'utilisation (NULL = non utilisé)
    ip          TEXT,                            -- IP au moment de la création
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
