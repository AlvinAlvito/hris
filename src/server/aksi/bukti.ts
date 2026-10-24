import { gagal, s } from '@/lib/http';
import { simpanBerkas } from '@/lib/berkasPrivat';
import type { User } from '@/lib/aturan';

export function validasiLinkBukti(m: Record<string, any>): string {
  const link = s(m, 'buktiLink').trim();
  if (link) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol)) gagal('Tautan bukti harus menggunakan http atau https');
    } catch { gagal('Format tautan bukti tidak valid'); }
    if (link.length > 1000) gagal('Tautan bukti terlalu panjang');
  }
  return link;
}

export async function simpanBuktiPengajuan(m: Record<string, any>, u: User, kategori: string, refId: number): Promise<string> {
  const link = validasiLinkBukti(m);
  const file = m.buktiFile;
  let fileUrl = '';
  if (file != null) {
    if (typeof file !== 'object' || typeof file.data !== 'string') gagal('Berkas bukti tidak valid');
    const id = await simpanBerkas(file.data, u.id, kategori, refId, 'Bukti pengajuan', String(file.nama ?? 'bukti'), u.id);
    fileUrl = '/api/dok_unduh?id=' + id;
  }
  return link || fileUrl;
}
