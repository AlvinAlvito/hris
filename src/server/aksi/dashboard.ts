/* Data grafik dashboard & ringkasan */
import { q, type Baris } from '@/lib/db';
import { i } from '@/lib/http';
import { labelKet, need } from '@/lib/aturan';
import { statusHarian } from '@/lib/statusHarian';
import { tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

export const aksiDashboard: KumpulanAksi = {
  async dash_grafik(m) {
    await need(['admin', 'finance']);
    const hari = Math.max(7, Math.min(62, i(m, 'hari', 30)));
    const sampai = tglWIB(), dari = tambahHari(sampai, -(hari - 1));
    const users = await q(`SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id WHERE u.aktif=1 AND u.role<>'direktur'`);
    const peta = await statusHarian(users, dari, sampai);

    /* tren harian per status */
    const tanggal: string[] = [], seri: Record<string, number[]> = { hadir: [], telat: [], izin: [], mangkir: [], libur: [] };
    for (let d = dari; d <= sampai; d = tambahHari(d, 1)) {
      tanggal.push(d);
      const n: Record<string, number> = { hadir: 0, telat: 0, izin: 0, mangkir: 0, libur: 0 };
      for (const p of Object.values(peta)) {
        const st = p[d] ?? 'luar';
        if (st === 'hadir' || st === 'telat' || st === 'mangkir' || st === 'libur') n[st]++;
        else if (st === 'setengah') n.hadir++;
        else if (st === 'cuti' || st === 'ket') n.izin++;
      }
      for (const k of Object.keys(n)) seri[k].push(n[k]);
    }
    /* komposisi hari ini & per lokasi; daftar orang per kartu memakai status yang sama agar jumlahnya selalu cocok */
    const hariIni: Record<string, number> = { hadir: 0, telat: 0, cuti: 0, ket: 0, libur: 0, belum: 0 };
    const lokasi = new Map<string, Baris>();
    const abs = new Map((await q('SELECT user_id, in_time, out_time, menit_telat, kerja_dari FROM absensi WHERE tanggal=? AND in_time IS NOT NULL', [sampai])).map((r) => [r.user_id as number, r]));
    const ketHari = new Map((await q("SELECT user_id, jenis FROM ketidakhadiran WHERE tanggal=? AND status='Disetujui'", [sampai])).map((r) => [r.user_id as number, labelKet(r.jenis)]));
    const cutiHari = new Map((await q("SELECT user_id, jenis FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [sampai, sampai])).map((r) => [r.user_id as number, r.jenis as string]));
    const LABEL: Record<string, string> = { hadir: 'Tepat waktu', telat: 'Terlambat', setengah: 'Setengah hari', cuti: 'Cuti', ket: 'Izin', libur: 'Libur', belum: 'Belum absen', luar: 'Belum / sudah tidak bekerja', mangkir: 'Tidak hadir' };
    const orang: Baris[] = [];
    for (const x of users) {
      const st = peta[x.id]?.[sampai] ?? 'luar';
      if (st in hariIni) hariIni[st]++;
      else if (st === 'setengah') hariIni.hadir++;
      const a = abs.get(x.id);
      orang.push({ id: x.id, nik: x.nik, nama: x.nama, divisi: x.dept, jabatan: x.jabatan, lokasi: x.cnama || '', statusKerja: x.status_kerja, tglMasuk: x.tgl_masuk,
        foto: x.foto_profil ? '/uploads/avatar/' + x.foto_profil : '', status: st, statusLabel: LABEL[st] ?? st,
        masuk: a?.in_time ? String(a.in_time).slice(0, 5) : '', pulang: a?.out_time ? String(a.out_time).slice(0, 5) : '',
        telat: st === 'telat' ? Number(a?.menit_telat ?? 0) : 0, dari: a?.kerja_dari === 'wfh' ? 'WFH' : a?.kerja_dari === 'dlk' ? 'Dinas' : '',
        keterangan: st === 'cuti' ? cutiHari.get(x.id) ?? 'Cuti' : st === 'ket' ? ketHari.get(x.id) ?? 'Izin' : '' });
      const l = x.cnama || 'Tanpa lokasi';
      if (!lokasi.has(l)) lokasi.set(l, { nama: l, total: 0, hadir: 0, libur: 0 });
      const o = lokasi.get(l)!;
      o.total++;
      if (st === 'hadir' || st === 'telat' || st === 'setengah') o.hadir++;
      if (st === 'libur' || st === 'cuti' || st === 'ket') o.libur++;
    }
    /* komposisi SDM */
    const grup = (kol: string) => {
      const h = new Map<string, number>();
      for (const x of users) { const k = String(x[kol] ?? '').trim() || 'Belum diisi'; h.set(k, (h.get(k) ?? 0) + 1); }
      return [...h.entries()].sort((a, b) => b[1] - a[1]).map(([nama, nilai]) => ({ nama, nilai }));
    };
    const top = await q(`SELECT u.nama, SUM(a.menit_telat) menit, COUNT(*) kali FROM absensi a JOIN users u ON u.id=a.user_id
      WHERE a.terlambat=1 AND a.jam_mode<>'fleksibel' AND DATE_FORMAT(a.tanggal,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')
      GROUP BY u.id ORDER BY menit DESC LIMIT 7`);
    const jam = await q(`SELECT YEARWEEK(tanggal,3) mg, MIN(tanggal) awal, ROUND(AVG(menit_kerja)/60,2) rata, ROUND(SUM(lembur_menit)/60,1) lembur
      FROM absensi WHERE out_time IS NOT NULL AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK) GROUP BY mg ORDER BY mg`);
    return {
      tanggal, seri, hariIni, total: users.length, lokasi: [...lokasi.values()], orang: orang.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')),
      dept: grup('dept'), statusKerja: grup('status_kerja'), jk: grup('jk'),
      topTelat: top.map((r) => ({ nama: r.nama, menit: Number(r.menit), kali: Number(r.kali) })),
      jamMingguan: jam.map((r) => ({ awal: r.awal, rata: Number(r.rata), lembur: Number(r.lembur) })),
    };
  },
};
