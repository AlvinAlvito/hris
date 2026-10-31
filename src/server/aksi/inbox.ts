/* Kotak persetujuan: satu tempat melihat semua yang menunggu tindakan, sesuai peran.
   HC / Super Admin melihat seluruh karyawan; Supervisor hanya tim di bawahnya. */
import { nilai } from '@/lib/db';
import { cakupanTim, isAdminUp, isAtasanRole, need, sqlCakupan } from '@/lib/aturan';
import type { KumpulanAksi } from '../daftar';

interface Item { kunci: string; judul: string; jumlah: number; ikon: string; tujuan: string; ket: string }

export const aksiInbox: KumpulanAksi = {
  async inbox_ringkas() {
    const u = await need();
    const n = async (sql: string, p: unknown[] = []) => Number((await nilai(sql, p)) ?? 0);
    const item: Item[] = [];
    const tambah = (kunci: string, judul: string, jumlah: number, ikon: string, tujuan: string, ket = '') =>
      item.push({ kunci, judul, jumlah, ikon, tujuan, ket });
    const me = u.id;
    if (isAdminUp(u) || isAtasanRole(u)) {
      // pengajuan diputus atasan berwenang, kecuali milik sendiri
      const tim = await cakupanTim(u), c = (kolom: string) => sqlCakupan(tim, kolom);
      tambah('cuti', 'Pengajuan cuti', await n(`SELECT COUNT(*) FROM cuti WHERE status='Menunggu' AND user_id<>?${c('user_id')}`, [me]), 'plane', 'cuti');
      tambah('pengajuan', 'Lembur, lupa absen & izin terlambat', await n(`SELECT COUNT(*) FROM pengajuan WHERE status IN ('Menunggu HR','Menunggu Rekomendasi')
        AND jenis IN ('lembur','lupa_in','lupa_out','izin_telat') AND user_id<>?${c('user_id')}`, [me]), 'clock', 'persetujuan:pengajuan');
      tambah('ket', 'Izin, sakit, WFH & dinas', await n(`SELECT COUNT(*) FROM ketidakhadiran WHERE status IN ('Menunggu HR','Menunggu Rekomendasi')
        AND user_id<>?${c('user_id')}`, [me]), 'file-heart', 'persetujuan:ket');
      tambah('absen', 'Absensi menunggu approval (31 hari)', await n(`SELECT COUNT(*) FROM absensi WHERE approval='menunggu' AND in_time IS NOT NULL
        AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 31 DAY) AND user_id<>?${c('user_id')}`, [me]), 'fingerprint', 'absensi');
      tambah('kpi', 'Laporan KPI menunggu verifikasi', await n(`SELECT COUNT(*) FROM kpi_lapor WHERE status='diajukan' AND user_id<>?${c('user_id')}`, [me]), 'target', 'kelola-kpi');
      tambah('lupa', 'Lupa clock out', await n(`SELECT COUNT(*) FROM absensi WHERE in_time IS NOT NULL AND out_time IS NULL AND lupa_out=1${c('user_id')}`), 'clock-alert', 'absensi');
    }
    if (isAdminUp(u)) {
      tambah('kontrak', 'Kontrak berakhir ≤ 30 hari', await n(`SELECT COUNT(*) FROM users WHERE aktif=1 AND kontrak_selesai IS NOT NULL
        AND kontrak_selesai <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`), 'file-clock', 'karyawan');
      tambah('payroll', 'Payroll draf menunggu final', await n("SELECT COUNT(*) FROM payroll_periode WHERE status='draft'"), 'calculator', 'payroll');
      tambah('rekrutmen', 'Lamaran baru belum ditinjau', await n("SELECT COUNT(*) FROM lamaran WHERE tahap='baru'"), 'user-plus', 'kelola-rekrutmen');
    }
    return { item: item.filter((x) => x.jumlah > 0), semua: item, total: item.reduce((a, x) => a + x.jumlah, 0) };
  },
};
