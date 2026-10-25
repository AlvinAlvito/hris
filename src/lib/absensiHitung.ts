/* Perhitungan ulang satu baris absensi dari jam masuk & pulang.
   Dipakai koreksi HC dan persetujuan pengajuan lupa clock in / lupa clock out. */
import { exec, q1, type Baris } from './db';
import { gagal } from './http';
import { cabangById, jadwalHari, jamKerjaHari, shiftById, targetMenit, type User } from './aturan';
import { setgInt } from './pengaturan';
import { epoch, POLA_TGL, tambahHari } from './waktu';

export interface HasilHitung {
  in_time: string; out_time: string | null; tgl_pulang: string | null; menit_kerja: number; kurang_menit: number;
  lembur_menit: number; langgar_inti: number; terlambat: number; menit_telat: number; lupa_out: number;
}

/* a = baris absensi (target_menit, izin_sesi, jadwal_in, shift_id, jam_mode), u = pemilik (jam_mode, inti_mulai, inti_selesai).
   jamOut kosong = belum pulang (baris tetap ditandai lupa clock out). */
export async function hitungAbsensi(a: Baris, u: User, jamIn: string, jamOut: string, tglOutMasukan = ''): Promise<HasilHitung> {
  const tglMasuk = a.tanggal, inTs = epoch(tglMasuk, jamIn);
  let outTime: string | null = null, tglPulang: string | null = null, menitKerja = 0, kurang = 0, lembur = 0, langgar = 0, lupa = 1;
  if (jamOut !== '') {
    // tanggal pulang: hari yang sama, atau hari berikutnya bila jam pulang lebih awal
    let tglOut = tglOutMasukan;
    if (tglOut !== '' && POLA_TGL.test(tglOut)) { if (tglOut < tglMasuk) gagal('Tanggal pulang tidak boleh sebelum tanggal masuk'); }
    else tglOut = epoch(tglMasuk, jamOut) <= inTs ? tambahHari(tglMasuk, 1) : tglMasuk;
    const outTs = epoch(tglOut, jamOut);
    menitKerja = Math.round((outTs - inTs) / 60);
    if (menitKerja <= 0) gagal('Jam pulang harus setelah jam masuk');
    if (menitKerja > 1440) gagal('Durasi kerja melebihi 24 jam — periksa lagi tanggal dan jamnya');
    outTime = jamOut + ':00'; tglPulang = tglOut !== tglMasuk ? tglOut : null; lupa = 0;
    const target = Number(a.target_menit);
    kurang = target > 0 ? Math.max(0, target - menitKerja) : 0;
    const lemburMin = await setgInt('lembur_min_menit', 30);
    lembur = target > 0 && menitKerja - target >= lemburMin && !a.izin_sesi ? menitKerja - target : 0;
    if ((u.jam_mode ?? 'tetap') === 'fleksibel' && u.inti_mulai && u.inti_selesai) {
      const intiA = epoch(tglMasuk, u.inti_mulai); let intiB = epoch(tglMasuk, u.inti_selesai);
      if (intiB <= intiA) intiB += 86400;
      if (inTs > intiA || outTs < intiB) langgar = 1;
    }
  }
  // keterlambatan terhadap jadwal yang tersimpan di baris itu (izin setengah hari pagi tidak dihitung telat)
  let telat = 0, menitTelat = 0;
  if (a.jadwal_in && a.izin_sesi !== 'pagi') {
    let tol = (a.jam_mode ?? 'tetap') === 'shift' ? 0 : await setgInt('toleransi', 10);
    if (a.shift_id) { const sh = await shiftById(a.shift_id); if (sh) tol = sh.toleransi; }
    const seharusnya = epoch(tglMasuk, a.jadwal_in);
    if (inTs > seharusnya + tol * 60) { telat = 1; menitTelat = Math.floor((inTs - seharusnya) / 60); }
  }
  return { in_time: jamIn + ':00', out_time: outTime, tgl_pulang: tglPulang, menit_kerja: menitKerja, kurang_menit: kurang,
    lembur_menit: lembur, langgar_inti: langgar, terlambat: telat, menit_telat: menitTelat, lupa_out: lupa };
}

/* Jadwal yang berlaku bagi seseorang pada satu tanggal: jam masuk & pulang seharusnya, target, nama pola */
export async function jadwalAbsen(u: User, tgl: string) {
  const jm = u.jam_mode || 'tetap', jd = await jadwalHari(u, tgl), sh = jd.shift;
  let jadwalIn: string | null = null, jadwalOut: string | null = null, nama = '';
  if (jm === 'shift') {
    if (jd.libur) nama = 'Di luar jadwal (dijadwalkan libur)';
    else if (sh) { nama = sh.nama; jadwalIn = sh.jam_masuk; jadwalOut = sh.jam_pulang; } else nama = 'Belum dijadwalkan';
  } else if (jm === 'fleksibel') nama = jd.libur ? 'Masuk saat libur' : 'Fleksibel';
  else if (jd.libur) nama = 'Masuk saat libur';
  else {
    const j = await jamKerjaHari(tgl);
    if (j) { jadwalIn = j[0] + ':00'; jadwalOut = j[1] + ':00'; } else nama = 'Masuk saat libur';
  }
  return { jm, jd, sh, jadwalIn, jadwalOut, nama, target: await targetMenit(u, sh, tgl) };
}

/* Buat baris absensi dari pengajuan lupa clock in yang disetujui (belum ada baris pada tanggal itu) */
export async function barisAbsensiManual(u: User, tgl: string, jamIn: string, oleh: string, catatan: string): Promise<Baris> {
  const j = await jadwalAbsen(u, tgl), cab = await cabangById(u.cabang_id);
  const a: Baris = { tanggal: tgl, target_menit: j.target, izin_sesi: '', jadwal_in: j.jadwalIn, shift_id: j.sh?.id ?? null, jam_mode: j.jm };
  const h = await hitungAbsensi(a, u, jamIn, '');
  await exec(`INSERT INTO absensi (user_id,tanggal,mode,in_time,cabang_id,cabang_nama,jam_mode,shift_id,shift_nama,jadwal_in,jadwal_out,
    target_menit,terlambat,menit_telat,dikoreksi,koreksi_oleh,koreksi_catatan,tgl_koreksi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NOW())`,
  [u.id, tgl, u.lokasi_mode ?? 'kantor', h.in_time, cab?.id ?? null, cab?.nama ?? '', j.jm, j.sh?.id ?? null, j.nama, j.jadwalIn, j.jadwalOut,
    j.target, h.terlambat, h.menit_telat, oleh, catatan.slice(0, 255)]);
  return (await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [u.id, tgl]))!;
}
