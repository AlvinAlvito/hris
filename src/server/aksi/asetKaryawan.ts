/* Aset barang yang dipegang karyawan (laptop, HP, monitor, dll.).
   - Karyawan menginput sendiri aset yang ia pegang: jenis, merk/tipe, sejak kapan (menu "Aset Saya").
   - HC & Super Admin memantau semua aset di menu Aset → tab Aset Karyawan, bisa menambah atas nama karyawan,
     memverifikasi, mencatat pengembalian, dan mengekspor.
   Mengubah data yang sudah diverifikasi membuat statusnya kembali "belum diverifikasi" agar HC mengecek ulang. */
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { isAdminUp, labelPenyetuju, logAksi, need } from '@/lib/aturan';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

export const JENIS_ASET = ['Laptop', 'Komputer (PC)', 'Monitor', 'HP / Tablet', 'Printer / Scanner', 'Kamera', 'Proyektor', 'Perangkat jaringan',
  'Aksesoris (mouse, keyboard, headset)', 'Furnitur', 'Kunci / kartu akses', 'Lainnya'];
const KONDISI = ['baik', 'perlu_perbaikan', 'rusak'];

const barisAset = (x: Baris) => ({ id: x.id, userId: x.user_id, nama: x.nama ?? '', nik: x.nik ?? '', divisi: x.dept ?? '', jenis: x.jenis, tipe: x.tipe,
  nomorSeri: x.nomor_seri, sejak: x.sejak, kondisi: x.kondisi, keterangan: x.keterangan, status: x.status, tglKembali: x.tgl_kembali,
  diverifikasi: !!x.diverifikasi, verifikasiOleh: x.verifikasi_oleh, verifikasiAt: x.verifikasi_at, dibuatNama: x.dibuat_nama, diubah: x.updated_at });
const SQL_ASET = 'SELECT a.*, u.nama, u.nik, u.dept FROM aset_barang a LEFT JOIN users u ON u.id=a.user_id';

/* periksa isian form aset (dipakai karyawan & HC) */
function isian(m: Record<string, unknown>) {
  const jenis = s(m, 'jenis').replace(/\s+/g, ' ').slice(0, 60), tipe = s(m, 'tipe').replace(/\s+/g, ' ').slice(0, 150);
  if (jenis.length < 2) gagal('Pilih atau tulis jenis aset (mis. Laptop)');
  if (tipe.length < 2) gagal('Tulis merk / tipe aset (mis. Lenovo ThinkPad E14)');
  const sejak = s(m, 'sejak');
  if (!POLA_TGL.test(sejak)) gagal('Isi tanggal sejak kapan aset dipegang');
  if (sejak < '1990-01-01' || sejak > tglWIB()) gagal('Tanggal "sejak" tidak boleh di masa depan');
  const kondisi = s(m, 'kondisi', 'baik');
  if (!KONDISI.includes(kondisi)) gagal('Kondisi tidak sah');
  return { jenis, tipe, nomor_seri: s(m, 'nomorSeri').slice(0, 100), sejak, kondisi, keterangan: s(m, 'keterangan').slice(0, 500) };
}

/* aset milik pengguna sendiri, atau HC / Super Admin untuk aset siapa pun */
async function asetBoleh(id: number) {
  const u = await need();
  const a = await q1(SQL_ASET + ' WHERE a.id=?', [id]);
  if (!a) gagal('Aset tidak ditemukan', 404);
  if (!isAdminUp(u) && a.user_id !== u.id) gagal('Anda tidak berwenang', 403);
  return { u, a };
}

export const aksiAsetKaryawan: KumpulanAksi = {
  /* ================= karyawan: Aset Saya ================= */
  async asb_saya() {
    const u = await need();
    const barang = (await q(SQL_ASET + " WHERE a.user_id=? ORDER BY a.status='dikembalikan', a.sejak DESC, a.id DESC", [u.id])).map(barisAset);
    const kendaraan = await q('SELECT id, jenis, brand, merk, plat, tahun FROM aset_kendaraan WHERE aktif=1 AND pemegang_id=? ORDER BY plat', [u.id]);
    return { barang, kendaraan, jenis: JENIS_ASET };
  },

  async asb_simpan(m) {
    const u = await need();
    const id = i(m, 'id'), hc = isAdminUp(u);
    if (id) await asetBoleh(id);   // hak akses diperiksa sebelum isian
    const data = isian(m);
    // HC boleh mencatat atas nama karyawan lain; karyawan hanya untuk dirinya
    let pemegang = u.id;
    if (hc && i(m, 'userId')) {
      const k = await q1('SELECT id FROM users WHERE id=? AND aktif=1', [i(m, 'userId')]);
      if (!k) gagal('Karyawan pemegang tidak ditemukan');
      pemegang = k.id;
    }
    if (id) {
      const { a } = await asetBoleh(id);
      // HC yang mengubah langsung dianggap terverifikasi; perubahan oleh karyawan perlu dicek ulang HC
      const verif = hc ? { diverifikasi: 1, verifikasi_oleh: labelPenyetuju(u), verifikasi_at: new Date() } : { diverifikasi: 0, verifikasi_oleh: '', verifikasi_at: null };
      const baru = { ...data, ...verif, user_id: hc && i(m, 'userId') ? pemegang : a.user_id };
      await exec(`UPDATE aset_barang SET ${Object.keys(baru).map((k) => `${k}=:${k}`).join(',')} WHERE id=:__id`, { ...baru, __id: id });
      await logAksi(u.id, 'ubah_aset', `${data.jenis} ${data.tipe}`.slice(0, 255));
      return { pesan: hc ? 'Data aset diperbarui' : 'Data aset diperbarui. HC akan memverifikasi ulang.' };
    }
    const n = Number((await q1("SELECT COUNT(*) n FROM aset_barang WHERE user_id=? AND status='dipegang'", [pemegang]))?.n ?? 0);
    if (n >= 100) gagal('Maksimal 100 aset aktif per karyawan');
    await sisipkan('aset_barang', { ...data, user_id: pemegang, dibuat_oleh: u.id, dibuat_nama: u.nama,
      ...(hc ? { diverifikasi: 1, verifikasi_oleh: labelPenyetuju(u), verifikasi_at: new Date() } : {}) });
    await logAksi(u.id, 'tambah_aset', `${data.jenis} ${data.tipe}`.slice(0, 255));
    return { pesan: hc ? 'Aset dicatat' : 'Aset dicatat. HC akan memverifikasinya.' };
  },

  /* aset sudah dikembalikan ke kantor: tetap tersimpan sebagai riwayat */
  async asb_kembalikan(m) {
    const { u, a } = await asetBoleh(i(m, 'id'));
    if (a.status === 'dikembalikan') gagal('Aset ini sudah tercatat dikembalikan');
    const tgl = s(m, 'tanggal') || tglWIB();
    if (!POLA_TGL.test(tgl) || tgl > tglWIB()) gagal('Tanggal pengembalian tidak sah');
    if (a.sejak && tgl < String(a.sejak)) gagal('Tanggal pengembalian sebelum tanggal mulai dipegang');
    await exec("UPDATE aset_barang SET status='dikembalikan', tgl_kembali=? WHERE id=?", [tgl, a.id]);
    await logAksi(u.id, 'kembalikan_aset', `${a.jenis} ${a.tipe} (${a.nama})`.slice(0, 255));
    return { pesan: 'Aset ditandai sudah dikembalikan' };
  },

  /* hapus: karyawan hanya untuk data yang belum diverifikasi (salah input); HC kapan pun */
  async asb_hapus(m) {
    const { u, a } = await asetBoleh(i(m, 'id'));
    if (!isAdminUp(u) && a.diverifikasi) gagal('Aset yang sudah diverifikasi HC tidak bisa dihapus. Tandai "Dikembalikan" atau hubungi HC.');
    await exec('DELETE FROM aset_barang WHERE id=?', [a.id]);
    await logAksi(u.id, 'hapus_aset', `${a.jenis} ${a.tipe} (${a.nama})`.slice(0, 255));
    return { pesan: 'Data aset dihapus' };
  },

  /* ================= HC / Super Admin ================= */
  async asb_daftar() {
    await need(['admin']);
    const l = (await q(SQL_ASET + " ORDER BY a.status='dikembalikan', a.diverifikasi, u.nama, a.jenis, a.id DESC")).map(barisAset);
    const aktif = l.filter((x) => x.status === 'dipegang');
    const karyawan = await q("SELECT id, nama, nik, dept FROM users WHERE aktif=1 AND role<>'direktur' ORDER BY nama");
    const perJenis: Record<string, number> = {};
    for (const x of aktif) perJenis[x.jenis] = (perJenis[x.jenis] ?? 0) + 1;
    return {
      barang: l, jenis: JENIS_ASET, karyawan: karyawan.map((k) => ({ id: k.id, nama: k.nama, nik: k.nik, divisi: k.dept ?? '' })),
      ringkas: { dipegang: aktif.length, pemegang: new Set(aktif.map((x) => x.userId)).size, belum: aktif.filter((x) => !x.diverifikasi).length,
        bermasalah: aktif.filter((x) => x.kondisi !== 'baik').length, perJenis },
    };
  },

  async asb_verifikasi(m) {
    const u = await need(['admin']);
    const ids = (Array.isArray(m.ids) ? m.ids : [m.id]).map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0).slice(0, 500);
    if (!ids.length) gagal('Pilih aset yang diverifikasi');
    const r = await exec(`UPDATE aset_barang SET diverifikasi=1, verifikasi_oleh=?, verifikasi_at=NOW() WHERE diverifikasi=0 AND id IN (${ids.map(() => '?').join(',')})`, [labelPenyetuju(u), ...ids]);
    await logAksi(u.id, 'verifikasi_aset', `${r.affectedRows} aset`);
    return { pesan: `${r.affectedRows} aset diverifikasi` };
  },
};
