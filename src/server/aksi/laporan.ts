/* Laporan: absensi per tanggal / rentang tanggal (HC), cuti, lembur, dan dinas luar kota per pegawai (HC semua, Supervisor timnya) */
import { q, q1, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { cakupanTim, cutiAktif, hariLiburMingguan, liburResmi, cutiPenyesuaian, cutiPending, cutiTerpakai, jadwalHari, jatahCuti, KET_TETAP_KERJA, labelKet, need, periodeCuti, sisaCuti, sqlCakupan } from '@/lib/aturan';
import { setg } from '@/lib/pengaturan';
import { statusHarian } from '@/lib/statusHarian';
import { epoch, hariIso, jamWIB, POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';
import { hasilHalaman, paramHalaman, polaCari } from '@/lib/paginasi';

/* periode rekap finance: 27 bulan lalu – 26 bulan ini (sama dengan rekap keterlambatan) */
function periodeFinance(periode: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) gagal('Periode tidak sah');
  const [th, bl] = periode.split('-').map(Number), lalu = bl === 1 ? `${th - 1}-12` : `${th}-${String(bl - 1).padStart(2, '0')}`;
  const dari = `${lalu}-27`, sampai = `${periode}-26`, tanggal: string[] = [];
  for (let t = dari; t <= sampai; t = tambahHari(t, 1)) tanggal.push(t);
  return { dari, sampai, tanggal };
}
/* karyawan yang masuk rekap finance: aktif, atau keluar di dalam/sesudah periode; Direksi (direktur divisi Direksi) terpisah, akun HR tidak ikut */
async function karyawanFinance(dari: string) {
  const users = await q(`SELECT * FROM users WHERE aktif=1 OR (tgl_keluar IS NOT NULL AND tgl_keluar >= ?) ORDER BY dept, nama`, [dari]);
  return { karyawan: users.filter((u) => u.role !== 'direktur'), direksi: users.filter((u) => u.role === 'direktur' && /direksi/i.test(String(u.dept ?? ''))) };
}

export const aksiLaporan: KumpulanAksi = {
  /* status setiap karyawan pada setiap tanggal.
     Urutan: hadir > cuti > izin/sakit > libur > belum waktunya > tanpa keterangan */
  async lap_harian(m) {
    await need(['admin']);
    const dari = s(m, 'dari', tglWIB()), sampai = s(m, 'sampai', dari);
    if (!POLA_TGL.test(dari) || !POLA_TGL.test(sampai) || sampai < dari) gagal('Rentang tanggal tidak sah');
    if ((epoch(sampai) - epoch(dari)) / 86400 > 30) gagal('Rentang paling panjang 31 hari');
    const hariIni = tglWIB(), jamKini = jamWIB(), jamPulang = (await setg('jam_pulang', '17:00')) + ':00';
    const users = await q(`SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.aktif=1 AND u.role<>'direktur' ORDER BY u.dept, u.nama`);
    const abs: Record<number, Record<string, Baris>> = {};
    for (const r of await q('SELECT * FROM absensi WHERE tanggal BETWEEN ? AND ?', [dari, sampai])) (abs[r.user_id] ??= {})[r.tanggal] = r;
    const cuti: Record<number, Baris[]> = {};
    for (const r of await q("SELECT user_id, jenis, mulai, selesai FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [sampai, dari]))
      (cuti[r.user_id] ??= []).push(r);
    const ket: Record<number, Record<string, Baris[]>> = {};
    for (const r of await q(`SELECT user_id, tanggal, jenis, sesi, status, alasan FROM ketidakhadiran
      WHERE tanggal BETWEEN ? AND ? AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui')`, [dari, sampai]))
      ((ket[r.user_id] ??= {})[r.tanggal] ??= []).push(r);

    const baris: Baris[] = [];
    const ringkas: Record<string, number> = { hadir: 0, telat: 0, wfh: 0, dlk: 0, cuti: 0, izin: 0, libur: 0, alpa: 0, belum: 0 };
    for (let t = dari; t <= sampai; t = tambahHari(t, 1)) {
      for (const u of users) {
        if (u.tgl_masuk > t || (u.tgl_keluar && u.tgl_keluar < t)) continue;
        const a = abs[u.id]?.[t], daftarKet = ket[u.id]?.[t] ?? [];
        let kat = '', status = '';
        const catatan: string[] = [];
        for (const k of daftarKet) if (k.jenis === 'setengah_hari') catatan.push(`Izin ½ hari ${k.sesi}${k.status === 'Disetujui' ? '' : ' (menunggu)'}`);
        if (a) {
          kat = 'hadir'; status = 'Hadir';
          if (a.kerja_dari === 'wfh') { status = 'WFH'; ringkas.wfh++; }
          if (a.kerja_dari === 'dlk') { status = 'Dinas Luar Kota'; ringkas.dlk++; }
          if (a.terlambat === 1) { catatan.push(`Telat ${a.menit_telat} mnt`); ringkas.telat++; }
          if (a.in_luar === 1) catatan.push('Di luar area');
          if (a.in_time && !a.out_time) catatan.push(a.lupa_out === 1 ? 'Lupa absen pulang' : 'Belum absen pulang');
        } else {
          const c = (cuti[u.id] ?? []).find((x) => x.mulai <= t && x.selesai >= t);
          if (c) { kat = 'cuti'; status = c.jenis; }
          if (!kat) {
            const k = daftarKet.find((x) => !KET_TETAP_KERJA.includes(x.jenis));
            if (k) { kat = 'izin'; status = labelKet(k.jenis) + (k.status === 'Disetujui' ? '' : ' (menunggu)'); if (k.alasan) catatan.push(k.alasan); }
          }
          if (!kat) {
            const jd = await jadwalHari(u, t);
            if (jd.libur) { kat = 'libur'; status = 'Libur' + (jd.ket ? ' — ' + jd.ket : ''); }
            else if (t > hariIni || (t === hariIni && jamKini < jamPulang)) { kat = 'belum'; status = 'Belum absen'; }
            else { kat = 'alpa'; status = 'Tanpa keterangan'; }
          }
          // cuti yang jatuh di hari libur tidak dihitung sebagai cuti
          if (kat === 'cuti' && (await jadwalHari(u, t)).libur) { kat = 'libur'; status = 'Libur'; }
        }
        ringkas[kat]++;
        baris.push({
          tanggal: t, userId: u.id, nik: u.nik, nama: u.nama, divisi: u.dept, jabatan: u.jabatan, lokasi: u.cnama ?? '',
          kategori: kat, status, masuk: a?.in_time ? String(a.in_time).slice(0, 5) : '', pulang: a?.out_time ? String(a.out_time).slice(0, 5) : '',
          menitTelat: a ? a.menit_telat : 0, menitKerja: a ? a.menit_kerja : 0, catatan: catatan.join(' · '),
        });
      }
    }
    const pg = paramHalaman(m), teks = pg.cari.toLowerCase();
    const cocok = (b: Baris) => {
      if (teks && !`${b.nama} ${b.nik} ${b.divisi}`.toLowerCase().includes(teks)) return false;
      const k = String(m.kategori ?? '');
      if (!k) return true;
      if (k === 'telat') return Number(b.menitTelat) > 0 && b.kategori === 'hadir';
      if (k === 'wfh') return b.status === 'WFH';
      if (k === 'dlk') return b.status === 'Dinas Luar Kota';
      return b.kategori === k;
    };
    const terpilih = baris.filter(cocok);
    return { dari, sampai, ringkas, baris: m.all ? terpilih : terpilih.slice(pg.offset, pg.offset + 8),
      page: pg.page, pageSize: 8, total: terpilih.length, totalPages: Math.max(1, Math.ceil(terpilih.length / 8)) };
  },

  /* jatah, pemakaian, sisa cuti tahunan & tanggal cuti yang diambil, per pegawai */
  async lap_lembur(m) {
    const u = await need(['atasan']), tim = await cakupanTim(u);
    const kini = tglWIB(), dari = s(m, 'dari', kini.slice(0, 8) + '01'), sampai = s(m, 'sampai', kini);
    if (!POLA_TGL.test(dari) || !POLA_TGL.test(sampai) || sampai < dari) gagal('Rentang tanggal tidak sah');
    if ((epoch(sampai) - epoch(dari)) / 86400 > 366) gagal('Rentang paling panjang satu tahun');
    const pg = paramHalaman(m), cariSql = pg.cari ? ' AND (x.nama LIKE ? OR x.nik LIKE ? OR x.dept LIKE ?)' : '';
    const args: unknown[] = [dari, sampai, ...(pg.cari ? Array(3).fill(polaCari(pg.cari)) : [])];
    const sumber = `FROM pengajuan p JOIN users x ON x.id=p.user_id
      WHERE p.jenis='lembur' AND p.status<>'Dibatalkan' AND p.tanggal BETWEEN ? AND ?${cariSql}${sqlCakupan(tim, 'p.user_id')}`;
    const setuju = "p.status='Disetujui'", tunggu = "p.status IN ('Menunggu HR','Menunggu Rekomendasi')";
    const ang = `COALESCE(SUM(IF(${setuju},p.menit,0)),0) menit_setuju, COALESCE(SUM(${setuju}),0) n_setuju, COALESCE(SUM(IF(${tunggu},p.menit,0)),0) menit_tunggu,
      COALESCE(SUM(${tunggu}),0) n_tunggu, COALESCE(SUM(p.status LIKE 'Ditolak%'),0) n_tolak`;
    const tot = await q1(`SELECT COUNT(DISTINCT p.user_id) orang, ${ang} ${sumber}`, args);
    const baris = await q(`SELECT p.user_id, x.nik, x.nama, x.dept, x.jabatan, ${ang} ${sumber} GROUP BY p.user_id ORDER BY menit_setuju DESC, x.nama` + (m.all ? '' : ' LIMIT ? OFFSET ?'),
      m.all ? args : [...args, pg.limit, pg.offset]);
    const ids = baris.map((x) => Number(x.user_id)).join(',') || '0';
    const detail: Record<number, Baris[]> = {};
    // hitungan upah lembur berbeda antara hari biasa, Sabtu, Minggu, dan libur nasional
    const per: Record<number, Record<string, number>> = {};
    for (const r of await q(`SELECT p.user_id, p.tanggal, p.jam_mulai, p.jam_selesai, p.menit, p.alasan, p.status, p.approver FROM pengajuan p
      WHERE p.jenis='lembur' AND p.status<>'Dibatalkan' AND p.tanggal BETWEEN ? AND ? AND p.user_id IN (${ids}) ORDER BY p.tanggal DESC, p.id DESC`, [dari, sampai])) {
      const libur = await liburResmi(r.tanggal), h = hariIso(r.tanggal);
      const jenisHari = libur ? 'libur' : h === 7 ? 'minggu' : h === 6 ? 'sabtu' : 'biasa';
      (detail[r.user_id] ??= []).push({ tanggal: r.tanggal, jenisHari, namaLibur: libur?.nama ?? '', jamMulai: String(r.jam_mulai ?? '').slice(0, 5), jamSelesai: String(r.jam_selesai ?? '').slice(0, 5),
        menit: Number(r.menit), alasan: r.alasan, status: r.status, approver: r.approver });
      if (r.status === 'Disetujui') { const o = (per[r.user_id] ??= {}); o[jenisHari] = (o[jenisHari] ?? 0) + Number(r.menit); }
    }
    const items = baris.map((x) => ({ userId: x.user_id, nik: x.nik, nama: x.nama, divisi: x.dept, jabatan: x.jabatan, menitDisetujui: Number(x.menit_setuju), jumlahDisetujui: Number(x.n_setuju),
      menitPerHari: { biasa: 0, sabtu: 0, minggu: 0, libur: 0, ...per[x.user_id] },
      menitMenunggu: Number(x.menit_tunggu), jumlahMenunggu: Number(x.n_tunggu), jumlahDitolak: Number(x.n_tolak), rincian: detail[x.user_id] ?? [] }));
    if (m.all) return items;
    return { ...hasilHalaman(items, Number(tot?.orang ?? 0), pg.page), ringkas: { orang: Number(tot?.orang ?? 0), menitDisetujui: Number(tot?.menit_setuju ?? 0), menitMenunggu: Number(tot?.menit_tunggu ?? 0), jumlahMenunggu: Number(tot?.n_tunggu ?? 0) } };
  },

  /* Dinas luar kota per pegawai, dari pengajuan DLK (satu baris per hari). Hari dinas dipisah hari biasa / Sabtu / Minggu & libur
     karena uang dinas bisa berbeda. Satu perjalanan = hari berurutan yang disetujui dengan tujuan yang sama. */
  async lap_dlk(m) {
    const u = await need(['atasan']), tim = await cakupanTim(u);
    const kini = tglWIB(), dari = s(m, 'dari', kini.slice(0, 8) + '01'), sampai = s(m, 'sampai', kini);
    if (!POLA_TGL.test(dari) || !POLA_TGL.test(sampai) || sampai < dari) gagal('Rentang tanggal tidak sah');
    if ((epoch(sampai) - epoch(dari)) / 86400 > 366) gagal('Rentang paling panjang satu tahun');
    const pg = paramHalaman(m), cariSql = pg.cari ? ' AND (x.nama LIKE ? OR x.nik LIKE ? OR x.dept LIKE ? OR k.alasan LIKE ?)' : '';
    const args: unknown[] = [dari, sampai, ...(pg.cari ? Array(4).fill(polaCari(pg.cari)) : [])];
    const sumber = `FROM ketidakhadiran k JOIN users x ON x.id=k.user_id
      WHERE k.jenis='dlk' AND k.status<>'Dibatalkan' AND k.tanggal BETWEEN ? AND ?${cariSql}${sqlCakupan(tim, 'k.user_id')}`;
    const ang = `COALESCE(SUM(k.status='Disetujui'),0) n_setuju, COALESCE(SUM(k.status IN ('Menunggu HR','Menunggu Rekomendasi')),0) n_tunggu,
      COALESCE(SUM(k.status LIKE 'Ditolak%'),0) n_tolak`;
    const tot = await q1(`SELECT COUNT(DISTINCT k.user_id) orang, ${ang} ${sumber}`, args);
    const baris = await q(`SELECT k.user_id, x.nik, x.nama, x.dept, x.jabatan, ${ang} ${sumber} GROUP BY k.user_id ORDER BY n_setuju DESC, x.nama` + (m.all ? '' : ' LIMIT ? OFFSET ?'),
      m.all ? args : [...args, pg.limit, pg.offset]);
    const ids = baris.map((x) => Number(x.user_id)).join(',') || '0';
    const abs = new Map((await q(`SELECT user_id, tanggal, in_time, out_time FROM absensi WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ? AND in_time IS NOT NULL`, [dari, sampai]))
      .map((r) => [r.user_id + '|' + r.tanggal, r]));
    const detail: Record<number, Baris[]> = {}, per: Record<number, Record<string, number>> = {}, perjalanan: Record<number, number> = {};
    const akhir: Record<number, { t: string; tujuan: string }> = {};
    for (const r of await q(`SELECT k.user_id, k.tanggal, k.alasan, k.bukti_link, k.status, k.approver, k.created_at FROM ketidakhadiran k
      WHERE k.jenis='dlk' AND k.status<>'Dibatalkan' AND k.tanggal BETWEEN ? AND ? AND k.user_id IN (${ids}) ORDER BY k.user_id, k.tanggal, k.id`, [dari, sampai])) {
      const libur = await liburResmi(r.tanggal), h = hariIso(r.tanggal);
      const jenisHari = libur ? 'libur' : h === 7 ? 'minggu' : h === 6 ? 'sabtu' : 'biasa', a = abs.get(r.user_id + '|' + r.tanggal);
      (detail[r.user_id] ??= []).push({ tanggal: r.tanggal, jenisHari, namaLibur: libur?.nama ?? '', tujuan: r.alasan, buktiLink: r.bukti_link ?? '', status: r.status,
        approver: r.approver, diajukan: r.created_at, masuk: a?.in_time ? String(a.in_time).slice(0, 5) : '', pulang: a?.out_time ? String(a.out_time).slice(0, 5) : '' });
      if (r.status !== 'Disetujui') continue;
      const o = (per[r.user_id] ??= {}); o[jenisHari] = (o[jenisHari] ?? 0) + 1;
      const tujuan = String(r.alasan ?? '').trim().toLowerCase(), sblm = akhir[r.user_id];
      if (!sblm || tambahHari(sblm.t, 1) !== r.tanggal || sblm.tujuan !== tujuan) perjalanan[r.user_id] = (perjalanan[r.user_id] ?? 0) + 1;
      akhir[r.user_id] = { t: r.tanggal, tujuan };
    }
    const items = baris.map((x) => ({ userId: x.user_id, nik: x.nik, nama: x.nama, divisi: x.dept, jabatan: x.jabatan,
      hariDisetujui: Number(x.n_setuju), perjalanan: perjalanan[x.user_id] ?? 0, hariPerJenis: { biasa: 0, sabtu: 0, minggu: 0, libur: 0, ...per[x.user_id] },
      hariMenunggu: Number(x.n_tunggu), hariDitolak: Number(x.n_tolak), rincian: (detail[x.user_id] ?? []).reverse() }));
    if (m.all) return items;
    return { ...hasilHalaman(items, Number(tot?.orang ?? 0), pg.page),
      ringkas: { orang: Number(tot?.orang ?? 0), hariDisetujui: Number(tot?.n_setuju ?? 0), hariMenunggu: Number(tot?.n_tunggu ?? 0), hariDitolak: Number(tot?.n_tolak ?? 0) } };
  },

  /* Rekap keterlambatan untuk finance: periode absensi 27 bulan lalu – 26 bulan ini.
     Denda per hari terlambat: sampai 20 menit tanpa denda, lalu Rp25.000 per 20 menit berikutnya (21–40 = 25 rb, 41–60 = 50 rb, dst). */
  async lap_telat_finance(m) {
    await need(['admin']);
    const periode = s(m, 'periode');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) gagal('Periode tidak sah');
    const [th, bl] = periode.split('-').map(Number), lalu = bl === 1 ? `${th - 1}-12` : `${th}-${String(bl - 1).padStart(2, '0')}`;
    const dari = `${lalu}-27`, sampai = `${periode}-26`;
    const tanggal: string[] = [];
    for (let t = dari; t <= sampai; t = tambahHari(t, 1)) tanggal.push(t);
    const libur: string[] = [];
    for (const t of tanggal) if (await liburResmi(t)) libur.push(t);
    const users = await q(`SELECT id, nik, nama, dept, role FROM users WHERE aktif=1 OR (tgl_keluar IS NOT NULL AND tgl_keluar >= ?) ORDER BY dept, nama`, [dari]);
    const menit: Record<number, Record<string, number>> = {};
    for (const r of await q(`SELECT user_id, tanggal, menit_telat FROM absensi WHERE tanggal BETWEEN ? AND ? AND terlambat=1 AND telat_diizinkan=0
      AND approval<>'ditolak' AND in_time IS NOT NULL AND jam_mode<>'fleksibel'`, [dari, sampai])) (menit[r.user_id] ??= {})[r.tanggal] = Number(r.menit_telat);
    const denda = (x: number) => (x <= 20 ? 0 : Math.ceil((x - 20) / 20) * 25000);
    const karyawan = users.filter((u) => u.role !== 'direktur').map((u) => {
      const mm = menit[u.id] ?? {}, nilaiHari = Object.values(mm);
      return { nik: u.nik, nama: u.nama, divisi: u.dept, menit: mm, totalMenit: nilaiHari.reduce((a, x) => a + x, 0), potongan: nilaiHari.reduce((a, x) => a + denda(x), 0) };
    });
    return { periode, dari, sampai, tanggal, libur, direksi: users.filter((u) => u.role === 'direktur' && /direksi/i.test(String(u.dept ?? ''))).map((u) => ({ nik: u.nik, nama: u.nama })), karyawan };
  },

  /* Rekap lembur untuk finance. Dasar periode: tanggal disetujui (bawaan, seperti rekap manual HC: lembur lama yang baru
     disetujui ikut dibayar bulan ini) atau tanggal lembur. Upah dihitung di Excel dengan rumus HC agar bisa disesuaikan. */
  async lap_lembur_finance(m) {
    await need(['admin']);
    const periode = s(m, 'periode'), { dari, sampai } = periodeFinance(periode), dasar = s(m, 'dasar') === 'tanggal' ? 'tanggal' : 'disetujui';
    const kolom = dasar === 'tanggal' ? 'p.tanggal' : 'DATE(p.tgl_putusan)';
    const rows = await q(`SELECT p.user_id, u.nama, u.dept, u.jabatan, p.tanggal, p.jam_mulai, p.jam_selesai, p.menit, p.alasan, p.approver, p.tgl_putusan
      FROM pengajuan p JOIN users u ON u.id=p.user_id WHERE p.jenis='lembur' AND p.status='Disetujui' AND ${kolom} BETWEEN ? AND ?
      ORDER BY u.dept, u.nama, p.tanggal, p.jam_mulai`, [dari, sampai]);
    const orang = new Map<number, Baris>();
    for (const r of rows) {
      const o = orang.get(r.user_id) ?? { nama: r.nama, divisi: r.dept, jabatan: r.jabatan, lembur: [] as Baris[] };
      const libur = await liburResmi(r.tanggal);
      o.lembur.push({ tanggal: r.tanggal, hariIso: hariIso(r.tanggal), libur: libur?.nama ?? '', mulai: String(r.jam_mulai ?? '').slice(0, 5), selesai: String(r.jam_selesai ?? '').slice(0, 5),
        menit: Number(r.menit), alasan: r.alasan, approver: r.approver, disetujui: String(r.tgl_putusan ?? '').slice(0, 10) });
      orang.set(r.user_id, o);
    }
    return { periode, dari, sampai, dasar, orang: [...orang.values()] };
  },

  /* Rekap perjalanan dinas (DLK) untuk finance: hari DLK disetujui di periode; hari berurutan dengan tujuan sama = satu perjalanan.
     Kompensasi per hari dihitung di Excel (bawaan Rp25.000, mengikuti rekap manual HC). */
  async lap_dlk_finance(m) {
    await need(['admin']);
    const periode = s(m, 'periode'), { dari, sampai } = periodeFinance(periode);
    const rows = await q(`SELECT k.user_id, u.nama, u.dept, u.jabatan, k.tanggal, k.alasan FROM ketidakhadiran k JOIN users u ON u.id=k.user_id
      WHERE k.jenis='dlk' AND k.status='Disetujui' AND k.tanggal BETWEEN ? AND ? ORDER BY u.dept, u.nama, k.tanggal`, [dari, sampai]);
    const orang = new Map<number, Baris>();
    for (const r of rows) {
      const o = orang.get(r.user_id) ?? { nama: r.nama, divisi: r.dept, jabatan: r.jabatan, perjalanan: [] as Baris[] };
      const akhir = o.perjalanan[o.perjalanan.length - 1], tujuan = String(r.alasan ?? '').trim();
      // hari kerja berikutnya (lewat akhir pekan/libur di antaranya) dengan tujuan sama masih satu perjalanan
      let sambung = false;
      if (akhir && akhir.tujuan.toLowerCase() === tujuan.toLowerCase()) {
        sambung = true;
        for (let t = tambahHari(akhir.kembali, 1); t < r.tanggal; t = tambahHari(t, 1)) if (hariIso(t) < 6 && !(await liburResmi(t))) { sambung = false; break; }
      }
      if (sambung) { akhir.kembali = r.tanggal; akhir.hari.push(r.tanggal); }
      else o.perjalanan.push({ berangkat: r.tanggal, kembali: r.tanggal, hari: [r.tanggal], tujuan });
      orang.set(r.user_id, o);
    }
    for (const o of orang.values()) for (const p of o.perjalanan) {
      const jenis = [];
      for (const t of p.hari) { const lb = await liburResmi(t); jenis.push(lb ? 'libur' : hariIso(t) === 7 ? 'minggu' : hariIso(t) === 6 ? 'sabtu' : 'biasa'); }
      p.jumlahHari = p.hari.length;
      p.ketHari = jenis.every((j) => j === 'biasa') ? 'Hari kerja' : [...new Set(jenis.map((j) => ({ biasa: 'Hari kerja', sabtu: 'Sabtu', minggu: 'Minggu', libur: 'Libur nasional' } as Record<string, string>)[j]))].join(' + ');
    }
    return { periode, dari, sampai, orang: [...orang.values()] };
  },

  /* Rekap kehadiran untuk finance: kode per hari mengikuti rekap manual HC.
     1 hadir · PD perjalanan dinas · W WFH · S sakit · I izin · C cuti tahunan · C.K cuti lain · A alpa · kosong = libur / belum terjadi / belum bekerja.
     Hari kerja = hari terjadwal masuk di periode (selama masa kerja). Potongan dihitung di Excel dari tunjangan kehadiran yang diisi HC. */
  async lap_hadir_finance(m) {
    await need(['admin']);
    const periode = s(m, 'periode'), { dari, sampai, tanggal } = periodeFinance(periode), hariIni = tglWIB();
    const { karyawan, direksi } = await karyawanFinance(dari);
    const libur: string[] = [];
    for (const t of tanggal) if (await liburResmi(t)) libur.push(t);
    const peta = await statusHarian(karyawan, dari, sampai);
    const ids = karyawan.map((u) => Number(u.id)).join(',') || '0';
    const ket: Record<string, string> = {}, cuti: Record<string, string> = {}, jdw: Record<string, number | null> = {};
    for (const r of await q(`SELECT user_id, tanggal, jenis FROM ketidakhadiran WHERE status='Disetujui' AND tanggal BETWEEN ? AND ? AND user_id IN (${ids})`, [dari, sampai]))
      ket[r.user_id + '|' + r.tanggal] = r.jenis;
    for (const r of await q(`SELECT user_id, jenis, mulai, selesai FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=? AND user_id IN (${ids})`, [sampai, dari]))
      for (let t = r.mulai > dari ? r.mulai : dari; t <= (r.selesai < sampai ? r.selesai : sampai); t = tambahHari(t, 1)) cuti[r.user_id + '|' + t] = r.jenis;
    for (const r of await q(`SELECT user_id, tanggal, shift_id FROM jadwal_shift WHERE tanggal BETWEEN ? AND ? AND user_id IN (${ids})`, [dari, sampai]))
      jdw[r.user_id + '|' + r.tanggal] = r.shift_id;
    const hasil = [];
    for (const u of karyawan) {
      const mingguan = await hariLiburMingguan(u), kode: Record<string, string | number> = {};
      let hariKerja = 0;
      for (const t of tanggal) {
        const k = u.id + '|' + t;
        const bekerja = (!u.tgl_masuk || t >= u.tgl_masuk) && (!u.tgl_keluar || t <= u.tgl_keluar);
        const liburHari = k in jdw ? jdw[k] === null : mingguan.includes(hariIso(t)) || ((u.jam_mode ?? 'tetap') !== 'shift' && libur.includes(t));
        if (bekerja && !liburHari) hariKerja++;
        if (!bekerja || t > hariIni) continue;
        const st = peta[u.id]?.[t] ?? 'luar', jk = ket[k];
        if (jk === 'dlk') kode[t] = 'PD';
        else if (jk === 'wfh') kode[t] = 'W';
        else if (st === 'hadir' || st === 'telat' || st === 'setengah') kode[t] = 1;
        else if (st === 'cuti') kode[t] = /tahunan/i.test(cuti[k] ?? '') ? 'C' : 'C.K';
        else if (st === 'ket') kode[t] = jk === 'sakit' ? 'S' : jk === 'libur' ? '' : 'I';
        else if (st === 'mangkir') kode[t] = 'A';
      }
      hasil.push({ nik: u.nik, nama: u.nama, jabatan: u.jabatan ?? '', divisi: u.dept ?? '', tglMasuk: u.tgl_masuk ?? '', kode, hariKerja,
        sisaCuti: (await cutiAktif(u)) ? await sisaCuti(u) : null });
    }
    return { periode, dari, sampai, tanggal, libur, direksi: direksi.map((u) => ({ nama: u.nama, jabatan: u.jabatan ?? '' })), karyawan: hasil };
  },

  async lap_cuti(m) {
    const u0 = await need(['atasan']), tim = await cakupanTim(u0);
    // tiap karyawan punya periode sendiri (12 bulan sejak tanggal masuk); laporan memakai periode yang berlaku pada tanggal ini
    const tgl = s(m, 'tanggal', tglWIB());
    if (!POLA_TGL.test(tgl)) gagal('Tanggal tidak sah');
    const pg = paramHalaman(m), cariSql = (pg.cari ? ' AND (nama LIKE ? OR nik LIKE ? OR dept LIKE ?)' : '') + sqlCakupan(tim, 'id');
    const args: any[] = pg.cari ? Array(3).fill(polaCari(pg.cari)) : [];
    const count = await q1("SELECT COUNT(*) n FROM users WHERE aktif=1 AND role<>'direktur'" + cariSql, args);
    const users = await q("SELECT * FROM users WHERE aktif=1 AND role<>'direktur'" + cariSql + ' ORDER BY dept, nama' + (m.all ? '' : ' LIMIT 8 OFFSET ?'), m.all ? args : [...args, pg.offset]);
    const ids = users.map((u) => Number(u.id)).join(',') || '0', luasDari = tambahHari(tgl, -366), luasSampai = tambahHari(tgl, 366);
    const cutiAll = await q(`SELECT user_id, jenis, mulai, selesai, hari, alasan, approver FROM cuti
      WHERE status='Disetujui' AND user_id IN (${ids}) AND mulai BETWEEN ? AND ? ORDER BY mulai`, [luasDari, luasSampai]);
    const izinAll = await q(`SELECT user_id, jenis, tanggal FROM ketidakhadiran WHERE status='Disetujui' AND user_id IN (${ids}) AND tanggal BETWEEN ? AND ?`, [luasDari, luasSampai]);
    const hasil = [];
    for (const u of users) {
      const p = periodeCuti(u, tgl), dalam = (t: string) => t >= p.mulai && t <= p.selesai;
      const iz: Record<string, number> = {};
      for (const r of izinAll) if (r.user_id === u.id && dalam(r.tanggal)) iz[r.jenis] = (iz[r.jenis] ?? 0) + 1;
      const jatah = jatahCuti(u), pakai = await cutiTerpakai(u, tgl);
      hasil.push({
        userId: u.id, nik: u.nik, nama: u.nama, divisi: u.dept, jabatan: u.jabatan, berhak: cutiAktif(u), periode: p, jatah, terpakai: pakai,
        menunggu: await cutiPending(u, tgl), penyesuaian: await cutiPenyesuaian(u, tgl), sisa: await sisaCuti(u, tgl),
        cuti: cutiAll.filter((c) => c.user_id === u.id && dalam(c.mulai)).map((c) => ({ jenis: c.jenis, mulai: c.mulai, selesai: c.selesai, hari: c.hari, alasan: c.alasan, approver: c.approver })),
        sakit: iz.sakit ?? 0, izin: (iz.izin ?? 0) + (iz.keperluan ?? 0) + (iz.lainnya ?? 0),
        setengahHari: iz.setengah_hari ?? 0, wfh: iz.wfh ?? 0, dlk: iz.dlk ?? 0,
      });
    }
    return m.all ? hasil : hasilHalaman(hasil, Number(count?.n ?? 0), pg.page);
  },
};
