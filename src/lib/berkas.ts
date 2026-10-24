import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { gagal } from './http';
import { sekarangSql } from './waktu';

/* Folder penyimpanan di luar folder public: uploads (foto absensi & avatar),
   private (dokumen & nota), brand (logo & favicon). */
export function folderPenyimpanan(sub: 'uploads' | 'private' | 'brand'): string {
  return path.resolve(process.env.STORAGE_DIR || './storage', sub);
}
/* cegah path traversal: hasil harus tetap di dalam folder dasar */
export function jalurAman(dasar: string, relatif: string): string | null {
  const p = path.resolve(dasar, relatif);
  return p.startsWith(dasar + path.sep) ? p : null;
}

export function dataUrlKeBuffer(dataUrl: string, jenis: RegExp): { buf: Buffer; mime: string } {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m || !jenis.test(m[1])) gagal('Format berkas tidak sah');
  return { buf: Buffer.from(m[2], 'base64'), mime: m[1].toLowerCase() };
}
export function jpegSah(buf: Buffer): boolean { return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff; }
export function pngSah(buf: Buffer): boolean { return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); }

/* Foto absensi: JPEG langsung dari kamera, maks 3 MB, disimpan per bulan */
export async function simpanFoto(dataUrl: string, uid: number, tag: string): Promise<string> {
  const { buf } = dataUrlKeBuffer(dataUrl, /^image\/jpeg$/);
  if (buf.length > 3 * 1024 * 1024) gagal('Ukuran foto terlalu besar');
  if (!jpegSah(buf)) gagal('File bukan foto JPEG yang sah');
  const waktu = sekarangSql().replace(/[-: ]/g, '');
  const sub = sekarangSql().slice(0, 7);
  const nama = `${sub}/${uid}_${waktu.slice(0, 8)}_${waktu.slice(8)}_${tag}_${randomBytes(3).toString('hex')}.jpg`;
  const dir = path.join(folderPenyimpanan('uploads'), sub);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(folderPenyimpanan('uploads'), nama), buf);
  return nama;
}

export const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
};
