/* Reimburse: karyawan ajukan + bukti → HC verifikasi → HC setujui pembayaran (transfer / lewat gaji) → Dibayar.
   Pemohon tidak pernah bisa memverifikasi atau menyetujui klaimnya sendiri. */
import { exec, q, q1, transaksi, type Baris } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import { logAksi, need, rupiah } from '@/lib/aturan';
import { berkasUntuk, simpanBerkas } from '@/lib/berkasPrivat';
import { setgInt, settingsPublik } from '@/lib/pengaturan';
import { periodeSah, periodeTerkunci, uang } from '@/lib/periode';
import { POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

async function rbRow(r: Baris) {
  return {
    id: r.id, userId: r.user_id, nama: r.nama ?? '', nik: r.nik ?? '', cabang: r.cnama ?? '', kategori: r.kategori, kegiatan: r.kegiatan,
    tanggal: r.tanggal, nominal: Number(r.nominal), keterangan: r.keterangan, status: r.status,
    hrOleh: r.hr_oleh, hrCatatan: r.hr_catatan, tglHr: r.tgl_hr, finOleh: r.fin_oleh, finCatatan: r.fin_catatan, tglFin: r.tgl_fin,
    nominalDisetujui: r.nominal_disetujui !== null ? Number(r.nominal_disetujui) : null,
    metodeBayar: r.metode_bayar, periodeGaji: r.periode_gaji, tglBayar: r.tgl_bayar,
    bankNama: r.bank_nama ?? '', bankRekening: r.bank_rekening ?? '', bankAtasNama: r.bank_atas_nama ?? '',
    tglAjukan: r.created_at, bukti: await berkasUntuk('reimburse', r.id),
  };
}
const SQL_RB = `SELECT r.*, u.nama, u.nik, u.bank_nama, u.bank_rekening, u.bank_atas_nama, c.nama cnama
  FROM reimburse r JOIN users u ON u.id=r.user_id LEFT JOIN cabang c ON c.id=u.cabang_id`;
async function rbAmbil(id: number) {
  return (await q1(SQL_RB + ' WHERE r.id=?', [id])) ?? gagal('Klaim reimburse tidak ditemukan');
}

export const aksiReimburse: KumpulanAksi = {
  async rb_ajukan(m) {
    const u = await need();
    const kat = s(m, 'kategori');
    if (!(await settingsPublik()).reimburseKategori.includes(kat)) gagal('Pilih kategori reimburse');
    const tgl = s(m, 'tanggal'), hariIni = tglWIB();
    if (!POLA_TGL.test(tgl)) gagal('Tanggal transaksi tidak sah');
    if (tgl > hariIni) gagal('Tanggal transaksi tidak boleh di masa depan');
    const maks = await setgInt('reimburse_maks_hari', 60);
    if (tgl < tambahHari(hariIni, -maks)) gagal(`Klaim paling lambat ${maks} hari setelah tanggal transaksi`);
    const nominal = uang(m, 'nominal');
    if (nominal <= 0 || nominal > 1000000000) gagal('Nominal tidak sah');
    const ket = s(m, 'keterangan');
    if (ket === '') gagal('Keterangan wajib diisi');
    const bukti = m.bukti;
    if (!Array.isArray(bukti) || bukti.length < 1) gagal('Lampirkan minimal satu foto nota / bukti pembayaran');
    if (bukti.length > 5) gagal('Maksimal 5 lampiran per klaim');
    const rid = await transaksi(async () => {
      const r = await exec('INSERT INTO reimburse (user_id,kategori,kegiatan,tanggal,nominal,keterangan) VALUES (?,?,?,?,?,?)',
        [u.id, kat, s(m, 'kegiatan').slice(0, 150), tgl, nominal, ket.slice(0, 255)]);
      for (const [n, bk] of bukti.entries()) {
        // {data,nama} atau data URL langsung
        const data = typeof bk === 'object' && bk ? String(bk.data ?? '') : String(bk), nm = typeof bk === 'object' && bk ? String(bk.nama ?? '') : '';
        await simpanBerkas(data, u.id, 'reimburse', r.insertId, 'Bukti', nm || 'bukti-' + (n + 1), u.id);
      }
      return r.insertId;
    });
    await logAksi(u.id, 'ajukan_reimburse', kat + ' ' + rupiah(nominal));
    return { pesan: 'Klaim reimburse terkirim. Menunggu verifikasi HC.', id: rid };
  },
  async rb_saya() {
    const u = await need();
    return Promise.all((await q('SELECT r.*, u.nama, u.nik FROM reimburse r JOIN users u ON u.id=r.user_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 100', [u.id])).map(rbRow));
  },
  async rb_batal(m) {
    const u = await need();
    const r = await exec("UPDATE reimburse SET status='Dibatalkan' WHERE id=? AND user_id=? AND status IN ('Menunggu HR','Menunggu Finance')", [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Klaim tidak dapat dibatalkan');
    return { pesan: 'Klaim dibatalkan' };
  },
  async rb_daftar(m) {
    await need(['admin', 'direktur', 'finance']);
    const status = s(m, 'status', 'ALL'), bl = s(m, 'bulan');
    let sql = SQL_RB + ' WHERE 1';
    const prm: unknown[] = [];
    if (status !== 'ALL') { sql += ' AND r.status=?'; prm.push(status); }
    if (bl) { if (!periodeSah(bl)) gagal('Bulan tidak sah'); sql += " AND DATE_FORMAT(r.tanggal,'%Y-%m')=?"; prm.push(bl); }
    return Promise.all((await q(sql + ' ORDER BY r.id DESC LIMIT 300', prm)).map(rbRow));
  },
  async rb_putus_hr(m) {
    const u = await need(['admin', 'direktur']);
    const r = await rbAmbil(i(m, 'id'));
    if (r.user_id === u.id) gagal('Anda tidak dapat memverifikasi klaim sendiri');
    if (r.status !== 'Menunggu HR') gagal('Klaim ini sudah diproses');
    const setuju = b(m, 'setuju'), cat = s(m, 'catatan');
    if (!setuju && cat === '') gagal('Tuliskan alasan penolakan agar karyawan tahu apa yang perlu diperbaiki');
    await exec('UPDATE reimburse SET status=?, hr_oleh=?, hr_catatan=?, tgl_hr=NOW() WHERE id=?', [setuju ? 'Menunggu Finance' : 'Ditolak HR', u.nama, cat, r.id]);
    await logAksi(u.id, setuju ? 'verifikasi_reimburse' : 'tolak_reimburse_hr', '#' + r.id);
    return { pesan: setuju ? 'Terverifikasi — tinggal disetujui pembayarannya' : 'Klaim ditolak' };
  },
  async rb_putus_fin(m) {
    const u = await need(['finance', 'direktur']);
    const r = await rbAmbil(i(m, 'id'));
    if (r.user_id === u.id) gagal('Anda tidak dapat menyetujui klaim sendiri');
    if (r.status !== 'Menunggu Finance') gagal('Klaim belum diverifikasi HC atau sudah diproses');
    const setuju = b(m, 'setuju'), cat = s(m, 'catatan');
    if (!setuju) {
      if (cat === '') gagal('Tuliskan alasan penolakan');
      await exec("UPDATE reimburse SET status='Ditolak Finance', fin_oleh=?, fin_catatan=?, tgl_fin=NOW() WHERE id=?", [u.nama, cat, r.id]);
      await logAksi(u.id, 'tolak_reimburse_fin', '#' + r.id);
      return { pesan: 'Klaim ditolak HC' };
    }
    const diajukan = Number(r.nominal);
    const nom = m.nominalDisetujui !== undefined ? uang(m, 'nominalDisetujui') : diajukan;
    if (nom <= 0 || nom > diajukan) gagal('Nominal disetujui harus antara 1 dan nominal yang diajukan');
    if (nom < diajukan && cat === '') gagal('Jelaskan alasan bila nominal disetujui lebih kecil');
    const metode = s(m, 'metode', 'transfer');
    if (!['transfer', 'gaji'].includes(metode)) gagal('Metode pembayaran tidak dikenal');
    let periode: string | null = null, status = 'Disetujui', tglBayar: string | null = null;
    if (metode === 'gaji') {
      periode = s(m, 'periodeGaji') || tglWIB().slice(0, 7);
      if (!periodeSah(periode)) gagal('Periode gaji tidak sah');
      if (await periodeTerkunci(periode)) gagal(`Payroll periode ${periode} sudah final. Pilih periode berikutnya.`);
    } else if (b(m, 'sudahDibayar')) {
      status = 'Dibayar'; tglBayar = s(m, 'tglBayar') || tglWIB();
      if (!POLA_TGL.test(tglBayar)) gagal('Tanggal bayar tidak sah');
    }
    await exec(`UPDATE reimburse SET status=?, fin_oleh=?, fin_catatan=?, tgl_fin=NOW(), nominal_disetujui=?,
      metode_bayar=?, periode_gaji=?, tgl_bayar=? WHERE id=?`, [status, u.nama, cat, nom, metode, periode, tglBayar, r.id]);
    await logAksi(u.id, 'setujui_reimburse', `#${r.id} ${rupiah(nom)} via ${metode}`);
    return { pesan: metode === 'gaji' ? 'Disetujui — akan dibayarkan bersama gaji periode ' + periode
      : status === 'Dibayar' ? 'Disetujui dan dicatat sudah ditransfer' : 'Disetujui — menunggu transfer' };
  },
  async rb_bayar(m) {
    const u = await need(['finance', 'direktur']);
    const r = await rbAmbil(i(m, 'id'));
    if (r.status !== 'Disetujui' || r.metode_bayar !== 'transfer') gagal('Klaim ini tidak menunggu transfer');
    const tgl = s(m, 'tglBayar') || tglWIB();
    if (!POLA_TGL.test(tgl)) gagal('Tanggal bayar tidak sah');
    await exec("UPDATE reimburse SET status='Dibayar', tgl_bayar=? WHERE id=?", [tgl, r.id]);
    await logAksi(u.id, 'bayar_reimburse', '#' + r.id);
    return { pesan: 'Ditandai sudah ditransfer' };
  },
};
