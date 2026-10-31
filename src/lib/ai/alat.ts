/* Alat (tools) AI Asisten. Angka kehadiran memakai lib/statusHarian (rumus yang sama dengan Rekap & Payroll),
   sehingga jawaban AI konsisten dengan aplikasi. Semua hanya membaca data. */
import { kueriBacaSaja, nilai, q, q1, type Baris } from '../db';
import { bulanKerja, cutiAktif, cutiTerpakai, jatahCuti, labelJenis, labelKet, sisaCuti } from '../aturan';
import { statusHarian, hitungStatus } from '../statusHarian';
import { jadwalKerja, setg, setgInt } from '../pengaturan';
import { POLA_TGL, tglWIB } from '../waktu';
import { KOLOM_TERLARANG, periksaSql, TABEL_AI } from './sqlAman';
import { pengaturanLog, periode, ringkasBeban } from '../logKerja';

const PERAN: Record<string, string> = { karyawan: 'Staff', atasan: 'Supervisor', admin: 'HC', direktur: 'Super Admin', finance: 'Finance' };
const awalBulan = () => tglWIB().slice(0, 8) + '01';
/* data absensi baru ada sejak aplikasi dipakai: pengaturan "tanggal mulai HRIS", atau absensi pertama di database */
export async function mulaiData(): Promise<string> {
  const s = await setg('tanggal_mulai_hris', '');
  if (POLA_TGL.test(s)) return s;
  return String((await nilai('SELECT MIN(tanggal) FROM absensi')) ?? tglWIB());
}
async function rentang(a: unknown, z: unknown): Promise<[string, string, string | null]> {
  let dari = POLA_TGL.test(String(a ?? '')) ? String(a) : awalBulan();
  let sampai = POLA_TGL.test(String(z ?? '')) ? String(z) : tglWIB();
  if (sampai > tglWIB()) sampai = tglWIB();
  const mulai = await mulaiData();
  let catatan: string | null = null;
  if (dari < mulai) { catatan = `Aplikasi HRIS baru dipakai sejak ${mulai}; data sebelum tanggal itu tidak tersedia sehingga periode disesuaikan.`; dari = mulai; }
  if (sampai < dari) sampai = dari;
  return [dari, sampai, catatan];
}
const jam5 = (t: unknown) => (t ? String(t).slice(0, 5) : null);

/* definisi alat untuk model (format OpenAI / Groq) */
export const DEFINISI_ALAT = [
  { type: 'function', function: { name: 'cari_karyawan', description: 'Cari karyawan berdasarkan nama, NIK, jabatan, atau divisi. Gunakan lebih dulu untuk mendapatkan user_id.',
    parameters: { type: 'object', properties: { kata: { type: 'string', description: 'kata kunci, mis. "Rina" atau "Akademik"' }, termasuk_nonaktif: { type: 'boolean' } }, required: ['kata'] } } },
  { type: 'function', function: { name: 'ringkasan_karyawan', description: 'Profil & kinerja kehadiran satu karyawan pada rentang tanggal: hadir, terlambat (kali & menit), setengah hari, mangkir, izin per jenis, cuti, lembur, jam masuk rata-rata, approval ditolak, pengajuan, masa kerja, sisa cuti.',
    parameters: { type: 'object', properties: { user_id: { type: 'integer' }, dari: { type: 'string', description: 'YYYY-MM-DD, bawaan awal bulan ini' }, sampai: { type: 'string', description: 'YYYY-MM-DD, bawaan hari ini' } }, required: ['user_id'] } } },
  { type: 'function', function: { name: 'rekap_karyawan', description: 'Rekap kehadiran banyak karyawan sekaligus (bisa per divisi) pada rentang tanggal, diurutkan. Cocok untuk peringkat: paling sering terlambat, kehadiran terendah, dll.',
    parameters: { type: 'object', properties: { dari: { type: 'string' }, sampai: { type: 'string' }, divisi: { type: 'string', description: 'nama divisi (opsional)' },
      urut: { type: 'string', enum: ['kehadiran_terendah', 'kehadiran_tertinggi', 'terlambat_terbanyak', 'menit_telat_terbanyak', 'mangkir_terbanyak', 'nama'] }, batas: { type: 'integer', description: 'maks 60' } } } } },
  { type: 'function', function: { name: 'struktur_organisasi', description: 'Struktur organisasi / bagan / siapa atasan & bawahan siapa. Isi "nama" untuk fokus satu orang (rantai atasan & bawahan langsungnya), atau "divisi" untuk satu divisi; kosongkan untuk seluruh pimpinan tim. Juga menandai bawahan yang divisinya berbeda dari atasannya (sering terjadi setelah ada yang pindah divisi).',
    parameters: { type: 'object', properties: { nama: { type: 'string', description: 'nama karyawan (opsional)' }, divisi: { type: 'string', description: 'nama divisi (opsional)' } } } } },
  { type: 'function', function: { name: 'rekrutmen_lowongan', description: 'Daftar lowongan rekrutmen beserta status (draf/buka/tutup), kuota, batas, kualifikasi, dan jumlah pelamar per tahap pipeline.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['semua', 'buka', 'draf', 'tutup'] } } } } },
  { type: 'function', function: { name: 'rekrutmen_kandidat', description: 'Daftar kandidat (pelamar) diurutkan skor AI tertinggi: skor kecocokan, tahap, pendidikan, pengalaman, ringkasan. Saring per lowongan (id atau judul), tahap, atau kata kunci (nama/keahlian).',
    parameters: { type: 'object', properties: { lowongan_id: { type: 'integer' }, lowongan: { type: 'string', description: 'judul lowongan (sebagian)' },
      tahap: { type: 'string', enum: ['baru', 'disaring', 'tes', 'wawancara_hc', 'wawancara_user', 'penawaran', 'diterima', 'ditolak'] }, kata: { type: 'string' }, batas: { type: 'integer', description: 'maks 40' } } } } },
  { type: 'function', function: { name: 'rekrutmen_detail_kandidat', description: 'Detail lengkap satu kandidat: profil CV (pendidikan, pengalaman, keahlian), analisis AI (skor rinci, pemenuhan syarat, kekuatan, kekurangan, hal yang perlu diklarifikasi, saran pertanyaan wawancara), jawaban pertanyaan, catatan & riwayat tahap dari HC.',
    parameters: { type: 'object', properties: { kandidat_id: { type: 'integer' }, kode: { type: 'string', description: 'kode lamaran, mis. RK1A2B3C' } } } } },
  { type: 'function', function: { name: 'kpi_karyawan', description: 'KPI (kinerja) satu karyawan per bulan: skor, predikat, status verifikasi, dan rincian tiap indikator (target, realisasi, pencapaian, bobot). Gunakan untuk pertanyaan kinerja / promosi.',
    parameters: { type: 'object', properties: { user_id: { type: 'integer' }, dari: { type: 'string', description: 'YYYY-MM; kosongkan untuk 6 bulan terakhir' }, sampai: { type: 'string', description: 'YYYY-MM; kosongkan agar bulan berjalan ikut' } }, required: ['user_id'] } } },
  { type: 'function', function: { name: 'kpi_rekap', description: 'Peringkat skor KPI karyawan pada satu bulan atau rata-rata rentang bulan, bisa per divisi. Hanya KPI yang sudah disetujui dihitung kecuali termasuk_belum_final=true.',
    parameters: { type: 'object', properties: { dari: { type: 'string', description: 'YYYY-MM' }, sampai: { type: 'string', description: 'YYYY-MM' }, divisi: { type: 'string' },
      urut: { type: 'string', enum: ['tertinggi', 'terendah'] }, termasuk_belum_final: { type: 'boolean' }, batas: { type: 'integer', description: 'maks 60' } } } } },
  { type: 'function', function: { name: 'beban_kerja', description: 'Utilisasi beban kerja karyawan dari log pekerjaan harian pada satu minggu atau bulan: jam tercatat, kapasitas, % utilisasi, status (underload/optimal/overload/belum mengisi), jumlah pekerjaan. Bisa per divisi.',
    parameters: { type: 'object', properties: { jenis: { type: 'string', enum: ['minggu', 'bulan'] }, tanggal: { type: 'string', description: 'YYYY-MM-DD di dalam periode; bawaan hari ini' },
      divisi: { type: 'string' }, status: { type: 'string', enum: ['underload', 'optimal', 'overload', 'belum'] } } } } },
  { type: 'function', function: { name: 'log_kerja_karyawan', description: 'Daftar pekerjaan yang dicatat seorang karyawan (uraian, kategori, durasi, status) pada rentang tanggal, beserta ringkasan per kategori.',
    parameters: { type: 'object', properties: { user_id: { type: 'integer' }, dari: { type: 'string', description: 'YYYY-MM-DD, bawaan awal minggu ini' }, sampai: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['user_id'] } } },
  { type: 'function', function: { name: 'lihat_skema', description: 'Daftar tabel & kolom yang boleh dibaca. Panggil sekali sebelum menulis query_sql.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'query_sql', description: 'Jalankan SATU kueri SELECT baca-saja (MySQL/MariaDB) untuk pertanyaan yang tidak tercakup alat lain. Sebutkan kolom eksplisit (tanpa SELECT *), maksimal 200 baris. Hanya tabel di skema yang diberikan.',
    parameters: { type: 'object', properties: { sql: { type: 'string' }, tujuan: { type: 'string', description: 'singkat: data apa yang dicari' } }, required: ['sql'] } } },
];

async function cariKaryawan(a: Baris) {
  const kata = String(a.kata ?? '').trim().slice(0, 60);
  if (!kata) throw new Error('kata kunci kosong');
  const pola = '%' + kata.replace(/[\\%_]/g, '\\$&') + '%';
  const rows = await q(`SELECT u.id, u.nik, u.nama, u.jabatan, u.dept, u.role, u.status_kerja, u.tgl_masuk, u.aktif, a.nama atasan
    FROM users u LEFT JOIN users a ON a.id=u.atasan_id WHERE (u.nama LIKE ? OR u.nik LIKE ? OR u.jabatan LIKE ? OR u.dept LIKE ?)
    ${a.termasuk_nonaktif ? '' : 'AND u.aktif=1'} ORDER BY u.nama LIMIT 20`, [pola, pola, pola, pola]);
  const karyawan = rows.map((r) => ({ user_id: r.id, nik: r.nik, nama: r.nama, jabatan: r.jabatan, divisi: r.dept, peran: PERAN[r.role] ?? r.role,
    status_kerja: r.status_kerja, tgl_masuk: r.tgl_masuk, aktif: r.aktif === 1, atasan: r.atasan ?? null }));
  if (karyawan.length) return karyawan;
  // bukan karyawan: mungkin pelamar rekrutmen
  const pelamar = await q(`SELECT l.id, l.kode, l.nama, l.tahap, l.skor, w.judul FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id WHERE l.nama LIKE ? ORDER BY l.id DESC LIMIT 10`, [pola]);
  return pelamar.length
    ? { karyawan: [], catatan: 'Nama ini bukan karyawan, tetapi ditemukan sebagai PELAMAR rekrutmen. Gunakan rekrutmen_detail_kandidat dengan kandidat_id berikut.',
      kandidat_rekrutmen: pelamar.map((r) => ({ kandidat_id: r.id, kode: r.kode, nama: r.nama, lowongan: r.judul, tahap: r.tahap, skor: r.skor })) }
    : { karyawan: [], catatan: 'Tidak ditemukan sebagai karyawan maupun pelamar.' };
}

async function statistik(users: Baris[], dari: string, sampai: string) {
  const peta = await statusHarian(users, dari, sampai);
  const ids = users.map((u) => Number(u.id)).join(',') || '0';
  const abs = new Map<number, Baris>();
  for (const r of await q(`SELECT user_id, COUNT(*) baris, SUM(terlambat=1 AND telat_diizinkan=0) telat_x, SUM(IF(terlambat=1 AND telat_diizinkan=0, menit_telat, 0)) menit_telat,
      SUM(telat_diizinkan=1) telat_diizinkan, SUM(approval='ditolak') ditolak, SUM(approval='menunggu') menunggu, SUM(lupa_out=1 AND out_time IS NULL) lupa_out,
      SUM(lembur_menit) lembur, SUM(kurang_menit) kurang, ROUND(AVG(TIME_TO_SEC(in_time))/60) rata_masuk, SUM(kerja_dari='wfh') wfh, SUM(kerja_dari='dlk') dlk
      FROM absensi WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ? AND in_time IS NOT NULL GROUP BY user_id`, [dari, sampai])) abs.set(r.user_id, r);
  return users.map((u) => {
    const n = hitungStatus(peta[u.id] ?? {}), a = abs.get(u.id) ?? {};
    const wajib = n.hadir + n.telat + n.setengah + n.cuti + n.ket + n.mangkir + n.belum;
    const hadir = n.hadir + n.telat + n.setengah;
    const rm = a.rata_masuk != null ? Number(a.rata_masuk) : null;
    return {
      user_id: u.id, nama: u.nama, divisi: u.dept, jabatan: u.jabatan,
      hari_wajib_kerja: wajib, hadir, hadir_tepat_waktu: n.hadir, terlambat_kali: n.telat, setengah_hari_tanpa_izin: n.setengah,
      cuti_hari: n.cuti, izin_disetujui_hari: n.ket, mangkir_hari: n.mangkir, belum_absen_hari_ini: n.belum, libur_hari: n.libur,
      persen_kehadiran: wajib - n.cuti - n.ket > 0 ? Math.round((hadir / (wajib - n.cuti - n.ket)) * 1000) / 10 : null,
      total_menit_terlambat: Number(a.menit_telat ?? 0), terlambat_dengan_izin: Number(a.telat_diizinkan ?? 0),
      absensi_ditolak_atasan: Number(a.ditolak ?? 0), absensi_menunggu_approval: Number(a.menunggu ?? 0), lupa_clock_out: Number(a.lupa_out ?? 0),
      lembur_menit: Number(a.lembur ?? 0), kurang_jam_menit: Number(a.kurang ?? 0), wfh_hari: Number(a.wfh ?? 0), dinas_hari: Number(a.dlk ?? 0),
      rata_jam_masuk: rm != null ? `${String(Math.floor(rm / 60)).padStart(2, '0')}:${String(rm % 60).padStart(2, '0')}` : null,
    };
  });
}

async function ringkasanKaryawan(a: Baris) {
  const u = await q1('SELECT * FROM users WHERE id=?', [Number(a.user_id)]);
  if (!u) throw new Error('Karyawan tidak ditemukan');
  const [dari, sampai, catatan] = await rentang(a.dari, a.sampai);
  const [st] = await statistik([u], dari, sampai);
  const atasan = u.atasan_id ? await q1('SELECT nama, jabatan FROM users WHERE id=?', [u.atasan_id]) : null;
  const bawahan = Number(await nilai('SELECT COUNT(*) FROM users WHERE atasan_id=? AND aktif=1', [u.id]));
  const izin = await q(`SELECT jenis, COUNT(*) n FROM ketidakhadiran WHERE user_id=? AND status='Disetujui' AND tanggal BETWEEN ? AND ? GROUP BY jenis`, [u.id, dari, sampai]);
  const cuti = await q(`SELECT jenis, mulai, selesai, hari, status FROM cuti WHERE user_id=? AND mulai<=? AND selesai>=? ORDER BY mulai`, [u.id, sampai, dari]);
  const aju = await q(`SELECT jenis, status, COUNT(*) n FROM pengajuan WHERE user_id=? AND tanggal BETWEEN ? AND ? GROUP BY jenis, status`, [u.id, dari, sampai]);
  const telatTerbesar = await q(`SELECT tanggal, in_time, jadwal_in, menit_telat FROM absensi WHERE user_id=? AND tanggal BETWEEN ? AND ? AND terlambat=1
    ORDER BY menit_telat DESC LIMIT 5`, [u.id, dari, sampai]);
  const tahun = Number(sampai.slice(0, 4));
  return {
    periode: { dari, sampai, catatan },
    profil: { user_id: u.id, nik: u.nik, nama: u.nama, jabatan: u.jabatan, divisi: u.dept, peran: PERAN[u.role] ?? u.role, status_kerja: u.status_kerja,
      tgl_masuk: u.tgl_masuk, masa_kerja_bulan: bulanKerja(u.tgl_masuk), kontrak_selesai: u.kontrak_selesai, aktif: u.aktif === 1,
      pola_jam: u.jam_mode, atasan: atasan ? `${atasan.nama} (${atasan.jabatan})` : null, jumlah_bawahan_langsung: bawahan,
      pendidikan: [u.pendidikan, u.jurusan, u.institusi].filter(Boolean).join(' ') || null },
    kehadiran: st,
    izin_disetujui_per_jenis: Object.fromEntries(izin.map((x) => [labelKet(x.jenis), Number(x.n)])),
    cuti_pada_periode: cuti,
    cuti_tahunan: { berhak: cutiAktif(u), jatah: jatahCuti(u), terpakai_tahun_ini: await cutiTerpakai(u.id, tahun), sisa: cutiAktif(u) ? await sisaCuti(u) : 0 },
    pengajuan_lain: aju.map((x) => ({ jenis: labelJenis(x.jenis), status: x.status, jumlah: Number(x.n) })),
    keterlambatan_terbesar: telatTerbesar.map((x) => ({ tanggal: x.tanggal, masuk: jam5(x.in_time), jadwal: jam5(x.jadwal_in), menit: Number(x.menit_telat) })),
  };
}

async function rekapKaryawan(a: Baris) {
  const [dari, sampai, catatan] = await rentang(a.dari, a.sampai);
  const divisi = String(a.divisi ?? '').trim();
  const users = await q(`SELECT * FROM users WHERE aktif=1 AND role<>'direktur'${divisi ? ' AND dept LIKE ?' : ''} ORDER BY nama`, divisi ? ['%' + divisi + '%'] : []);
  const st = await statistik(users, dari, sampai);
  const urut = String(a.urut ?? 'kehadiran_terendah');
  const kunci: Record<string, (x: Baris) => number> = {
    kehadiran_terendah: (x) => x.persen_kehadiran ?? 999, kehadiran_tertinggi: (x) => -(x.persen_kehadiran ?? -1),
    terlambat_terbanyak: (x) => -x.terlambat_kali, menit_telat_terbanyak: (x) => -x.total_menit_terlambat, mangkir_terbanyak: (x) => -(x.mangkir_hari + x.setengah_hari_tanpa_izin / 2),
  };
  const f = kunci[urut];
  st.sort((x, y) => (f ? f(x) - f(y) : 0) || String(x.nama).localeCompare(String(y.nama), 'id'));
  const batas = Math.max(1, Math.min(60, Number(a.batas) || 15));
  const tot = st.reduce((s, x) => ({ hadir: s.hadir + x.hadir, wajib: s.wajib + x.hari_wajib_kerja - x.cuti_hari - x.izin_disetujui_hari, telat: s.telat + x.terlambat_kali, mangkir: s.mangkir + x.mangkir_hari }), { hadir: 0, wajib: 0, telat: 0, mangkir: 0 });
  const ringkas = (x: Baris) => ({ user_id: x.user_id, nama: x.nama, divisi: x.divisi, hadir: x.hadir, wajib: x.hari_wajib_kerja, persen: x.persen_kehadiran,
    telat_kali: x.terlambat_kali, telat_menit: x.total_menit_terlambat, setengah: x.setengah_hari_tanpa_izin, mangkir: x.mangkir_hari, izin: x.izin_disetujui_hari,
    cuti: x.cuti_hari, rata_masuk: x.rata_jam_masuk });
  return { periode: { dari, sampai, catatan }, divisi: divisi || 'semua', jumlah_karyawan: st.length,
    ringkasan: { persen_kehadiran_rata2: tot.wajib ? Math.round((tot.hadir / tot.wajib) * 1000) / 10 : null, total_terlambat_kali: tot.telat, total_mangkir_hari: tot.mangkir },
    urutan: urut, keterangan_kolom: 'wajib=hari kerja wajib; persen=kehadiran tanpa menghitung cuti/izin; setengah=setengah hari tanpa izin', data: st.slice(0, batas).map(ringkas) };
}

/* struktur organisasi persis seperti halaman Struktur Organisasi: disusun dari atasan langsung tiap karyawan */
async function strukturOrganisasi(a: Baris) {
  const semua = await q(`SELECT id, nama, jabatan, dept, role, atasan_id FROM users WHERE aktif=1 AND role<>'direktur' ORDER BY nama`);
  const peta = new Map(semua.map((x) => [x.id as number, x]));
  const orang = (x: Baris | undefined) => (x ? { nama: x.nama, jabatan: x.jabatan, divisi: x.dept || null, peran: PERAN[x.role] ?? x.role } : null);
  const bawahanDari = (id: number) => semua.filter((x) => x.atasan_id === id);
  const penjelasan = 'Bagan & kartu Struktur Organisasi disusun HANYA dari "atasan langsung" tiap karyawan; divisi hanya label/warna. Atasan langsung juga menentukan siapa yang menerima & menyetujui pengajuan karyawan. HC mengubahnya sendiri di menu Karyawan → ubah karyawan → kolom "Atasan langsung" (tidak perlu bantuan IT).';
  // bawahan yang divisinya berbeda dari atasannya (kecuali atasan di Direksi)
  const beda = semua.filter((x) => { const at = peta.get(x.atasan_id); return at && at.dept && x.dept && at.dept !== x.dept && !/direksi/i.test(at.dept); })
    .map((x) => ({ karyawan: x.nama, divisi_karyawan: x.dept, atasan_langsung: peta.get(x.atasan_id)!.nama, divisi_atasan: peta.get(x.atasan_id)!.dept }));
  const nama = String(a.nama ?? '').trim().toLowerCase(), divisi = String(a.divisi ?? '').trim().toLowerCase();
  if (nama) {
    const cocok = semua.filter((x) => String(x.nama).toLowerCase().includes(nama));
    if (!cocok.length) return { penjelasan, hasil: 'Karyawan aktif dengan nama itu tidak ditemukan.' };
    return { penjelasan, hasil: cocok.slice(0, 5).map((x) => {
      const rantai: unknown[] = [];
      for (let at = peta.get(x.atasan_id), n = 0; at && n < 10; at = peta.get(at.atasan_id), n++) rantai.push(orang(at));
      return { ...orang(x), rantai_atasan_terdekat_dulu: rantai, bawahan_langsung: bawahanDari(x.id).map(orang),
        bawahan_beda_divisi: beda.filter((b) => b.atasan_langsung === x.nama) };
    }) };
  }
  const pimpinan = semua.filter((x) => bawahanDari(x.id).length && (!divisi || String(x.dept).toLowerCase().includes(divisi) || bawahanDari(x.id).some((b) => String(b.dept).toLowerCase().includes(divisi))));
  return { penjelasan, jumlah_karyawan_aktif: semua.length, puncak: semua.filter((x) => !peta.has(x.atasan_id)).map(orang),
    pimpinan_tim: pimpinan.map((x) => ({ ...orang(x), atasan_langsung: peta.get(x.atasan_id)?.nama ?? null, bawahan_langsung: bawahanDari(x.id).map((b) => `${b.nama} (${b.jabatan}, ${b.dept || '-'})`) })),
    bawahan_beda_divisi_dengan_atasan: divisi ? beda.filter((b) => [b.divisi_karyawan, b.divisi_atasan].some((d) => String(d).toLowerCase().includes(divisi))) : beda };
}

/* ---------- rekrutmen (kontak pelamar tidak pernah dikirim ke model) ---------- */
const jsonAman = (t: unknown) => { try { return t ? JSON.parse(String(t)) : null; } catch { return null; } };
const LABEL_TAHAP_AI: Record<string, string> = { baru: 'Baru', disaring: 'Lolos saring', tes: 'Tes', wawancara_hc: 'Wawancara HC', wawancara_user: 'Wawancara user',
  penawaran: 'Penawaran', diterima: 'Diterima', ditolak: 'Ditolak' };
async function rekrutmenLowongan(a: Baris) {
  const st = String(a.status ?? 'semua');
  const l = await q(`SELECT w.*, COUNT(l.id) jumlah FROM lowongan w LEFT JOIN lamaran l ON l.lowongan_id=w.id
    ${['buka', 'draf', 'tutup'].includes(st) ? 'WHERE w.status=?' : ''} GROUP BY w.id ORDER BY w.created_at DESC LIMIT 40`, ['buka', 'draf', 'tutup'].includes(st) ? [st] : []);
  const per = await q(`SELECT lowongan_id, tahap, COUNT(*) n FROM lamaran GROUP BY lowongan_id, tahap`);
  return l.map((w) => ({ lowongan_id: w.id, judul: w.judul, divisi: w.divisi, lokasi: w.lokasi, tipe: w.tipe, status: w.status, kuota: w.kuota, batas: w.batas,
    dibuat: String(w.created_at).slice(0, 10), kualifikasi: String(w.kualifikasi ?? '').split('\n').filter(Boolean).slice(0, 12), jumlah_pelamar: Number(w.jumlah),
    per_tahap: Object.fromEntries(per.filter((x) => x.lowongan_id === w.id).map((x) => [LABEL_TAHAP_AI[x.tahap] ?? x.tahap, Number(x.n)])) }));
}
async function rekrutmenKandidat(a: Baris) {
  const w: string[] = [], p: unknown[] = [];
  if (Number(a.lowongan_id)) { w.push('l.lowongan_id=?'); p.push(Number(a.lowongan_id)); }
  else if (String(a.lowongan ?? '').trim()) { w.push('w.judul LIKE ?'); p.push('%' + String(a.lowongan).trim() + '%'); }
  if (a.tahap && LABEL_TAHAP_AI[String(a.tahap)]) { w.push('l.tahap=?'); p.push(String(a.tahap)); }
  if (String(a.kata ?? '').trim()) { const k = '%' + String(a.kata).trim() + '%'; w.push('(l.nama LIKE ? OR l.profil LIKE ?)'); p.push(k, k); }
  const batas = Math.max(1, Math.min(40, Number(a.batas) || 15));
  const rows = await q(`SELECT l.id, l.kode, l.nama, l.tahap, l.skor, l.kecocokan, l.ai_status, l.rating_hc, l.pendidikan, l.profil, l.created_at, w.judul
    FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.skor IS NULL, l.skor DESC, l.created_at DESC LIMIT ${batas}`, p);
  return { jumlah: rows.length, catatan: 'Skor = kecocokan CV dengan kualifikasi lowongan menurut AI (0-100); keputusan tetap di HC.', kandidat: rows.map((r) => {
    const pr = jsonAman(r.profil) ?? {};
    return { kandidat_id: r.id, kode: r.kode, nama: r.nama, lowongan: r.judul, tahap: LABEL_TAHAP_AI[r.tahap] ?? r.tahap, skor: r.skor, kecocokan: r.kecocokan || null,
      status_analisis: r.ai_status, rating_hc: r.rating_hc, pendidikan: r.pendidikan, pengalaman_bulan: pr.total_pengalaman_bulan ?? null,
      keahlian: (pr.keahlian ?? []).slice(0, 8), ringkasan: String(pr.ringkasan ?? '').slice(0, 300), melamar: String(r.created_at).slice(0, 10) };
  }) };
}
async function rekrutmenDetail(a: Baris) {
  const l = await q1(`SELECT l.*, w.judul, w.kualifikasi FROM lamaran l JOIN lowongan w ON w.id=l.lowongan_id WHERE ${Number(a.kandidat_id) ? 'l.id=?' : 'l.kode=?'}`,
    [Number(a.kandidat_id) || String(a.kode ?? '').trim().toUpperCase()]);
  if (!l) throw new Error('Kandidat tidak ditemukan');
  const riwayat = await q('SELECT jenis, dari, ke, catatan, oleh_nama, created_at FROM lamaran_riwayat WHERE lamaran_id=? ORDER BY id', [l.id]);
  return { kandidat_id: l.id, kode: l.kode, nama: l.nama, lowongan: l.judul, tahap: LABEL_TAHAP_AI[l.tahap] ?? l.tahap, skor: l.skor, kecocokan: l.kecocokan,
    status_analisis: l.ai_status, rating_hc: l.rating_hc, isian_pelamar: { pendidikan_terakhir: l.pendidikan, jurusan: l.jurusan || null,
      lama_pengalaman: l.pengalaman || null, pekerjaan_terakhir: l.kerja_terakhir || null, domisili: l.domisili || null }, profil_cv: jsonAman(l.profil),
    analisis_ai: jsonAman(l.analisis), jawaban_pertanyaan: jsonAman(l.jawaban), sudah_jadi_karyawan: !!l.user_id,
    riwayat: riwayat.map((r) => ({ waktu: String(r.created_at).slice(0, 16), jenis: r.jenis, perubahan: r.jenis === 'tahap' ? `${LABEL_TAHAP_AI[r.dari] ?? r.dari} → ${LABEL_TAHAP_AI[r.ke] ?? r.ke}` : undefined,
      catatan: r.catatan || undefined, oleh: r.oleh_nama || undefined })) };
}

/* ---------- KPI ---------- */
const POLA_BLN = /^\d{4}-(0[1-9]|1[0-2])$/;
function rentangBulan(a: unknown, z: unknown, mundur = 5): [string, string] {
  const kini = tglWIB().slice(0, 7);
  const sampai = POLA_BLN.test(String(z ?? '')) ? String(z) : kini;
  let dari = POLA_BLN.test(String(a ?? '')) ? String(a) : '';
  if (!dari) { const d = new Date(Date.UTC(+sampai.slice(0, 4), +sampai.slice(5, 7) - 1 - mundur, 1)); dari = d.toISOString().slice(0, 7); }
  return dari <= sampai ? [dari, sampai] : [sampai, dari];
}
async function kpiKaryawan(a: Baris) {
  const u = await q1('SELECT id, nama, jabatan, dept FROM users WHERE id=?', [Number(a.user_id)]);
  if (!u) throw new Error('Karyawan tidak ditemukan');
  const [dari, sampai] = rentangBulan(a.dari, a.sampai);
  const lapor = await q('SELECT * FROM kpi_lapor WHERE user_id=? AND periode BETWEEN ? AND ? ORDER BY periode', [u.id, dari, sampai]);
  const nilai = lapor.length ? await q(`SELECT * FROM kpi_nilai WHERE lapor_id IN (${lapor.map((x) => Number(x.id)).join(',')}) ORDER BY urut, id`) : [];
  const final = lapor.filter((x) => x.status === 'disetujui' && x.skor != null);
  // jangan sampai KPI yang lebih baru terlewat karena rentang yang dipilih model
  const lebihBaru = await q("SELECT periode, status, skor FROM kpi_lapor WHERE user_id=? AND periode>? ORDER BY periode", [u.id, sampai]);
  return { karyawan: `${u.nama} (${u.jabatan}${u.dept ? ', ' + u.dept : ''})`, rentang: `${dari} s.d. ${sampai}`,
    peringatan: lebihBaru.length ? `Ada KPI SETELAH rentang ini: ${lebihBaru.map((x) => `${x.periode} (${x.status}${x.skor != null ? ', skor ' + Number(x.skor) : ''})`).join('; ')}. Panggil ulang tanpa "sampai" untuk menyertakannya.` : undefined,
    rata_rata_skor_final: final.length ? Math.round((final.reduce((s, x) => s + Number(x.skor), 0) / final.length) * 10) / 10 : null,
    catatan: lapor.length ? 'Skor ≥100 Sangat Baik, 90-99 Baik, 75-89 Cukup, <75 Perlu Perbaikan. Status selain "disetujui" belum final.' : 'Belum ada laporan KPI pada rentang ini.',
    bulan: lapor.map((l) => ({ periode: l.periode, nama_bulan: `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][+String(l.periode).slice(5, 7) - 1]} ${String(l.periode).slice(0, 4)}`, template: l.template_nama, status: l.status, skor: l.skor == null ? null : Number(l.skor), predikat: l.predikat || null,
      catatan_verifikator: l.catatan_verifikator || undefined,
      indikator: nilai.filter((x) => x.lapor_id === l.id).map((x) => ({ nama: x.nama, target: Number(x.target), satuan: x.satuan, realisasi: x.realisasi == null ? null : Number(x.realisasi),
        pencapaian_persen: x.pencapaian == null ? null : Number(x.pencapaian), bobot: Number(x.bobot), arah: x.arah })) })) };
}
async function kpiRekap(a: Baris) {
  const [dari, sampai] = rentangBulan(a.dari, a.sampai, 0);
  const divisi = String(a.divisi ?? '').trim();
  const p: unknown[] = [dari, sampai];
  if (divisi) p.push('%' + divisi + '%');
  const rows = await q(`SELECT u.id, u.nama, u.jabatan, u.dept, COUNT(k.id) bulan, ROUND(AVG(k.skor),1) rata, MIN(k.skor) terendah, MAX(k.skor) tertinggi,
      SUM(k.status='disetujui') final FROM kpi_lapor k JOIN users u ON u.id=k.user_id
    WHERE k.periode BETWEEN ? AND ? AND k.skor IS NOT NULL ${a.termasuk_belum_final ? '' : "AND k.status='disetujui'"} ${divisi ? 'AND u.dept LIKE ?' : ''}
    GROUP BY u.id ORDER BY rata ${a.urut === 'terendah' ? 'ASC' : 'DESC'} LIMIT ${Math.max(1, Math.min(60, Number(a.batas) || 20))}`, p);
  const belum = Number(await nilai(`SELECT COUNT(*) FROM kpi_lapor WHERE periode BETWEEN ? AND ? AND status IN ('draf','diajukan','dikembalikan')`, [dari, sampai]));
  return { rentang: `${dari} s.d. ${sampai}`, divisi: divisi || 'semua', laporan_belum_final: belum,
    peringkat: rows.map((r, n) => ({ peringkat: n + 1, user_id: r.id, nama: r.nama, jabatan: r.jabatan, divisi: r.dept, rata_skor: Number(r.rata), jumlah_bulan: Number(r.bulan),
      skor_terendah: Number(r.terendah), skor_tertinggi: Number(r.tertinggi), bulan_final: Number(r.final) })) };
}

/* ---------- log kerja & beban kerja ---------- */
async function bebanKerja(a: Baris) {
  const p = periode(a.jenis === 'bulan' ? 'bulan' : 'minggu', POLA_TGL.test(String(a.tanggal ?? '')) ? String(a.tanggal) : tglWIB());
  const divisi = String(a.divisi ?? '').trim();
  const users = await q(`SELECT * FROM users WHERE aktif=1 AND role<>'direktur'${divisi ? ' AND dept LIKE ?' : ''} ORDER BY nama`, divisi ? ['%' + divisi + '%'] : []);
  const set = await pengaturanLog();
  let r = await ringkasBeban(users, p.dari, p.sampai);
  if (a.status) r = r.filter((x) => x.status === a.status);
  r.sort((x, y) => (y.utilisasi ?? -1) - (x.utilisasi ?? -1));
  return { periode: p.label, rentang: `${p.dari} s.d. ${p.sampai}`, batas_optimal: `${set.bawah}–${set.atas}%`,
    catatan: 'Utilisasi = jam pekerjaan tercatat ÷ kapasitas (hari kerja sesuai jadwal dikurangi libur/cuti/izin, sampai hari ini). "belum" = belum mencatat pekerjaan sama sekali.',
    karyawan: r.slice(0, 60).map((x) => ({ user_id: x.userId, nama: x.nama, divisi: x.dept, jam: Math.round(x.menit / 6) / 10, kapasitas_jam: Math.round(x.kapasitas / 6) / 10,
      utilisasi_persen: x.utilisasi, status: x.status, pekerjaan: x.jumlah, selesai: x.selesai, hari_terisi: x.hariTerisi, hari_kerja: x.hariKerja })) };
}
async function logKerjaKaryawan(a: Baris) {
  const u = await q1('SELECT * FROM users WHERE id=?', [Number(a.user_id)]);
  if (!u) throw new Error('Karyawan tidak ditemukan');
  const awal = periode('minggu', tglWIB());
  const dari = POLA_TGL.test(String(a.dari ?? '')) ? String(a.dari) : awal.dari, sampai = POLA_TGL.test(String(a.sampai ?? '')) ? String(a.sampai) : tglWIB();
  const [r] = await ringkasBeban([u], dari, sampai);
  const log = await q('SELECT tanggal, kategori_nama, uraian, durasi_menit, status FROM log_kerja WHERE user_id=? AND tanggal BETWEEN ? AND ? ORDER BY tanggal DESC, id DESC LIMIT 80', [u.id, dari, sampai]);
  const kat = await q(`SELECT kategori_nama k, SUM(durasi_menit) m, COUNT(*) n FROM log_kerja WHERE user_id=? AND tanggal BETWEEN ? AND ? AND status<>'rencana' GROUP BY k ORDER BY m DESC`, [u.id, dari, sampai]);
  return { karyawan: `${u.nama} (${u.jabatan})`, rentang: `${dari} s.d. ${sampai}`, utilisasi_persen: r?.utilisasi ?? null, status: r?.status, jam: Math.round((r?.menit ?? 0) / 6) / 10,
    kapasitas_jam: Math.round((r?.kapasitas ?? 0) / 6) / 10, per_kategori: kat.map((x) => ({ kategori: x.k || 'Tanpa kategori', jam: Math.round(Number(x.m) / 6) / 10, pekerjaan: Number(x.n) })),
    pekerjaan: log.map((x) => ({ tanggal: x.tanggal, kategori: x.kategori_nama, uraian: x.uraian, menit: Number(x.durasi_menit), status: x.status })),
    dipotong_80: log.length >= 80 };
}

async function querySql(a: Baris) {
  const sql = periksaSql(String(a.sql ?? ''));
  const rows = await kueriBacaSaja(sql, 200, 5000);
  return { jumlah_baris: rows.length, dibatasi_200: rows.length >= 200, baris: rows };
}

export async function jalankanAlat(nama: string, argumen: Baris): Promise<unknown> {
  switch (nama) {
    case 'cari_karyawan': return cariKaryawan(argumen);
    case 'ringkasan_karyawan': return ringkasanKaryawan(argumen);
    case 'rekap_karyawan': return rekapKaryawan(argumen);
    case 'struktur_organisasi': return strukturOrganisasi(argumen);
    case 'beban_kerja': return bebanKerja(argumen);
    case 'log_kerja_karyawan': return logKerjaKaryawan(argumen);
    case 'kpi_karyawan': return kpiKaryawan(argumen);
    case 'kpi_rekap': return kpiRekap(argumen);
    case 'rekrutmen_lowongan': return rekrutmenLowongan(argumen);
    case 'rekrutmen_kandidat': return rekrutmenKandidat(argumen);
    case 'rekrutmen_detail_kandidat': return rekrutmenDetail(argumen);
    case 'query_sql': return querySql(argumen);
    case 'lihat_skema': return { skema: await ringkasSkema() };
    default: throw new Error('Alat tidak dikenal: ' + nama);
  }
}

/* skema tabel yang boleh dibaca (tanpa kolom rahasia), untuk prompt sistem */
export async function ringkasSkema(): Promise<string> {
  const rows = await q(`SELECT table_name t, column_name c, column_type ty FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name IN (${TABEL_AI.map(() => '?').join(',')}) ORDER BY table_name, ordinal_position`, TABEL_AI);
  const peta = new Map<string, string[]>();
  for (const r of rows) {
    if (KOLOM_TERLARANG.includes(String(r.c).toLowerCase())) continue;
    if (!peta.has(r.t)) peta.set(r.t, []);
    peta.get(r.t)!.push(`${r.c} ${String(r.ty).replace(/^(varchar|int|decimal|tinyint|bigint)\(.*\)$/, '$1').slice(0, 60)}`);
  }
  return [...peta.entries()].map(([t, k]) => `${t}(${k.join(', ')})`).join('\n');
}

export async function konteksAturan(): Promise<string> {
  const jk = await jadwalKerja(), tol = await setgInt('toleransi', 10);
  const hari = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const jam = [1, 2, 3, 4, 5, 6, 7].map((d) => `${hari[d]} ${jk[d] ? jk[d]!.join('–') : 'libur'}`).join('; ');
  return `Jam kerja kantor: ${jam}. Toleransi terlambat ${tol} menit. Aplikasi HRIS mulai dipakai ${await mulaiData()} — data kehadiran sebelum tanggal itu tidak ada.`;
}
