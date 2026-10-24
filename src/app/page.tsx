import { redirect } from 'next/navigation';
import type { Me } from '@/components/Aplikasi';
import { berandaAwal } from '@/lib/klien/nav';
import { dataAwal } from '@/lib/server/awal';

export const dynamic = 'force-dynamic';

export default async function Akar() {
  const { me } = await dataAwal();
  redirect(me ? berandaAwal(me as Me) : '/masuk');
}
