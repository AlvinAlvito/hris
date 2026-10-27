/* Alat (tools) AI Asisten. Angka kehadiran memakai lib/statusHarian (rumus yang sama dengan Rekap & Payroll),
   sehingga jawaban AI konsisten dengan aplikasi. Semua hanya membaca data. */
import { kueriBacaSaja, nilai, q, q1, type Baris } from '../db';
import { bulanKerja, cutiAktif, cutiTerpakai, jatahCuti, labelJenis, labelKet, sisaCuti } from '../aturan';
import { statusHarian, hitungStatus } from '../statusHarian';
import { jadwalKerja, setg, setgInt } from '../pengaturan';
import { POLA_TGL, tglWIB } from '../waktu';
import { KOLOM_TERLARANG, periksaSql, TABEL_AI } from './sqlAman';

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
  return rows.map((r) => ({ user_id: r.id, nik: r.nik, nama: r.nama, jabatan: r.jabatan, divisi: r.dept, peran: PERAN[r.role] ?? r.role,
    status_kerja: r.status_kerja, tgl_masuk: r.tgl_masuk, aktif: r.aktif === 1, atasan: r.atasan ?? null }));
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
