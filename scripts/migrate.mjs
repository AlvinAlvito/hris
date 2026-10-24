/* =====================================================================
   Penyesuai struktur database — jalankan setiap kali memperbarui aplikasi:
     npm run migrate
   1. menjalankan db/schema.sql -> membuat tabel yang belum ada, mengisi
      pengaturan/data bawaan yang belum ada (INSERT IGNORE);
   2. menambahkan KOLOM yang ada di schema.sql tetapi belum ada di database;
   3. melebarkan pilihan ENUM bila versi baru menambah pilihan.
   Aman dijalankan berulang. TIDAK PERNAH menghapus tabel, kolom, atau data.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AKAR, koneksi } from './env.mjs';

const sql = readFileSync(path.join(AKAR, 'db', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
const db = await koneksi();
const nama = process.env.DB_NAME;

/* 1. jalankan schema.sql pernyataan demi pernyataan */
const bersih = sql.replace(/^\s*--.*$/gm, '');
for (let stmt of bersih.split(';\n')) {
  stmt = stmt.trim().replace(/;$/, '');
  if (stmt) await db.query(stmt);
}

/* 2 & 3. bandingkan kolom per tabel */
async function kolomAda(t) {
  const [r] = await db.query('SELECT column_name k, column_type t FROM information_schema.columns WHERE table_schema=? AND table_name=?', [nama, t]);
  return Object.fromEntries(r.map((x) => [x.k.toLowerCase(), x.t]));
}
const isiEnum = (tipe) => {
  const m = /^enum\((.*)\)$/i.exec(tipe.trim());
  return m ? [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]) : [];
};
/* pisahkan isi CREATE TABLE per koma tingkat teratas (bukan koma di dalam ENUM(...) atau kutip) */
function pisahDefinisi(isi) {
  isi = isi.replace(/--[^\n]*/g, '');
  const hasil = [];
  let buf = '', dalam = 0, kutip = false;
  for (const c of isi) {
    if (c === "'") kutip = !kutip;
    if (!kutip) {
      if (c === '(') dalam++;
      else if (c === ')') dalam--;
      else if (c === ',' && dalam === 0) { hasil.push(buf); buf = ''; continue; }
    }
    buf += c;
  }
  if (buf.trim()) hasil.push(buf);
  return hasil.map((x) => x.replace(/\s+/g, ' ').trim());
}

let n = 0;
for (const [, tabel, isi] of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*ENGINE/gi)) {
  const ada = await kolomAda(tabel);
  let sebelum = null;
  for (const baris of pisahDefinisi(isi)) {
    if (!baris || /^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|FOREIGN)\b/i.test(baris)) continue;
    const m = /^`?(\w+)`?\s+(.+)$/.exec(baris);
    if (!m) continue;
    const [, kolom, def] = m, k = kolom.toLowerCase();
    if (!(k in ada)) {
      await db.query(`ALTER TABLE \`${tabel}\` ADD COLUMN \`${kolom}\` ${def.replace(/\bPRIMARY KEY\b|\bAUTO_INCREMENT\b/gi, '')}${sebelum ? ` AFTER \`${sebelum}\`` : ''}`);
      console.log(`${tabel}.${kolom} ditambahkan`); n++;
    } else if (/^ENUM\s*\(/i.test(def)) {
      // lebarkan ENUM hanya bila semua pilihan lama masih ada
      const baru = isiEnum((/^(ENUM\s*\((?:[^()']|'[^']*')*\))/i.exec(def) ?? [])[1] ?? ''), lama = isiEnum(ada[k]);
      if (baru.length && lama.length && baru.some((x) => !lama.includes(x)) && lama.every((x) => baru.includes(x))) {
        await db.query(`ALTER TABLE \`${tabel}\` MODIFY COLUMN \`${kolom}\` ${def}`);
        console.log(`${tabel}.${kolom}: pilihan diperluas`); n++;
      }
    }
    sebelum = kolom;
  }
}

/* penyesuaian data yang aman */
await db.query("UPDATE absensi SET jam_mode='tetap' WHERE jam_mode='' OR jam_mode IS NULL");
await db.end();
console.log(n ? `Selesai: ${n} perubahan struktur.` : 'Struktur database sudah terbaru.');
