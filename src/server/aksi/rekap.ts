/* Rekap absensi untuk atasan: persetujuan absensi & ringkasan harian.
   HC / Super Admin melihat seluruh karyawan; Supervisor hanya tim di bawahnya.
   Absensi DITOLAK dihitung tidak hadir di payroll (lihat lib/statusHarian.ts). */
import { exec, q, q1 } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import { cakupanTim, labelKet, labelPenyetuju, logAksi, need, pastikanDalamCakupan, sqlCakupan, jamKerjaHari } from '@/lib/aturan';
import { statusHarian } from '@/lib/statusHarian';
import { POLA_TGL, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const jam5 = (t: unknown) => (t ? String(t).slice(0, 5) : '');

export const aksiRekap: KumpulanAksi = {
  async abs_putus(m) {
    const u = await need(['atasan']);
    const id = i(m, 'id'), setuju = b(m, 'setuju'), catatan = s(m, 'catatan').slice(0, 255);
    const a = await q1('SELECT a.*, x.nama, x.nik FROM absensi a JOIN users x ON x.id=a.user_id WHERE a.id=?', [id]);
    if (!a) gagal('Data absensi tidak ditemukan');
    await pastikanDalamCakupan(u, a.user_id);
    if (!setuju && !catatan) gagal('Tuliskan alasan penolakan — terlihat oleh karyawan');
    await exec('UPDATE absensi SET approval=?, approval_oleh=?, approval_catatan=?, tgl_approval=NOW() WHERE id=?',
      [setuju ? 'disetujui' : 'ditolak', labelPenyetuju(u), catatan, id]);
    await logAksi(u.id, setuju ? 'setujui_absensi' : 'tolak_absensi', `${a.nik} ${a.tanggal}` + (catatan ? ` — ${catatan}` : ''));
    return { pesan: setuju ? `Absensi ${a.nama} disetujui` : `Absensi ${a.nama} ditolak — dihitung tidak hadir` };
  },
  /* setujui banyak sekaligus; baris di luar tim atau milik sendiri dilewati */
  async abs_putus_massal(m) {
    const u = await need(['atasan']), tim = await cakupanTim(u);
    const ids = (Array.isArray(m.ids) ? m.ids : []).map(Number).filter((x: number) => Number.isInteger(x) && x > 0).slice(0, 500);
    if (!ids.length) gagal('Tidak ada absensi yang dipilih');
    const r = await exec(`UPDATE absensi SET approval='disetujui', approval_oleh=?, approval_catatan='', tgl_approval=NOW()
      WHERE id IN (${ids.join(',')}) AND approval='menunggu' AND in_time IS NOT NULL AND user_id<>?${sqlCakupan(tim, 'user_id')}`, [labelPenyetuju(u), u.id]);
    await logAksi(u.id, 'setujui_absensi_massal', `${r.affectedRows} baris`);
    return { pesan: `${r.affectedRows} absensi disetujui` };
  },

  /* ringkasan satu hari: komposisi kehadiran, keterlambatan, sebaran jam masuk, per divisi, yang belum hadir */
  async abs_ringkasan(m) {
    const u = await need(['atasan']), tim = await cakupanTim(u);
    let tgl = s(m, 'tanggal', tglWIB());
    if (!POLA_TGL.test(tgl)) tgl = tglWIB();
    const cid = i(m, 'cabangId');
    const users = await q(`SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.aktif=1 AND u.role<>'direktur'${cid ? ' AND u.cabang_id=?' : ''}${sqlCakupan(tim, 'u.id')} ORDER BY u.nama`, cid ? [cid] : []);
    const peta = await statusHarian(users, tgl, tgl);
    const abs = new Map<number, Record<string, any>>();
    if (users.length)
      for (const a of await q(`SELECT * FROM absensi WHERE tanggal=? AND user_id IN (${users.map((x) => Number(x.id)).join(',')})`, [tgl])) abs.set(a.user_id, a);
    const ket = new Map<number, string>();
    for (const k of await q("SELECT user_id, jenis, sesi FROM ketidakhadiran WHERE tanggal=? AND status='Disetujui'", [tgl]))
      ket.set(k.user_id, labelKet(k.jenis) + (k.sesi ? ` (${k.sesi})` : ''));
    const cuti = new Map<number, string>();
    for (const c of await q("SELECT user_id, jenis FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [tgl, tgl])) cuti.set(c.user_id, c.jenis);

    const n: Record<string, number> = { hadir: 0, telat: 0, setengah: 0, cuti: 0, ket: 0, libur: 0, belum: 0, mangkir: 0, luar: 0 };
    let wfh = 0, luarArea = 0, menunggu = 0, ditolak = 0, totalTelat = 0, totMasuk = 0, nMasuk = 0;
    const sebaran = new Map<string, number>(), divisi = new Map<string, Record<string, any>>();
    const terlambat: Record<string, any>[] = [], tidakHadir: Record<string, any>[] = [];
    for (const x of users) {
      const st = peta[x.id]?.[tgl] ?? 'luar', a = abs.get(x.id);
      n[st] = (n[st] ?? 0) + 1;
      const dv = String(x.dept || '').trim() || 'Tanpa divisi';
      if (!divisi.has(dv)) divisi.set(dv, { nama: dv, total: 0, hadir: 0, telat: 0, tidak: 0 });
      const d = divisi.get(dv)!;
      if (st !== 'libur' && st !== 'luar') d.total++;
      if (a?.in_time) {
        if (a.approval === 'menunggu') menunggu++;
        if (a.approval === 'ditolak') ditolak++;
        if (a.kerja_dari) wfh++;
        if (a.in_luar === 1 || a.out_luar === 1) luarArea++;
        const [hh, mm] = String(a.in_time).split(':').map(Number);
        totMasuk += hh * 60 + mm; nMasuk++;
        const slot = `${String(hh).padStart(2, '0')}:${mm < 30 ? '00' : '30'}`;
        sebaran.set(slot, (sebaran.get(slot) ?? 0) + 1);
      }
      if (st === 'hadir' || st === 'telat' || st === 'setengah') d.hadir++;
      if (a?.terlambat === 1) {
        if (st === 'telat') d.telat++;
        totalTelat += Number(a.menit_telat);
        terlambat.push({ id: x.id, absenId: a.id, nama: x.nama, nik: x.nik, dept: x.dept, inTime: jam5(a.in_time), jadwalIn: jam5(a.jadwal_in),
          menitTelat: Number(a.menit_telat), diizinkan: a.telat_diizinkan === 1, approval: a.approval });
      }
      if (['belum', 'mangkir', 'cuti', 'ket'].includes(st)) {
        if (st === 'belum' || st === 'mangkir') d.tidak++;
        tidakHadir.push({ id: x.id, nama: x.nama, nik: x.nik, dept: x.dept, status: st,
          ket: st === 'cuti' ? cuti.get(x.id) ?? 'Cuti' : st === 'ket' ? ket.get(x.id) ?? 'Izin' : a?.approval === 'ditolak' ? 'Absensi ditolak' : '' });
      }
    }
    const wajib = users.length - n.libur - n.luar, hadir = n.hadir + n.telat + n.setengah;
    const rata = nMasuk ? Math.round(totMasuk / nMasuk) : 0;
    return {
      tanggal: tgl, jamKerja: await jamKerjaHari(tgl), totalKaryawan: users.length, wajib, hadir,
      persenHadir: wajib > 0 ? Math.round((hadir / wajib) * 1000) / 10 : 0,
      ringkas: { ...n, wfh, luarArea, menunggu, ditolak, totalMenitTelat: totalTelat },
      rataMasuk: nMasuk ? `${String(Math.floor(rata / 60)).padStart(2, '0')}:${String(rata % 60).padStart(2, '0')}` : '',
      sebaranMasuk: [...sebaran.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([jam, jumlah]) => ({ jam, jumlah })),
      perDivisi: [...divisi.values()].filter((d) => d.total > 0).sort((a, b) => b.total - a.total),
      terlambat: terlambat.sort((a, b) => b.menitTelat - a.menitTelat),
      tidakHadir: tidakHadir.sort((a, b) => a.status.localeCompare(b.status) || a.nama.localeCompare(b.nama, 'id')),
    };
  },
};
