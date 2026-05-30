// Couche d'accès à la base SQLite. better-sqlite3 est synchrone : c'est plus
// simple à écrire que le sqlite3 asynchrone classique, et plus rapide en
// pratique (pas de yield event-loop entre chaque requête sur des datasets de
// taille moyenne).

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Crée le répertoire data/ si nécessaire
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');     // meilleures perfs en lecture concurrente
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');   // OK avec WAL

// Helpers pratiques
export function get(sql, params = []) {
  return db.prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}
export function all(sql, params = []) {
  return db.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}
export function run(sql, params = []) {
  return db.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
}

// Conversion 1/0 ↔ booléen
export function bool(v) { return v ? 1 : 0; }

// Sérialisation JSON pour les colonnes texte
export function jsonGet(row, field) {
  const v = row && row[field];
  if (v == null || v === '') return null;
  try { return JSON.parse(v); } catch { return null; }
}
export function jsonSet(v) {
  return JSON.stringify(v ?? null);
}
