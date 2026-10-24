import { redirect } from 'next/navigation';
import type { Me } from '@/components/Aplikasi';
import { PenyediaAplikasi } from '@/components/Aplikasi';
import { berandaAwal } from '@/lib/klien/nav';
import { dataAwal } from '@/lib/server/awal';
import { FormMasuk } from './FormMasuk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Masuk · HRIS POSI' };

export default async function HalamanMasuk() {
  const awal = await dataAwal();
  if (awal.me) redirect(berandaAwal(awal.me as Me));
  return (
    <PenyediaAplikasi awal={{ me: null, settings: awal.settings }}>
      <FormMasuk />
    </PenyediaAplikasi>
  );
}
