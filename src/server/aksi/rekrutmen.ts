/* Rekrutmen: portal lowongan publik (tanpa login) dan pengelolaan pipeline kandidat oleh HC / Super Admin */
import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { konteks } from '@/lib/konteks';
import { normalisasiNomorWhatsApp } from '@/lib/telepon';
import { folderPenyimpanan, jalurAman } from '@/lib/berkas';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import { bacaCv, catatRiwayat, kabariHc, kenaliCv, LABEL_TAHAP, LABEL_TIPE, pertanyaanLowongan, picuAntrean, simpanCv, TAHAP, type Tahap } from '@/lib/rekrutmen';
import { groqJson, KuotaPenuh } from '@/lib/ai/groqJson';
import { hasilTes, paketUntuk, siapkanTes } from './tesRekrutmen';
import type { KumpulanAksi } from '../daftar';

const TIPE = ['tetap', 'kontrak', 'magang', 'freelance', 'paruh_waktu'];
export const PENDIDIKAN = ['SMA/SMK', 'D3', 'D4', 'S1', 'S2', 'S3', 'Lainnya'];
export const PENGALAMAN = ['Belum ada (fresh graduate)', 'Kurang dari 1 tahun', '1–2 tahun', '3–5 tahun', 'Lebih dari 5 tahun'];
const json = <T>(t: unknown, bawaan: T): T => { try { return t ? JSON.parse(String(t)) : bawaan; } catch { return bawaan; } };
const barisTeks = (t: unknown) => String(t ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
type Bidang = { nama: string; paketId: number | null };
const bidangLowongan = (r: Baris) => json<Bidang[]>(r.bidang, []).filter((b) => b && b.nama);
const POLA_URL = /^https?:\/\/[^\s<>"]+$/i;
export const PETUNJUK_VIDEO = 'Rekam video Anda mengajar satu materi (5–10 menit), unggah ke YouTube atau Google Drive, lalu tempel tautannya di sini. Pastikan tautan dapat dibuka oleh siapa saja.';

/* lowongan yang tampil di portal: berstatus buka dan belum lewat batas */
const SQL_BUKA = "status='buka' AND (batas IS NULL OR batas >= CURDATE())";

/* pembatas pengiriman per IP (di memori): maks 5 lamaran per 10 menit */
const jejakIp = new Map<string, number[]>();
function batasiIp(ip: string) {
  const kini = Date.now(), daftar = (jejakIp.get(ip) ?? []).filter((t) => kini - t < 10 * 60_000);
  if (daftar.length >= 5) gagal('Terlalu banyak pengiriman dari jaringan Anda. Coba lagi beberapa menit lagi.', 429);
  daftar.push(kini); jejakIp.set(ip, daftar);
  if (jejakIp.size > 5000) jejakIp.clear();
}

/* soalAda: paket tes yang sudah berisi soal (paket kosong dianggap tidak ada tes) */
function lowonganPublik(r: Baris, soalAda: Set<number> = new Set()) {
  const bidang = bidangLowongan(r), ada = (id: unknown) => soalAda.has(Number(id));
  return { id: r.id, judul: r.judul, divisi: r.divisi, lokasi: r.lokasi, tipe: r.tipe, tipeLabel: LABEL_TIPE[r.tipe] ?? r.tipe,
    deskripsi: r.deskripsi ?? '', kualifikasi: barisTeks(r.kualifikasi), nilaiPlus: barisTeks(r.nilai_plus), pertanyaan: pertanyaanLowongan(r),
    batas: r.batas, dibuka: String(r.created_at).slice(0, 10), wajibVideo: !!r.wajib_video, petunjukVideo: r.petunjuk_video || PETUNJUK_VIDEO,
    bidang: bidang.map((b) => ({ nama: b.nama, tes: ada(b.paketId || r.tes_paket_id) })), tes: bidang.length ? bidang.some((b) => ada(b.paketId || r.tes_paket_id)) : ada(r.tes_paket_id) };
}
function lowonganAdmin(r: Baris, soalAda: Set<number>) {
  return { ...lowonganPublik(r, soalAda), kualifikasiTeks: r.kualifikasi ?? '', nilaiPlusTeks: r.nilai_plus ?? '', kuota: r.kuota, status: r.status,
    jumlah: Number(r.jumlah ?? 0), baru: Number(r.baru ?? 0), diterima: Number(r.diterima ?? 0),
    petunjukVideoTeks: r.petunjuk_video ?? '', bidangAtur: bidangLowongan(r), tesPaketId: r.tes_paket_id ?? null };
}
const paketBersoal = async () => new Set((await q('SELECT DISTINCT paket_id FROM tes_soal')).map((x) => Number(x.paket_id)));
function kandidatRingkas(r: Baris) {
  const pr = json<Record<string, any>>(r.profil, {});
  const pd = Array.isArray(pr.pendidikan) && pr.pendidikan[0] ? pr.pendidikan[0] : null;
  return { id: r.id, kode: r.kode, nama: r.nama, email: r.email, noHp: r.no_hp, lowonganId: r.lowongan_id, lowongan: r.judul ?? '', tahap: r.tahap,
    bidang: r.bidang ?? '', linkVideo: r.link_video ?? '', tesStatus: r.tes_status ?? null, tesNilai: r.tes_nilai ?? null, tesLulus: r.tes_status === 'selesai' && Number(r.tes_lulus) ? Number(r.tes_nilai) >= Number(r.tes_lulus) : null,
    skor: r.skor, kecocokan: r.kecocokan, aiStatus: r.ai_status, rating: r.rating_hc, pendidikan: pd ? [pd.jenjang, pd.jurusan].filter(Boolean).join(' ') : r.pendidikan,
    pengalamanBulan: pr.total_pengalaman_bulan ?? null, pengalamanIsian: r.pengalaman ?? '', ringkasan: String(pr.ringkasan ?? '').slice(0, 220), dilamar: r.created_at, userId: r.user_id };
}
async function lamaranAda(id: number) {
  const l = await q1('SELECT l.*, w.judul FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id WHERE l.id=?', [id]);
  if (!l) gagal('Lamaran tidak ditemukan', 404);
  return l;
}

export const aksiRekrutmen: KumpulanAksi = {
  /* ================= PUBLIK (tanpa login) ================= */
  async rk_portal() {
    const l = await q(`SELECT * FROM lowongan WHERE ${SQL_BUKA} ORDER BY created_at DESC`);
    const soalAda = await paketBersoal();
    return { lowongan: l.map((x) => lowonganPublik(x, soalAda)), pendidikan: PENDIDIKAN, pengalaman: PENGALAMAN };
  },

  async rk_lamar(m) {
    // jebakan bot: kolom tersembunyi terisi -> pura-pura berhasil tanpa menyimpan
    if (s(m, 'situs')) return { nama: s(m, 'nama'), posisi: '' };
    batasiIp(konteks()?.ip || 'tanpa-ip');
    const lw = await q1(`SELECT * FROM lowongan WHERE id=? AND ${SQL_BUKA}`, [i(m, 'lowonganId')]);
    if (!lw) gagal('Lowongan ini sudah ditutup atau tidak ditemukan');
    const nama = s(m, 'nama').replace(/\s+/g, ' '), email = s(m, 'email').toLowerCase();
    if (nama.length < 3 || nama.length > 150) gagal('Nama lengkap wajib diisi (3–150 karakter)');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 150) gagal('Alamat email tidak valid');
    const hp = normalisasiNomorWhatsApp(s(m, 'noHp'));
    if (!hp) gagal('Nomor WhatsApp tidak valid. Contoh: 081234567890');
    const pendidikan = s(m, 'pendidikan');
    if (!PENDIDIKAN.includes(pendidikan)) gagal('Pilih pendidikan terakhir');
    const pengalaman = s(m, 'pengalaman');
    if (!PENGALAMAN.includes(pengalaman)) gagal('Pilih lama pengalaman kerja');
    const tautan = s(m, 'tautan');
    if (tautan && (!/^https?:\/\/\S+$/i.test(tautan) || tautan.length > 300)) gagal('Tautan portofolio harus diawali http:// atau https://');
    const daftarBidang = bidangLowongan(lw), bidang = s(m, 'bidang');
    if (daftarBidang.length && !daftarBidang.some((b) => b.nama === bidang)) gagal('Pilih bidang yang Anda lamar');
    const linkVideo = s(m, 'linkVideo');
    if (lw.wajib_video && !linkVideo) gagal('Tempel tautan video Anda (YouTube, Google Drive, dll.)');
    if (linkVideo && (!POLA_URL.test(linkVideo) || linkVideo.length > 500)) gagal('Tautan video harus berupa alamat lengkap yang diawali https://');
    const tanya = pertanyaanLowongan(lw), masuk = (m.jawaban && typeof m.jawaban === 'object') ? m.jawaban as Record<string, unknown> : {};
    const jawaban: Record<string, string> = {};
    tanya.forEach((t, n) => {
      const v = String(masuk[n] ?? '').trim();
      if (!v) gagal(`Jawab pertanyaan: "${t}"`);
      jawaban[t] = v.slice(0, 1500);
    });
    if (!m.setuju) gagal('Centang persetujuan pemrosesan data untuk melanjutkan');
    // CV: PDF / DOCX, maks 5 MB, dikenali dari isi berkas (bukan nama / ekstensi)
    const cv = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(s(m, 'cv'));
    if (!cv) gagal('Unggah CV Anda (PDF atau DOCX)');
    const buf = Buffer.from(cv[1], 'base64');
    if (buf.length > 5 * 1024 * 1024) gagal('Ukuran CV maksimal 5 MB');
    const jenis = kenaliCv(buf);
    if (!jenis) gagal('CV harus berupa berkas PDF atau Word (.docx)');
    if (await q1('SELECT id FROM lamaran WHERE lowongan_id=? AND email=? AND created_at > DATE_SUB(NOW(), INTERVAL 60 DAY)', [lw.id, email]))
      gagal('Anda sudah mengirim lamaran untuk posisi ini. Tim HRD akan menghubungi Anda.');
    const cvPath = await simpanCv(buf, jenis);
    let id = 0;
    for (let n = 0; n < 5 && !id; n++) {
      const kode = 'RK' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      try {
        id = await sisipkan('lamaran', { lowongan_id: lw.id, kode, nama, email, no_hp: hp, domisili: s(m, 'domisili').slice(0, 120), pendidikan, tautan,
          bidang: daftarBidang.length ? bidang.slice(0, 100) : '', link_video: linkVideo,
          jurusan: s(m, 'jurusan').slice(0, 100), pengalaman, kerja_terakhir: s(m, 'kerjaTerakhir').slice(0, 150),
          jawaban: JSON.stringify(jawaban), cv_path: cvPath, cv_nama: (s(m, 'cvNama').replace(/[^\p{L}\p{N} ._()-]/gu, '_') || 'cv.' + jenis.ext).slice(0, 200),
          cv_mime: jenis.mime, ip: (konteks()?.ip ?? '').slice(0, 45) });
      } catch (e) { if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY')) throw e; }
    }
    if (!id) gagal('Gagal menyimpan lamaran, silakan coba lagi');
    await catatRiwayat(id, 'sistem', 'Lamaran masuk melalui portal rekrutmen.');
    await kabariHc(nama, lw.judul + (daftarBidang.length ? ' — ' + bidang : ''));
    picuAntrean();
    // tes pilihan ganda (bila lowongan memakainya): pelamar langsung diarahkan mengerjakan
    const tes = await siapkanTes(id, paketUntuk(lw.bidang, lw.tes_paket_id, bidang));
    return { nama, posisi: lw.judul, tes };
  },

  /* ================= HC / SUPER ADMIN ================= */
  async rk_ringkas() {
    await need(['admin']);
    const lw = await q(`SELECT w.*, COUNT(l.id) jumlah, SUM(l.tahap='baru') baru, SUM(l.tahap='diterima') diterima
      FROM lowongan w LEFT JOIN lamaran l ON l.lowongan_id=w.id GROUP BY w.id ORDER BY FIELD(w.status,'buka','draf','tutup'), w.created_at DESC`);
    const n = async (sql: string) => Number((await q1(sql))?.n ?? 0);
    const soalAda = await paketBersoal();
    const paket = await q('SELECT p.id, p.judul, p.divisi, (SELECT COUNT(*) FROM tes_soal WHERE paket_id=p.id) n FROM tes_paket p ORDER BY p.judul');
    return {
      lowongan: lw.map((x) => lowonganAdmin(x, soalAda)), tahap: TAHAP.map((k) => ({ k, label: LABEL_TAHAP[k] })), tipe: LABEL_TIPE, petunjukVideo: PETUNJUK_VIDEO,
      paket: paket.map((x) => ({ id: x.id, judul: x.judul, divisi: x.divisi, jumlahSoal: Number(x.n) })),
      stat: { buka: lw.filter((x) => x.status === 'buka').length, baru: await n("SELECT COUNT(*) n FROM lamaran WHERE tahap='baru'"),
        bulanIni: await n("SELECT COUNT(*) n FROM lamaran WHERE created_at >= DATE_FORMAT(CURDATE(),'%Y-%m-01')"),
        antrean: await n("SELECT COUNT(*) n FROM lamaran WHERE ai_status IN ('antri','proses')"), proses: await n("SELECT COUNT(*) n FROM lamaran WHERE tahap NOT IN ('diterima','ditolak')") },
    };
  },

  /* Draf kualifikasi wajib dari judul, divisi, lokasi, tipe, dan deskripsi yang sudah diisi HC. Hanya saran: HC tetap meninjau sebelum menyimpan. */
  async rk_kualifikasi_ai(m) {
    await need(['admin']);
    const judul = s(m, 'judul').slice(0, 150), divisi = s(m, 'divisi').slice(0, 100), lokasi = s(m, 'lokasi').slice(0, 100);
    const deskripsi = s(m, 'deskripsi').slice(0, 3000), tipe = LABEL_TIPE[s(m, 'tipe')] ?? s(m, 'tipe');
    if (judul.length < 3) gagal('Isi judul posisi dulu agar AI tahu posisi yang dicari');
    const sistem = `Anda membantu HC Yayasan Pendidikan POSI (Pusat Olimpiade Sains Indonesia, Medan) menyusun lowongan kerja.
Buat daftar KUALIFIKASI WAJIB untuk posisi yang diberikan, dalam Bahasa Indonesia.
Aturan:
- 5 sampai 8 butir, masing-masing satu kalimat pendek (maks. 110 karakter), jelas dan bisa dinilai dari CV (pendidikan, pengalaman, keahlian, alat/aplikasi, kemampuan).
- Sesuaikan dengan judul, divisi, lokasi, tipe pekerjaan, dan deskripsi. Jangan menambah tugas yang tidak ada di deskripsi.
- Tipe magang/freelance: jangan mensyaratkan pengalaman panjang.
- DILARANG syarat diskriminatif: usia, jenis kelamin, agama, suku, status pernikahan, penampilan fisik, tinggi/berat badan.
- Tanpa penomoran atau tanda butir di awal teks.
Balas JSON: {"kualifikasi": ["...", "..."]}`;
    const isi = `Judul posisi: ${judul}
Divisi: ${divisi || '-'}
Lokasi: ${lokasi || '-'}
Tipe pekerjaan: ${tipe || '-'}
Deskripsi pekerjaan:
${deskripsi || '-'}`;
    let hasil: Record<string, unknown>;
    try { hasil = await groqJson(sistem, isi, 1200); }
    catch (e) { gagal(e instanceof KuotaPenuh ? 'Layanan AI sedang sibuk, coba lagi dalam 1 menit' : 'AI gagal membuat kualifikasi, coba lagi', 503); }
    const daftar = (Array.isArray(hasil.kualifikasi) ? hasil.kualifikasi : []).map((x) => String(x ?? '').replace(/^\s*(\d+[.)]|[-•*])\s*/, '').replace(/\s+/g, ' ').trim())
      .filter((x) => x.length >= 5).slice(0, 8).map((x) => x.slice(0, 200));
    if (!daftar.length) gagal('AI tidak menghasilkan kualifikasi, coba lagi', 503);
    return { kualifikasi: daftar };
  },

  async rk_lowongan_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), judul = s(m, 'judul');
    if (judul.length < 3) gagal('Judul posisi wajib diisi');
    const tipe = s(m, 'tipe', 'kontrak');
    if (!TIPE.includes(tipe)) gagal('Tipe pekerjaan tidak sah');
    const status = s(m, 'status', 'draf');
    if (!['draf', 'buka', 'tutup'].includes(status)) gagal('Status tidak sah');
    const batas = s(m, 'batas');
    if (batas && !POLA_TGL.test(batas)) gagal('Tanggal batas tidak sah');
    if (status === 'buka' && !barisTeks(m.kualifikasi).length) gagal('Isi minimal satu kualifikasi wajib sebelum lowongan dibuka');
    const pertanyaan = (Array.isArray(m.pertanyaan) ? m.pertanyaan : barisTeks(m.pertanyaan)).map((x: unknown) => String(x).trim()).filter(Boolean);
    if (pertanyaan.length > 5) gagal('Maksimal 5 pertanyaan tambahan');
    // bidang (opsional) masing-masing boleh punya paket tes sendiri; tanpa paket = paket tes bawaan lowongan
    const idPaket = new Set((await q('SELECT id FROM tes_paket')).map((x) => Number(x.id)));
    const cekPaket = (v: unknown) => { const n = Number(v) || 0; if (n && !idPaket.has(n)) gagal('Paket soal yang dipilih tidak ditemukan'); return n || null; };
    const bidang: Bidang[] = [];
    for (const b of Array.isArray(m.bidang) ? m.bidang as Record<string, unknown>[] : []) {
      const nama = String(b?.nama ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!nama) continue;
      if (bidang.some((x) => x.nama.toLowerCase() === nama.toLowerCase())) gagal(`Bidang "${nama}" tertulis dua kali`);
      bidang.push({ nama, paketId: cekPaket(b.paketId) });
    }
    if (bidang.length > 20) gagal('Maksimal 20 bidang');
    const data: Baris = { judul: judul.slice(0, 150), divisi: s(m, 'divisi').slice(0, 100), lokasi: s(m, 'lokasi').slice(0, 150), tipe,
      wajib_video: m.wajibVideo ? 1 : 0, petunjuk_video: s(m, 'petunjukVideo').slice(0, 500), bidang: JSON.stringify(bidang), tes_paket_id: cekPaket(m.tesPaketId),
      deskripsi: s(m, 'deskripsi').slice(0, 6000), kualifikasi: s(m, 'kualifikasi').slice(0, 4000), nilai_plus: s(m, 'nilaiPlus').slice(0, 3000),
      pertanyaan: JSON.stringify(pertanyaan.map((x: string) => x.slice(0, 200))), kuota: Math.max(1, Math.min(999, i(m, 'kuota', 1))), batas: batas || null, status };
    if (id) {
      const k = Object.keys(data);
      const r = await exec(`UPDATE lowongan SET ${k.map((x) => `${x}=:${x}`).join(',')} WHERE id=:__id`, { ...data, __id: id });
      if (!r.affectedRows) gagal('Lowongan tidak ditemukan');
      await logAksi(u.id, 'ubah_lowongan', judul);
      return { pesan: 'Lowongan tersimpan', id };
    }
    const baru = await sisipkan('lowongan', { ...data, dibuat_oleh: u.id });
    await logAksi(u.id, 'tambah_lowongan', judul);
    return { pesan: status === 'buka' ? 'Lowongan dibuat dan langsung tampil di portal' : 'Lowongan disimpan sebagai draf', id: baru };
  },

  async rk_lowongan_status(m) {
    const u = await need(['admin']);
    const status = s(m, 'status');
    if (!['draf', 'buka', 'tutup'].includes(status)) gagal('Status tidak sah');
    const lw = await q1('SELECT * FROM lowongan WHERE id=?', [i(m, 'id')]);
    if (!lw) gagal('Lowongan tidak ditemukan');
    if (status === 'buka' && !barisTeks(lw.kualifikasi).length) gagal('Isi kualifikasi wajib dulu sebelum membuka lowongan');
    await exec('UPDATE lowongan SET status=? WHERE id=?', [status, lw.id]);
    await logAksi(u.id, 'status_lowongan', `${lw.judul} → ${status}`);
    return { pesan: status === 'buka' ? 'Lowongan dibuka di portal' : status === 'tutup' ? 'Lowongan ditutup' : 'Lowongan dijadikan draf' };
  },

  async rk_lowongan_hapus(m) {
    const u = await need(['admin']);
    const lw = await q1('SELECT l.*, (SELECT COUNT(*) FROM lamaran WHERE lowongan_id=l.id) n FROM lowongan l WHERE l.id=?', [i(m, 'id')]);
    if (!lw) gagal('Lowongan tidak ditemukan');
    if (Number(lw.n) > 0) gagal('Lowongan ini sudah memiliki pelamar. Tutup lowongan saja agar data kandidat tetap tersimpan.');
    await exec('DELETE FROM lowongan WHERE id=?', [lw.id]);
    await logAksi(u.id, 'hapus_lowongan', lw.judul);
    return { pesan: 'Lowongan dihapus' };
  },

  async rk_kandidat(m) {
    await need(['admin']);
    const w: string[] = [], p: unknown[] = [];
    if (i(m, 'lowonganId')) { w.push('l.lowongan_id=?'); p.push(i(m, 'lowonganId')); }
    const tahap = s(m, 'tahap');
    if (tahap && (TAHAP as readonly string[]).includes(tahap)) { w.push('l.tahap=?'); p.push(tahap); }
    const cari = s(m, 'cari');
    if (cari) { w.push('(l.nama LIKE ? OR l.email LIKE ? OR l.kode LIKE ? OR l.profil LIKE ?)'); const k = '%' + cari.replace(/[\\%_]/g, '\\$&') + '%'; p.push(k, k, k, k); }
    const urut = s(m, 'urut') === 'terbaru' ? 'l.created_at DESC' : 'l.skor IS NULL, l.skor DESC, l.created_at DESC';
    const urutAkhir = s(m, 'urut') === 'tes' ? "t.status='selesai' DESC, t.nilai DESC, l.skor DESC" : urut;
    const l = await q(`SELECT l.id, l.kode, l.nama, l.email, l.no_hp, l.lowongan_id, l.tahap, l.skor, l.kecocokan, l.ai_status, l.rating_hc, l.pendidikan,
      l.pengalaman, l.profil, l.created_at, l.user_id, l.bidang, l.link_video, w.judul, t.status tes_status, t.nilai tes_nilai, t.nilai_lulus tes_lulus
      FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id LEFT JOIN lamaran_tes t ON t.lamaran_id=l.id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${urutAkhir} LIMIT 500`, p);
    return l.map(kandidatRingkas);
  },

  async rk_detail(m) {
    await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const riwayat = await q('SELECT * FROM lamaran_riwayat WHERE lamaran_id=? ORDER BY id DESC', [l.id]);
    return {
      ...kandidatRingkas(l), domisili: l.domisili, tautan: l.tautan, tes: await hasilTes(l.id), pendidikanIsian: l.pendidikan, jurusan: l.jurusan, pengalamanIsian: l.pengalaman, kerjaTerakhir: l.kerja_terakhir, cvNama: l.cv_nama, cvUrl: '/api/rk_cv?id=' + l.id, aiGalat: l.ai_galat,
      jawaban: json<Record<string, string>>(l.jawaban, {}), profil: json(l.profil, null), analisis: json(l.analisis, null), diproses: l.diproses_at,
      riwayat: riwayat.map((r) => ({ id: r.id, jenis: r.jenis, dari: r.dari, ke: r.ke, catatan: r.catatan, oleh: r.oleh_nama, waktu: r.created_at })),
    };
  },

  async rk_tahap(m) {
    const u = await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const ke = s(m, 'tahap') as Tahap;
    if (!TAHAP.includes(ke)) gagal('Tahap tidak sah');
    if (ke === l.tahap) return { pesan: 'Tahap tidak berubah' };
    await exec('UPDATE lamaran SET tahap=? WHERE id=?', [ke, l.id]);
    await catatRiwayat(l.id, 'tahap', s(m, 'catatan'), { id: u.id, nama: u.nama }, l.tahap, ke);
    await logAksi(u.id, 'tahap_kandidat', `${l.nama} (${l.kode}): ${LABEL_TAHAP[l.tahap as Tahap]} → ${LABEL_TAHAP[ke]}`);
    return { pesan: `${l.nama} dipindah ke ${LABEL_TAHAP[ke]}` };
  },

  async rk_catatan(m) {
    const u = await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const c = s(m, 'catatan');
    if (!c) gagal('Tulis catatan terlebih dulu');
    await catatRiwayat(l.id, 'catatan', c, { id: u.id, nama: u.nama });
    return { pesan: 'Catatan tersimpan' };
  },

  async rk_rating(m) {
    await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const r = i(m, 'rating');
    await exec('UPDATE lamaran SET rating_hc=? WHERE id=?', [r >= 1 && r <= 5 ? r : null, l.id]);
    return { pesan: 'Penilaian HC tersimpan' };
  },

  async rk_analisis_ulang(m) {
    const u = await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    if (l.ai_status === 'proses') gagal('CV ini sedang dianalisis');
    await exec("UPDATE lamaran SET ai_status='antri', ai_percobaan=0, ai_galat='' WHERE id=?", [l.id]);
    await catatRiwayat(l.id, 'sistem', 'Analisis AI diulang atas permintaan ' + u.nama + '.');
    picuAntrean();
    return { pesan: 'CV masuk antrean analisis ulang' };
  },

  async rk_hapus(m) {
    const u = await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    await exec('DELETE FROM lamaran WHERE id=?', [l.id]);
    const p = jalurAman(folderPenyimpanan('private'), l.cv_path);
    if (p) await unlink(p).catch(() => {});
    await logAksi(u.id, 'hapus_lamaran', `${l.nama} (${l.kode}) · ${l.judul}`);
    return { pesan: 'Lamaran dan CV dihapus permanen' };
  },

  /* CV dibuka langsung di browser (GET) */
  async rk_cv(m) {
    await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const isi = await bacaCv(l.cv_path);
    if (!isi) gagal('Berkas CV tidak ditemukan', 404);
    const ascii = String(l.cv_nama).replace(/[^A-Za-z0-9._-]/g, '_') || 'cv';
    const pdf = l.cv_path.endsWith('.pdf');
    return new Response(new Uint8Array(isi), { headers: {
      'Content-Type': pdf ? 'application/pdf' : l.cv_mime,
      'Content-Disposition': `${pdf && m.unduh === undefined ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(l.cv_nama)}`,
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    } });
  },

  /* data awal form Tambah Karyawan dari kandidat yang diterima */
  async rk_jadikan_karyawan(m) {
    await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    if (l.tahap !== 'diterima') gagal('Pindahkan kandidat ke tahap Diterima terlebih dulu');
    if (l.user_id) gagal('Kandidat ini sudah dijadikan karyawan');
    const lw = await q1('SELECT * FROM lowongan WHERE id=?', [l.lowongan_id]);
    const pr = json<Record<string, any>>(l.profil, {}), pd = Array.isArray(pr.pendidikan) ? pr.pendidikan[0] ?? {} : {};
    const status: Record<string, string> = { tetap: 'probation', kontrak: 'kontrak', magang: 'magang', freelance: 'freelance', paruh_waktu: 'harian' };
    return { lamaranId: l.id, nama: l.nama, email: l.email, noHp: l.no_hp, jabatan: lw?.judul ?? '', dept: lw?.divisi ?? '', statusKerja: status[lw?.tipe] ?? 'kontrak',
      pendidikan: l.pendidikan, jurusan: (l.jurusan || String(pd.jurusan ?? '')).slice(0, 100), institusi: String(pd.institusi ?? '').slice(0, 120), tglMasuk: tglWIB() };
  },
  async rk_tautkan_karyawan(m) {
    const u = await need(['admin']);
    const l = await lamaranAda(i(m, 'id'));
    const k = await q1('SELECT id, nik FROM users WHERE id=?', [i(m, 'userId')]);
    if (!k) gagal('Akun karyawan tidak ditemukan');
    await exec('UPDATE lamaran SET user_id=? WHERE id=?', [k.id, l.id]);
    await catatRiwayat(l.id, 'sistem', `Dijadikan karyawan (NIK ${k.nik}) oleh ${u.nama}.`);
    return { pesan: 'Kandidat tercatat sebagai karyawan' };
  },
};
