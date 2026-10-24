/* Membuat akun awal Super Admin dan HC bila database masih kosong, serta menyetel nama organisasi.
     npm run seed -- <pin_superadmin> <pin_hc> "<nama organisasi>"
   Peran di database: Super Admin = 'direktur', HC = 'admin'.
   Tanggal masuk akun awal = hari ini; ubah ke tanggal sebenarnya lewat menu Karyawan. */
import bcrypt from 'bcryptjs';
import { hariIniWIB, koneksi } from './env.mjs';

const [pinSuper = '123456', pinHc = '123456', nama = ''] = process.argv.slice(2);
for (const p of [pinSuper, pinHc]) if (!/^\d{6}$/.test(p)) { console.error('PIN harus 6 digit angka'); process.exit(1); }
const db = await koneksi();

if (nama) {
  await db.query("INSERT INTO settings (k,v) VALUES ('perusahaan',?) ON DUPLICATE KEY UPDATE v=VALUES(v)", [nama]);
  console.log('Nama organisasi: ' + nama);
}
const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM users');
if (n > 0) { console.log(`Sudah ada ${n} akun — pembuatan akun awal dilewati.`); await db.end(); process.exit(0); }

const [[pusat]] = await db.query("SELECT id FROM cabang WHERE tipe='pusat' ORDER BY id LIMIT 1");
let idPusat = pusat?.id;
if (!idPusat) idPusat = (await db.query("INSERT INTO cabang (nama,tipe,radius) VALUES ('Kantor Pusat','pusat',200)"))[0].insertId;

const sql = `INSERT INTO users (nik,nama,jabatan,dept,pin_hash,tgl_masuk,role,cuti_mode,jatah,lokasi_mode,cabang_id,atasan_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`;
const hari = hariIniWIB();
await db.query(sql, ['superadmin', 'Super Admin', 'Super Admin', 'Sistem', await bcrypt.hash(pinSuper, 10), hari, 'direktur', 'off', 0, 'bebas', idPusat]);
await db.query(sql, ['hc', 'Staf HC', 'Staf Human Capital', 'Human Capital', await bcrypt.hash(pinHc, 10), hari, 'admin', 'auto', 12, 'kantor', idPusat]);
await db.end();
console.log(`Akun awal dibuat:\n  superadmin / ${pinSuper}\n  hc         / ${pinHc}`);
