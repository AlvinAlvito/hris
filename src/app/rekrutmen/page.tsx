import { PenyediaAplikasi } from '@/components/Aplikasi';
import { dataAwal } from '@/lib/server/awal';
import { PortalRekrutmen } from './PortalRekrutmen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Karier · Yayasan Pendidikan Posi', description: 'Lowongan kerja Yayasan Pendidikan Posi — kirim lamaran Anda secara online.', robots: { index: true, follow: true } };

/* Portal lowongan publik: tanpa login. Pengguna yang sedang login tetap bisa membukanya. */
export default async function HalamanRekrutmen() {
  const awal = await dataAwal();
  return (
    <PenyediaAplikasi awal={{ me: null, settings: awal.settings }}>
      <PortalRekrutmen />
    </PenyediaAplikasi>
  );
}
