/* Dijalankan Next.js sekali saat server mulai: menyalakan penjadwal pengingat absen.
   Pola resmi Next.js: impor hanya di dalam cabang NEXT_RUNTIME === 'nodejs' agar tidak ikut dibundel untuk runtime edge
   (web-push membutuhkan modul Node seperti http). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.PENGINGAT_MATI === '1') return;
    const { mulaiPengingat } = await import('./server/pengingat');
    mulaiPengingat();
  }
}
