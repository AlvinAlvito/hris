import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { konteks } from './konteks';

/* Satu pool untuk seluruh proses. DATE/TIME dikembalikan sebagai teks ('2026-10-23', '08:05:00')
   seperti PDO di versi lama, dan zona waktu sesi database disamakan dengan WIB
   agar CURDATE()/NOW() menunjuk hari yang sama dengan jam absensi. */
const g = globalThis as unknown as { __posiPool?: Pool };

function pool(): Pool {
  if (!g.__posiPool) {
    g.__posiPool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      charset: 'utf8mb4',
      timezone: '+07:00',
      dateStrings: true,
      decimalNumbers: true,
      connectionLimit: 10,
    });
    g.__posiPool.on('connection', (c) => { c.query("SET time_zone='+07:00'"); });
  }
  return g.__posiPool;
}

export type Baris = Record<string, any>;
type Param = unknown[] | Record<string, unknown>;

/* Di dalam transaksi(), semua query memakai koneksi transaksi yang sama. */
function pelaksana(): Pool | PoolConnection {
  return konteks()?.koneksi ?? pool();
}

/* Parameter bernama (:kolom) diubah sendiri menjadi '?' posisional, karena koneksi transaksi dari pool
   tidak mewarisi opsi namedPlaceholders. Query bernama hanya dibuat oleh kode ini (sisipkan/perbarui/SET dinamis). */
function posisional(sql: string, p: Param): [string, unknown[]] {
  if (Array.isArray(p)) return [sql, p];
  const nilai: unknown[] = [];
  const hasil = sql.replace(/:([A-Za-z_]\w*)/g, (_, k: string) => {
    if (!(k in p)) throw new Error('Parameter tidak ada: ' + k);
    nilai.push(p[k]);
    return '?';
  });
  return [hasil, nilai];
}

export async function q<T = Baris>(sql: string, p: Param = []): Promise<T[]> {
  const [s, v] = posisional(sql, p);
  const [rows] = await pelaksana().query<RowDataPacket[]>(s, v);
  return rows as unknown as T[];
}
export async function q1<T = Baris>(sql: string, p: Param = []): Promise<T | null> {
  const r = await q<T>(sql, p);
  return r[0] ?? null;
}
export async function nilai<T = any>(sql: string, p: Param = []): Promise<T | null> {
  const r = await q1<Baris>(sql, p);
  return r ? (Object.values(r)[0] as T) : null;
}
export async function exec(sql: string, p: Param = []): Promise<ResultSetHeader> {
  const [s, v] = posisional(sql, p);
  const [r] = await pelaksana().query<ResultSetHeader>(s, v);
  return r;
}

export async function transaksi<T>(fn: () => Promise<T>): Promise<T> {
  const ktx = konteks();
  if (!ktx) throw new Error('transaksi() harus dipanggil di dalam permintaan');
  if (ktx.koneksi) return fn();
  const c = await pool().getConnection();
  ktx.koneksi = c;
  try {
    await c.beginTransaction();
    const hasil = await fn();
    await c.commit();
    return hasil;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    ktx.koneksi = undefined;
    c.release();
  }
}

/* INSERT/UPDATE dari objek kolom => nilai */
export async function sisipkan(tabel: string, data: Baris): Promise<number> {
  const k = Object.keys(data);
  const r = await exec(`INSERT INTO ${tabel} (${k.join(',')}) VALUES (${k.map((x) => ':' + x).join(',')})`, data);
  return r.insertId;
}
export async function perbarui(tabel: string, data: Baris, id: number): Promise<void> {
  const k = Object.keys(data);
  if (!k.length) return;
  await exec(`UPDATE ${tabel} SET ${k.map((x) => `${x}=:${x}`).join(',')} WHERE id=:__id`, { ...data, __id: id });
}

/* Kueri baca-saja untuk AI Asisten: koneksi tersendiri, transaksi READ ONLY (database menolak perintah tulis),
   batas waktu eksekusi, dan batas jumlah baris. SQL harus sudah lolos pemeriksaan di lib/ai/sqlAman.ts. */
export async function kueriBacaSaja(sql: string, maksBaris = 200, batasMs = 5000): Promise<Baris[]> {
  const c = await pool().getConnection();
  try {
    const [[v]] = await c.query<RowDataPacket[]>('SELECT VERSION() v');
    const maria = /mariadb/i.test(String(v.v));
    await c.query('START TRANSACTION READ ONLY');
    const kueri = maria
      ? `SET STATEMENT max_statement_time=${batasMs / 1000} FOR SELECT * FROM (${sql}) AS hasil_ai LIMIT ${maksBaris}`
      : `SELECT /*+ MAX_EXECUTION_TIME(${batasMs}) */ * FROM (${sql}) AS hasil_ai LIMIT ${maksBaris}`;
    const [rows] = await c.query<RowDataPacket[]>(kueri);
    return rows as Baris[];
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}
