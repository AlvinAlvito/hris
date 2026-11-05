/* Status & pemicu manual backup ke Google Spreadsheet (HC / Super Admin) */
import { logAksi, need } from '@/lib/aturan';
import { backupAktif, backupBerjalan, bacaStatusBackup, jalankanBackup, SELANG_BACKUP_MS } from '@/lib/backupSheet';
import { gagal } from '@/lib/http';
import { jalankanDalamKonteks } from '@/lib/konteks';
import type { KumpulanAksi } from '../daftar';

export const aksiBackup: KumpulanAksi = {
  async backup_status() {
    await need(['admin']);
    return { aktif: backupAktif(), berjalan: backupBerjalan(), selangJam: SELANG_BACKUP_MS / 3600_000, sheetUrl: process.env.SHEET_BACKUP_SHEET_URL ?? '', status: await bacaStatusBackup() };
  },
  async backup_jalankan() {
    const u = await need(['admin']);
    if (!backupAktif()) gagal('Backup belum dikonfigurasi');
    if (backupBerjalan()) gagal('Backup sedang berjalan');
    await logAksi(u.id, 'backup_spreadsheet', 'manual');
    // bisa lebih lama dari batas tunggu proxy, jadi dijalankan di latar belakang; halaman memantau statusnya
    void jalankanDalamKonteks({ ip: '', ua: '' }, () => jalankanBackup('manual')).catch((e) => console.error('[backup-sheet]', e));
    return { pesan: 'Backup dimulai. Status diperbarui otomatis di halaman ini.' };
  },
};
