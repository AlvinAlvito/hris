/* Log kerja (to-do / catatan pekerjaan harian) & analisis beban kerja.
   Karyawan mencatat pekerjaannya; Supervisor (timnya) & HC melihat utilisasi, rincian, dan memberi komentar. */
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { cakupanTim, inList, isAdminUp, labelPenyetuju, logAksi, need, pastikanDalamCakupan, type User } from '@/lib/aturan';
import { beriTahu } from '@/lib/notifikasi';
import { setSetting } from '@/lib/pengaturan';
import { cekTanggalLog, kapasitas, LABEL_BEBAN, LABEL_STATUS_LOG, pengaturanLog, periode, ringkasBeban, STATUS_LOG } from '@/lib/logKerja';
import { POLA_JAM, POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const KATEGORI_AWAL = ['Koordinasi', 'Administrasi', 'Rapat', 'Event / Lapangan', 'Produksi & Pengiriman', 'Laporan', 'Pengembangan / Belajar', 'Lainnya'];
const menitJam = (j: string) => { const [h, m] = j.split(':').map(Number); return h * 60 + m; };

/* kategori yang berlaku untuk karyawan: umum (tanpa divisi) + divisinya; isi kategori awal bila masih kosong */
async function kategoriUntuk(dept?: string) {
  if (!(await q1('SELECT id FROM log_kategori LIMIT 1')))
    for (const [n, nama] of KATEGORI_AWAL.entries()) await sisipkan('log_kategori', { nama, urut: n });
  const l = await q('SELECT * FROM log_kategori WHERE aktif=1 ORDER BY urut, nama');
  return l.filter((k) => !k.divisi || dept === undefined || String(k.divisi).toLowerCase() === String(dept ?? '').toLowerCase())
    .map((k) => ({ id: k.id, nama: k.nama, divisi: k.divisi }));
}
function logRow(r: Baris, komentar: Baris[] = []) {
  return { id: r.id, tanggal: r.tanggal, kategoriId: r.kategori_id, kategori: r.kategori_nama, uraian: r.uraian, jamMulai: r.jam_mulai ? String(r.jam_mulai).slice(0, 5) : '',
    jamSelesai: r.jam_selesai ? String(r.jam_selesai).slice(0, 5) : '', durasi: Number(r.durasi_menit), status: r.status, statusLabel: LABEL_STATUS_LOG[r.status],
    keterangan: r.keterangan, tautan: r.tautan,
    komentar: komentar.filter((k) => k.log_id === r.id).map((k) => ({ id: k.id, oleh: k.oleh_nama, isi: k.isi, waktu: k.created_at })) };
}
async function logDenganKomentar(sql: string, p: unknown[]) {
  const l = await q(sql, p);
  const kom = l.length ? await q(`SELECT * FROM log_komentar WHERE log_id IN (${inList(l.map((x) => x.id))}) ORDER BY id`) : [];
  return l.map((r) => logRow(r, kom));
}
/* ringkasan durasi per kategori */
async function perKategori(ids: number[], dari: string, sampai: string) {
  if (!ids.length) return [];
  return (await q(`SELECT IF(kategori_nama='', 'Tanpa kategori', kategori_nama) k, SUM(durasi_menit) menit, COUNT(*) jumlah FROM log_kerja
    WHERE user_id IN (${inList(ids)}) AND tanggal BETWEEN ? AND ? AND status<>'rencana' GROUP BY k ORDER BY menit DESC`, [dari, sampai]))
    .map((r) => ({ kategori: r.k, menit: Number(r.menit), jumlah: Number(r.jumlah) }));
}
async function bolehLihat(u: User, pemilik: number) {
  if (pemilik === u.id || isAdminUp(u)) return;
  const ids = await cakupanTim(u);
  if (ids !== null && !ids.includes(pemilik)) gagal('Karyawan ini bukan anggota tim Anda', 403);
}
function bacaPeriode(m: Baris) { return periode(s(m, 'jenis') === 'bulan' ? 'bulan' : 'minggu', s(m, 'tanggal') || tglWIB()); }

export const aksiLogKerja: KumpulanAksi = {
  /* ================= KARYAWAN ================= */
  async log_saya(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Akun Super Admin tidak mencatat log kerja');
    const p = bacaPeriode(m), set = await pengaturanLog();
    const [r] = await ringkasBeban([u], p.dari, p.sampai);
    const kap = (await kapasitas([u], p.dari, p.sampai))[u.id];
    const log = await logDenganKomentar('SELECT * FROM log_kerja WHERE user_id=? AND tanggal BETWEEN ? AND ? ORDER BY tanggal DESC, jam_mulai IS NULL, jam_mulai DESC, id DESC', [u.id, p.dari, p.sampai]);
    return { periode: p, ringkas: { ...r, statusLabel: LABEL_BEBAN[r.status] }, kapasitasHarian: kap?.perHari ?? {}, log, kategori: await kategoriUntuk(u.dept),
      batas: { bawah: set.bawah, atas: set.atas }, hariIni: tglWIB(), perKategori: await perKategori([u.id], p.dari, p.sampai) };
  },

  async log_simpan(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Akun Super Admin tidak mencatat log kerja');
    const id = i(m, 'id');
    const lama = id ? await q1('SELECT * FROM log_kerja WHERE id=?', [id]) : null;
    if (id && (!lama || lama.user_id !== u.id)) gagal('Catatan tidak ditemukan', 404);
    if (lama) cekTanggalLog(lama.tanggal, 'proses');   // catatan lama di luar batas waktu tidak bisa diubah
    const tanggal = s(m, 'tanggal'), status = s(m, 'status', 'selesai');
    if (!(STATUS_LOG as readonly string[]).includes(status)) gagal('Status tidak sah');
    cekTanggalLog(tanggal, status);
    const kat = await q1('SELECT * FROM log_kategori WHERE id=? AND aktif=1', [i(m, 'kategoriId')]);
    if (!kat) gagal('Pilih kategori pekerjaan');
    const uraian = s(m, 'uraian').replace(/\s+/g, ' ');
    if (uraian.length < 3) gagal('Tuliskan uraian pekerjaan');
    // durasi: dari jam mulai–selesai bila keduanya diisi, selain itu dari isian durasi (menit)
    const jamA = s(m, 'jamMulai'), jamB = s(m, 'jamSelesai');
    if ((jamA && !POLA_JAM.test(jamA)) || (jamB && !POLA_JAM.test(jamB))) gagal('Format jam tidak sah');
    let durasi = i(m, 'durasi');
    if (jamA && jamB) { durasi = menitJam(jamB) - menitJam(jamA); if (durasi <= 0) durasi += 1440; }
    if (durasi < 0 || durasi > 960) gagal('Durasi tidak wajar (maksimal 16 jam per pekerjaan)');
    if (status !== 'rencana' && durasi < 1) gagal('Isi durasi pekerjaan (atau jam mulai & selesai)');
    const tautan = s(m, 'tautan');
    if (tautan && (!/^https?:\/\/\S+$/i.test(tautan) || tautan.length > 1000)) gagal('Tautan harus diawali http:// atau https://');
    const data = { tanggal, kategori_id: kat.id, kategori_nama: kat.nama, uraian: uraian.slice(0, 500), jam_mulai: jamA ? jamA + ':00' : null, jam_selesai: jamB ? jamB + ':00' : null,
      durasi_menit: durasi, status, keterangan: s(m, 'keterangan').slice(0, 500), tautan };
    if (id) {
      await exec(`UPDATE log_kerja SET ${Object.keys(data).map((k) => `${k}=:${k}`).join(',')} WHERE id=:__id`, { ...data, __id: id });
      return { pesan: 'Catatan pekerjaan diperbarui', id };
    }
    // jaga dari kiriman ganda (klik dua kali)
    const kembar = await q1('SELECT id FROM log_kerja WHERE user_id=? AND tanggal=? AND uraian=? AND created_at > DATE_SUB(NOW(), INTERVAL 10 SECOND)', [u.id, tanggal, data.uraian]);
    if (kembar) return { pesan: 'Pekerjaan sudah tercatat', id: kembar.id };
    return { pesan: 'Pekerjaan tercatat', id: await sisipkan('log_kerja', { ...data, user_id: u.id }) };
  },

  async log_status(m) {
    const u = await need();
    const l = await q1('SELECT * FROM log_kerja WHERE id=? AND user_id=?', [i(m, 'id'), u.id]);
    if (!l) gagal('Catatan tidak ditemukan', 404);
    const st = s(m, 'status');
    if (!(STATUS_LOG as readonly string[]).includes(st)) gagal('Status tidak sah');
    cekTanggalLog(l.tanggal, st);
    if (st !== 'rencana' && Number(l.durasi_menit) < 1) gagal('Isi durasi pekerjaan ini dulu (ubah catatan)');
    await exec('UPDATE log_kerja SET status=? WHERE id=?', [st, l.id]);
    return { pesan: 'Status: ' + LABEL_STATUS_LOG[st] };
  },

  async log_hapus(m) {
    const u = await need();
    const l = await q1('SELECT * FROM log_kerja WHERE id=? AND user_id=?', [i(m, 'id'), u.id]);
    if (!l) gagal('Catatan tidak ditemukan', 404);
    cekTanggalLog(l.tanggal, 'rencana');
    await exec('DELETE FROM log_kerja WHERE id=?', [l.id]);
    return { pesan: 'Catatan dihapus' };
  },

  /* salin pekerjaan dari hari kerja terakhir yang terisi ke tanggal tujuan sebagai Rencana */
  async log_salin(m) {
    const u = await need();
    const ke = s(m, 'ke') || tglWIB();
    cekTanggalLog(ke, 'rencana');
    const dari = s(m, 'dari') || String((await q1('SELECT MAX(tanggal) t FROM log_kerja WHERE user_id=? AND tanggal<?', [u.id, ke]))?.t ?? '');
    if (!POLA_TGL.test(dari)) gagal('Belum ada catatan sebelumnya untuk disalin');
    const l = await q('SELECT * FROM log_kerja WHERE user_id=? AND tanggal=? ORDER BY id LIMIT 50', [u.id, dari]);
    if (!l.length) gagal('Tidak ada pekerjaan pada tanggal tersebut');
    for (const x of l) await sisipkan('log_kerja', { user_id: u.id, tanggal: ke, kategori_id: x.kategori_id, kategori_nama: x.kategori_nama, uraian: x.uraian,
      jam_mulai: x.jam_mulai, jam_selesai: x.jam_selesai, durasi_menit: x.durasi_menit, status: 'rencana' });
    return { pesan: `${l.length} pekerjaan dari ${dari} disalin sebagai Rencana. Ubah statusnya saat dikerjakan.` };
  },

  /* ================= SUPERVISOR (timnya) & HC ================= */
  async beban_tim(m) {
    const u = await need();
    const tim = await cakupanTim(u);
    const p = bacaPeriode(m), set = await pengaturanLog();
    const divisi = s(m, 'divisi');
    const users = await q(`SELECT * FROM users WHERE aktif=1 AND role<>'direktur' AND id<>?${tim === null ? '' : ` AND id IN (${inList(tim)})`}${divisi ? ' AND dept=?' : ''} ORDER BY nama`,
      divisi ? [u.id, divisi] : [u.id]);
    const baris = (await ringkasBeban(users, p.dari, p.sampai)).map((r) => ({ ...r, statusLabel: LABEL_BEBAN[r.status] }));
    const terhitung = baris.filter((x) => x.utilisasi != null && x.status !== 'belum');
    const semuaDivisi = [...new Set((await q(`SELECT DISTINCT dept FROM users WHERE aktif=1 AND role<>'direktur'${tim === null ? '' : ` AND id IN (${inList(tim)})`}`)).map((x) => String(x.dept ?? '')).filter(Boolean))].sort();
    return { periode: p, batas: { bawah: set.bawah, atas: set.atas }, admin: isAdminUp(u), divisi: semuaDivisi, baris,
      stat: { rata: terhitung.length ? Math.round((terhitung.reduce((a, x) => a + (x.utilisasi ?? 0), 0) / terhitung.length) * 10) / 10 : null,
        overload: baris.filter((x) => x.status === 'overload').length, optimal: baris.filter((x) => x.status === 'optimal').length,
        underload: baris.filter((x) => x.status === 'underload').length, belum: baris.filter((x) => x.status === 'belum').length,
        jam: Math.round(baris.reduce((a, x) => a + x.menit, 0) / 6) / 10 },
      perKategori: await perKategori(users.map((x) => x.id as number), p.dari, p.sampai) };
  },

  async beban_detail(m) {
    const u = await need();
    const k = await q1('SELECT * FROM users WHERE id=?', [i(m, 'userId')]);
    if (!k) gagal('Karyawan tidak ditemukan');
    await bolehLihat(u, k.id);
    const p = bacaPeriode(m), set = await pengaturanLog();
    const [r] = await ringkasBeban([k], p.dari, p.sampai);
    const kap = (await kapasitas([k], p.dari, p.sampai))[k.id];
    const log = await logDenganKomentar('SELECT * FROM log_kerja WHERE user_id=? AND tanggal BETWEEN ? AND ? ORDER BY tanggal DESC, jam_mulai IS NULL, jam_mulai DESC, id DESC', [k.id, p.dari, p.sampai]);
    return { periode: p, ringkas: { ...r, statusLabel: LABEL_BEBAN[r.status] }, kapasitasHarian: kap?.perHari ?? {}, log, batas: { bawah: set.bawah, atas: set.atas },
      perKategori: await perKategori([k.id], p.dari, p.sampai), bolehKomentar: k.id !== u.id };
  },

  async log_komentar(m) {
    const u = await need();
    const l = await q1('SELECT * FROM log_kerja WHERE id=?', [i(m, 'id')]);
    if (!l) gagal('Catatan tidak ditemukan', 404);
    if (l.user_id === u.id) gagal('Komentar diberikan oleh atasan / HC. Tambahkan keterangan lewat tombol ubah catatan.');
    await pastikanDalamCakupan(u, l.user_id);
    const isi = s(m, 'isi');
    if (!isi) gagal('Tulis komentar terlebih dulu');
    await sisipkan('log_komentar', { log_id: l.id, oleh: u.id, oleh_nama: labelPenyetuju(u), isi: isi.slice(0, 1000) });
    await beriTahu([l.user_id], { jenis: 'log', tautan: '/pekerjaan?tanggal=' + l.tanggal, judul: `Komentar dari ${u.nama}`, isi: `"${String(l.uraian).slice(0, 60)}": ${isi.slice(0, 140)}` });
    return { pesan: 'Komentar terkirim' };
  },

  async beban_tahunan(m) {
    const u = await need();
    const tim = await cakupanTim(u);
    const tahun = i(m, 'tahun', +tglWIB().slice(0, 4)), divisi = s(m, 'divisi');
    const users = await q(`SELECT * FROM users WHERE aktif=1 AND role<>'direktur' AND id<>?${tim === null ? '' : ` AND id IN (${inList(tim)})`}${divisi ? ' AND dept=?' : ''} ORDER BY nama`,
      divisi ? [u.id, divisi] : [u.id]);
    const bulan: { bulan: string; data: Record<number, { u: number | null; s: string }> }[] = [];
    const mulai = (await pengaturanLog()).mulai;
    for (let b = 1; b <= 12; b++) {
      const awal = `${tahun}-${String(b).padStart(2, '0')}-01`;
      if (awal > tglWIB()) break;
      const p = periode('bulan', awal);
      if (mulai && p.sampai < mulai) continue;   // bulan sebelum log kerja mulai dipakai tidak ditampilkan
      const r = await ringkasBeban(users, p.dari, p.sampai);
      bulan.push({ bulan: awal.slice(0, 7), data: Object.fromEntries(r.map((x) => [x.userId, { u: x.utilisasi, s: x.status }])) });
    }
    return { tahun, karyawan: users.map((x) => ({ id: x.id, nama: x.nama, dept: x.dept })), bulan };
  },

  /* ekspor detail log (dalam cakupan) untuk Excel */
  async beban_ekspor(m) {
    const u = await need();
    const tim = await cakupanTim(u);
    const p = bacaPeriode(m);
    const l = await q(`SELECT l.*, us.nama, us.nik, us.dept FROM log_kerja l JOIN users us ON us.id=l.user_id WHERE l.tanggal BETWEEN ? AND ?${tim === null ? '' : ` AND l.user_id IN (${inList(tim)})`}
      ORDER BY us.nama, l.tanggal, l.jam_mulai`, [p.dari, p.sampai]);
    return l.map((x) => ({ Tanggal: x.tanggal, NIK: x.nik, Nama: x.nama, Divisi: x.dept, Kategori: x.kategori_nama, Uraian: x.uraian,
      'Jam Mulai': x.jam_mulai ? String(x.jam_mulai).slice(0, 5) : '', 'Jam Selesai': x.jam_selesai ? String(x.jam_selesai).slice(0, 5) : '',
      'Durasi (jam)': Math.round((Number(x.durasi_menit) / 60) * 100) / 100, Status: LABEL_STATUS_LOG[x.status], Keterangan: x.keterangan }));
  },

  /* ================= PENGATURAN (HC) ================= */
  async log_kategori_daftar() {
    await need(['admin']);
    await kategoriUntuk();
    const l = await q(`SELECT k.*, (SELECT COUNT(*) FROM log_kerja WHERE kategori_id=k.id) dipakai FROM log_kategori k ORDER BY k.aktif DESC, k.urut, k.nama`);
    const divisi = (await q("SELECT DISTINCT dept FROM users WHERE aktif=1 AND dept<>'' ORDER BY dept")).map((x) => x.dept);
    return { kategori: l.map((k) => ({ id: k.id, nama: k.nama, divisi: k.divisi, aktif: !!k.aktif, dipakai: Number(k.dipakai) })), divisi, pengaturan: await pengaturanLog() };
  },
  async log_kategori_simpan(m) {
    const u = await need(['admin']);
    const nama = s(m, 'nama');
    if (nama.length < 2) gagal('Nama kategori wajib diisi');
    const data = { nama: nama.slice(0, 80), divisi: s(m, 'divisi').slice(0, 100), aktif: m.aktif === false ? 0 : 1 };
    if (i(m, 'id')) await exec('UPDATE log_kategori SET nama=?, divisi=?, aktif=? WHERE id=?', [data.nama, data.divisi, data.aktif, i(m, 'id')]);
    else await sisipkan('log_kategori', { ...data, urut: 99 });
    await logAksi(u.id, 'kategori_log', nama);
    return { pesan: 'Kategori tersimpan' };
  },
  async log_kategori_hapus(m) {
    const u = await need(['admin']);
    const k = await q1('SELECT k.*, (SELECT COUNT(*) FROM log_kerja WHERE kategori_id=k.id) n FROM log_kategori k WHERE k.id=?', [i(m, 'id')]);
    if (!k) gagal('Kategori tidak ditemukan');
    if (Number(k.n) > 0) { await exec('UPDATE log_kategori SET aktif=0 WHERE id=?', [k.id]); await logAksi(u.id, 'nonaktif_kategori_log', k.nama);
      return { pesan: 'Kategori sudah dipakai, jadi dinonaktifkan (catatan lama tetap utuh)' }; }
    await exec('DELETE FROM log_kategori WHERE id=?', [k.id]);
    return { pesan: 'Kategori dihapus' };
  },
  async log_pengaturan_simpan(m) {
    const u = await need(['admin']);
    const jam = Number(m.jamEfektif), bawah = i(m, 'bawah'), atas = i(m, 'atas'), mulai = s(m, 'mulai');
    if (!(jam >= 1 && jam <= 12)) gagal('Jam kerja efektif per hari antara 1–12 jam');
    if (!(bawah >= 10 && bawah < atas && atas <= 200)) gagal('Batas underload harus lebih kecil dari batas overload (10–200%)');
    if (mulai && !POLA_TGL.test(mulai)) gagal('Tanggal mulai tidak sah');
    await setSetting('log_jam_efektif', Math.round(jam * 60));
    await setSetting('log_batas_bawah', bawah);
    await setSetting('log_batas_atas', atas);
    await setSetting('log_mulai', mulai);
    await logAksi(u.id, 'pengaturan_log', `${jam} jam · ${bawah}–${atas}%`);
    return { pesan: 'Pengaturan beban kerja tersimpan' };
  },
};

