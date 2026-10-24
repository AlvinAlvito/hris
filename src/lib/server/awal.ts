import { me } from '@/lib/aturan';
import { userPublik } from '@/lib/format';
import { jalankanDalamKonteks } from '@/lib/konteks';
import { settingsPublik } from '@/lib/pengaturan';

/* Data awal untuk halaman yang dirender di server: pengguna yang masuk & pengaturan publik */
export async function dataAwal() {
  return jalankanDalamKonteks({ ip: '', ua: '' }, async () => {
    const u = await me();
    return { me: u ? await userPublik(u) : null, settings: await settingsPublik() };
  });
}
