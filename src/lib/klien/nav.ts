import type { Me } from '@/components/Aplikasi';

export interface ItemNav {
  k: string; href: string; t: string; ic: string; g: string; cnt?: 'total' | 'rekomendasi';
  s: (m: Me) => boolean;
  siap: boolean;   // halaman sudah tersedia di versi Next.js
}
const adm = (m: Me) => m.role === 'admin' || m.role === 'direktur';
const bukanDir = (m: Me) => m.role !== 'direktur';

export const NAV: ItemNav[] = [
  { k: 'beranda', href: '/beranda', t: 'Beranda', ic: 'house', g: 'Saya', s: bukanDir, siap: true },
  { k: 'jadwal', href: '/jadwal', t: 'Jadwal', ic: 'calendar-days', g: 'Saya', s: bukanDir, siap: true },
  { k: 'ajuan', href: '/pengajuan', t: 'Pengajuan', ic: 'send', g: 'Saya', s: bukanDir, siap: true },
  { k: 'slip', href: '/slip', t: 'Slip Gaji', ic: 'banknote', g: 'Saya', s: bukanDir, siap: true },
  { k: 'riwayat', href: '/riwayat', t: 'Riwayat Absen', ic: 'history', g: 'Saya', s: bukanDir, siap: true },
  { k: 'dash', href: '/dashboard', t: 'Dashboard', ic: 'layout-dashboard', g: 'Kelola', s: adm, siap: true },
  { k: 'inbox', href: '/persetujuan', t: 'Persetujuan', ic: 'inbox', g: 'Kelola', s: adm, cnt: 'total', siap: true },
  { k: 'kar', href: '/karyawan', t: 'Karyawan', ic: 'users', g: 'SDM', s: adm, siap: true },
  { k: 'org', href: '/organisasi', t: 'Struktur Organisasi', ic: 'network', g: 'SDM', s: () => true, siap: true },
  { k: 'cab', href: '/lokasi', t: 'Lokasi Kerja', ic: 'map-pin', g: 'SDM', s: adm, siap: true },
  { k: 'abs', href: '/absensi', t: 'Rekap Absensi', ic: 'fingerprint', g: 'Waktu Kerja', s: adm, siap: true },
  { k: 'shf', href: '/shift', t: 'Shift & Jadwal', ic: 'calendar', g: 'Waktu Kerja', s: adm, siap: true },
  { k: 'cut', href: '/cuti', t: 'Cuti', ic: 'plane', g: 'Waktu Kerja', s: adm, siap: true },
  { k: 'lapabs', href: '/laporan/absensi', t: 'Laporan Absensi', ic: 'file-spreadsheet', g: 'Laporan', s: adm, siap: true },
  { k: 'lapcuti', href: '/laporan/cuti', t: 'Laporan Cuti', ic: 'list-checks', g: 'Laporan', s: adm, siap: true },
  { k: 'rbadm', href: '/reimburse', t: 'Reimburse', ic: 'receipt', g: 'Keuangan', s: adm, siap: true },
  { k: 'ksadm', href: '/kasbon', t: 'Kasbon', ic: 'hand-coins', g: 'Keuangan', s: adm, siap: true },
  { k: 'pay', href: '/payroll', t: 'Payroll', ic: 'calculator', g: 'Keuangan', s: adm, siap: true },
  { k: 'info', href: '/informasi', t: 'Pengumuman & Libur', ic: 'megaphone', g: 'Informasi', s: () => true, siap: true },
  { k: 'set', href: '/pengaturan', t: 'Pengaturan', ic: 'settings', g: 'Sistem', s: adm, siap: true },
  { k: 'profil', href: '/profil', t: 'Profil Saya', ic: 'user', g: 'Akun', s: () => true, siap: true },
];

export const navTerlihat = (m: Me) => NAV.filter((n) => n.siap && n.s(m));
export const berandaAwal = (m: Me) => (m.role === 'direktur' ? (NAV.find((n) => n.k === 'dash')?.siap ? '/dashboard' : '/profil') : '/beranda');

/* menu bawah (HP): dua kiri, satu tombol bulat di tengah, satu kanan, lalu "Menu" */
export function urutanBawah(m: Me) {
  const vis = navTerlihat(m).map((n) => n.k);
  const tengah = vis.includes('dash') ? 'dash' : 'beranda';
  const lain = ['beranda', 'inbox', 'ajuan', 'jadwal', 'slip', 'riwayat', 'kar', 'pay', 'info'].filter((k) => k !== tengah && vis.includes(k)).slice(0, 3);
  return { tengah, urut: [...lain.slice(0, 2), tengah, ...lain.slice(2)].map((k) => NAV.find((n) => n.k === k)!) };
}
