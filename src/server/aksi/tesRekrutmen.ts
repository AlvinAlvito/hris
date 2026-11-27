/* Tes rekrutmen pilihan ganda:
   - Bank soal (paket + soal + kunci + poin) dikelola HC, Super Admin, dan Supervisor; soal bisa dibuat manual atau dibantu AI.
   - Pelamar mengerjakan tes lewat tautan bertoken (tanpa login) langsung setelah mengirim lamaran.
   Nilai = jumlah poin soal yang benar ÷ total poin × 100. Kunci jawaban tidak pernah dikirim ke pelamar. */
import { randomBytes, randomInt } from 'node:crypto';
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { konteks } from '@/lib/konteks';
import { catatRiwayat } from '@/lib/rekrutmen';
import { groqJson, KuotaPenuh } from '@/lib/ai/groqJson';
import type { KumpulanAksi } from '../daftar';

const json = <T>(t: unknown, bawaan: T): T => { try { return t ? JSON.parse(String(t)) : bawaan; } catch { return bawaan; } };

const MAKS_SOAL = 200;
/* toleransi kirim setelah waktu habis (jaringan lambat / pengiriman otomatis) */
const TOLERANSI_DETIK = 120;

type SoalTes = { id: number; p: string; o: string[]; k: number; poin: number };

/* periksa isian satu soal; dipakai form manual, simpan hasil AI, dan impor */
function bersihkanSoal(x: Record<string, unknown>): { pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string } {
  const pertanyaan = String(x.pertanyaan ?? '').trim();
  if (pertanyaan.length < 3) gagal('Tulis pertanyaannya terlebih dulu');
  if (pertanyaan.length > 3000) gagal('Pertanyaan terlalu panjang (maks. 3000 karakter)');
  const mentah = Array.isArray(x.opsi) ? x.opsi.map((o) => String(o ?? '').trim()) : [];
  const kunciAsal = Number(x.kunci);
  // pilihan kosong dibuang; indeks kunci ikut digeser
  const opsi: string[] = []; let kunci = -1;
  mentah.forEach((o, n) => { if (!o) return; if (n === kunciAsal) kunci = opsi.length; opsi.push(o.slice(0, 500)); });
  if (opsi.length < 2) gagal('Isi minimal 2 pilihan jawaban');
  if (opsi.length > 5) gagal('Maksimal 5 pilihan jawaban (A–E)');
  if (new Set(opsi.map((o) => o.toLowerCase())).size !== opsi.length) gagal('Ada pilihan jawaban yang sama persis');
  if (kunci < 0) gagal('Tandai satu pilihan sebagai jawaban benar');
  const poin = Math.round(Number(x.poin ?? 1));
  if (!Number.isFinite(poin) || poin < 1 || poin > 100) gagal('Poin soal harus 1–100');
  return { pertanyaan, opsi, kunci, poin, pembahasan: String(x.pembahasan ?? '').trim().slice(0, 1000) };
}

async function paketAda(id: number) {
  const p = await q1('SELECT * FROM tes_paket WHERE id=?', [id]);
  if (!p) gagal('Paket soal tidak ditemukan', 404);
  return p;
}
/* lowongan yang memakai paket ini (bawaan lowongan atau salah satu bidangnya) */
async function lowonganPemakai(paketId: number) {
  const l = await q('SELECT id, judul, status, tes_paket_id, bidang FROM lowongan');
  return l.filter((x) => Number(x.tes_paket_id) === paketId || json<{ paketId?: number }[]>(x.bidang, []).some((b) => Number(b.paketId) === paketId));
}
function paketRingkas(p: Baris) {
  return { id: p.id, judul: p.judul, divisi: p.divisi, petunjuk: p.petunjuk ?? '', durasi: Number(p.durasi_menit), nilaiLulus: Number(p.nilai_lulus), acak: !!p.acak,
    jumlahSoal: Number(p.jumlah_soal ?? 0), totalPoin: Number(p.total_poin ?? 0), peserta: Number(p.peserta ?? 0), rataNilai: p.rata_nilai == null ? null : Math.round(Number(p.rata_nilai)),
    dibuatNama: p.dibuat_nama, diubah: p.updated_at };
}
const SQL_PAKET = `SELECT p.*, (SELECT COUNT(*) FROM tes_soal WHERE paket_id=p.id) jumlah_soal, (SELECT COALESCE(SUM(poin),0) FROM tes_soal WHERE paket_id=p.id) total_poin,
  (SELECT COUNT(*) FROM lamaran_tes WHERE paket_id=p.id AND status='selesai') peserta, (SELECT AVG(nilai) FROM lamaran_tes WHERE paket_id=p.id AND status='selesai') rata_nilai
  FROM tes_paket p`;

/* tes pelamar berdasarkan token; token = 32 karakter heksadesimal acak */
async function tesDariToken(m: Record<string, unknown>) {
  const token = String(m.token ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(token)) gagal('Tautan tes tidak valid', 404);
  const t = await q1(`SELECT t.*, TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(t.mulai_at, INTERVAL t.durasi_menit MINUTE)) sisa,
    l.nama, w.judul posisi, l.bidang FROM lamaran_tes t JOIN lamaran l ON l.id=t.lamaran_id JOIN lowongan w ON w.id=l.lowongan_id WHERE t.token=?`, [token]);
  if (!t) gagal('Tautan tes tidak ditemukan atau sudah tidak berlaku', 404);
  return t;
}
function infoTes(t: Baris, jumlahSoal: number) {
  return { status: t.status, judul: t.judul, nama: t.nama, posisi: t.posisi, bidang: t.bidang, durasi: Number(t.durasi_menit), jumlahSoal,
    petunjuk: t.petunjuk ?? '' };
}
const soalUntukPelamar = (soal: SoalTes[]) => soal.map((x) => ({ id: x.id, p: x.p, o: x.o, poin: x.poin }));

/* buat baris tes untuk lamaran baru (dipanggil rk_lamar); kosong bila lowongan tanpa tes */
export async function siapkanTes(lamaranId: number, paketId: number | null): Promise<string> {
  if (!paketId) return '';
  const p = await q1('SELECT p.*, (SELECT COUNT(*) FROM tes_soal WHERE paket_id=p.id) n FROM tes_paket p WHERE p.id=?', [paketId]);
  if (!p || !Number(p.n)) return '';
  const token = randomBytes(16).toString('hex');
  await sisipkan('lamaran_tes', { lamaran_id: lamaranId, paket_id: p.id, judul: String(p.judul).slice(0, 150), token, durasi_menit: p.durasi_menit, nilai_lulus: p.nilai_lulus });
  return token;
}

/* ringkasan hasil tes untuk HC (detail kandidat) */
export async function hasilTes(lamaranId: number) {
  const t = await q1('SELECT t.*, TIMESTAMPDIFF(SECOND, t.mulai_at, t.selesai_at) lama FROM lamaran_tes t WHERE t.lamaran_id=?', [lamaranId]);
  if (!t) return null;
  const soal = json<SoalTes[]>(t.soal, []), jwb = json<Record<string, number>>(t.jawaban, {});
  return {
    status: t.status, judul: t.judul, token: t.token, nilai: t.nilai, benar: t.benar, jumlah: t.jumlah, poin: t.poin, maks: t.maks, nilaiLulus: Number(t.nilai_lulus),
    lulus: t.nilai == null || !Number(t.nilai_lulus) ? null : Number(t.nilai) >= Number(t.nilai_lulus), lewatWaktu: !!t.lewat_waktu, durasi: Number(t.durasi_menit),
    mulai: t.mulai_at, selesai: t.selesai_at, lamaDetik: t.lama == null ? null : Number(t.lama),
    rincian: t.status === 'selesai' ? soal.map((x) => ({ p: x.p, o: x.o, kunci: x.k, jawab: jwb[x.id] ?? null, poin: x.poin })) : [],
  };
}

export const aksiTesRekrutmen: KumpulanAksi = {
  /* ================= PUBLIK: pelamar mengerjakan tes (tanpa login) ================= */
  async rk_tes_buka(m) {
    const t = await tesDariToken(m);
    const p = t.paket_id ? await q1('SELECT petunjuk, (SELECT COUNT(*) FROM tes_soal WHERE paket_id=?) n FROM tes_paket WHERE id=?', [t.paket_id, t.paket_id]) : null;
    const jumlah = t.status === 'belum' ? Number(p?.n ?? 0) : json<SoalTes[]>(t.soal, []).length;
    return infoTes({ ...t, petunjuk: p?.petunjuk ?? '' }, jumlah);
  },

  /* mulai (atau lanjutkan) tes: soal disalin dari bank soal saat pertama kali dibuka, urutan diacak bila diatur */
  async rk_tes_mulai(m) {
    const t = await tesDariToken(m);
    if (t.status === 'selesai') gagal('Tes ini sudah selesai dikerjakan. Terima kasih!');
    if (t.status === 'mulai') {
      const soal = json<SoalTes[]>(t.soal, []);
      return { soal: soalUntukPelamar(soal), sisaDetik: Number(t.durasi_menit) ? Math.max(0, Number(t.sisa)) : null };
    }
    const p = t.paket_id ? await q1('SELECT * FROM tes_paket WHERE id=?', [t.paket_id]) : null;
    const baris = p ? await q('SELECT id, pertanyaan, opsi, kunci, poin FROM tes_soal WHERE paket_id=? ORDER BY urut, id LIMIT ?', [p.id, MAKS_SOAL]) : [];
    if (!baris.length) gagal('Soal tes belum tersedia. Tim HRD akan menghubungi Anda.');
    const soal: SoalTes[] = baris.map((x) => ({ id: x.id, p: x.pertanyaan, o: json<string[]>(x.opsi, []), k: Number(x.kunci), poin: Number(x.poin) }));
    if (p!.acak) for (let n = soal.length - 1; n > 0; n--) { const j = randomInt(n + 1); [soal[n], soal[j]] = [soal[j], soal[n]]; }
    // status='belum' di WHERE: dua tab yang menekan "Mulai" bersamaan tidak membuat dua salinan soal
    const r = await exec("UPDATE lamaran_tes SET status='mulai', soal=?, durasi_menit=?, nilai_lulus=?, mulai_at=NOW(), ip=? WHERE id=? AND status='belum'",
      [JSON.stringify(soal), p!.durasi_menit, p!.nilai_lulus, (konteks()?.ip ?? '').slice(0, 45), t.id]);
    if (!r.affectedRows) return aksiTesRekrutmen.rk_tes_mulai(m, undefined as unknown as Request);
    await catatRiwayat(t.lamaran_id, 'sistem', `Pelamar mulai mengerjakan tes "${t.judul}".`);
    return { soal: soalUntukPelamar(soal), sisaDetik: Number(p!.durasi_menit) ? Number(p!.durasi_menit) * 60 : null };
  },

  async rk_tes_kirim(m) {
    const t = await tesDariToken(m);
    if (t.status === 'selesai') gagal('Jawaban tes ini sudah terkirim sebelumnya. Terima kasih!');
    if (t.status !== 'mulai') gagal('Tes belum dimulai');
    const soal = json<SoalTes[]>(t.soal, []);
    const masuk = (m.jawaban && typeof m.jawaban === 'object') ? m.jawaban as Record<string, unknown> : {};
    const jawaban: Record<string, number> = {};
    let benar = 0, poin = 0, maks = 0;
    for (const x of soal) {
      maks += x.poin;
      const v = masuk[String(x.id)];
      const n = v === null || v === undefined || v === '' ? NaN : Number(v);
      if (!Number.isInteger(n) || n < 0 || n >= x.o.length) continue;
      jawaban[x.id] = n;
      if (n === x.k) { benar++; poin += x.poin; }
    }
    const nilai = maks ? Math.round((poin / maks) * 100) : 0;
    const lewat = Number(t.durasi_menit) > 0 && Number(t.sisa) < -TOLERANSI_DETIK ? 1 : 0;
    const r = await exec("UPDATE lamaran_tes SET status='selesai', jawaban=?, benar=?, jumlah=?, poin=?, maks=?, nilai=?, lewat_waktu=?, selesai_at=NOW() WHERE id=? AND status='mulai'",
      [JSON.stringify(jawaban), benar, soal.length, poin, maks, nilai, lewat, t.id]);
    if (!r.affectedRows) gagal('Jawaban tes ini sudah terkirim sebelumnya. Terima kasih!');
    await catatRiwayat(t.lamaran_id, 'sistem', `Tes "${t.judul}" selesai: nilai ${nilai} (${benar}/${soal.length} benar, ${poin}/${maks} poin)${lewat ? ', dikirim setelah waktu habis' : ''}.`);
    return { pesan: 'Jawaban terkirim', nama: t.nama, posisi: t.posisi };
  },

  /* ================= HC / SUPER ADMIN / SUPERVISOR: bank soal ================= */
  async ts_paket_daftar() {
    await need(['atasan']);
    const p = await q(SQL_PAKET + ' ORDER BY p.updated_at DESC');
    const lw = await q('SELECT id, judul, status, tes_paket_id, bidang FROM lowongan');
    return p.map((x) => ({ ...paketRingkas(x),
      lowongan: lw.filter((l) => Number(l.tes_paket_id) === x.id || json<{ paketId?: number }[]>(l.bidang, []).some((b) => Number(b.paketId) === x.id)).map((l) => ({ id: l.id, judul: l.judul, status: l.status })) }));
  },

  async ts_paket_simpan(m) {
    const u = await need(['atasan']);
    const id = i(m, 'id'), judul = s(m, 'judul').replace(/\s+/g, ' ');
    if (judul.length < 3 || judul.length > 150) gagal('Nama paket soal wajib diisi (3–150 karakter)');
    const durasi = i(m, 'durasi'), lulus = i(m, 'nilaiLulus');
    if (durasi < 0 || durasi > 300) gagal('Durasi tes 0–300 menit (0 = tanpa batas waktu)');
    if (lulus < 0 || lulus > 100) gagal('Nilai minimal lulus 0–100');
    const data = { judul, divisi: s(m, 'divisi').slice(0, 100), petunjuk: s(m, 'petunjuk').slice(0, 3000), durasi_menit: durasi, nilai_lulus: lulus, acak: m.acak === false || m.acak === 0 ? 0 : 1 };
    if (id) {
      await paketAda(id);
      await exec('UPDATE tes_paket SET judul=?, divisi=?, petunjuk=?, durasi_menit=?, nilai_lulus=?, acak=? WHERE id=?', [data.judul, data.divisi, data.petunjuk, data.durasi_menit, data.nilai_lulus, data.acak, id]);
      await logAksi(u.id, 'ubah_paket_soal', judul);
      return { pesan: 'Paket soal tersimpan', id };
    }
    const baru = await sisipkan('tes_paket', { ...data, dibuat_oleh: u.id, dibuat_nama: u.nama });
    await logAksi(u.id, 'tambah_paket_soal', judul);
    return { pesan: 'Paket soal dibuat. Tambahkan soalnya sekarang.', id: baru };
  },

  async ts_paket_hapus(m) {
    const u = await need(['atasan']);
    const p = await paketAda(i(m, 'id'));
    const dipakai = await lowonganPemakai(p.id);
    if (dipakai.length) gagal(`Paket ini masih dipakai lowongan: ${dipakai.map((x) => x.judul).join(', ')}. Ganti paket tes di lowongan tersebut terlebih dulu.`);
    await exec('DELETE FROM tes_paket WHERE id=?', [p.id]);
    await logAksi(u.id, 'hapus_paket_soal', p.judul);
    return { pesan: 'Paket soal dihapus. Hasil tes pelamar yang sudah ada tetap tersimpan.' };
  },

  /* salin paket beserta soalnya, mis. untuk membuat versi bidang lain */
  async ts_paket_duplikat(m) {
    const u = await need(['atasan']);
    const p = await paketAda(i(m, 'id'));
    const baru = await sisipkan('tes_paket', { judul: (p.judul + ' (salinan)').slice(0, 150), divisi: p.divisi, petunjuk: p.petunjuk, durasi_menit: p.durasi_menit,
      nilai_lulus: p.nilai_lulus, acak: p.acak, dibuat_oleh: u.id, dibuat_nama: u.nama });
    await exec(`INSERT INTO tes_soal (paket_id, pertanyaan, opsi, kunci, poin, pembahasan, sumber, urut)
      SELECT ?, pertanyaan, opsi, kunci, poin, pembahasan, sumber, urut FROM tes_soal WHERE paket_id=?`, [baru, p.id]);
    await logAksi(u.id, 'duplikat_paket_soal', p.judul);
    return { pesan: 'Paket soal disalin', id: baru };
  },

  async ts_soal_daftar(m) {
    await need(['atasan']);
    const p = await q1(SQL_PAKET + ' WHERE p.id=?', [i(m, 'paketId')]);
    if (!p) gagal('Paket soal tidak ditemukan', 404);
    const soal = await q('SELECT * FROM tes_soal WHERE paket_id=? ORDER BY urut, id', [p.id]);
    return { paket: { ...paketRingkas(p), lowongan: (await lowonganPemakai(p.id)).map((l) => ({ id: l.id, judul: l.judul, status: l.status })) },
      soal: soal.map((x) => ({ id: x.id, pertanyaan: x.pertanyaan, opsi: json<string[]>(x.opsi, []), kunci: Number(x.kunci), poin: Number(x.poin), pembahasan: x.pembahasan, sumber: x.sumber })) };
  },

  async ts_soal_simpan(m) {
    const u = await need(['atasan']);
    const p = await paketAda(i(m, 'paketId'));
    const x = bersihkanSoal(m);
    const id = i(m, 'id');
    if (id) {
      const r = await exec('UPDATE tes_soal SET pertanyaan=?, opsi=?, kunci=?, poin=?, pembahasan=? WHERE id=? AND paket_id=?',
        [x.pertanyaan, JSON.stringify(x.opsi), x.kunci, x.poin, x.pembahasan, id, p.id]);
      if (!r.affectedRows) gagal('Soal tidak ditemukan', 404);
    } else {
      const n = Number((await q1('SELECT COUNT(*) n, COALESCE(MAX(urut),0) u FROM tes_soal WHERE paket_id=?', [p.id]))?.n ?? 0);
      if (n >= MAKS_SOAL) gagal(`Maksimal ${MAKS_SOAL} soal per paket`);
      await exec('INSERT INTO tes_soal (paket_id, pertanyaan, opsi, kunci, poin, pembahasan, urut) SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(urut),0)+1 FROM tes_soal WHERE paket_id=?',
        [p.id, x.pertanyaan, JSON.stringify(x.opsi), x.kunci, x.poin, x.pembahasan, p.id]);
    }
    await exec('UPDATE tes_paket SET updated_at=NOW() WHERE id=?', [p.id]);
    await logAksi(u.id, id ? 'ubah_soal' : 'tambah_soal', p.judul);
    return { pesan: id ? 'Soal tersimpan' : 'Soal ditambahkan' };
  },

  /* simpan beberapa soal sekaligus (hasil AI yang sudah ditinjau) */
  async ts_soal_simpan_banyak(m) {
    const u = await need(['atasan']);
    const p = await paketAda(i(m, 'paketId'));
    const daftar = Array.isArray(m.soal) ? m.soal as Record<string, unknown>[] : [];
    if (!daftar.length) gagal('Pilih minimal satu soal');
    const bersih = daftar.slice(0, 50).map((x, n) => { try { return bersihkanSoal(x); } catch (e) { gagal(`Soal ${n + 1}: ${(e as Error).message}`); } });
    const ada = Number((await q1('SELECT COUNT(*) n FROM tes_soal WHERE paket_id=?', [p.id]))?.n ?? 0);
    if (ada + bersih.length > MAKS_SOAL) gagal(`Maksimal ${MAKS_SOAL} soal per paket`);
    let urut = Number((await q1('SELECT COALESCE(MAX(urut),0) u FROM tes_soal WHERE paket_id=?', [p.id]))?.u ?? 0);
    for (const x of bersih) {
      await sisipkan('tes_soal', { paket_id: p.id, pertanyaan: x.pertanyaan, opsi: JSON.stringify(x.opsi), kunci: x.kunci, poin: x.poin, pembahasan: x.pembahasan,
        sumber: m.sumber === 'ai' ? 'ai' : 'manual', urut: ++urut });
    }
    await exec('UPDATE tes_paket SET updated_at=NOW() WHERE id=?', [p.id]);
    await logAksi(u.id, 'tambah_soal', `${p.judul}: ${bersih.length} soal`);
    return { pesan: `${bersih.length} soal ditambahkan` };
  },

  async ts_soal_hapus(m) {
    const u = await need(['atasan']);
    const x = await q1('SELECT s.id, p.judul, p.id pid FROM tes_soal s JOIN tes_paket p ON p.id=s.paket_id WHERE s.id=?', [i(m, 'id')]);
    if (!x) gagal('Soal tidak ditemukan', 404);
    await exec('DELETE FROM tes_soal WHERE id=?', [x.id]);
    await exec('UPDATE tes_paket SET updated_at=NOW() WHERE id=?', [x.pid]);
    await logAksi(u.id, 'hapus_soal', x.judul);
    return { pesan: 'Soal dihapus' };
  },

  async ts_soal_urut(m) {
    await need(['atasan']);
    const x = await q1('SELECT id, paket_id FROM tes_soal WHERE id=?', [i(m, 'id')]);
    if (!x) gagal('Soal tidak ditemukan', 404);
    const semua = await q('SELECT id FROM tes_soal WHERE paket_id=? ORDER BY urut, id', [x.paket_id]);
    const n = semua.findIndex((y) => y.id === x.id), j = n + (s(m, 'arah') === 'naik' ? -1 : 1);
    if (j < 0 || j >= semua.length) return { pesan: '' };
    [semua[n], semua[j]] = [semua[j], semua[n]];
    for (let k = 0; k < semua.length; k++) await exec('UPDATE tes_soal SET urut=? WHERE id=?', [k + 1, semua[k].id]);
    return { pesan: '' };
  },

  /* draf soal dari AI — tidak langsung disimpan; pembuat soal meninjau dulu */
  async ts_soal_ai(m) {
    await need(['atasan']);
    const p = await paketAda(i(m, 'paketId'));
    const materi = s(m, 'materi').slice(0, 2000);
    if (materi.length < 3) gagal('Tulis materi / topik soal agar AI tahu soal yang dibuat');
    const jumlah = Math.max(1, Math.min(15, i(m, 'jumlah', 10)));
    const tingkat = ({ mudah: 'mudah', sedang: 'sedang', sulit: 'sulit (setara seleksi olimpiade)', campuran: 'campuran mudah, sedang, dan sulit' } as Record<string, string>)[s(m, 'tingkat')] ?? 'sedang';
    const nOpsi = Math.max(3, Math.min(5, i(m, 'opsi', 4)));
    const ada = await q('SELECT pertanyaan FROM tes_soal WHERE paket_id=? ORDER BY id DESC LIMIT 30', [p.id]);
    const sistem = `Anda penyusun soal tes seleksi karyawan di Yayasan Pendidikan POSI (Pusat Olimpiade Sains Indonesia).
Buat soal PILIHAN GANDA dalam Bahasa Indonesia yang baku, jelas, dan hanya punya SATU jawaban benar.
Aturan:
- Tepat ${jumlah} soal, masing-masing ${nOpsi} pilihan jawaban. Tingkat kesulitan: ${tingkat}.
- Fakta, angka, dan hitungan harus benar. Untuk setiap soal, selesaikan sendiri langkah demi langkah dan uji SEMUA pilihan; pastikan tepat satu pilihan benar dan "kunci" menunjuk pilihan itu. Bila ragu, ganti soalnya.
- Pengecoh masuk akal, panjang pilihan seimbang. Hindari "semua benar" / "semua salah" dan soal yang bergantung pada gambar.
- Tulis rumus dalam teks biasa (mis. x^2, akar(2), 3/4).
- Letak kunci jawaban bervariasi (jangan selalu A).
- "kunci" = indeks pilihan yang benar, mulai dari 0.
- "pembahasan" singkat (maks. 2 kalimat) menjelaskan mengapa kunci benar.
- Jangan mengulang soal yang sudah ada di bank soal.
Balas JSON: {"soal": [{"pertanyaan": "...", "opsi": ["...", "..."], "kunci": 0, "pembahasan": "..."}]}`;
    const isi = `Paket soal: ${p.judul}${p.divisi ? ' (divisi ' + p.divisi + ')' : ''}
Materi / topik / kompetensi yang diuji:
${materi}
${ada.length ? '\nSoal yang sudah ada (jangan diulang):\n' + ada.map((x) => '- ' + String(x.pertanyaan).slice(0, 160).replace(/\s+/g, ' ')).join('\n') : ''}`;
    let hasil: Record<string, unknown>;
    // penalaran 'medium': model memeriksa hitungan & kunci jawaban lebih teliti (token penalaran ikut dihitung)
    try { hasil = await groqJson(sistem, isi, Math.min(18000, 3000 + jumlah * 900), 'medium'); }
    catch (e) { gagal(e instanceof KuotaPenuh ? 'Layanan AI sedang sibuk, coba lagi dalam 1 menit' : 'AI gagal membuat soal, coba lagi', 503); }
    const soal = (Array.isArray(hasil.soal) ? hasil.soal : []).map((x) => {
      try {
        const o = x as Record<string, unknown>;
        const opsi = (Array.isArray(o.opsi) ? o.opsi : []).map((y) => String(y ?? '').replace(/^\s*[A-Ea-e][.)]\s+/, '').trim());
        return bersihkanSoal({ pertanyaan: o.pertanyaan, opsi, kunci: o.kunci, poin: 1, pembahasan: o.pembahasan });
      } catch { return null; }
    }).filter(Boolean).slice(0, jumlah);
    if (!soal.length) gagal('AI tidak menghasilkan soal yang valid, coba lagi', 503);
    return { soal: await periksaKunci(soal as SoalAi[]) };
  },

  /* ================= HC: tes milik kandidat ================= */
  /* buat ulang tes pelamar (mis. terputus / salah paket): hasil lama dihapus, tautan baru dibuat */
  async rk_tes_ulang(m) {
    const u = await need(['admin']);
    const l = await q1('SELECT l.id, l.nama, l.bidang, w.tes_paket_id, w.bidang wb FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id WHERE l.id=?', [i(m, 'id')]);
    if (!l) gagal('Lamaran tidak ditemukan', 404);
    const paket = paketUntuk(l.wb, l.tes_paket_id, l.bidang);
    if (!paket) gagal('Lowongan ini tidak memakai tes');
    await exec('DELETE FROM lamaran_tes WHERE lamaran_id=?', [l.id]);
    const token = await siapkanTes(l.id, paket);
    if (!token) gagal('Paket soal lowongan ini belum berisi soal');
    await catatRiwayat(l.id, 'sistem', `Tes diulang oleh ${u.nama}; tautan tes baru dibuat.`);
    return { pesan: 'Tes diatur ulang. Kirim tautan tes yang baru ke pelamar.', token };
  },
};

/* Pemeriksaan kedua: AI mengerjakan ulang soal TANPA melihat kunci. Soal yang jawabannya berbeda dari kunci ditandai "ragu"
   agar pembuat soal memeriksanya. Bila pemeriksaan gagal (kuota / jaringan), soal tetap dikembalikan tanpa tanda. */
type SoalAi = { pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string };
async function periksaKunci(soal: SoalAi[]): Promise<(SoalAi & { ragu?: boolean; jawabPeriksa?: number })[]> {
  const sistem = `Anda pemeriksa soal pilihan ganda yang sangat teliti. Kerjakan setiap soal secara mandiri, langkah demi langkah, lalu pilih SATU pilihan yang benar.
Bila tidak ada pilihan yang benar atau lebih dari satu yang benar, isi -1.
Balas JSON: {"jawaban": [indeks pilihan mulai 0 untuk soal 1, soal 2, ...]}`;
  const isi = soal.map((x, n) => `Soal ${n + 1}: ${x.pertanyaan}\n${x.opsi.map((o, j) => `${j}. ${o}`).join('\n')}`).join('\n\n');
  try {
    const r = await groqJson(sistem, isi, Math.min(14000, 2000 + soal.length * 700), 'medium');
    const j = Array.isArray(r.jawaban) ? r.jawaban.map((x) => Number(x)) : [];
    if (j.length !== soal.length) return soal;
    return soal.map((x, n) => (j[n] === x.kunci ? x : { ...x, ragu: true, jawabPeriksa: j[n] }));
  } catch { return soal; }
}

/* paket tes yang berlaku untuk pelamar: paket bidang yang dipilih, atau paket bawaan lowongan */
export function paketUntuk(bidangLowongan: unknown, paketBawaan: unknown, bidangPelamar: string): number | null {
  const b = json<{ nama: string; paketId?: number | null }[]>(bidangLowongan, []).find((x) => x.nama === bidangPelamar);
  return Number(b?.paketId) || Number(paketBawaan) || null;
}

