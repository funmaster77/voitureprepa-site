// Test de fumée minimal : démarre le serveur, exerce les principales routes,
// vérifie les réponses, puis s'arrête. À lancer avec `npm run test:smoke`.
// Requiert que la BDD soit initialisée (`npm run migrate`).

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = 3001;
process.env.PORT = String(PORT);
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.CORS_ORIGINS = '*';

const child = spawn('node', ['src/server.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
child.stdout.on('data', d => process.stdout.write('[srv] ' + d));
child.stderr.on('data', d => process.stderr.write('[err] ' + d));

const baseUrl = `http://localhost:${PORT}`;
let passed = 0, failed = 0;

async function assertOk(label, fn) {
  try { await fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label} — ${e.message}`); failed++; }
}

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch { /* not ready yet */ }
    await wait(200);
  }
  throw new Error('Le serveur ne répond pas');
}

try {
  await waitReady();
  console.log('Serveur prêt, exécution des tests :\n');

  await assertOk('GET /api/health', async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  let cookie = '';
  const fetchJson = async (url, opts = {}) => {
    const r = await fetch(`${baseUrl}${url}`, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(opts.headers || {}),
      },
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return r;
  };

  const testEmail = `smoke-${Date.now()}@example.test`;
  await assertOk('POST /api/auth/register (particulier)', async () => {
    const r = await fetchJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'Test1234!', prenom: 'Smoke', nom: 'Test' }),
    });
    if (r.status !== 201) throw new Error(`status ${r.status}`);
  });

  await assertOk('POST /api/auth/login', async () => {
    const r = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'Test1234!' }),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  await assertOk('GET /api/auth/me (avec session)', async () => {
    const r = await fetchJson('/api/auth/me');
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    if (data.email !== testEmail) throw new Error('mauvais email');
  });

  await assertOk('POST /api/ads', async () => {
    const r = await fetchJson('/api/ads', {
      method: 'POST',
      body: JSON.stringify({
        type: 'voiture', titre: 'BMW M3 Stage 1 smoke test',
        prix: 35000, marque: 'BMW', modele: 'M3', annee: 2018, km: 50000,
      }),
    });
    if (r.status !== 201) throw new Error(`status ${r.status}`);
  });

  await assertOk('GET /api/ads (annonce pending non visible)', async () => {
    const r = await fetchJson('/api/ads');
    const ads = await r.json();
    if (ads.some(a => a.titre?.includes('smoke test'))) {
      throw new Error('annonce pending visible publiquement');
    }
  });

  await assertOk('GET /api/settings (public)', async () => {
    const r = await fetchJson('/api/settings');
    const data = await r.json();
    if (data.particulier_duree !== 3) throw new Error('particulier_duree manquant');
  });

  await assertOk('GET /api/admin/ads/pending (refusé sans rôle admin)', async () => {
    const r = await fetchJson('/api/admin/ads/pending');
    if (r.status !== 403) throw new Error(`status ${r.status} (attendu 403)`);
  });

  // ---------- Vérification d'email & récupération de mot de passe ----------
  await assertOk('GET /api/auth/verify-email?token=invalide → 400 HTML', async () => {
    const r = await fetchJson('/api/auth/verify-email?token=' + 'x'.repeat(64));
    if (r.status !== 400) throw new Error(`status ${r.status} (attendu 400)`);
  });

  await assertOk('POST /api/auth/resend-verification (session active)', async () => {
    const r = await fetchJson('/api/auth/resend-verification', { method: 'POST' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    if (data.ok !== true) throw new Error('réponse inattendue');
  });

  await assertOk('POST /api/auth/forgot-password (email inconnu → 200 quand même)', async () => {
    const r = await fetchJson('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody-' + Date.now() + '@example.test' }),
    });
    if (!r.ok) throw new Error(`status ${r.status} (attendu 200 anti-énumération)`);
  });

  await assertOk('POST /api/auth/forgot-password (email réel)', async () => {
    const r = await fetchJson('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail }),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  await assertOk('POST /api/auth/reset-password (token bidon → 400)', async () => {
    const r = await fetchJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'z'.repeat(64), password: 'NewPass2026!' }),
    });
    if (r.status !== 400) throw new Error(`status ${r.status} (attendu 400)`);
  });

  console.log(`\n${passed} passés, ${failed} échoués.`);
} catch (e) {
  console.error('Erreur:', e.message);
  failed = -1;
} finally {
  child.kill('SIGTERM');
  await wait(200);
  process.exit(failed === 0 ? 0 : 1);
}
