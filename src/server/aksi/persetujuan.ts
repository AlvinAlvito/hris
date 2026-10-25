/* Keputusan atasan: cuti, lembur, lupa clock in / out, izin terlambat, izin/sakit/WFH/dinas.
   HC & Super Admin memutus seluruh karyawan; Supervisor hanya tim di bawahnya.
   Tidak ada yang bisa memutus pengajuannya sendiri. */
import { exec, nilai, q, q1, transaksi } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import {
  cakupanTim, cutiAktif, labelJenis, labelKet, labelPenyetuju, logAksi, need, pastikanDalamCakupan, sisaCuti, sqlCakupan,
  terapkanSetengahHari,
} from '@/lib/aturan';
import { barisAbsensiManual, hitungAbsensi } from '@/lib/absensiHitung';
import { cutiRow, ketRow, pengajuanRow } from '@/lib/format';
import type { KumpulanAksi } from '../daftar';
import { hasilHalaman, paramHalaman, polaCari } from '@/lib/paginasi';

const PENYETUJU = ['admin', 'atasan'];

export const aksiPersetujuan: KumpulanAksi = {
  /* ---------- cuti ---------- */
  async adm_cuti(m) {
    const u = await need(PENYETUJU), tim = await cakupanTim(u);
    const status = s(m, 'status', 'Menunggu');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('c.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR u.dept LIKE ? OR c.jenis LIKE ? OR c.alasan LIKE ?)'); p.push(...Array(5).fill(polaCari(h.cari))); }
    const where = (cond.length ? ' WHERE ' + cond.join(' AND ') : ' WHERE 1') + sqlCakupan(tim, 'c.user_id');
    const from = ' FROM cuti c JOIN users u ON u.id=c.user_id' + where;
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
    const u = await need(PENYETUJU);
    const id = i(m, 'id'), st = s(m, 'status'), cat = s(m, 'catatan');
    if (st !== 'Disetujui' && st !== 'Ditolak') gagal('Status tidak sah');
    const c = await q1('SELECT c.*, u.role urole FROM cuti c JOIN users u ON u.id=c.user_id WHERE c.id=?', [id]);
    if (!c) gagal('Pengajuan tidak ditemukan');
    if (c.status !== 'Menunggu') gagal('Pengajuan sudah diputus');
    await pastikanDalamCakupan(u, c.user_id);
    if (st === 'Disetujui' && c.jenis === 'Cuti Tahunan') {
      const p = await q1('SELECT * FROM users WHERE id=?', [c.user_id]);
      if (!p || !cutiAktif(p)) gagal('Karyawan belum berhak cuti tahunan');
      const sisa = await sisaCuti(p);
      if (c.hari > sisa) gagal(`Sisa cuti tidak mencukupi (${sisa} hari)`);
    }
    await exec('UPDATE cuti SET status=?,catatan=?,approver=?,tgl_putusan=NOW() WHERE id=?', [st, cat, labelPenyetuju(u), id]);
    await logAksi(u.id, 'putus_cuti', st + ' #' + id);
    return { pesan: 'Pengajuan ' + st.toLowerCase() };
  },

  /* ---------- lembur, lupa clock in / out, izin terlambat ---------- */
  async adm_pengajuan(m) {
    const u = await need(PENYETUJU), tim = await cakupanTim(u);
    const status = s(m, 'status', 'Menunggu HR');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('p.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR p.jenis LIKE ? OR p.alasan LIKE ?)'); p.push(...Array(4).fill(polaCari(h.cari))); }
    const where = (cond.length ? ' WHERE ' + cond.join(' AND ') : ' WHERE 1') + sqlCakupan(tim, 'p.user_id');
    const from = ' FROM pengajuan p JOIN users u ON u.id=p.user_id LEFT JOIN cabang c ON c.id=u.cabang_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const l = await q(`SELECT p.*, u.nama, u.nik, c.nama cabang_nama${from} ORDER BY p.id DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const items = await Promise.all(l.map(pengajuanRow));
    return m.all ? items : hasilHalaman(items, total, h.page);
  },
  async adm_pengajuan_putus(m) {
    const u = await need(PENYETUJU);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const x = await q1('SELECT * FROM pengajuan WHERE id=?', [id]);
    if (!x) gagal('Pengajuan tidak ditemukan');
    await pastikanDalamCakupan(u, x.user_id);
    if (!['Menunggu HR', 'Menunggu Rekomendasi'].includes(x.status)) gagal('Pengajuan sudah diputus');
    const oleh = labelPenyetuju(u);
    if (!setuju) {
      await exec("UPDATE pengajuan SET status='Ditolak HR', catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?", [catatan, oleh, id]);
      await logAksi(u.id, 'tolak_pengajuan', '#' + id);
      return { pesan: 'Pengajuan ditolak' };
    }
    if (!['lembur', 'lupa_in', 'lupa_out', 'izin_telat'].includes(x.jenis)) gagal('Jenis pengajuan ini sudah tidak dipakai');
    const kar = await q1('SELECT * FROM users WHERE id=?', [x.user_id]);
    if (!kar) gagal('Karyawan tidak ditemukan');
    const jam = x.jam_mulai ? String(x.jam_mulai).slice(0, 5) : '';
    const ket = `${labelJenis(x.jenis)} disetujui ${oleh}` + (catatan ? ` — ${catatan}` : '');
    let pesan = 'Pengajuan disetujui';
    await transaksi(async () => {
      const a = await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [x.user_id, x.tanggal]);
      if (x.jenis === 'lupa_in') {
        // jam masuk sebenarnya; buat baris bila belum ada, atau perbaiki jam masuk yang tercatat
        if (!a) await barisAbsensiManual(kar, x.tanggal, jam, oleh, ket);
        else {
          const jamOut = a.out_time ? String(a.out_time).slice(0, 5) : '';
          const h = await hitungAbsensi(a, kar, jam, jamOut, a.tgl_pulang ?? '');
          await exec(`UPDATE absensi SET in_time=?, menit_kerja=?, kurang_menit=?, lembur_menit=?, langgar_inti=?, terlambat=?, menit_telat=?,
            dikoreksi=1, koreksi_oleh=?, koreksi_catatan=?, tgl_koreksi=NOW() WHERE id=?`,
          [h.in_time, h.menit_kerja, h.kurang_menit, h.lembur_menit, h.langgar_inti, h.terlambat, h.menit_telat, oleh, ket.slice(0, 255), a.id]);
        }
        pesan = `Disetujui — jam masuk ${jam} tercatat`;
      } else if (x.jenis === 'lupa_out') {
        if (!a || !a.in_time) gagal('Belum ada clock in pada tanggal itu. Ajukan atau setujui "Lupa Clock In" lebih dulu.');
        const h = await hitungAbsensi(a, kar, String(a.in_time).slice(0, 5), jam);
        await exec(`UPDATE absensi SET out_time=?, tgl_pulang=?, menit_kerja=?, kurang_menit=?, lembur_menit=?, langgar_inti=?, lupa_out=0,
          dikoreksi=1, koreksi_oleh=?, koreksi_catatan=?, tgl_koreksi=NOW() WHERE id=?`,
        [h.out_time, h.tgl_pulang, h.menit_kerja, h.kurang_menit, h.lembur_menit, h.langgar_inti, oleh, ket.slice(0, 255), a.id]);
        pesan = `Disetujui — jam pulang ${jam} tercatat`;
      } else if (x.jenis === 'izin_telat') {
        // berlaku untuk baris yang sudah ada; bila belum absen, clock in nanti membaca izin ini
        if (a) await exec('UPDATE absensi SET telat_diizinkan=1 WHERE id=?', [a.id]);
        pesan = 'Izin terlambat disetujui — keterlambatan hari itu tidak dihitung pelanggaran';
      } else pesan = 'Pengajuan disetujui dan tercatat sebagai lembur resmi';
      await exec("UPDATE pengajuan SET status='Disetujui', catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?", [catatan, oleh, id]);
    });
    await logAksi(u.id, 'setujui_pengajuan', `${x.jenis} ${x.tanggal} #${id}`);
    return { pesan };
  },

  /* ---------- izin, sakit, setengah hari, WFH, dinas ---------- */
  async adm_ketidakhadiran(m) {
    const u = await need(PENYETUJU), tim = await cakupanTim(u);
    const status = s(m, 'status', 'Menunggu HR');
    const h = paramHalaman(m), cond: string[] = [], p: unknown[] = [];
    if (status !== 'ALL') { cond.push('k.status=?'); p.push(status); }
    if (h.cari) { cond.push('(u.nama LIKE ? OR u.nik LIKE ? OR k.jenis LIKE ? OR k.alasan LIKE ?)'); p.push(...Array(4).fill(polaCari(h.cari))); }
    const where = (cond.length ? ' WHERE ' + cond.join(' AND ') : ' WHERE 1') + sqlCakupan(tim, 'k.user_id');
    const from = ' FROM ketidakhadiran k JOIN users u ON u.id=k.user_id LEFT JOIN cabang c ON c.id=u.cabang_id' + where;
    const total = Number(await nilai('SELECT COUNT(*)' + from, p));
    const l = await q(`SELECT k.*, u.nama, u.nik, c.nama cabang_nama${from} ORDER BY k.id DESC` + (m.all ? '' : ' LIMIT ? OFFSET ?'), m.all ? p : [...p, h.limit, h.offset]);
    const items = l.map(ketRow);
    return m.all ? items : hasilHalaman(items, total, h.page);
  },
  async adm_ket_putus(m) {
    const u = await need(PENYETUJU);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan');
    const x = await q1('SELECT * FROM ketidakhadiran WHERE id=?', [id]);
    if (!x) gagal('Keterangan tidak ditemukan');
    await pastikanDalamCakupan(u, x.user_id);
    if (!['Menunggu HR', 'Menunggu Rekomendasi'].includes(x.status)) gagal('Keterangan sudah diputus');
    await exec('UPDATE ketidakhadiran SET status=?, catatan_hr=?, approver=?, tgl_putusan=NOW() WHERE id=?',
      [setuju ? 'Disetujui' : 'Ditolak HR', catatan, labelPenyetuju(u), id]);
    if (setuju && x.jenis === 'setengah_hari') await terapkanSetengahHari(x.user_id, x.tanggal, x.sesi);
    await logAksi(u.id, setuju ? 'setujui_ketidakhadiran' : 'tolak_ketidakhadiran', `${labelKet(x.jenis)} ${x.tanggal} #${id}`);
    return { pesan: setuju ? 'Keterangan disetujui dan tercatat' : 'Keterangan ditolak' };
  },
};
