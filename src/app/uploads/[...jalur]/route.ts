import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { folderPenyimpanan, jalurAman, MIME } from '@/lib/berkas';
import { sesi } from '@/lib/sesi';

export const runtime = 'nodejs';

/* Foto absensi & foto profil — hanya untuk pengguna yang sudah masuk */
export async function GET(_req: Request, ctx: { params: Promise<{ jalur: string[] }> }) {
  if (!(await sesi()).uid) return new Response('Silakan masuk terlebih dahulu', { status: 401 });
  const { jalur } = await ctx.params;
  const p = jalurAman(folderPenyimpanan('uploads'), jalur.join('/'));
  const mime = p ? MIME[path.extname(p).toLowerCase()] : undefined;
  if (!p || !mime || mime === 'application/pdf') return new Response('Tidak ditemukan', { status: 404 });
  try {
    return new Response(new Uint8Array(await readFile(p)), {
      headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch { return new Response('Tidak ditemukan', { status: 404 }); }
}
