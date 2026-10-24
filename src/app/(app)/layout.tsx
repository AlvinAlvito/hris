import { redirect } from 'next/navigation';
import { PenyediaAplikasi, type Me } from '@/components/Aplikasi';
import { Shell } from '@/components/Shell';
import { dataAwal } from '@/lib/server/awal';

export const dynamic = 'force-dynamic';

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const awal = await dataAwal();
  if (!awal.me) redirect('/masuk');
  return (
    <PenyediaAplikasi awal={{ me: awal.me as Me, settings: awal.settings }}>
      <Shell>{children}</Shell>
    </PenyediaAplikasi>
  );
}
