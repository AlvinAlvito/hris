/* Daftar semua aksi API: nama aksi => fungsi penangan.
   Nama aksi sama dengan versi PHP (login, absen, kr_import, lap_harian, …). */
import type { Masukan } from '@/lib/http';

export type Penangan = (m: Masukan, req: Request) => Promise<unknown>;
export type KumpulanAksi = Record<string, Penangan>;

import { aksiAuth } from './aksi/auth';
import { aksiAbsen } from './aksi/absen';
import { aksiPengajuan } from './aksi/pengajuan';
import { aksiInfo } from './aksi/informasi';
import { aksiInbox } from './aksi/inbox';
import { aksiBranding } from './aksi/branding';
import { aksiPersetujuan } from './aksi/persetujuan';
import { aksiJadwal } from './aksi/jadwal';
import { aksiAdmin } from './aksi/admin';
import { aksiKaryawan } from './aksi/karyawan';
import { aksiDashboard } from './aksi/dashboard';
import { aksiLaporan } from './aksi/laporan';
import { aksiReimburse } from './aksi/reimburse';
import { aksiKasbon } from './aksi/kasbon';
import { aksiPayroll } from './aksi/payroll';

export const AKSI: KumpulanAksi = {
  ...aksiAuth, ...aksiAbsen, ...aksiPengajuan, ...aksiInfo, ...aksiInbox, ...aksiBranding,
  ...aksiPersetujuan, ...aksiJadwal, ...aksiAdmin, ...aksiKaryawan, ...aksiDashboard, ...aksiLaporan, ...aksiReimburse, ...aksiKasbon, ...aksiPayroll,
};
