import { PenyediaAplikasi } from '@/components/Aplikasi';
import { dataAwal } from '@/lib/server/awal';
import { HalamanTes } from './HalamanTes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tes Seleksi · Yayasan Pendidikan Posi', robots: { index: false, follow: false } };

/* Tes seleksi pelamar lewat tautan bertoken (/rekrutmen/tes?t=...), tanpa login */
export default async function Halaman({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const awal = await dataAwal(), sp = await searchParams;
  const token = String(Array.isArray(sp.t) ? sp.t[0] : sp.t ?? '');
  return (
    <PenyediaAplikasi awal={{ me: null, settings: awal.settings }}>
      <HalamanTes token={token} />
    </PenyediaAplikasi>
  );
}
