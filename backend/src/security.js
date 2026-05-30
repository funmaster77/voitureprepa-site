// Enregistrement des plugins de sécurité HTTP (Helmet, CORS, rate-limit, sessions).

import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/secure-session';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';

export async function registerSecurity(app) {
  // ---------- Cookies ----------
  await app.register(fastifyCookie);

  // ---------- Sessions (cookie signé + chiffré) ----------
  // Le cookie ne contient que l'id de session. La session côté serveur est en
  // table SQLite, ce qui permet une invalidation immédiate.
  await app.register(fastifySession, {
    key: Buffer.from(config.sessionSecret.slice(0, 64).padEnd(64, '0').slice(0, 64), 'hex'),
    cookieName: 'vp_sess',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.isProduction,   // HTTPS uniquement en prod
      maxAge: config.sessionDuration,
    },
  });

  // ---------- CORS ----------
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Pas d'origine = appel direct (Postman, curl, server-to-server) — autorisé
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error('Origine non autorisée'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ---------- En-têtes de sécurité ----------
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // à durcir une fois le front nettoyé des inline styles
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProduction ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
  });

  // ---------- Rate limit global (60 req/min/IP par défaut) ----------
  await app.register(fastifyRateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}
