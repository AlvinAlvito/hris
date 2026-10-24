/* Kasbon / pinjaman karyawan: ajukan → HC verifikasi → HC cairkan (Aktif)
   → cicilan dipotong otomatis saat payroll difinalkan → Lunas */
import { exec, nilai, q, q1, transaksi, type Baris } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import { logAksi, need, rupiah } from '@/lib/aturan';
import { setg, setgInt } from '@/lib/pengaturan';
import { periodeBerikut, periodeSah, periodeTerkunci, uang } from '@/lib/periode';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

async function ksRow(k: Baris, denganBayar = false) {
  const r: Baris = {
    id: k.id, userId: k.user_id, nama: k.nama ?? '', nik: k.nik ?? '', nominal: Number(k.nominal), tenor: k.tenor, cicilan: Number(k.cicilan),
    alasan: k.alasan, status: k.status, hrOleh: k.hr_oleh, hrCatatan: k.hr_catatan, tglHr: k.tgl_hr,
    finOleh: k.fin_oleh, finCatatan: k.fin_catatan, tglFin: k.tgl_fin, tglCair: k.tgl_cair, mulaiPotong: k.mulai_potong,
    terbayar: Number(k.terbayar), sisa: Math.max(0, Number(k.nominal) - Number(k.terbayar)), tglAjukan: k.created_at,
  };
  if (denganBayar) {
    r.pembayaran = (await q('SELECT * FROM kasbon_bayar WHERE kasbon_id=? ORDER BY periode, id', [k.id])).map((x) => ({
      periode: x.periode, nominal: Number(x.nominal), sumber: x.sumber, catatan: x.catatan, oleh: x.dicatat_oleh, tanggal: x.created_at }));
  }
  return r;
}
async function ksAmbil(id: number) {
  return (await q1('SELECT k.*, u.nama, u.nik FROM kasbon k JOIN users u ON u.id=k.user_id WHERE k.id=?', [id])) ?? gagal('Kasbon tidak ditemukan');
}

export const aksiKasbon: KumpulanAksi = {
  async ks_ajukan(m) {
    const u = await need();
    const nominal = uang(m, 'nominal'), tenor = i(m, 'tenor', 1), alasan = s(m, 'alasan');
    const tenorMaks = await setgInt('kasbon_tenor_maks', 12);
    if (nominal < 10000) gagal('Nominal kasbon minimal Rp10.000');
    if (tenor < 1 || tenor > tenorMaks) gagal(`Tenor cicilan 1–${tenorMaks} bulan`);
    if (alasan === '') gagal('Alasan kasbon wajib diisi');
    if ((await setgInt('kasbon_satu_aktif', 1)) === 1 &&
      Number(await nilai("SELECT COUNT(*) FROM kasbon WHERE user_id=? AND status IN ('Menunggu HR','Menunggu Finance','Aktif')", [u.id])) > 0)
      gagal('Anda masih punya kasbon yang berjalan. Lunasi dulu sebelum mengajukan lagi.');
    const gapok = Number(await nilai('SELECT gaji_pokok FROM gaji_karyawan WHERE user_id=?', [u.id]) ?? 0);
    const kali = parseFloat(await setg('kasbon_maks_kali_gaji', 1)) || 0;
    if (kali > 0 && gapok <= 0) gagal('Data gaji Anda belum diatur HC, jadi batas kasbon belum bisa dihitung. Hubungi HC.');
    if (kali > 0 && nominal > gapok * kali) gagal(`Nominal melebihi batas kasbon (${rupiah(Math.trunc(gapok * kali))})`);
    const cicilan = Math.ceil(nominal / tenor);
    await exec('INSERT INTO kasbon (user_id,nominal,tenor,cicilan,alasan) VALUES (?,?,?,?,?)', [u.id, nominal, tenor, cicilan, alasan.slice(0, 255)]);
    await logAksi(u.id, 'ajukan_kasbon', `${rupiah(nominal)} / ${tenor} bln`);
    return { pesan: `Pengajuan kasbon terkirim. Cicilan ${rupiah(cicilan)}/bulan setelah disetujui.` };
  },
  async ks_saya() {
    const u = await need();
    return Promise.all((await q('SELECT k.*, u.nama, u.nik FROM kasbon k JOIN users u ON u.id=k.user_id WHERE k.user_id=? ORDER BY k.id DESC LIMIT 50', [u.id])).map((k) => ksRow(k, true)));
  },
  async ks_batal(m) {
    const u = await need();
    const r = await exec("UPDATE kasbon SET status='Dibatalkan' WHERE id=? AND user_id=? AND status IN ('Menunggu HR','Menunggu Finance')", [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Kasbon tidak dapat dibatalkan');
    return { pesan: 'Pengajuan kasbon dibatalkan' };
  },
  async ks_daftar(m) {
    await need(['admin', 'direktur', 'finance']);
    const status = s(m, 'status', 'ALL');
    const rows = await q('SELECT k.*, u.nama, u.nik FROM kasbon k JOIN users u ON u.id=k.user_id' + (status !== 'ALL' ? ' WHERE k.status=?' : '') + ' ORDER BY k.id DESC LIMIT 300',
      status !== 'ALL' ? [status] : []);
    return Promise.all(rows.map((k) => ksRow(k, true)));
  },
  async ks_putus_hr(m) {
    const u = await need(['admin', 'direktur']);
    const k = await ksAmbil(i(m, 'id'));
    if (k.user_id === u.id) gagal('Anda tidak dapat memverifikasi kasbon sendiri');
    if (k.status !== 'Menunggu HR') gagal('Kasbon ini sudah diproses');
    const setuju = b(m, 'setuju'), cat = s(m, 'catatan');
    if (!setuju && cat === '') gagal('Tuliskan alasan penolakan');
    await exec('UPDATE kasbon SET status=?, hr_oleh=?, hr_catatan=?, tgl_hr=NOW() WHERE id=?', [setuju ? 'Menunggu Finance' : 'Ditolak HR', u.nama, cat, k.id]);
    await logAksi(u.id, setuju ? 'verifikasi_kasbon' : 'tolak_kasbon_hr', '#' + k.id);
    return { pesan: setuju ? 'Terverifikasi — tinggal dicairkan' : 'Kasbon ditolak' };
  },
  async ks_putus_fin(m) {
    const u = await need(['finance', 'direktur']);
    const k = await ksAmbil(i(m, 'id'));
    if (k.user_id === u.id) gagal('Anda tidak dapat menyetujui kasbon sendiri');
    if (k.status !== 'Menunggu Finance') gagal('Kasbon belum diverifikasi HC atau sudah diproses');
    const setuju = b(m, 'setuju'), cat = s(m, 'catatan');
    if (!setuju) {
      if (cat === '') gagal('Tuliskan alasan penolakan');
      await exec("UPDATE kasbon SET status='Ditolak Finance', fin_oleh=?, fin_catatan=?, tgl_fin=NOW() WHERE id=?", [u.nama, cat, k.id]);
      await logAksi(u.id, 'tolak_kasbon_fin', '#' + k.id);
      return { pesan: 'Kasbon ditolak HC' };
    }
    const tglCair = s(m, 'tglCair') || tglWIB();
    if (!POLA_TGL.test(tglCair)) gagal('Tanggal pencairan tidak sah');
    const mulai = s(m, 'mulaiPotong') || periodeBerikut(tglCair.slice(0, 7));
    if (!periodeSah(mulai)) gagal('Periode mulai potong tidak sah');
    if (await periodeTerkunci(mulai)) gagal(`Payroll periode ${mulai} sudah final. Pilih periode berikutnya.`);
    const tenor = i(m, 'tenor', k.tenor);
    if (tenor < 1 || tenor > 60) gagal('Tenor tidak sah');
    const cicilan = Math.ceil(Number(k.nominal) / tenor);
    await exec(`UPDATE kasbon SET status='Aktif', fin_oleh=?, fin_catatan=?, tgl_fin=NOW(), tgl_cair=?, mulai_potong=?, tenor=?, cicilan=? WHERE id=?`,
      [u.nama, cat, tglCair, mulai, tenor, cicilan, k.id]);
    await logAksi(u.id, 'cairkan_kasbon', `#${k.id} mulai potong ${mulai}`);
    return { pesan: `Kasbon disetujui & dicairkan. Cicilan ${rupiah(cicilan)} mulai gaji ${mulai}` };
  },
  async ks_bayar_manual(m) {
    const u = await need(['finance', 'direktur']);
    const k = await ksAmbil(i(m, 'id'));
    if (k.status !== 'Aktif') gagal('Kasbon tidak dalam status aktif');
    const sisa = Number(k.nominal) - Number(k.terbayar), nom = uang(m, 'nominal');
    if (nom <= 0 || nom > sisa) gagal('Nominal pembayaran harus antara 1 dan sisa ' + rupiah(sisa));
    const periode = s(m, 'periode') || tglWIB().slice(0, 7);
    if (!periodeSah(periode)) gagal('Periode tidak sah');
    await transaksi(async () => {
      await exec("INSERT INTO kasbon_bayar (kasbon_id,periode,nominal,sumber,catatan,dicatat_oleh) VALUES (?,?,?,'manual',?,?)",
        [k.id, periode, nom, s(m, 'catatan').slice(0, 255), u.nama]);
      // status dihitung lebih dulu: MySQL memakai nilai kolom yang SUDAH diubah untuk penugasan berikutnya
      await exec("UPDATE kasbon SET status=IF(terbayar+?>=nominal,'Lunas',status), terbayar=terbayar+? WHERE id=?", [nom, nom, k.id]);
    });
    await logAksi(u.id, 'bayar_kasbon_manual', `#${k.id} ${rupiah(nom)}`);
    return { pesan: nom >= sisa ? 'Pembayaran tercatat — kasbon LUNAS' : 'Pembayaran tercatat. Sisa ' + rupiah(sisa - nom) };
  },
};
