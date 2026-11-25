/* Pengingat pajak kendaraan untuk HC & Super Admin: H-30, H-7, dan hari jatuh tempo (atau lewat).
   Dipanggil dari penjadwal pengingat (server/pengingat.ts) setiap 15 menit pada jam kerja.
   Kunci notifikasi per kendaraan per jatuh tempo per tahap → tiap tahap terkirim sekali, tetap terkirim walau server sempat mati di hari H. */
import { q } from './db';
import { kirimNotif } from './notifikasi';
import { jamWIB, tglWIB } from './waktu';

const TAHAP: [number, string][] = [[0, 'h0'], [7, 'h7'], [30, 'h30']];

export async function periksaPajakKendaraan(paksa = false): Promise<void> {
  const jam = jamWIB().slice(0, 5);
  if (!paksa && (jam < '08:00' || jam > '17:00' || Number(jam.slice(3)) % 15 !== 0)) return;
  const hariIni = tglWIB();
  const l = await q("SELECT id, jenis, brand, merk, plat, tgl_pajak FROM aset_kendaraan WHERE aktif=1 AND tgl_pajak IS NOT NULL AND tgl_pajak <= DATE_ADD(?, INTERVAL 30 DAY)", [hariIni]);
  if (!l.length) return;
  const penerima = (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
  if (!penerima.length) return;
  for (const k of l) {
    const sisa = Math.round((Date.parse(k.tgl_pajak + 'T00:00:00Z') - Date.parse(hariIni + 'T00:00:00Z')) / 864e5);
    const tahap = TAHAP.find(([batas]) => sisa <= batas);   // tahap paling mendesak yang sudah tercapai
    if (!tahap) continue;
    const tgl = String(k.tgl_pajak).split('-').reverse().join('/'), nama = `${k.jenis === 'mobil' ? 'Mobil' : 'Motor'} ${k.brand} ${k.merk}`.trim();
    await kirimNotif(penerima, {
      jenis: 'aset', kunci: `pajak:${k.id}:${k.tgl_pajak}:${tahap[1]}`, tautan: '/aset',
      judul: sisa < 0 ? `Pajak ${k.plat} lewat jatuh tempo` : sisa === 0 ? `Pajak ${k.plat} jatuh tempo hari ini` : `Pajak ${k.plat} jatuh tempo ${sisa} hari lagi`,
      isi: `${nama} (${k.plat}) — jatuh tempo pajak ${tgl}${sisa < 0 ? `, sudah lewat ${-sisa} hari` : ''}. Tandai "Sudah bayar" di menu Aset setelah dibayar.`,
    });
  }
}
