// Routes réservées au rôle admin. Chaque route inscrit son action dans l'audit log.

import { all, get, run } from '../db.js';
import { requireRole } from '../auth.js';
import { rejectSchema } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';

function audit(adminId, action, targetId, payload, ip) {
  run(
    `INSERT INTO admin_audit (admin_id, action, target_id, payload, ip)
     VALUES (?, ?, ?, ?, ?)`,
    [adminId, action, targetId == null ? null : String(targetId),
     payload ? JSON.stringify(payload) : null, ip || null]
  );
}

export default async function adminRoutes(app) {
  // Toutes les routes admin passent par requireRole('admin') qui vérifie
  // session + rôle + 2FA à CHAQUE requête.
  const onlyAdmin = { preHandler: requireRole('admin') };

  // ---------- Liste des annonces à modérer ----------
  app.get('/api/admin/ads/pending', onlyAdmin, async () => {
    return all(
      `SELECT a.*, u.email AS owner_email
       FROM ads a JOIN users u ON u.id = a.owner_id
       WHERE a.status = 'pending'
       ORDER BY a.submitted_at ASC`
    );
  });

  // ---------- Validation ----------
  app.post('/api/admin/ads/:id/approve', onlyAdmin, async (req) => {
    const id = Number(req.params.id);
    const ad = get(`SELECT id, owner_id, first_published_at FROM ads WHERE id = ?`, [id]);
    if (!ad) throw notFound();
    const owner = get(`SELECT role FROM users WHERE id = ?`, [ad.owner_id]);
    const firstPublishedAt = ad.first_published_at || new Date().toISOString();
    // Pour un pro, created_at reste calé sur la première mise en ligne.
    const createdAt = owner?.role === 'pro' ? firstPublishedAt : new Date().toISOString();
    run(
      `UPDATE ads
       SET status = 'approved',
           reject_reason = NULL,
           first_published_at = COALESCE(first_published_at, ?),
           created_at = ?,
           was_modified = 0,
           is_renewal = 0,
           updated_at = datetime('now')
       WHERE id = ?`,
      [firstPublishedAt, createdAt, id]
    );
    audit(req.user.id, 'ad.approve', id, null, req.ip);
    return { ok: true };
  });

  // ---------- Refus ----------
  app.post('/api/admin/ads/:id/reject', onlyAdmin, async (req) => {
    const id = Number(req.params.id);
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Motif requis (3 caractères minimum).');
    const ad = get(`SELECT id FROM ads WHERE id = ?`, [id]);
    if (!ad) throw notFound();
    run(
      `UPDATE ads SET status = 'rejected', reject_reason = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [parsed.data.reason, id]
    );
    audit(req.user.id, 'ad.reject', id, { reason: parsed.data.reason }, req.ip);
    return { ok: true };
  });

  // ---------- Liste des utilisateurs ----------
  app.get('/api/admin/users', onlyAdmin, async () => {
    return all(
      `SELECT id, email, role, pro_pack, prenom, nom, raison_sociale,
              telephone, email_verifie, actif, created_at, last_login_at
       FROM users ORDER BY created_at DESC LIMIT 500`
    );
  });

  // ---------- Audit log (consultation) ----------
  app.get('/api/admin/audit', onlyAdmin, async (req) => {
    const limit = Math.min(Number(req.query?.limit) || 100, 500);
    return all(
      `SELECT a.id, a.admin_id, u.email AS admin_email, a.action, a.target_id,
              a.payload, a.ip, a.created_at
       FROM admin_audit a JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC LIMIT ?`,
      [limit]
    );
  });
}
