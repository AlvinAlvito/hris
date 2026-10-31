import { NextResponse } from 'next/server';
import { AKSI } from '@/server/daftar';
import { Gagal } from '@/lib/http';
import { jalankanDalamKonteks } from '@/lib/konteks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Satu pintu API: POST /api/<aksi> dengan isi JSON.
   Jawaban: {ok:true,data} atau {ok:false,error}. Hasil berupa Response (unduhan berkas) diteruskan apa adanya. */
async function tangani(req: Request, aksi: string, masukan: Record<string, any>) {
  const fn = AKSI[aksi];
  if (!fn) return NextResponse.json({ ok: false, error: 'Aksi tidak dikenal: ' + aksi }, { status: 404 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  try {
    const data = await jalankanDalamKonteks({ ip, ua: req.headers.get('user-agent') ?? '' }, () => fn(masukan, req));
    if (data instanceof Response) return data;
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Gagal) return NextResponse.json({ ok: false, error: e.message }, { status: e.kode });
    console.error('HRIS [' + aksi + ']', e);
    const db = typeof e === 'object' && e && 'sqlMessage' in e;
    return NextResponse.json({ ok: false, error: db ? 'Kesalahan database. Hubungi admin sistem.' : 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ aksi: string }> }) {
  const { aksi } = await ctx.params;
  let masukan: Record<string, any> = {};
  try { const j = await req.json(); if (j && typeof j === 'object') masukan = j; } catch { /* isi kosong */ }
  return tangani(req, aksi, masukan);
}
/* GET hanya untuk aksi baca yang dibuka langsung di browser (manifest PWA, unduh dokumen) —
   aksi yang mengubah data tidak boleh bisa dipicu lewat tautan biasa. */
const BOLEH_GET = new Set(['br_manifest', 'dok_unduh', 'bootstrap', 'rk_cv']);
export async function GET(req: Request, ctx: { params: Promise<{ aksi: string }> }) {
  const { aksi } = await ctx.params;
  if (!BOLEH_GET.has(aksi)) return NextResponse.json({ ok: false, error: 'Gunakan POST' }, { status: 405 });
  return tangani(req, aksi, Object.fromEntries(new URL(req.url).searchParams));
}
