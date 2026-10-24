/* =====================================================================
   Aturan bisnis inti: peran, jadwal harian, libur, cuti, absensi berjalan.
   Port langsung dari versi PHP — logika dan urutan pemeriksaannya sama.
   ===================================================================== */
import { exec, nilai, q, q1, type Baris } from './db';
import { konteks, simpanSementara } from './konteks';
import { setg, setgInt } from './pengaturan';
import { gagal } from './http';
import { sesi } from './sesi';
import { detikSekarang, epoch, hariIso, tambahHari, tglWIB } from './waktu';

export type User = Baris;

/* ---------------- peran & sesi ---------------- */
/* Peran: 'karyawan' (Pegawai), 'admin' (HC), 'direktur' (Super Admin).
   HC dan Super Admin memegang kendali penuh. 'atasan' & 'finance' hanya sisa data lama. */
export function isAdminUp(u: User): boolean { return u.role === 'admin' || u.role === 'direktur'; }
export function isFinance(u: User): boolean { return u.role === 'finance'; }
export function isAtasanRole(u: User): boolean { return u.role === 'atasan'; }
export function isAtasan(u: User): boolean { return isAtasanRole(u) || isAdminUp(u); }

export async function me(): Promise<User | null> {
  return simpanSementara('me', async () => {
    const ss = await sesi();
    if (!ss.uid) return null;
    const u = await q1('SELECT * FROM users WHERE id=? AND aktif=1', [ss.uid]);
    if (!u || !ss.superadminUid) return u;
    const admin = await q1("SELECT id,nama FROM users WHERE id=? AND role='direktur' AND aktif=1", [ss.superadminUid]);
    if (!admin) { ss.destroy(); return null; }
    return { ...u, impersonasi: { id: admin.id, nama: admin.nama } };
  });
}
export async function need(peran?: string[]): Promise<User> {
  const u = await me();
  if (!u) gagal('Sesi berakhir, silakan login ulang', 401);
  if (peran && !isAdminUp(u) && !peran.includes(u.role)) gagal('Anda tidak berwenang', 403);
  return u;
}

export async function logAksi(uid: number, aksi: string, ket = ''): Promise<void> {
  const k = konteks();
  await exec('INSERT INTO log_aktivitas (user_id,aksi,keterangan,ip,ua) VALUES (?,?,?,?,?)',
    [uid || null, aksi, ket, (k?.ip ?? '').slice(0, 45), (k?.ua ?? '').slice(0, 255)]);
}

/* ---------------- rekomendasi atasan (data lama; nonaktif secara bawaan) ---------------- */
export async function pakaiRekomendasi(): Promise<boolean> { return (await setgInt('rekomendasi_atasan', 0)) === 1; }
export async function atasanUntuk(u: User): Promise<User | null> {
  if (u.atasan_id) {
    const a = await q1('SELECT * FROM users WHERE id=? AND aktif=1', [u.atasan_id]);
    if (a && a.role === 'atasan' && a.id !== u.id) return a;
    if (a) return null;
  }
  if (u.cabang_id === null) return null;
  return q1("SELECT * FROM users WHERE role='atasan' AND aktif=1 AND cabang_id=? AND id<>? ORDER BY id LIMIT 1", [u.cabang_id, u.id]);
}
export async function perluRekomendasi(u: User): Promise<boolean> {
  return (await pakaiRekomendasi()) && !isAtasan(u) && (await atasanUntuk(u)) !== null;
}
export async function bolehMerekomendasi(atasan: User, pemilik: User): Promise<boolean> {
  if (isAdminUp(atasan)) return true;
  if (!isAtasanRole(atasan) || pemilik.id === atasan.id) return false;
  const a = await atasanUntuk(pemilik);
  return a !== null && a.id === atasan.id;
}
export async function idTimAtasan(atasan: User): Promise<number[]> {
  const l = await q(`SELECT * FROM users WHERE aktif=1 AND id<>? AND role<>'direktur'
    AND (atasan_id=? OR (atasan_id IS NULL AND cabang_id <=> ?))`, [atasan.id, atasan.id, atasan.cabang_id]);
  const ids: number[] = [];
  for (const x of l) if (await bolehMerekomendasi(atasan, x)) ids.push(x.id);
  return ids;
}
export function inList(ids: number[]): string { return ids.length ? ids.map((x) => Math.trunc(x)).join(',') : '0'; }

/* ---------------- label ---------------- */
export function labelJenis(j: string): string {
  return j === 'ganti_shift' ? 'Ganti Shift' : j === 'libur' ? 'Libur / Pindah Libur' : 'Lembur';
}
const LABEL_KET: Record<string, string> = {
  sakit: 'Sakit', izin: 'Izin', keperluan: 'Keperluan Pribadi', libur: 'Libur', lainnya: 'Lainnya',
  setengah_hari: 'Izin Setengah Hari', wfh: 'WFH', dlk: 'Dinas Luar Kota',
};
export function labelKet(j: string): string { return LABEL_KET[j] ?? j.charAt(0).toUpperCase() + j.slice(1); }
/* jenis yang tetap bekerja (absen seperti biasa); sisanya berarti tidak masuk */
export const KET_TETAP_KERJA = ['setengah_hari', 'wfh', 'dlk'];

/* ---------------- izin kerja (WFH / dinas / setengah hari) ---------------- */
export async function izinKerja(uid: number, tgl: string): Promise<[string, string]> {
  const l = await q(`SELECT jenis, sesi FROM ketidakhadiran WHERE user_id=? AND tanggal=? AND status='Disetujui'
    AND jenis IN ('setengah_hari','wfh','dlk')`, [uid, tgl]);
  let dari = '', sesiIzin = '';
  for (const x of l) { if (x.jenis === 'setengah_hari') sesiIzin = x.sesi; else dari = x.jenis; }
  return [dari, sesiIzin];
}
/* izin setengah hari yang disetujui setelah karyawan absen: sesuaikan catatan absensinya */
export async function terapkanSetengahHari(uid: number, tgl: string, sesiIzin: string): Promise<void> {
  const a = await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [uid, tgl]);
  if (!a || a.izin_sesi !== '') return;
  const target = Math.floor(a.target_menit / 2);
  const kurang = a.out_time ? Math.max(0, target - a.menit_kerja) : 0;
  const pagi = sesiIzin === 'pagi';
  await exec('UPDATE absensi SET izin_sesi=?, target_menit=?, kurang_menit=?, lembur_menit=0, terlambat=?, menit_telat=? WHERE id=?',
    [sesiIzin, target, kurang, pagi ? 0 : a.terlambat, pagi ? 0 : a.menit_telat, a.id]);
}

/* ---------------- masa kerja & cuti ---------------- */
export function bulanKerja(tglMasuk: string): number {
  const hariIni = tglWIB();
  if (!tglMasuk || tglMasuk > hariIni) return 0;
  const [y1, m1, d1] = tglMasuk.split('-').map(Number);
  const [y2, m2, d2] = hariIni.split('-').map(Number);
  let bulan = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) bulan--;
  return Math.max(0, bulan);
}
export function cutiAktif(u: User): boolean {
  if (u.role === 'direktur') return false;
  if (u.cuti_mode === 'on') return true;
  if (u.cuti_mode === 'off') return false;
  return bulanKerja(u.tgl_masuk) >= 12;
}
export function jatahCuti(u: User): number { return cutiAktif(u) ? Number(u.jatah) : 0; }
export async function cutiTerpakai(uid: number, th?: number): Promise<number> {
  return Number(await nilai(`SELECT COALESCE(SUM(hari),0) FROM cuti
    WHERE user_id=? AND jenis='Cuti Tahunan' AND status='Disetujui' AND YEAR(mulai)=?`, [uid, th ?? Number(tglWIB().slice(0, 4))]));
}
export async function cutiPending(uid: number, th?: number): Promise<number> {
  return Number(await nilai(`SELECT COALESCE(SUM(hari),0) FROM cuti
    WHERE user_id=? AND jenis='Cuti Tahunan' AND status='Menunggu' AND YEAR(mulai)=?`, [uid, th ?? Number(tglWIB().slice(0, 4))]));
}
export async function sisaCuti(u: User): Promise<number> { return jatahCuti(u) - (await cutiTerpakai(u.id)); }

/* ---------------- kalender libur ---------------- */
export async function kalenderLibur(): Promise<Record<string, Baris>> {
  return simpanSementara('libur', async () => {
    const o: Record<string, Baris> = {};
    try { for (const r of await q('SELECT tanggal,nama,jenis FROM hari_libur')) o[r.tanggal] = r; } catch { /* tabel belum ada */ }
    return o;
  });
}
export async function liburResmi(tgl: string): Promise<Baris | null> {
  if ((await setgInt('libur_nasional_aktif', 1)) !== 1) return null;
  return (await kalenderLibur())[tgl] ?? null;
}
export async function hariKerjaSeminggu(): Promise<number> { return (await setgInt('hari_kerja_seminggu', 5)) === 6 ? 6 : 5; }
/* Jumlah hari cuti: hari kerja tanpa libur resmi; cuti melahirkan dihitung hari kalender */
export async function hitungHari(m: string, sd: string, jenis: string): Promise<number> {
  if (sd < m) return 0;
  const kal = jenis === 'Cuti Melahirkan', hk = await hariKerjaSeminggu();
  let n = 0;
  for (let t = m; t <= sd; t = tambahHari(t, 1)) {
    if (kal || (hariIso(t) <= hk && !(await liburResmi(t)))) n++;
  }
  return n;
}

/* ---------------- lokasi ---------------- */
export function jarakMeter(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}
export async function cabangById(id: number | null | undefined): Promise<Baris | null> {
  if (!id) return null;
  return simpanSementara('cabang:' + id, () => q1('SELECT * FROM cabang WHERE id=?', [id]));
}
export function cabangPublik(c: Baris) {
  return { id: c.id, nama: c.nama, tipe: c.tipe, alamat: c.alamat, lat: c.lat, lng: c.lng, radius: c.radius, aktif: c.aktif === 1 };
}

/* ---------------- shift & jadwal ---------------- */
export async function shiftById(id: number | null | undefined): Promise<Baris | null> {
  if (!id) return null;
  return simpanSementara('shift:' + id, () => q1('SELECT * FROM shift WHERE id=?', [id]));
}
export function durasiShift(sh: Baris): number {
  let d = Math.round((epoch('2000-01-01', sh.jam_pulang) - epoch('2000-01-01', sh.jam_masuk)) / 60);
  if (d <= 0) d += 1440;
  return d;
}
export function shiftPublik(sh: Baris) {
  return { id: sh.id, nama: sh.nama, jamMasuk: String(sh.jam_masuk).slice(0, 5), jamPulang: String(sh.jam_pulang).slice(0, 5),
    toleransi: sh.toleransi, lintasHari: sh.lintas_hari === 1, aktif: sh.aktif === 1, durasiMenit: durasiShift(sh) };
}
/* Hari libur mingguan tetap: users.libur_hari = angka hari ISO dipisah koma.
   NULL = bawaan (non-shift libur akhir pekan bila diaktifkan), '0' = tidak ada. */
export async function hariLiburMingguan(u: User): Promise<number[]> {
  const lh = u.libur_hari;
  if (lh === null || lh === undefined || lh === '') {
    if ((u.jam_mode ?? 'tetap') !== 'shift' && (await setgInt('libur_minggu_nonshift', 1)) === 1)
      return (await hariKerjaSeminggu()) === 6 ? [7] : [6, 7];
    return [];
  }
  if (String(lh).trim() === '0') return [];
  return String(lh).split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => d >= 1 && d <= 7);
}
export async function liburMingguan(u: User, tgl: string): Promise<boolean> {
  return (await hariLiburMingguan(u)).includes(hariIso(tgl));
}
export interface JadwalHari { libur: boolean; shift: Baris | null; sumber: string; ket?: string }
/* Jadwal seseorang pada satu tanggal: jadwal per tanggal → libur mingguan → libur resmi (non-shift) → shift bawaan */
export async function jadwalHari(u: User, tgl: string): Promise<JadwalHari> {
  const j = await q1('SELECT * FROM jadwal_shift WHERE user_id=? AND tanggal=?', [u.id, tgl]);
  if (j) {
    if (j.shift_id === null) return { libur: true, shift: null, sumber: 'jadwal' };
    const sh = await shiftById(j.shift_id);
    if (sh) return { libur: false, shift: sh, sumber: 'jadwal' };
  }
  if (await liburMingguan(u, tgl)) return { libur: true, shift: null, sumber: 'mingguan' };
  if (u.jam_mode !== 'shift') {
    const lr = await liburResmi(tgl);
    if (lr) return { libur: true, shift: null, sumber: 'nasional', ket: lr.nama };
  }
  if (u.jam_mode === 'shift' && u.shift_id) {
    const sh = await shiftById(u.shift_id);
    if (sh) return { libur: false, shift: sh, sumber: 'bawaan' };
  }
  return { libur: false, shift: null, sumber: 'tidak ada' };
}
/* null = libur, number = id shift, false = tidak punya jadwal (mode bukan shift) */
export async function nilaiJadwal(u: User, tgl: string): Promise<number | null | false> {
  const j = await jadwalHari(u, tgl);
  if (j.libur) return null;
  if (j.shift) return j.shift.id;
  return false;
}
export async function namaJadwal(v: number | null | false): Promise<string> {
  if (v === null) return 'LIBUR';
  if (v === false) return '-';
  const sh = await shiftById(v);
  return sh ? sh.nama : '-';
}
export async function tulisJadwal(userId: number, tgl: string, v: number | null | false, oleh: string,
  tukarId: number | null = null, asal = 'manual'): Promise<void> {
  await exec(`INSERT INTO jadwal_shift (user_id,tanggal,shift_id,dibuat_oleh,tukar_id,asal) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE shift_id=VALUES(shift_id), dibuat_oleh=VALUES(dibuat_oleh), tukar_id=VALUES(tukar_id), asal=VALUES(asal)`,
    [userId, tgl, v === false ? null : v, oleh, tukarId, asal]);
}

/* ---------------- absensi berjalan ---------------- */
export async function sudahAdaAbsensi(userId: number, tgl: string): Promise<boolean> {
  return !!(await nilai('SELECT 1 FROM absensi WHERE user_id=? AND tanggal=?', [userId, tgl]));
}
export async function batasJamTerbuka(): Promise<number> {
  const j = await setgInt('batas_jam_terbuka', 18);
  return j >= 4 && j <= 36 ? j : 18;
}
export async function masihBerjalan(row: Baris): Promise<boolean> {
  if (!row.in_time || row.out_time) return false;
  return detikSekarang() - epoch(row.tanggal, row.in_time) <= (await batasJamTerbuka()) * 3600;
}
/* baris terbuka (hari ini / kemarin untuk shift malam) yang masih boleh ditutup dengan clock out biasa */
export async function absensiBerjalan(userId: number, tglNow: string): Promise<Baris | null> {
  const r = await q1(`SELECT * FROM absensi WHERE user_id=? AND tanggal IN (?,?)
    AND in_time IS NOT NULL AND out_time IS NULL ORDER BY tanggal DESC LIMIT 1`, [userId, tglNow, tambahHari(tglNow, -1)]);
  return r && (await masihBerjalan(r)) ? r : null;
}
export async function tandaiLupaOut(userId: number): Promise<void> {
  await exec(`UPDATE absensi SET lupa_out=1 WHERE user_id=? AND in_time IS NOT NULL AND out_time IS NULL AND lupa_out=0
    AND TIMESTAMPDIFF(HOUR, TIMESTAMP(tanggal, in_time), NOW()) > ?`, [userId, await batasJamTerbuka()]);
}
export async function targetMenit(u: User, sh: Baris | null): Promise<number> {
  if (u.jam_mode === 'shift') {
    if (sh) return durasiShift(sh);
    const bawaan = await shiftById(u.shift_id);
    if (bawaan) return durasiShift(bawaan);
  }
  if (u.jam_mode === 'fleksibel') return Number(u.target_menit);
  let d = Math.round((epoch('2000-01-01', await setg('jam_pulang', '17:00')) - epoch('2000-01-01', await setg('jam_masuk', '08:00'))) / 60);
  if (d <= 0) d += 1440;
  return d;
}
export function jamTeks(menit: number): string { return Math.floor(menit / 60) + 'j ' + (menit % 60) + 'm'; }
export function rupiah(n: number): string { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
