// Point d'entrée du backend Fastify.
// - charge la configuration
// - enregistre les plugins de sécurité (sessions, cookies, helmet, CORS, rate-limit)
// - branche les hooks d'authentification
// - monte les routes (auth, annonces, admin, paramètres)
// - vérifie que la base est initialisée et seed le compte admin

import Fastify from 'fastify';
import { config } from './config.js';
import { registerSecurity } from './security.js';
import { loadSessionHook, purgeExpiredSessions } from './auth.js';
import { purgeExpiredTokens } from './tokens.js';
import { registerErrorHandler } from './utils/errors.js';
import { seedIfEmpty } from './seed.js';
import accountsRoutes from './routes/accounts.js';
import adsRoutes from './routes/ads.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import { get } from './db.js';

const app = Fastify({
  logger: {
    level: config.isProduction ? 'info' : 'debug',
    transport: config.isDevelopment
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: config.isProduction, // si derrière Nginx/Caddy
  bodyLimit: 1024 * 1024,           // 1 Mo JSON max
});

// ---------- Plugins ----------
await registerSecurity(app);
registerErrorHandler(app);

// ---------- Hook global d'auth ----------
// Charge req.user et req.session_db pour TOUTES les requêtes.
app.addHook('preHandler', loadSessionHook);

// ---------- Health check ----------
app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

// ---------- Routes métier ----------
await app.register(accountsRoutes);
await app.register(adsRoutes);
await app.register(adminRoutes);
await app.register(settingsRoutes);

// ---------- Vérifications pré-démarrage ----------
try {
  // S'assure que les tables existent (sinon : exécuter `npm run migrate`)
  const probe = get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`);
  if (!probe) {
    app.log.error('Base de données non initialisée. Exécutez : npm run migrate');
    process.exit(1);
  }
  await seedIfEmpty(app.log);
} catch (err) {
  app.log.error({ err }, 'Erreur au démarrage');
  process.exit(1);
}

// Purge périodique des sessions et tokens expirés (toutes les heures)
setInterval(() => {
  const sessions = purgeExpiredSessions();
  if (sessions > 0) app.log.info(`Sessions expirées purgées : ${sessions}`);
  const tokens = purgeExpiredTokens();
  if (tokens > 0) app.log.info(`Tokens auth expirés purgés : ${tokens}`);
}, 3600 * 1000);

// ---------- Démarrage ----------
try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Serveur prêt sur http://localhost:${config.port}`);
  app.log.info(`Mode : ${config.env}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
