/* Status harian karyawan dalam satu rentang tanggal (hemat query).
   Hasil: { user_id: { 'YYYY-MM-DD': status } }
   status: hadir | telat | setengah (kerja < 50% target tanpa izin setengah hari) | cuti | ket (keterangan disetujui) | libur |
           mangkir | belum (hari ini, belum absen) | luar (belum masuk / sudah keluar / hari yang akan datang)
   Absensi yang DITOLAK atasan dianggap tidak ada (jatuh ke cuti / keterangan / libur / mangkir).
   Terlambat dengan izin terlambat yang disetujui dihitung hadir.
   Dipakai dashboard dan payroll (hitung hari hadir / mangkir). */
import { q, type Baris } from './db';
import { hariLiburMingguan, inList, liburResmi } from './aturan';
import { hariIso, tambahHari, tglWIB, POLA_TGL } from './waktu';
import { setg } from './pengaturan';

export type PetaStatus = Record<number, Record<string, string>>;

export async function statusHarian(users: Baris[], dari: string, sampai: string): Promise<PetaStatus> {
  if (!users.length) return {};
  const ids = inList(users.map((u) => u.id)), hariIni = tglWIB();
  const abs: Record<number, Record<string, Baris>> = {};
  for (const r of await q(`SELECT user_id, tanggal, terlambat, telat_diizinkan, jam_mode, out_time, izin_sesi, menit_kerja, target_menit FROM absensi
    WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ? AND in_time IS NOT NULL AND approval<>'ditolak'`, [dari, sampai])) (abs[r.user_id] ??= {})[r.tanggal] = r;
  const cuti: Record<number, Set<string>> = {};
  for (const r of await q(`SELECT user_id, mulai, selesai FROM cuti WHERE user_id IN (${ids}) AND status='Disetujui' AND mulai<=? AND selesai>=?`, [sampai, dari])) {
    const set = (cuti[r.user_id] ??= new Set());
    for (let t = r.mulai > dari ? r.mulai : dari, e = r.selesai < sampai ? r.selesai : sampai; t <= e; t = tambahHari(t, 1)) set.add(t);
  }
  const ket: Record<number, Set<string>> = {};
  for (const r of await q(`SELECT user_id, tanggal FROM ketidakhadiran WHERE user_id IN (${ids}) AND status='Disetujui' AND tanggal BETWEEN ? AND ?`, [dari, sampai]))
    (ket[r.user_id] ??= new Set()).add(r.tanggal);
  const jdw: Record<number, Record<string, number | null>> = {};
  for (const r of await q(`SELECT user_id, tanggal, shift_id FROM jadwal_shift WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ?`, [dari, sampai]))
    (jdw[r.user_id] ??= {})[r.tanggal] = r.shift_id;

  const awal = await setg('tanggal_mulai_hris', ''), mulaiHris = POLA_TGL.test(awal) ? awal : '1970-01-01';
  const hasil: PetaStatus = {};
  for (const u of users) {
    // hari sebelum aplikasi mulai dipakai tidak dihitung (belum ada yang absen di HRIS ini)
    const uid = u.id, masuk = [u.tgl_masuk ?? '1970-01-01', mulaiHris].sort().pop()!, keluar = u.tgl_keluar ?? null, mingguan = await hariLiburMingguan(u);
    const peta: Record<string, string> = (hasil[uid] = {});
    for (let t = dari; t <= sampai; t = tambahHari(t, 1)) {
      if (t < masuk || (keluar && t > keluar) || t > hariIni) { peta[t] = 'luar'; continue; }
      const a = abs[uid]?.[t];
      if (a) {
        if (a.out_time && !a.izin_sesi && Number(a.target_menit) > 0 && Number(a.menit_kerja) * 2 < Number(a.target_menit)) peta[t] = 'setengah';
        else peta[t] = a.terlambat === 1 && a.telat_diizinkan !== 1 && a.jam_mode !== 'fleksibel' ? 'telat' : 'hadir';
        continue;
      }
      if (cuti[uid]?.has(t)) { peta[t] = 'cuti'; continue; }
      if (ket[uid]?.has(t)) { peta[t] = 'ket'; continue; }
      // jadwal: roster khusus menang, lalu libur mingguan, libur resmi (non-shift)
      let libur = false;
      if (jdw[uid] && t in jdw[uid]) libur = jdw[uid][t] === null;
      else if (mingguan.includes(hariIso(t))) libur = true;
      else if ((u.jam_mode ?? 'tetap') !== 'shift' && (await liburResmi(t))) libur = true;
      peta[t] = libur ? 'libur' : t === hariIni ? 'belum' : 'mangkir';
    }
  }
  return hasil;
}
export function hitungStatus(peta: Record<string, string>) {
  const n: Record<string, number> = { hadir: 0, telat: 0, setengah: 0, cuti: 0, ket: 0, libur: 0, mangkir: 0, belum: 0, luar: 0 };
  for (const st of Object.values(peta)) n[st] = (n[st] ?? 0) + 1;
  return n;
}
