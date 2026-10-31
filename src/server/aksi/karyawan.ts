/* Karyawan: profil lengkap, foto profil, struktur organisasi, kontrak, dokumen privat, impor Excel */
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PIN_AWAL } from '@/lib/pinAwal';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { exec, nilai, q, q1, sisipkan, transaksi, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { isAdminUp, logAksi, need, type User } from '@/lib/aturan';
import { setgInt } from '@/lib/pengaturan';
import { ambilBiodata, KOLOM_BIODATA, periksaBiodata, userPublik } from '@/lib/format';
import { dataUrlKeBuffer, folderPenyimpanan } from '@/lib/berkas';
import { bacaBerkas, berkasRow, bolehLihatBerkas, hapusBerkasFisik, simpanBerkas } from '@/lib/berkasPrivat';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const JENIS_DOKUMEN = ['KTP', 'KK', 'NPWP', 'Kontrak Kerja', 'Ijazah', 'Transkrip', 'Sertifikat', 'Kartu BPJS', 'Buku Tabungan',
  'SK Pengangkatan', 'Surat Keterangan', 'Lainnya'];
/* kolom yang boleh diperbarui karyawan sendiri (sisanya lewat HC) */
const BIODATA_MANDIRI = ['noHp', 'email', 'alamatDomisili', 'daruratNama', 'daruratHubungan', 'daruratHp', 'pendidikan', 'jurusan', 'institusi'];

async function ambilUser(id: number): Promise<User> {
  const u = await q1('SELECT * FROM users WHERE id=?', [id]);
  if (!u) gagal('Karyawan tidak ditemukan');
  return u;
}
const bolehLihatProfil = (u: User, target: number) => u.id === target || isAdminUp(u);

/* satu baris impor Excel -> [kolom tabel users, daftar kesalahan]; hanya kolom yang terisi yang dipakai */
function barisImport(r: Baris, cabangNama: Map<string, number>): [Baris, string[]] {
  const data: Baris = {}, salah: string[] = [];
  const nama = String(r.nama ?? '').trim();
  if (nama) data.nama = nama.slice(0, 150);
  for (const k of ['jabatan', 'dept']) { const v = String(r[k] ?? '').trim(); if (v) data[k] = v.slice(0, 100); }
  const tgl = String(r.tglMasuk ?? '').trim();
  if (tgl) { if (POLA_TGL.test(tgl)) data.tgl_masuk = tgl; else salah.push('Tanggal Masuk harus YYYY-MM-DD'); }
  const lok = String(r.lokasi ?? '').trim();
  if (lok) { const id = cabangNama.get(lok.toLowerCase()); if (id) data.cabang_id = id; else salah.push(`Lokasi Kerja "${lok}" tidak ada di menu Lokasi Kerja`); }
  const peran = String(r.peran ?? '').trim().toLowerCase();
  if (peran) {
    if (['pegawai', 'karyawan', 'staff', 'staf'].includes(peran)) data.role = 'karyawan';
    else if (peran === 'supervisor' || peran === 'spv') data.role = 'atasan';
    else if (peran === 'hc') data.role = 'admin';
    else salah.push('Peran harus Staff, Supervisor, atau HC');
  }
  for (const [k, [kol, aturan]] of Object.entries(KOLOM_BIODATA)) {
    const v = String(r[k] ?? '').trim();
    if (!v) continue;
    const [hasil, err] = periksaBiodata(k, v);
    if (!err) { data[kol] = hasil; continue; }
    if (aturan === 'date') salah.push(`Format tanggal ${k} harus YYYY-MM-DD`);
    else if (typeof aturan === 'string' && aturan.startsWith('enum:')) salah.push(`${k} harus salah satu: ${aturan.slice(5).split(',').filter(Boolean).join(', ')}`);
    else salah.push(err);
  }
  return [data, salah];
}

export const aksiKaryawan: KumpulanAksi = {
  /* ---------- impor Excel (baris sudah dibaca di browser) ---------- */
  async kr_import(m) {
    const u = await need(['admin']);
    const baris: Baris[] = Array.isArray(m.baris) ? m.baris : [];
    if (!baris.length) gagal('File tidak berisi data');
    if (baris.length > 1000) gagal('Maksimal 1.000 baris per impor');
    const simpan = !!m.simpan;
    const cabangNama = new Map<string, number>(); let pusat: number | null = null;
    for (const c of await q('SELECT id, nama, tipe FROM cabang ORDER BY id')) {
      cabangNama.set(String(c.nama).toLowerCase(), c.id);
      if (pusat === null && c.tipe === 'pusat') pusat = c.id;
    }
    const ada = new Map<string, Baris>();
    for (const x of await q('SELECT id, nik, nama, role FROM users')) ada.set(String(x.nik).toLowerCase(), x);
    const hasil: Baris[] = [], dipakai = new Map<string, number>();
    const jatah = await setgInt('jatah_default', 12), target = await setgInt('target_menit_default', 480);
    const proses = async () => {
      for (const [idx, r] of baris.entries()) {
        const no = Number(r._baris ?? idx + 2), nik = String(r.nik ?? '').trim();
        const [data, salah] = barisImport(r, cabangNama);
        if (!nik) salah.push('NIK wajib diisi');
        else if (dipakai.has(nik.toLowerCase())) salah.push(`NIK ganda di file (baris ${dipakai.get(nik.toLowerCase())})`);
        const lama = ada.get(nik.toLowerCase());
        if (!lama && !data.nama) salah.push('Nama wajib diisi untuk karyawan baru');
        if (lama && lama.role === 'direktur') salah.push('Akun Super Admin tidak bisa diubah lewat impor');
        let pin = String(r.pin ?? '').trim();
        if (pin && !/^\d{4,8}$/.test(pin)) salah.push('PIN harus 4–8 digit angka');
        if (nik) dipakai.set(nik.toLowerCase(), no);
        const item: Baris = { baris: no, nik, nama: data.nama ?? lama?.nama ?? r.nama ?? '', aksi: lama ? 'perbarui' : 'baru', pesan: salah.join('; '), pin: '' };
        if (salah.length) { item.aksi = 'gagal'; hasil.push(item); continue; }
        if (simpan) {
          if (lama) {
            if (pin) data.pin_hash = await bcrypt.hash(pin, 10);
            const k = Object.keys(data);
            if (k.length) await exec(`UPDATE users SET ${k.map((x) => `${x}=:${x}`).join(',')} WHERE id=:__id`, { ...data, __id: lama.id });
          } else {
            if (!pin) { pin = PIN_AWAL; item.pin = pin; }
            await sisipkan('users', { nik, jabatan: 'Staff', tgl_masuk: tglWIB(), role: 'karyawan', cabang_id: pusat, jam_mode: 'tetap',
              lokasi_mode: 'kantor', cuti_mode: 'auto', jatah, target_menit: target, ...data, pin_hash: await bcrypt.hash(pin, 10) });
          }
        }
        hasil.push(item);
      }
    };
    if (simpan) {
      await transaksi(async () => {
        await proses();
        // kaitkan teks divisi & jabatan hasil impor ke master Struktur Organisasi bila namanya cocok
        // hanya baris yang tautannya kosong atau tidak lagi sesuai teksnya
        await exec(`UPDATE users u LEFT JOIN unit_organisasi cur ON cur.id=u.unit_id JOIN unit_organisasi o ON o.nama=TRIM(u.dept)
          SET u.unit_id=o.id WHERE cur.id IS NULL OR cur.nama<>TRIM(u.dept)`);
        await exec(`UPDATE users u LEFT JOIN jabatan cur ON cur.id=u.jabatan_id JOIN jabatan j ON j.nama=TRIM(u.jabatan) AND (j.unit_id <=> u.unit_id OR j.unit_id IS NULL)
          SET u.jabatan_id=j.id WHERE cur.id IS NULL OR cur.nama<>TRIM(u.jabatan)`);
      });
      await logAksi(u.id, 'impor_karyawan', hasil.filter((x) => x.aksi !== 'gagal').length + ' baris');
    } else await proses();
    return { hasil };
  },

  /* ---------- profil ---------- */
  async kr_profil(m) {
    const u = await need();
    const id = i(m, 'id') || u.id;
    if (!bolehLihatProfil(u, id)) gagal('Anda tidak berwenang melihat profil ini', 403);
    const x = await ambilUser(id);
    const p: Baris = await userPublik(x);
    p.atasanNama = '';
    if (x.atasan_id) { const a = await q1('SELECT nama, jabatan FROM users WHERE id=?', [x.atasan_id]); if (a) p.atasanNama = a.nama + ' · ' + a.jabatan; }
    p.jumlahBawahan = Number(await nilai('SELECT COUNT(*) FROM users WHERE atasan_id=? AND aktif=1', [id]));
    const dok = await q("SELECT * FROM berkas WHERE user_id=? AND kategori='dokumen' ORDER BY id DESC", [id]);
    return { profil: p, dokumen: dok.map(berkasRow), jenisDokumen: JENIS_DOKUMEN, bolehUbahSemua: isAdminUp(u), kolomMandiri: BIODATA_MANDIRI };
  },
  async kr_profil_saya(m) {
    const u = await need();
    const data = ambilBiodata(m, BIODATA_MANDIRI);
    const k = Object.keys(data);
    if (!k.length) gagal('Tidak ada data yang diubah');
    await exec(`UPDATE users SET ${k.map((x) => `${x}=:${x}`).join(',')} WHERE id=:__id`, { ...data, __id: u.id });
    await logAksi(u.id, 'ubah_profil_sendiri', k.join(','));
    return { pesan: 'Profil diperbarui', me: await userPublik(await ambilUser(u.id)) };
  },
  async kr_avatar(m) {
    const u = await need();
    const id = i(m, 'id') || u.id;
    if (!bolehLihatProfil(u, id)) gagal('Anda tidak berwenang', 403);
    const { buf } = dataUrlKeBuffer(s(m, 'gambar'), /^image\/(png|jpe?g|webp)$/);
    if (buf.length > 4 * 1024 * 1024) gagal('Foto rusak atau terlalu besar');
    let hasil: Buffer;
    // potong persegi di tengah, 320 px
    try { hasil = await sharp(buf).rotate().resize(320, 320, { fit: 'cover', position: 'centre' }).jpeg({ quality: 86 }).toBuffer(); }
    catch { gagal('Berkas bukan gambar yang sah'); }
    const dir = path.join(folderPenyimpanan('uploads'), 'avatar');
    await mkdir(dir, { recursive: true });
    const nama = randomBytes(12).toString('hex') + '.jpg';
    await writeFile(path.join(dir, nama), hasil);
    const lama = (await ambilUser(id)).foto_profil;
    if (lama && /^[a-f0-9]+\.jpg$/.test(lama)) await unlink(path.join(dir, lama)).catch(() => {});
    await exec('UPDATE users SET foto_profil=? WHERE id=?', [nama, id]);
    await logAksi(u.id, 'ganti_foto_profil', '#' + id);
    return { pesan: 'Foto profil diperbarui', foto: '/uploads/avatar/' + nama };
  },
  /* struktur organisasi: terbuka untuk semua karyawan */
  async kr_org() {
    await need();
    return (await q(`SELECT u.id, u.nama, u.jabatan, u.dept, u.role, u.atasan_id, u.foto_profil, c.nama cnama
      FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id WHERE u.aktif=1 ORDER BY u.nama`))
      .map((r) => ({ id: r.id, nama: r.nama, jabatan: r.jabatan, dept: r.dept, role: r.role, atasanId: r.atasan_id || null,
        foto: r.foto_profil ? '/uploads/avatar/' + r.foto_profil : '', lokasi: r.cnama ?? '' }));
  },
  async kr_kontrak(m) {
    await need(['admin']);
    const hari = Math.max(7, Math.min(180, i(m, 'hari', 45)));
    return (await q(`SELECT id, nik, nama, jabatan, status_kerja, kontrak_mulai, kontrak_selesai, DATEDIFF(kontrak_selesai, CURDATE()) sisa
      FROM users WHERE aktif=1 AND kontrak_selesai IS NOT NULL AND kontrak_selesai <= DATE_ADD(CURDATE(), INTERVAL ? DAY) ORDER BY kontrak_selesai`, [hari]))
      .map((r) => ({ id: r.id, nik: r.nik, nama: r.nama, jabatan: r.jabatan, statusKerja: r.status_kerja,
        kontrakMulai: r.kontrak_mulai, kontrakSelesai: r.kontrak_selesai, sisaHari: Number(r.sisa) }));
  },

  /* ---------- dokumen ---------- */
  async dok_daftar(m) {
    const u = await need();
    const id = i(m, 'userId') || u.id;
    if (!bolehLihatProfil(u, id)) gagal('Anda tidak berwenang', 403);
    return (await q("SELECT * FROM berkas WHERE user_id=? AND kategori='dokumen' ORDER BY id DESC", [id])).map(berkasRow);
  },
  async dok_unggah(m) {
    const u = await need();
    const id = i(m, 'userId') || u.id;
    if (!bolehLihatProfil(u, id)) gagal('Anda tidak berwenang', 403);
    await ambilUser(id);
    const jenis = s(m, 'jenis', 'Lainnya');
    if (!JENIS_DOKUMEN.includes(jenis)) gagal('Jenis dokumen tidak dikenal');
    const berlaku = s(m, 'berlakuSampai');
    if (berlaku && !POLA_TGL.test(berlaku)) gagal('Tanggal berlaku tidak sah');
    const bid = await simpanBerkas(s(m, 'data'), id, 'dokumen', null, jenis, s(m, 'nama', jenis), u.id, berlaku || null);
    await logAksi(u.id, 'unggah_dokumen', `${jenis} untuk #${id}`);
    return { pesan: 'Dokumen tersimpan', id: bid };
  },
  async dok_hapus(m) {
    const u = await need();
    const b = await q1('SELECT * FROM berkas WHERE id=?', [i(m, 'id')]);
    if (!b || b.kategori !== 'dokumen') gagal('Dokumen tidak ditemukan');
    const milikSendiri = b.user_id === u.id && b.diunggah_oleh === u.id;
    if (!isAdminUp(u) && !milikSendiri) gagal('Dokumen hanya dapat dihapus HC atau pengunggahnya', 403);
    await hapusBerkasFisik(b);
    await exec('DELETE FROM berkas WHERE id=?', [b.id]);
    await logAksi(u.id, 'hapus_dokumen', `${b.jenis} #${b.id}`);
    return { pesan: 'Dokumen dihapus' };
  },
  /* tampilkan / unduh berkas privat (dibuka langsung di browser lewat GET) */
  async dok_unduh(m) {
    const u = await need();
    const b = await q1('SELECT * FROM berkas WHERE id=?', [i(m, 'id')]);
    if (!b || !bolehLihatBerkas(u, b)) gagal('Berkas tidak ditemukan', 404);
    const isi = await bacaBerkas(b);
    if (!isi) gagal('Berkas tidak ditemukan', 404);
    const ascii = String(b.nama_asli).replace(/[^A-Za-z0-9._-]/g, '_') || 'berkas';
    return new Response(new Uint8Array(isi), {
      headers: {
        'Content-Type': b.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
        'Content-Disposition': `${m.unduh !== undefined ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(b.nama_asli)}`,
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
