/* Pengingat pajak tahunan & STNK 5 tahunan kendaraan untuk HC & Super Admin: H-30, H-7, dan hari jatuh tempo (atau lewat).
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
  const l = await q(`SELECT id, jenis, brand, merk, plat, tgl_pajak, tgl_stnk FROM aset_kendaraan WHERE aktif=1
    AND (tgl_pajak <= DATE_ADD(?, INTERVAL 30 DAY) OR tgl_stnk <= DATE_ADD(?, INTERVAL 30 DAY))`, [hariIni, hariIni]);
  if (!l.length) return;
  const penerima = (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
  if (!penerima.length) return;
  for (const k of l) for (const [kolom, label, kunci, aksi] of [['tgl_pajak', 'Pajak', 'pajak', 'Sudah bayar'], ['tgl_stnk', 'STNK 5 tahunan', 'stnk', 'STNK diperpanjang']] as const) {
    if (!k[kolom]) continue;
    const sisa = Math.round((Date.parse(k[kolom] + 'T00:00:00Z') - Date.parse(hariIni + 'T00:00:00Z')) / 864e5);
    const tahap = TAHAP.find(([batas]) => sisa <= batas);   // tahap paling mendesak yang sudah tercapai
    if (!tahap) continue;
    const tgl = String(k[kolom]).split('-').reverse().join('/'), nama = `${k.jenis === 'mobil' ? 'Mobil' : 'Motor'} ${k.brand} ${k.merk}`.trim();
    await kirimNotif(penerima, {
      jenis: 'aset', kunci: `${kunci}:${k.id}:${k[kolom]}:${tahap[1]}`, tautan: '/aset',
      judul: sisa < 0 ? `${label} ${k.plat} lewat jatuh tempo` : sisa === 0 ? `${label} ${k.plat} jatuh tempo hari ini` : `${label} ${k.plat} jatuh tempo ${sisa} hari lagi`,
      isi: `${nama} (${k.plat}) — jatuh tempo ${label.toLowerCase()} ${tgl}${sisa < 0 ? `, sudah lewat ${-sisa} hari` : ''}. Tandai "${aksi}" di menu Aset setelah diurus.`,
    });
  }
}
