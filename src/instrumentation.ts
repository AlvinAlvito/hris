/* Dijalankan Next.js sekali saat server mulai: menyalakan penjadwal pengingat absen */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.PENGINGAT_MATI === '1') return;
  const { mulaiPengingat } = await import('./server/pengingat');
  mulaiPengingat();
}
