/* Pengingat kontrak kerja berakhir: H-30, H-7, dan hari berakhirnya kontrak.
   Penerima: HC & Super Admin, atasan langsung, dan karyawan yang bersangkutan.
   Dipanggil penjadwal pengingat (server/pengingat.ts) tiap 15 menit pada jam kerja; kunci notifikasi per karyawan
   per tanggal kontrak per tahap, jadi tiap tahap terkirim sekali dan kontrak yang diperpanjang mendapat pengingat baru.
   Kontrak yang sudah lewat lebih dari 7 hari tidak diingatkan (menghindari banjir notifikasi untuk data lama). */
import { q } from './db';
import { kirimNotif } from './notifikasi';
import { jamWIB, tglWIB } from './waktu';

const TAHAP: [number, string][] = [[0, 'h0'], [7, 'h7'], [30, 'h30']];
const tglIndo = (t: string) => t.split('-').reverse().join('/');

export async function periksaKontrakBerakhir(paksa = false): Promise<void> {
  const jam = jamWIB().slice(0, 5);
  if (!paksa && (jam < '08:00' || jam > '17:00' || Number(jam.slice(3)) % 15 !== 0)) return;
  const hariIni = tglWIB();
  const l = await q(`SELECT id, nama, jabatan, atasan_id, DATE_FORMAT(kontrak_selesai,'%Y-%m-%d') selesai FROM users
    WHERE aktif=1 AND kontrak_selesai IS NOT NULL AND kontrak_selesai BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND DATE_ADD(?, INTERVAL 30 DAY)`, [hariIni, hariIni]);
  if (!l.length) return;
  const hc = (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
  for (const k of l) {
    const sisa = Math.round((Date.parse(k.selesai + 'T00:00:00Z') - Date.parse(hariIni + 'T00:00:00Z')) / 864e5);
    const tahap = TAHAP.find(([batas]) => sisa <= batas);
    if (!tahap) continue;
    const kapan = sisa < 0 ? `sudah berakhir ${-sisa} hari lalu` : sisa === 0 ? 'berakhir hari ini' : `berakhir ${sisa} hari lagi`;
    const kunci = `kontrak:${k.id}:${k.selesai}:${tahap[1]}`;
    // HC, Super Admin, dan atasan langsung (bukan karyawan itu sendiri)
    const pengelola = [...hc, Number(k.atasan_id) || 0].filter((x) => x && x !== k.id);
    await kirimNotif(pengelola, {
      jenis: 'kontrak', kunci, tautan: '/karyawan',
      judul: `Kontrak ${k.nama} ${kapan}`,
      isi: `${k.nama}${k.jabatan ? ` (${k.jabatan})` : ''} — kontrak kerja ${kapan} (${tglIndo(k.selesai)}). Putuskan perpanjangan / status, lalu perbarui tanggal kontrak di menu Karyawan.`,
    });
    await kirimNotif([k.id], {
      jenis: 'kontrak', kunci, tautan: '/profil',
      judul: `Kontrak kerja Anda ${kapan}`,
      isi: `Kontrak kerja Anda ${kapan} (${tglIndo(k.selesai)}). Silakan berkoordinasi dengan HC dan atasan Anda terkait kelanjutannya.`,
    });
  }
}
