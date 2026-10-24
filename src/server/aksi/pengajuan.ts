/* Pengajuan pegawai: cuti, izin/sakit/WFH/dinas/setengah hari, lembur & jadwal. Semua diputus HC. */
import { exec, q, q1 } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import {
  cutiAktif, cutiPending, hitungHari, jadwalHari, jamTeks, KET_TETAP_KERJA, labelKet, logAksi, namaJadwal, need, nilaiJadwal,
  perluRekomendasi, shiftById, sisaCuti, sudahAdaAbsensi,
} from '@/lib/aturan';
import { cutiRow, ketRow, pengajuanRow, userPublik } from '@/lib/format';
import { epoch, POLA_JAM, POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const tglId = (t: string) => t.split('-').reverse().join('/');

export const aksiPengajuan: KumpulanAksi = {
  /* ---------- cuti ---------- */
  async cuti_saya() {
    const u = await need();
    const list = await q('SELECT * FROM cuti WHERE user_id=? ORDER BY created_at DESC', [u.id]);
    return { me: await userPublik(u), pending: await cutiPending(u.id), list: list.map(cutiRow) };
  },
  async cuti_ajukan(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Super Admin tidak memiliki jatah cuti');
    const jenis = s(m, 'jenis'), mulai = s(m, 'mulai'), selesai = s(m, 'selesai'), alasan = s(m, 'alasan');
    if (!['Cuti Tahunan', 'Sakit', 'Izin', 'Cuti Melahirkan', 'Cuti Penting'].includes(jenis)) gagal('Jenis cuti tidak sah');
    if (!POLA_TGL.test(mulai) || !POLA_TGL.test(selesai)) gagal('Tanggal tidak sah');
    if (alasan === '') gagal('Alasan wajib diisi');
    const hari = await hitungHari(mulai, selesai, jenis);
    if (hari <= 0) gagal('Rentang tanggal tidak valid');
    if (jenis === 'Cuti Tahunan') {
      if (!cutiAktif(u)) gagal('Anda belum berhak cuti tahunan');
      const sisa = (await sisaCuti(u)) - (await cutiPending(u.id));
      if (hari > sisa) gagal(`Melebihi sisa cuti (${sisa} hari)`);
    }
    await exec('INSERT INTO cuti (user_id,jenis,mulai,selesai,hari,alasan,status) VALUES (?,?,?,?,?,?,?)', [u.id, jenis, mulai, selesai, hari, alasan, 'Menunggu']);
    await logAksi(u.id, 'ajukan_cuti', `${jenis} ${mulai}..${selesai}`);
    return { pesan: u.role === 'admin' ? 'Terkirim — menunggu persetujuan HC lain atau Super Admin' : 'Pengajuan terkirim, menunggu persetujuan HC' };
  },
  async cuti_batal(m) {
    const u = await need();
    const r = await exec("UPDATE cuti SET status='Dibatalkan' WHERE id=? AND user_id=? AND status='Menunggu'", [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Pengajuan tidak dapat dibatalkan');
    return { pesan: 'Pengajuan dibatalkan' };
  },

  /* ---------- izin, sakit, setengah hari, WFH, dinas luar kota ---------- */
  async ketidakhadiran_ajukan(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Super Admin tidak melakukan absensi');
    const jenis = s(m, 'jenis');
    if (!['sakit', 'izin', 'keperluan', 'libur', 'lainnya', 'setengah_hari', 'wfh', 'dlk'].includes(jenis)) gagal('Jenis pengajuan tidak sah');
    const tgl = s(m, 'tanggal');
    if (!POLA_TGL.test(tgl)) gagal('Tanggal tidak sah');
    // setengah hari selalu satu tanggal; jenis lain boleh rentang tanggal
    const sampai = jenis === 'setengah_hari' ? tgl : s(m, 'sampai') || tgl;
    if (!POLA_TGL.test(sampai) || sampai < tgl) gagal('Tanggal selesai tidak sah');
    let sesiIzin = '';
    if (jenis === 'setengah_hari') {
      sesiIzin = s(m, 'sesi');
      if (sesiIzin !== 'pagi' && sesiIzin !== 'siang') gagal('Pilih sesi pagi atau siang');
    }
    const alasan = s(m, 'alasan');
    if (alasan === '' && (jenis === 'lainnya' || jenis === 'dlk'))
      gagal(jenis === 'dlk' ? 'Tuliskan kota tujuan dan keperluan dinas' : 'Untuk jenis "Lainnya", alasan wajib diisi');
    const hariIni = tglWIB();
    if (tgl < tambahHari(hariIni, -30)) gagal('Pengajuan hanya bisa untuk 30 hari terakhir');
    if (sampai > tambahHari(hariIni, 60)) gagal('Pengajuan paling jauh 60 hari ke depan');
    if ((epoch(sampai) - epoch(tgl)) / 86400 > 30) gagal('Rentang paling panjang 31 hari');

    // satu baris per tanggal; pada rentang, hari libur dilewati
    const tanggal: string[] = [];
    for (let t = tgl; t <= sampai; t = tambahHari(t, 1)) {
      if (tgl !== sampai && (await jadwalHari(u, t)).libur) continue;
      tanggal.push(t);
    }
    if (!tanggal.length) gagal('Semua tanggal pada rentang itu adalah hari libur');
    for (const t of tanggal) {
      if (!KET_TETAP_KERJA.includes(jenis) && (await sudahAdaAbsensi(u.id, t)))
        gagal(`Anda tercatat hadir pada ${tglId(t)}, keterangan tidak diperlukan`);
      const ada = await q1(`SELECT id FROM ketidakhadiran WHERE user_id=? AND tanggal=?
        AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui')`, [u.id, t]);
      if (ada) gagal('Sudah ada pengajuan untuk ' + tglId(t));
    }
    const status = (await perluRekomendasi(u)) ? 'Menunggu Rekomendasi' : 'Menunggu HR';
    for (const t of tanggal)
      await exec('INSERT INTO ketidakhadiran (user_id,tanggal,jenis,sesi,alasan,status) VALUES (?,?,?,?,?,?)', [u.id, t, jenis, sesiIzin, alasan, status]);
    await logAksi(u.id, 'ajukan_ketidakhadiran', labelKet(jenis) + ' ' + tgl + (sampai !== tgl ? '..' + sampai : ''));
    const n = tanggal.length;
    return { pesan: labelKet(jenis) + (n > 1 ? ` ${n} hari` : '') + ' terkirim. Menunggu persetujuan HC.' };
  },
  async ketidakhadiran_saya() {
    const u = await need();
    const l = await q(`SELECT k.*, u.nama, u.nik FROM ketidakhadiran k JOIN users u ON u.id=k.user_id
      WHERE k.user_id=? ORDER BY k.id DESC LIMIT 60`, [u.id]);
    return l.map(ketRow);
  },
  async ketidakhadiran_batal(m) {
    const u = await need();
    const r = await exec(`UPDATE ketidakhadiran SET status='Dibatalkan'
      WHERE id=? AND user_id=? AND status IN ('Menunggu Rekomendasi','Menunggu HR')`, [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Keterangan tidak dapat dibatalkan');
    return { pesan: 'Keterangan dibatalkan' };
  },

  /* ---------- lembur, ganti shift, libur ---------- */
  async pengajuan_ajukan(m) {
    const u = await need();
    const jenis = s(m, 'jenis');
    if (!['ganti_shift', 'libur', 'lembur'].includes(jenis)) gagal('Jenis pengajuan tidak sah');
    const tgl = s(m, 'tanggal');
    if (!POLA_TGL.test(tgl)) gagal('Tanggal tidak sah');
    const alasan = s(m, 'alasan');
    if (alasan === '') gagal('Alasan wajib diisi');
    const hariIni = tglWIB();
    if (jenis !== 'lembur' && tgl < hariIni) gagal('Tanggal yang sudah lewat tidak bisa diajukan');
    if (jenis === 'lembur' && tgl < tambahHari(hariIni, -7)) gagal('Lembur hanya bisa diajukan untuk 7 hari terakhir ke depan');
    if (jenis !== 'lembur' && (await sudahAdaAbsensi(u.id, tgl))) gagal('Tanggal itu sudah terlanjur diabsen — hubungi HC untuk koreksi manual');

    let tgl2: string | null = null, shiftId: number | null = null, jamA: string | null = null, jamB: string | null = null, menit = 0, sesudah = '';
    const sebelum = await namaJadwal(await nilaiJadwal(u, tgl));
    if (jenis === 'ganti_shift') {
      if (u.jam_mode !== 'shift') gagal('Ganti shift hanya untuk karyawan bermode Shift');
      shiftId = i(m, 'shiftId');
      const sh = await shiftById(shiftId);
      if (!sh) gagal('Shift yang diminta tidak ditemukan');
      if (sh.aktif !== 1) gagal('Shift itu sedang nonaktif');
      sesudah = sh.nama;
      if (sebelum === sesudah) gagal('Shift yang diminta sama dengan jadwal Anda saat ini');
    } else if (jenis === 'libur') {
      sesudah = 'LIBUR';
      if (sebelum === 'LIBUR') gagal('Tanggal itu memang sudah libur');
      const t2 = s(m, 'tanggal2');
      if (t2 !== '') {
        if (!POLA_TGL.test(t2)) gagal('Tanggal pengganti tidak sah');
        if (t2 < hariIni) gagal('Tanggal pengganti sudah lewat');
        if (t2 === tgl) gagal('Tanggal pengganti tidak boleh sama');
        if (await sudahAdaAbsensi(u.id, t2)) gagal('Tanggal pengganti sudah terlanjur diabsen');
        tgl2 = t2;
      }
    } else {
      jamA = s(m, 'jamMulai'); jamB = s(m, 'jamSelesai');
      if (!POLA_JAM.test(jamA) || !POLA_JAM.test(jamB)) gagal('Jam lembur tidak sah');
      let d = Math.round((epoch('2000-01-01', jamB) - epoch('2000-01-01', jamA)) / 60);
      if (d <= 0) d += 1440;
      if (d > 720) gagal('Durasi lembur tidak wajar (maksimal 12 jam)');
      menit = d; jamA += ':00'; jamB += ':00';
      sesudah = 'Lembur ' + jamTeks(menit);
    }
    const ada = await q1(`SELECT id FROM pengajuan WHERE user_id=? AND tanggal=? AND jenis=?
      AND status IN ('Menunggu Rekomendasi','Menunggu HR')`, [u.id, tgl, jenis]);
    if (ada) gagal('Sudah ada pengajuan sejenis yang masih berjalan untuk tanggal itu');
    const status = (await perluRekomendasi(u)) ? 'Menunggu Rekomendasi' : 'Menunggu HR';
    await exec(`INSERT INTO pengajuan (user_id,jenis,tanggal,tanggal2,shift_id,jam_mulai,jam_selesai,menit,alasan,status,jadwal_sebelum,jadwal_sesudah)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [u.id, jenis, tgl, tgl2, shiftId, jamA, jamB, menit, alasan, status, sebelum, sesudah]);
    await logAksi(u.id, 'ajukan_' + jenis, tgl);
    return { pesan: 'Pengajuan terkirim. Menunggu keputusan HC.' };
  },
  async pengajuan_saya() {
    const u = await need();
    const l = await q(`SELECT p.*, u.nama, u.nik FROM pengajuan p JOIN users u ON u.id=p.user_id
      WHERE p.user_id=? ORDER BY p.id DESC LIMIT 60`, [u.id]);
    return Promise.all(l.map(pengajuanRow));
  },
  async pengajuan_batal(m) {
    const u = await need();
    const r = await exec(`UPDATE pengajuan SET status='Dibatalkan'
      WHERE id=? AND user_id=? AND status IN ('Menunggu Rekomendasi','Menunggu HR')`, [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Pengajuan tidak dapat dibatalkan');
    return { pesan: 'Pengajuan dibatalkan' };
  },
};
