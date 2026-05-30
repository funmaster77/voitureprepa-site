// Exécute toutes les migrations SQL du dossier migrations/ qui n'ont pas encore
// été appliquées. Très basique : utilise une table `_migrations` pour mémoriser
// les fichiers déjà passés. En prod, préférer un outil dédié (Knex migrate, etc.).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, run, all } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

run(`CREATE TABLE IF NOT EXISTS _migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const applied = new Set(all(`SELECT filename FROM _migrations`).map(r => r.filename));

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
let ranCount = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  · ${file} (déjà appliquée)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(sql);
    run(`INSERT INTO _migrations (filename) VALUES (?)`, [file]);
    db.exec('COMMIT');
    console.log(`  ✓ ${file}`);
    ranCount++;
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(`  ✗ ${file} — ${err.message}`);
    process.exit(1);
  }
}

console.log(ranCount === 0
  ? 'Base à jour, aucune migration appliquée.'
  : `${ranCount} migration(s) appliquée(s).`);
