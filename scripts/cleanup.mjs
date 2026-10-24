/* Hapus foto absensi yang lebih tua dari batas retensi (RETENSI_BULAN, bawaan 6). Jalankan harian lewat cron:
     npm run cleanup
   Baris absensi TIDAK dihapus — hanya berkas fotonya.
   Dokumen karyawan, nota reimburse, logo & foto profil tidak disentuh. */
import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { AKAR, hariIniWIB, koneksi } from './env.mjs';

const bulan = parseInt(process.env.RETENSI_BULAN ?? '6', 10);
if (!(bulan > 0)) { console.log('Retensi dimatikan.'); process.exit(0); }
const [th, bl] = hariIniWIB().split('-').map(Number);
const d = new Date(Date.UTC(th, bl - 1 - bulan, 1));
const batas = d.toISOString().slice(0, 10);
const folder = path.resolve(AKAR, process.env.STORAGE_DIR || './storage', 'uploads');

const db = await koneksi();
const [rows] = await db.query("SELECT id,in_photo,out_photo FROM absensi WHERE tanggal < ? AND (in_photo<>'' OR out_photo<>'')", [batas]);
let hapus = 0;
for (const r of rows) {
  for (const k of ['in_photo', 'out_photo']) {
    if (!r[k]) continue;
    const p = path.resolve(folder, r[k]);
    if (p.startsWith(folder + path.sep) && existsSync(p)) { unlinkSync(p); hapus++; }
  }
  await db.query("UPDATE absensi SET in_photo='', out_photo='' WHERE id=?", [r.id]);
}
await db.end();
// buang folder bulanan yang sudah kosong; folder foto profil tetap dipertahankan
if (existsSync(folder)) for (const e of readdirSync(folder, { withFileTypes: true })) {
  if (e.isDirectory() && e.name !== 'avatar' && !readdirSync(path.join(folder, e.name)).length) rmdirSync(path.join(folder, e.name));
}
console.log(`${hariIniWIB()} — ${hapus} foto sebelum ${batas.slice(0, 7)} dihapus.`);
