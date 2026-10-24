/* Pemuat .env.local / .env sederhana untuk skrip baris perintah (tanpa dependensi) + koneksi database */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

export const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = path.join(AKAR, f);
  if (!existsSync(p)) continue;
  for (const baris of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(baris);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function koneksi(opsi = {}) {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS,
    database: process.env.DB_NAME, timezone: '+07:00', dateStrings: true, charset: 'utf8mb4', ...opsi,
  });
}
/* tanggal hari ini di WIB (YYYY-MM-DD), tidak bergantung zona waktu server */
export const hariIniWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
