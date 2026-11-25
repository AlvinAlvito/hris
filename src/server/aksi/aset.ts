/* Aset: kendaraan operasional (motor / mobil), jatuh tempo pajak tahunan dan masa berlaku STNK 5 tahunan. Dikelola HC / Super Admin.
   Pengingat H-30, H-7, dan hari jatuh tempo untuk keduanya dikirim otomatis (lib/asetPengingat.ts). */
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { labelPenyetuju, logAksi, need } from '@/lib/aturan';
import { POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const JENIS = ['motor', 'mobil'];
/* sisa hari menuju jatuh tempo pajak (negatif = sudah lewat) */
export function sisaHariPajak(tgl: string | null, hariIni = tglWIB()): number | null {
  if (!tgl || !POLA_TGL.test(tgl)) return null;
  return Math.round((Date.parse(tgl + 'T00:00:00Z') - Date.parse(hariIni + 'T00:00:00Z')) / 864e5);
}
const baris = (x: Baris) => ({ id: x.id, jenis: x.jenis, brand: x.brand, merk: x.merk, tahun: x.tahun == null ? null : Number(x.tahun), plat: x.plat,
  tglPajak: x.tgl_pajak, sisaHari: sisaHariPajak(x.tgl_pajak), tglStnk: x.tgl_stnk, sisaHariStnk: sisaHariPajak(x.tgl_stnk),
  keterangan: x.keterangan, dibuatOleh: x.dibuat_oleh, diubah: x.updated_at });
/* plat dirapikan: huruf besar, spasi tunggal (mis. "bk 1234 abc" -> "BK 1234 ABC") */
const rapikanPlat = (p: string) => p.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/* tambah n tahun ke tanggal (29 Feb -> 28 Feb) */
function tambahTahun(t: string, n: number) {
  const [y, m, d] = t.split('-').map(Number);
  const akhir = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, akhir)).padStart(2, '0')}`;
}
const dalam = (x: number | null) => x != null && x >= 0 && x <= 30, lewat = (x: number | null) => x != null && x < 0;

export const aksiAset: KumpulanAksi = {
  async aset_kendaraan_daftar() {
    await need(['admin']);
    const l = (await q('SELECT * FROM aset_kendaraan WHERE aktif=1 ORDER BY tgl_pajak IS NULL, tgl_pajak, jenis, brand, merk')).map(baris);
    return { kendaraan: l, ringkas: { mobil: l.filter((x) => x.jenis === 'mobil').length, motor: l.filter((x) => x.jenis === 'motor').length,
      segera: l.filter((x) => dalam(x.sisaHari) || dalam(x.sisaHariStnk)).length, lewat: l.filter((x) => lewat(x.sisaHari) || lewat(x.sisaHariStnk)).length } };
  },

  async aset_kendaraan_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), jenis = s(m, 'jenis'), brand = s(m, 'brand').slice(0, 60), merk = s(m, 'merk').slice(0, 80), plat = rapikanPlat(s(m, 'plat')).slice(0, 20);
    const tgl = s(m, 'tglPajak'), tglStnk = s(m, 'tglStnk'), tahunTeks = s(m, 'tahun'), keterangan = s(m, 'keterangan').slice(0, 500);
    if (!JENIS.includes(jenis)) gagal('Pilih jenis kendaraan: motor atau mobil');
    if (brand.length < 2) gagal('Brand wajib diisi (mis. Toyota, Honda)');
    if (plat.length < 3) gagal('Plat kendaraan wajib diisi');
    const tahun = tahunTeks ? Number(tahunTeks) : null;
    if (tahun != null && (!Number.isInteger(tahun) || tahun < 1970 || tahun > Number(tglWIB().slice(0, 4)) + 1)) gagal('Tahun kendaraan tidak sah');
    if (tgl && !POLA_TGL.test(tgl)) gagal('Tanggal pajak tidak sah');
    if (tgl && (tgl < '2000-01-01' || tgl > tambahHari(tglWIB(), 2 * 366))) gagal('Jatuh tempo pajak tahunan paling jauh 2 tahun ke depan. Tanggal 5 tahunan diisi di kolom Masa berlaku STNK.');
    if (tglStnk && !POLA_TGL.test(tglStnk)) gagal('Tanggal STNK tidak sah');
    if (tglStnk && (tglStnk < '2000-01-01' || tglStnk > tambahHari(tglWIB(), 6 * 366))) gagal('Masa berlaku STNK paling jauh 6 tahun ke depan');
    const kembar = await q1('SELECT id FROM aset_kendaraan WHERE plat=? AND id<>? AND aktif=1', [plat, id]);
    if (kembar) gagal(`Plat ${plat} sudah terdaftar`);
    const data = { jenis, brand, merk, tahun, plat, tgl_pajak: tgl || null, tgl_stnk: tglStnk || null, keterangan };
    if (id) {
      const lama = await q1('SELECT * FROM aset_kendaraan WHERE id=? AND aktif=1', [id]);
      if (!lama) gagal('Kendaraan tidak ditemukan', 404);
      await exec(`UPDATE aset_kendaraan SET ${Object.keys(data).map((k) => `${k}=:${k}`).join(',')} WHERE id=:__id`, { ...data, __id: id });
      await logAksi(u.id, 'ubah_kendaraan', `${plat} ${brand} ${merk}`.slice(0, 255));
      return { pesan: 'Data kendaraan diperbarui' };
    }
    // plat lama yang pernah dihapus (nonaktif) dipakai lagi: hidupkan kembali barisnya
    const mati = await q1('SELECT id FROM aset_kendaraan WHERE plat=? AND aktif=0', [plat]);
    if (mati) await exec(`UPDATE aset_kendaraan SET ${Object.keys(data).map((k) => `${k}=:${k}`).join(',')}, aktif=1, dibuat_oleh=:__oleh WHERE id=:__id`, { ...data, __oleh: labelPenyetuju(u), __id: mati.id });
    else await sisipkan('aset_kendaraan', { ...data, dibuat_oleh: labelPenyetuju(u) });
    await logAksi(u.id, 'tambah_kendaraan', `${jenis} ${plat} ${brand} ${merk}`.slice(0, 255));
    return { pesan: `${jenis === 'mobil' ? 'Mobil' : 'Motor'} ${plat} ditambahkan` };
  },

  /* pajak tahunan dibayar (maju 1 tahun) atau STNK diperpanjang (maju 5 tahun); pengingat periode berikutnya berjalan otomatis */
  async aset_pajak_bayar(m) {
    const u = await need(['admin']);
    const k = await q1('SELECT * FROM aset_kendaraan WHERE id=? AND aktif=1', [i(m, 'id')]);
    if (!k) gagal('Kendaraan tidak ditemukan', 404);
    const stnk = s(m, 'apa') === 'stnk', kolom = stnk ? 'tgl_stnk' : 'tgl_pajak', lama = k[kolom];
    if (!lama) gagal(stnk ? 'Isi masa berlaku STNK dulu' : 'Isi tanggal jatuh tempo pajak dulu');
    const baru = tambahTahun(lama, stnk ? 5 : 1);
    await exec(`UPDATE aset_kendaraan SET ${kolom}=? WHERE id=?`, [baru, k.id]);
    await logAksi(u.id, stnk ? 'perpanjang_stnk_kendaraan' : 'bayar_pajak_kendaraan', `${k.plat}: ${lama} selesai, berikutnya ${baru}`);
    const t = baru.split('-').reverse().join('/');
    return { pesan: stnk ? `STNK ${k.plat} tercatat diperpanjang. Berlaku sampai ${t}` : `Pajak ${k.plat} tercatat lunas. Jatuh tempo berikutnya ${t}`, tgl: baru };
  },

  async aset_kendaraan_hapus(m) {
    const u = await need(['admin']);
    const k = await q1('SELECT * FROM aset_kendaraan WHERE id=? AND aktif=1', [i(m, 'id')]);
    if (!k) gagal('Kendaraan tidak ditemukan', 404);
    await exec('UPDATE aset_kendaraan SET aktif=0 WHERE id=?', [k.id]);   // disimpan sebagai arsip, tidak dihapus permanen
    await logAksi(u.id, 'hapus_kendaraan', `${k.plat} ${k.brand} ${k.merk}`.slice(0, 255));
    return { pesan: `${k.plat} dihapus dari daftar aset` };
  },
};
