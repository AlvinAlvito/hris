/* Kotak persetujuan: satu tempat melihat semua yang menunggu tindakan, sesuai peran */
import { nilai } from '@/lib/db';
import { idTimAtasan, inList, isAdminUp, isAtasanRole, need } from '@/lib/aturan';
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
    if (isAdminUp(u)) {
      // semua pengajuan diputus HC / Super Admin, kecuali milik sendiri
      tambah('cuti', 'Pengajuan cuti', await n("SELECT COUNT(*) FROM cuti WHERE status='Menunggu' AND user_id<>?", [me]), 'plane', 'cuti');
      tambah('pengajuan', 'Lembur, ganti shift & libur', await n("SELECT COUNT(*) FROM pengajuan WHERE status='Menunggu HR' AND user_id<>?", [me]), 'repeat', 'persetujuan:pengajuan');
      tambah('tukar', 'Tukar jadwal', await n("SELECT COUNT(*) FROM tukar_jadwal WHERE status='Menunggu HR'"), 'arrow-left-right', 'persetujuan:tukar');
      tambah('ket', 'Izin, sakit, WFH & dinas', await n("SELECT COUNT(*) FROM ketidakhadiran WHERE status='Menunggu HR' AND user_id<>?", [me]), 'file-heart', 'persetujuan:ket');
      tambah('rb_hr', 'Reimburse — verifikasi HC', await n("SELECT COUNT(*) FROM reimburse WHERE status='Menunggu HR' AND user_id<>?", [me]), 'receipt', 'reimburse');
      tambah('ks_hr', 'Kasbon — verifikasi HC', await n("SELECT COUNT(*) FROM kasbon WHERE status='Menunggu HR' AND user_id<>?", [me]), 'wallet', 'kasbon');
      tambah('lupa', 'Lupa clock out', await n('SELECT COUNT(*) FROM absensi WHERE in_time IS NOT NULL AND out_time IS NULL AND lupa_out=1'), 'clock-alert', 'absensi');
      tambah('kontrak', 'Kontrak berakhir ≤ 30 hari', await n(`SELECT COUNT(*) FROM users WHERE aktif=1 AND kontrak_selesai IS NOT NULL
        AND kontrak_selesai <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`), 'file-clock', 'karyawan');
      tambah('rb_fin', 'Reimburse — persetujuan bayar', await n("SELECT COUNT(*) FROM reimburse WHERE status='Menunggu Finance' AND user_id<>?", [me]), 'badge-check', 'reimburse');
      tambah('rb_transfer', 'Reimburse menunggu transfer', await n("SELECT COUNT(*) FROM reimburse WHERE status='Disetujui' AND metode_bayar='transfer'"), 'banknote', 'reimburse');
      tambah('ks_fin', 'Kasbon — pencairan HC', await n("SELECT COUNT(*) FROM kasbon WHERE status='Menunggu Finance' AND user_id<>?", [me]), 'hand-coins', 'kasbon');
      tambah('payroll', 'Payroll draf menunggu final', await n("SELECT COUNT(*) FROM payroll_periode WHERE status='draft'"), 'calculator', 'payroll');
    }
    if (isAtasanRole(u)) {
      const tim = inList(await idTimAtasan(u));
      const jml = (await n(`SELECT COUNT(*) FROM pengajuan WHERE status='Menunggu Rekomendasi' AND user_id IN (${tim})`))
        + (await n(`SELECT COUNT(*) FROM ketidakhadiran WHERE status='Menunggu Rekomendasi' AND user_id IN (${tim})`))
        + (await n(`SELECT COUNT(*) FROM tukar_jadwal WHERE status='Menunggu Rekomendasi' AND pemohon_id IN (${tim})`));
      tambah('rekomendasi', 'Menunggu rekomendasi Anda', jml, 'user-check', 'setuju');
    }
    tambah('rekan', 'Permintaan tukar dari rekan', await n("SELECT COUNT(*) FROM tukar_jadwal WHERE status='Menunggu Rekan' AND rekan_id=?", [me]), 'users', 'jadwal');
    return { item: item.filter((x) => x.jumlah > 0), semua: item, total: item.reduce((a, x) => a + x.jumlah, 0) };
  },
};
