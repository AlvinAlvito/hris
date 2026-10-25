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
import { aksiAdmin } from './aksi/admin';
import { aksiKaryawan } from './aksi/karyawan';
import { aksiDashboard } from './aksi/dashboard';
import { aksiLaporan } from './aksi/laporan';
import { aksiPayroll } from './aksi/payroll';
import { aksiOrganisasi } from './aksi/organisasi';
import { aksiRekap } from './aksi/rekap';

export const AKSI: KumpulanAksi = {
  ...aksiAuth, ...aksiAbsen, ...aksiPengajuan, ...aksiInfo, ...aksiInbox, ...aksiBranding,
  ...aksiPersetujuan, ...aksiAdmin, ...aksiKaryawan, ...aksiDashboard, ...aksiLaporan, ...aksiPayroll, ...aksiOrganisasi, ...aksiRekap,
};
