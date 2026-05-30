// Paramètres du site (tarifs, durées, prix minimum). Lecture publique, modification admin.

import { all, get, run } from '../db.js';
import { requireRole } from '../auth.js';
import { settingsUpdateSchema } from '../utils/validate.js';
import { badRequest } from '../utils/errors.js';

export default async function settingsRoutes(app) {
  // ---------- GET /api/settings — public ----------
  app.get('/api/settings', async () => {
    const rows = all(`SELECT key, value FROM site_settings`);
    const out = {};
    for (const r of rows) {
      try { out[r.key] = JSON.parse(r.value); }
      catch { out[r.key] = r.value; }
    }
    return out;
  });

  // ---------- PUT /api/settings — admin ----------
  app.put('/api/settings', { preHandler: requireRole('admin') }, async (req) => {
    const parsed = settingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.');
    const updates = parsed.data;
    for (const [key, value] of Object.entries(updates)) {
      const existing = get(`SELECT key FROM site_settings WHERE key = ?`, [key]);
      if (existing) {
        run(
          `UPDATE site_settings SET value = ?, updated_by = ?, updated_at = datetime('now')
           WHERE key = ?`,
          [JSON.stringify(value), req.user.id, key]
        );
      } else {
        run(
          `INSERT INTO site_settings (key, value, updated_by) VALUES (?, ?, ?)`,
          [key, JSON.stringify(value), req.user.id]
        );
      }
    }
    run(
      `INSERT INTO admin_audit (admin_id, action, payload, ip)
       VALUES (?, 'settings.update', ?, ?)`,
      [req.user.id, JSON.stringify(updates), req.ip || null]
    );
    return { ok: true, updated: Object.keys(updates).length };
  });
}
