// Routes des annonces : listing public, lecture, création, modification, suppression.

import { get, all, run, jsonSet, jsonGet } from '../db.js';
import { requireAuth } from '../auth.js';
import { adCreateSchema, adUpdateSchema } from '../utils/validate.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';

// Convertit une ligne SQLite en objet API
function toApiAd(row) {
  if (!row) return null;
  return {
    ...row,
    options: jsonGet(row, 'options') || [],
    badges: jsonGet(row, 'badges') || [],
    pieces_perf: jsonGet(row, 'pieces_perf') || [],
    modif_changes: jsonGet(row, 'modif_changes') || [],
    vente_en_ligne: !!row.vente_en_ligne,
    was_modified: !!row.was_modified,
    is_renewal: !!row.is_renewal,
  };
}

function getDurationMonths(user) {
  // Lookup minimal — la vraie logique lit site_settings (à enrichir plus tard).
  if (user.role === 'pro') {
    if (user.pro_pack === 'performance') return 12;
    if (user.pro_pack === 'premium') return 6;
    return 3;
  }
  return 3;
}

export default async function adsRoutes(app) {
  // ---------- GET /api/ads — listing public ----------
  app.get('/api/ads', async (req) => {
    const type = req.query?.type;
    const q = req.query?.q;
    const params = [];
    let sql = `
      SELECT id, type, titre, prix, marque, modele, annee, km, ville, departement,
             options, badges, vente_en_ligne, created_at, duration_months
      FROM ads
      WHERE status = 'approved'
        AND datetime(created_at, '+' || duration_months || ' months') > datetime('now')
    `;
    if (type === 'voiture' || type === 'piece') {
      sql += ` AND type = ?`;
      params.push(type);
    }
    if (q && typeof q === 'string' && q.length < 100) {
      sql += ` AND (titre LIKE ? OR description LIKE ? OR marque LIKE ?)`;
      const term = `%${q}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const rows = all(sql, params);
    return rows.map(toApiAd);
  });

  // ---------- GET /api/ads/:id ----------
  app.get('/api/ads/:id', async (req) => {
    const id = Number(req.params.id);
    const row = get(`SELECT * FROM ads WHERE id = ?`, [id]);
    if (!row) throw notFound();
    if (row.status !== 'approved' && (!req.user || req.user.id !== row.owner_id)) {
      throw notFound();
    }
    return toApiAd(row);
  });

  // ---------- POST /api/ads ----------
  app.post('/api/ads', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = adCreateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Annonce invalide.', parsed.error.flatten());
    const d = parsed.data;
    const user = req.user;

    const result = run(
      `INSERT INTO ads (
         owner_id, type, status, titre, description, prix,
         marque, modele, annee, km, carburant, boite, couleur,
         categorie, etat, stage,
         puissance_origine, puissance_actuelle, couple_origine, couple_actuel,
         pieces_perf, cat_piece, sous_piece, ville, departement,
         options, badges, vente_en_ligne, duration_months
       ) VALUES (?, ?, 'pending', ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?, ?, ?,
                 '[]', '[]', ?, ?)`,
      [
        user.id, d.type, d.titre, d.description || '', d.prix,
        d.marque || null, d.modele || null, d.annee || null, d.km || null,
        d.carburant || null, d.boite || null, d.couleur || null,
        d.categorie || null, d.etat || null, d.stage || null,
        d.puissance_origine ?? null, d.puissance_actuelle ?? null,
        d.couple_origine ?? null, d.couple_actuel ?? null,
        jsonSet(d.pieces_perf), d.cat_piece || null, d.sous_piece || null,
        d.ville || null, d.departement || null,
        d.vente_en_ligne ? 1 : 0, getDurationMonths(user),
      ]
    );
    reply.code(201);
    return { id: result.lastInsertRowid, status: 'pending' };
  });

  // ---------- PUT /api/ads/:id ----------
  app.put('/api/ads/:id', { preHandler: requireAuth }, async (req) => {
    const id = Number(req.params.id);
    const ad = get(`SELECT owner_id FROM ads WHERE id = ?`, [id]);
    if (!ad) throw notFound();
    if (ad.owner_id !== req.user.id) throw forbidden();

    const parsed = adUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Données invalides.');
    const d = parsed.data;

    // On ne modifie que les champs fournis, et l'annonce repasse en pending.
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(d)) {
      if (['pieces_perf'].includes(k)) {
        fields.push(`${k} = ?`); values.push(jsonSet(v));
      } else if (k === 'vente_en_ligne') {
        fields.push(`${k} = ?`); values.push(v ? 1 : 0);
      } else {
        fields.push(`${k} = ?`); values.push(v ?? null);
      }
    }
    if (fields.length === 0) return { ok: true };
    fields.push(`status = 'pending'`);
    fields.push(`was_modified = 1`);
    fields.push(`updated_at = datetime('now')`);
    values.push(id);
    run(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`, values);
    return { ok: true, status: 'pending' };
  });

  // ---------- DELETE /api/ads/:id ----------
  app.delete('/api/ads/:id', { preHandler: requireAuth }, async (req) => {
    const id = Number(req.params.id);
    const ad = get(`SELECT owner_id FROM ads WHERE id = ?`, [id]);
    if (!ad) throw notFound();
    if (ad.owner_id !== req.user.id && req.user.role !== 'admin') throw forbidden();
    run(`DELETE FROM ads WHERE id = ?`, [id]);
    return { ok: true };
  });
}
