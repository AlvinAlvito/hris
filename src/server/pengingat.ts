/* Pengingat absen otomatis — berjalan tiap menit di proses server (dimulai dari src/instrumentation.ts).
   - Clock in : sejak 5 menit sebelum jam masuk, bila belum clock in (jendela susulan 30 menit bila server sempat mati)
   - Clock out: sejak 5 menit sebelum jam pulang, bila sudah clock in tetapi belum clock out (jendela 60 menit)
   Tidak dikirim saat libur, cuti / izin (selain WFH, dinas, setengah hari) yang disetujui, atau pola jam fleksibel.
   Kunci notifikasi per orang per hari mencegah pengingat ganda. */
import { q } from '@/lib/db';
import { jalankanDalamKonteks } from '@/lib/konteks';
import { KET_TETAP_KERJA } from '@/lib/aturan';
import { jadwalAbsen } from '@/lib/absensiHitung';
import { kirimNotif } from '@/lib/notifikasi';
import { epoch, jamWIB, tglWIB } from '@/lib/waktu';

const SEBELUM = 5 * 60, SUSUL_IN = 30 * 60, SUSUL_OUT = 60 * 60;

export async function periksaPengingat(): Promise<void> {
  const tgl = tglWIB(), kini = epoch(tgl, jamWIB());
  const users = await q("SELECT * FROM users WHERE aktif=1 AND role<>'direktur' AND jam_mode<>'fleksibel' AND tgl_masuk<=?", [tgl]);
  if (!users.length) return;
  const abs = new Map((await q('SELECT user_id, in_time, out_time FROM absensi WHERE tanggal=?', [tgl])).map((a) => [a.user_id as number, a]));
  const cuti = new Set((await q("SELECT user_id FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [tgl, tgl])).map((x) => x.user_id as number));
  const izin = new Set((await q(`SELECT user_id FROM ketidakhadiran WHERE tanggal=? AND status='Disetujui'
    AND jenis NOT IN (${KET_TETAP_KERJA.map((k) => `'${k}'`).join(',')})`, [tgl])).map((x) => x.user_id as number));
  for (const u of users) {
    if (cuti.has(u.id) || izin.has(u.id) || (u.tgl_keluar && u.tgl_keluar < tgl)) continue;
    const a = abs.get(u.id);
    if (a?.in_time && a?.out_time) continue;
    const j = await jadwalAbsen(u, tgl);
    if (j.jd.libur || !j.jadwalIn || !j.jadwalOut) continue;
    const masuk = epoch(tgl, j.jadwalIn), pulang = epoch(tgl, j.jadwalOut);
    const jm = (t: string) => String(t).slice(0, 5);
    if (!a?.in_time && kini >= masuk - SEBELUM && kini < masuk + SUSUL_IN) {
      await kirimNotif([u.id], { jenis: 'pengingat', kunci: `ingat-in:${tgl}`, tautan: '/beranda',
        judul: kini < masuk ? `Jangan lupa clock in — ${jm(j.jadwalIn)}` : 'Anda belum clock in hari ini',
        isi: kini < masuk ? `Jam masuk Anda pukul ${jm(j.jadwalIn)}. Buka aplikasi lalu tekan Clock In.`
          : `Jam masuk ${jm(j.jadwalIn)} sudah lewat. Segera clock in, atau ajukan Izin Terlambat / Lupa Clock In.` });
    } else if (a?.in_time && !a.out_time && kini >= pulang - SEBELUM && kini < pulang + SUSUL_OUT) {
      await kirimNotif([u.id], { jenis: 'pengingat', kunci: `ingat-out:${tgl}`, tautan: '/beranda',
        judul: `Jangan lupa clock out — ${jm(j.jadwalOut)}`,
        isi: `Jam pulang Anda pukul ${jm(j.jadwalOut)}. Tekan Clock Out sebelum meninggalkan kantor.` });
    }
  }
}

/* satu penjadwal per proses (aman terhadap hot reload saat pengembangan) */
export function mulaiPengingat(): void {
  const g = globalThis as unknown as { __posiPengingat?: NodeJS.Timeout };
  if (g.__posiPengingat) return;
  let jalan = false;
  const tick = async () => {
    if (jalan) return;
    jalan = true;
    try { await jalankanDalamKonteks({ ip: '', ua: '' }, periksaPengingat); }
    catch (e) { console.error('[pengingat]', e); }
    finally { jalan = false; }
  };
  g.__posiPengingat = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
  console.log('[pengingat] penjadwal pengingat absen aktif');
}
