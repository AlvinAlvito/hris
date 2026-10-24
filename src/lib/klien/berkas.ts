'use client';
/* Membaca berkas dari input di browser. Foto dikompres di HP sebelum dikirim (hemat kuota). */
export interface BerkasDibaca { nama: string; data: string; jenis: 'pdf' | 'foto' }

export function bacaBerkas(file: File | undefined, maxDim = 1600): Promise<BerkasDibaca> {
  return new Promise((ok, gagal) => {
    if (!file) return gagal(new Error('Tidak ada berkas'));
    if (file.size > 12 * 1024 * 1024) return gagal(new Error('Berkas lebih dari 12 MB'));
    const fr = new FileReader();
    fr.onerror = () => gagal(new Error('Gagal membaca berkas'));
    if (file.type === 'application/pdf') {
      if (file.size > 5 * 1024 * 1024) return gagal(new Error('PDF maksimal 5 MB'));
      fr.onload = () => ok({ nama: file.name, data: String(fr.result), jenis: 'pdf' });
      fr.readAsDataURL(file);
      return;
    }
    if (!/^image\//.test(file.type)) return gagal(new Error('Gunakan foto (JPG/PNG) atau PDF'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, maxDim / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        const c = cv.getContext('2d')!; c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
        ok({ nama: file.name.replace(/\.\w+$/, '') + '.jpg', data: cv.toDataURL('image/jpeg', 0.82), jenis: 'foto' });
      };
      img.onerror = () => gagal(new Error('Gambar tidak dapat dibaca'));
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
/* logo / favicon: transparansi dipertahankan */
export function berkasPng(file: File | undefined, maxDim: number): Promise<string> {
  return new Promise((ok, gagal) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return gagal(new Error('Gunakan gambar PNG, JPG, atau WebP'));
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, maxDim / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL('image/png'));
      };
      img.onerror = () => gagal(new Error('Gambar tidak dapat dibaca'));
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
