import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { folderPenyimpanan, jalurAman, MIME } from '@/lib/berkas';

export const runtime = 'nodejs';

/* Logo & favicon organisasi — publik (dipakai layar masuk sebelum login) */
export async function GET(_req: Request, ctx: { params: Promise<{ jalur: string[] }> }) {
  const { jalur } = await ctx.params;
  const p = jalurAman(folderPenyimpanan('brand'), jalur.join('/'));
  if (!p || path.extname(p).toLowerCase() !== '.png') return new Response('Tidak ditemukan', { status: 404 });
  try {
    return new Response(new Uint8Array(await readFile(p)), {
      headers: { 'Content-Type': MIME['.png'], 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch { return new Response('Tidak ditemukan', { status: 404 }); }
}
