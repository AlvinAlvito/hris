/* Data grafik dashboard & ringkasan */
import { q, q1, type Baris } from '@/lib/db';
import { i } from '@/lib/http';
import { need } from '@/lib/aturan';
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
        else if (st === 'cuti' || st === 'ket') n.izin++;
      }
      for (const k of Object.keys(n)) seri[k].push(n[k]);
    }
    /* komposisi hari ini & per lokasi */
    const hariIni: Record<string, number> = { hadir: 0, telat: 0, cuti: 0, ket: 0, libur: 0, belum: 0 };
    const lokasi = new Map<string, Baris>();
    for (const x of users) {
      const st = peta[x.id]?.[sampai] ?? 'luar';
      if (st in hariIni) hariIni[st]++;
      const l = x.cnama || 'Tanpa lokasi';
      if (!lokasi.has(l)) lokasi.set(l, { nama: l, total: 0, hadir: 0, libur: 0 });
      const o = lokasi.get(l)!;
      o.total++;
      if (st === 'hadir' || st === 'telat') o.hadir++;
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
    const rb = await q(`SELECT kategori, SUM(COALESCE(nominal_disetujui, nominal)) total, COUNT(*) n FROM reimburse
      WHERE status IN ('Disetujui','Dibayar') AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) GROUP BY kategori ORDER BY total DESC`);
    const ks = await q1("SELECT COALESCE(SUM(nominal - terbayar),0) sisa, COUNT(*) n FROM kasbon WHERE status='Aktif'");
    return {
      tanggal, seri, hariIni, total: users.length, lokasi: [...lokasi.values()],
      dept: grup('dept'), statusKerja: grup('status_kerja'), jk: grup('jk'),
      topTelat: top.map((r) => ({ nama: r.nama, menit: Number(r.menit), kali: Number(r.kali) })),
      jamMingguan: jam.map((r) => ({ awal: r.awal, rata: Number(r.rata), lembur: Number(r.lembur) })),
      reimburse: rb.map((r) => ({ kategori: r.kategori, total: Number(r.total), n: Number(r.n) })),
      kasbon: { sisa: Number(ks?.sisa ?? 0), jumlah: Number(ks?.n ?? 0) },
    };
  },
};
