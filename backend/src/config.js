// Configuration applicative — lit l'environnement et expose des valeurs typées.
// Toute valeur sensible (secret de session) DOIT être fournie via .env, jamais
// codée en dur. En production, NODE_ENV=production est obligatoire.

// Variables d'env chargées par Node.js avec --env-file=.env (cf. package.json).
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().default('./data/voitureprepa.sqlite'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  CORS_ORIGINS: z.string().default(''),
  SESSION_DURATION_SECONDS: z.coerce.number().int().positive().default(604800),
  ADMIN_SESSION_DURATION_SECONDS: z.coerce.number().int().positive().default(1800),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  // URL publique du site, utilisée pour construire les liens dans les emails.
  APP_URL: z.string().url().default('http://localhost:3000'),
  // SMTP (optionnel : laissé vide en dev → mode "log + fichier").
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('VoiturePrepa <no-reply@voitureprepa.fr>'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuration invalide :', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  port: env.PORT,

  dbPath: path.isAbsolute(env.DB_PATH)
    ? env.DB_PATH
    : path.resolve(backendRoot, env.DB_PATH),

  sessionSecret: env.SESSION_SECRET,
  sessionDuration: env.SESSION_DURATION_SECONDS,
  adminSessionDuration: env.ADMIN_SESSION_DURATION_SECONDS,

  corsOrigins: env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [],

  argon2: {
    type: 2, // argon2id
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: 1,
  },

  appUrl: env.APP_URL.replace(/\/+$/, ''),

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  backendRoot,
};
