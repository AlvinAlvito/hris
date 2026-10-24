/* Keputusan HC: cuti, pengajuan jadwal & lembur, izin/sakit/WFH/dinas, tukar jadwal.
   Tidak ada yang bisa memutus pengajuannya sendiri. */
import { exec, nilai, q, q1, transaksi } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import {
  cutiAktif, labelKet, logAksi, namaJadwal, need, nilaiJadwal, perluRekomendasi, sisaCuti, sudahAdaAbsensi,
  terapkanSetengahHari, tulisJadwal,
} from '@/lib/aturan';
import { cutiRow, ketRow, pengajuanRow, tukarRow } from '@/lib/format';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';
import { simpanBuktiPengajuan, validasiLinkBukti } from './bukti';
import { hasilHalaman, paramHalaman, polaCari } from '@/lib/paginasi';

const filterStatus = (status: string, kolom: string) => (status !== 'ALL' ? ` WHERE ${kolom}=?` : '');

export const aksiPersetujuan: KumpulanAksi = {
  /* ---------- cuti ---------- */
  async adm_cuti(m) {
    await need(['admin']);
    const status = s(m, 'status', 'Menunggu');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('c.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR u.dept LIKE ? OR c.jenis LIKE ? OR c.alasan LIKE ?)'); p.push(...Array(5).fill(polaCari(h.cari))); }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '', from = ' FROM cuti c JOIN users u ON u.id=c.user_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const rows = await q(`SELECT c.*, u.nik,u.nama,u.dept,u.role${from} ORDER BY c.created_at DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const hasil = [];
    for (const r of rows) {
      const p = await q1('SELECT * FROM users WHERE id=?', [r.user_id]);
      hasil.push({ ...cutiRow(r), sisaPemohon: p && cutiAktif(p) ? await sisaCuti(p) : null });
    }
    return m.all ? hasil : hasilHalaman(hasil, total, h.page);
  },
  async adm_cuti_putus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), st = s(m, 'status'), cat = s(m, 'catatan');
    if (st !== 'Disetujui' && st !== 'Ditolak') gagal('Status tidak sah');
    const c = await q1('SELECT c.*, u.role urole FROM cuti c JOIN users u ON u.id=c.user_id WHERE c.id=?', [id]);
    if (!c) gagal('Pengajuan tidak ditemukan');
    if (c.status !== 'Menunggu') gagal('Pengajuan sudah diputus');
    if (c.user_id === u.id) gagal('Anda tidak dapat memutus pengajuan sendiri');
    if (st === 'Disetujui' && c.jenis === 'Cuti Tahunan') {
      const p = await q1('SELECT * FROM users WHERE id=?', [c.user_id]);
      if (!p || !cutiAktif(p)) gagal('Karyawan belum berhak cuti tahunan');
      const sisa = await sisaCuti(p);
      if (c.hari > sisa) gagal(`Sisa cuti tidak mencukupi (${sisa} hari)`);
    }
    await exec('UPDATE cuti SET status=?,catatan=?,approver=?,tgl_putusan=NOW() WHERE id=?',
      [st, cat, `${u.nama} (${u.role === 'direktur' ? 'Super Admin' : 'HC'})`, id]);
    await logAksi(u.id, 'putus_cuti', st + ' #' + id);
    return { pesan: 'Pengajuan ' + st.toLowerCase() };
  },

  /* ---------- ganti shift, libur, lembur ---------- */
  async adm_pengajuan(m) {
    await need(['admin']);
    const status = s(m, 'status', 'Menunggu HR');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('p.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR p.jenis LIKE ? OR p.alasan LIKE ?)'); p.push(...Array(4).fill(polaCari(h.cari))); }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '', from = ' FROM pengajuan p JOIN users u ON u.id=p.user_id LEFT JOIN cabang c ON c.id=u.cabang_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const l = await q(`SELECT p.*, u.nama, u.nik, c.nama cabang_nama${from} ORDER BY p.id DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const items = await Promise.all(l.map(pengajuanRow));
    return m.all ? items : hasilHalaman(items, total, h.page);
  },
  async adm_pengajuan_putus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const x = await q1('SELECT * FROM pengajuan WHERE id=?', [id]);
    if (!x) gagal('Pengajuan tidak ditemukan');
    if (x.user_id === u.id) gagal('Anda tidak dapat memutus pengajuan sendiri');
    if (!['Menunggu HR', 'Menunggu Rekomendasi'].includes(x.status)) gagal('Pengajuan sudah diputus');
    if (!setuju) {
      await exec("UPDATE pengajuan SET status='Ditolak HR', catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?", [catatan, u.nama, id]);
      await logAksi(u.id, 'tolak_pengajuan', '#' + id);
      return { pesan: 'Pengajuan ditolak' };
    }
    const kar = await q1('SELECT * FROM users WHERE id=?', [x.user_id]);
    if (!kar) gagal('Karyawan tidak ditemukan');
    if (x.jenis !== 'lembur' && (await sudahAdaAbsensi(x.user_id, x.tanggal))) gagal('Tanggal itu sudah diabsen — perubahan jadwal tidak bisa diterapkan lagi');
    await transaksi(async () => {
      if (x.jenis === 'ganti_shift') await tulisJadwal(x.user_id, x.tanggal, x.shift_id, u.nama, null, 'pengajuan');
      else if (x.jenis === 'libur') {
        const lama = await nilaiJadwal(kar, x.tanggal);          // jadwal yang dilepas
        await tulisJadwal(x.user_id, x.tanggal, null, u.nama, null, 'pengajuan');
        // pindah libur: hari pengganti mengambil jadwal yang tadi dilepas
        if (x.tanggal2) await tulisJadwal(x.user_id, x.tanggal2, lama === false ? null : lama, u.nama, null, 'pengajuan');
      }
      // lembur: cukup tercatat sebagai lembur yang disetujui, jadwal tidak diubah
      await exec("UPDATE pengajuan SET status='Disetujui', catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?", [catatan, u.nama, id]);
    });
    await logAksi(u.id, 'setujui_pengajuan', x.jenis + ' #' + id);
    return { pesan: 'Pengajuan disetujui' + (x.jenis === 'lembur' ? ' dan tercatat sebagai lembur resmi' : ' dan jadwal sudah diperbarui') };
  },

  /* ---------- izin, sakit, setengah hari, WFH, dinas ---------- */
  async adm_ketidakhadiran(m) {
    await need(['admin']);
    const status = s(m, 'status', 'Menunggu HR');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('k.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR k.jenis LIKE ? OR k.alasan LIKE ?)'); p.push(...Array(4).fill(polaCari(h.cari))); }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '', from = ' FROM ketidakhadiran k JOIN users u ON u.id=k.user_id LEFT JOIN cabang c ON c.id=u.cabang_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const l = await q(`SELECT k.*, u.nama, u.nik, c.nama cabang_nama${from} ORDER BY k.id DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const items = l.map(ketRow);
    return m.all ? items : hasilHalaman(items, total, h.page);
  },
  async adm_ket_putus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const x = await q1('SELECT * FROM ketidakhadiran WHERE id=?', [id]);
    if (!x) gagal('Keterangan tidak ditemukan');
    if (x.user_id === u.id) gagal('Anda tidak dapat memutus pengajuan sendiri');
    if (!['Menunggu HR', 'Menunggu Rekomendasi'].includes(x.status)) gagal('Keterangan sudah diputus');
    await exec('UPDATE ketidakhadiran SET status=?, catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?',
      [setuju ? 'Disetujui' : 'Ditolak HR', catatan, u.nama, id]);
    if (setuju && x.jenis === 'setengah_hari') await terapkanSetengahHari(x.user_id, x.tanggal, x.sesi);
    await logAksi(u.id, setuju ? 'setujui_ketidakhadiran' : 'tolak_ketidakhadiran', `${labelKet(x.jenis)} ${x.tanggal} #${id}`);
    return { pesan: setuju ? 'Keterangan disetujui dan tercatat' : 'Keterangan ditolak' };
  },

  /* ---------- tukar jadwal ---------- */
  async tukar_ajukan(m) {
    const u = await need();
    validasiLinkBukti(m);
    if (u.jam_mode !== 'shift') gagal('Tukar jadwal hanya untuk karyawan bermode Shift');
    const rid = i(m, 'rekanId'), t1 = s(m, 'tglSaya'), t2 = s(m, 'tglRekan'), alasan = s(m, 'alasan');
    if (!POLA_TGL.test(t1) || !POLA_TGL.test(t2)) gagal('Tanggal tidak sah');
    if (rid === u.id) gagal('Tidak bisa menukar dengan diri sendiri');
    if (!alasan) gagal('Alasan wajib diisi');
    const hariIni = tglWIB();
    if (t1 < hariIni || t2 < hariIni) gagal('Tanggal yang sudah lewat tidak bisa ditukar');
    const r = await q1('SELECT * FROM users WHERE id=? AND aktif=1', [rid]);
    if (!r) gagal('Rekan tidak ditemukan');
    if (r.jam_mode !== 'shift') gagal('Rekan bukan karyawan bermode Shift');
    if (r.cabang_id !== u.cabang_id) gagal('Hanya bisa menukar dengan rekan satu lokasi kerja');
    if ((await sudahAdaAbsensi(u.id, t1)) || (await sudahAdaAbsensi(rid, t2))) gagal('Salah satu tanggal sudah terlanjur diabsen — tidak bisa ditukar');
    const ada = await q1(`SELECT id FROM tukar_jadwal WHERE status IN ('Menunggu Rekan','Menunggu HR')
      AND ((pemohon_id=? AND tgl_pemohon=?) OR (rekan_id=? AND tgl_rekan=?))`, [u.id, t1, u.id, t1]);
    if (ada) gagal('Sudah ada permintaan tukar yang masih berjalan untuk tanggal itu');
    const n1 = await nilaiJadwal(u, t1), n2 = await nilaiJadwal(r, t2);
    const ins = await exec(`INSERT INTO tukar_jadwal (jenis,pemohon_id,tgl_pemohon,rekan_id,tgl_rekan,alasan,status,shift_pemohon_sebelum,shift_rekan_sebelum)
      VALUES (?,?,?,?,?,?,?,?,?)`, [n1 === null || n2 === null ? 'libur' : 'shift', u.id, t1, rid, t2, alasan, 'Menunggu Rekan',
      await namaJadwal(n1), await namaJadwal(n2)]);
    const buktiLink = await simpanBuktiPengajuan(m, u, 'tukar_jadwal', ins.insertId);
    if (buktiLink) await exec('UPDATE tukar_jadwal SET bukti_link=? WHERE id=?', [buktiLink, ins.insertId]);
    await logAksi(u.id, 'ajukan_tukar', `${t1} ↔ ${r.nama} ${t2}`);
    return { pesan: `Permintaan terkirim. Menunggu persetujuan ${r.nama}, lalu HC.` };
  },
  async tukar_respon_rekan(m) {
    const u = await need();
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const t = await q1('SELECT * FROM tukar_jadwal WHERE id=?', [id]);
    if (!t) gagal('Permintaan tidak ditemukan');
    if (t.rekan_id !== u.id) gagal('Permintaan ini bukan untuk Anda');
    if (t.status !== 'Menunggu Rekan') gagal('Permintaan ini sudah diproses');
    let lanjut = 'Menunggu HR';
    if (setuju) {
      const pemohon = await q1('SELECT * FROM users WHERE id=?', [t.pemohon_id]);
      if (pemohon && (await perluRekomendasi(pemohon))) lanjut = 'Menunggu Rekomendasi';
    }
    await exec('UPDATE tukar_jadwal SET status=?, catatan_rekan=?, tgl_respon_rekan=NOW() WHERE id=?', [setuju ? lanjut : 'Ditolak Rekan', catatan, id]);
    await logAksi(u.id, 'respon_tukar', (setuju ? 'setuju' : 'tolak') + ' #' + id);
    return { pesan: setuju ? 'Anda menyetujui. Menunggu persetujuan HC.' : 'Permintaan tukar ditolak' };
  },
  async tukar_batal(m) {
    const u = await need();
    const r = await exec(`UPDATE tukar_jadwal SET status='Dibatalkan'
      WHERE id=? AND pemohon_id=? AND status IN ('Menunggu Rekan','Menunggu Rekomendasi','Menunggu HR')`, [i(m, 'id'), u.id]);
    if (!r.affectedRows) gagal('Permintaan tidak dapat dibatalkan');
    return { pesan: 'Permintaan tukar dibatalkan' };
  },
  async adm_tukar(m) {
    await need(['admin']);
    const status = s(m, 'status', 'Menunggu HR');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('t.status=?'); p.push(status); }
    if (h.cari) { cond.push('(p.nama LIKE ? OR p.nik LIKE ? OR r.nama LIKE ? OR r.nik LIKE ? OR t.alasan LIKE ?)'); p.push(...Array(5).fill(polaCari(h.cari))); }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '', from = ' FROM tukar_jadwal t JOIN users p ON p.id=t.pemohon_id JOIN users r ON r.id=t.rekan_id LEFT JOIN cabang c ON c.id=p.cabang_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const l = await q(`SELECT t.*, p.nama pemohon_nama, r.nama rekan_nama, c.nama cabang_nama${from} ORDER BY t.id DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const items = l.map(tukarRow);
    return m.all ? items : hasilHalaman(items, total, h.page);
  },
  async adm_tukar_putus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const t = await q1('SELECT * FROM tukar_jadwal WHERE id=?', [id]);
    if (!t) gagal('Permintaan tidak ditemukan');
    if (t.status !== 'Menunggu HR') gagal('Permintaan ini belum disetujui rekan atau sudah diproses');
    if (!setuju) {
      await exec("UPDATE tukar_jadwal SET status='Ditolak HR', catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?", [catatan, u.nama, id]);
      await logAksi(u.id, 'tolak_tukar', '#' + id);
      return { pesan: 'Permintaan tukar ditolak' };
    }
    const pemohon = await q1('SELECT * FROM users WHERE id=?', [t.pemohon_id]), rekan = await q1('SELECT * FROM users WHERE id=?', [t.rekan_id]);
    if (!pemohon || !rekan) gagal('Data karyawan tidak lengkap');
    if ((await sudahAdaAbsensi(t.pemohon_id, t.tgl_pemohon)) || (await sudahAdaAbsensi(t.rekan_id, t.tgl_rekan)))
      gagal('Salah satu tanggal sudah diabsen — tukar tidak bisa diterapkan lagi');
    const n1 = await nilaiJadwal(pemohon, t.tgl_pemohon), n2 = await nilaiJadwal(rekan, t.tgl_rekan);
    await transaksi(async () => {
      // saling tukar: jadwal pemohon menjadi milik rekan, dan sebaliknya
      await tulisJadwal(t.pemohon_id, t.tgl_pemohon, n2, u.nama, id, 'tukar');
      await tulisJadwal(t.rekan_id, t.tgl_rekan, n1, u.nama, id, 'tukar');
      await exec(`UPDATE tukar_jadwal SET status='Disetujui', catatan_hr=?, approver=?, tgl_putusan=NOW(),
        shift_pemohon_sesudah=?, shift_rekan_sesudah=? WHERE id=?`, [catatan, u.nama, await namaJadwal(n2), await namaJadwal(n1), id]);
    });
    await logAksi(u.id, 'setujui_tukar', `#${id} ${t.tgl_pemohon} ↔ ${t.tgl_rekan}`);
    return { pesan: 'Tukar disetujui dan jadwal sudah ditukar' };
  },
};
