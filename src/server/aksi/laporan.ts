/* Laporan HC: absensi per tanggal / rentang tanggal, dan cuti per pegawai */
import { q, q1, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { cutiAktif, cutiPending, cutiTerpakai, jadwalHari, jatahCuti, KET_TETAP_KERJA, labelKet, need } from '@/lib/aturan';
import { setg } from '@/lib/pengaturan';
import { epoch, jamWIB, POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';
import { hasilHalaman, paramHalaman, polaCari } from '@/lib/paginasi';

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
  async lap_cuti(m) {
    await need(['admin']);
    const th = i(m, 'tahun', Number(tglWIB().slice(0, 4)));
    const pg = paramHalaman(m), cariSql = pg.cari ? ' AND (nama LIKE ? OR nik LIKE ? OR dept LIKE ?)' : '';
    const args: any[] = pg.cari ? Array(3).fill(polaCari(pg.cari)) : [];
    const count = await q1("SELECT COUNT(*) n FROM users WHERE aktif=1 AND role<>'direktur'" + cariSql, args);
    const users = await q("SELECT * FROM users WHERE aktif=1 AND role<>'direktur'" + cariSql + ' ORDER BY dept, nama' + (m.all ? '' : ' LIMIT 8 OFFSET ?'), m.all ? args : [...args, pg.offset]);
    const detail: Record<number, Baris[]> = {};
    for (const c of await q(`SELECT user_id, jenis, mulai, selesai, hari, alasan, approver FROM cuti
      WHERE status='Disetujui' AND YEAR(mulai)=? ORDER BY mulai`, [th]))
      (detail[c.user_id] ??= []).push({ jenis: c.jenis, mulai: c.mulai, selesai: c.selesai, hari: c.hari, alasan: c.alasan, approver: c.approver });
    const izin: Record<number, Record<string, number>> = {};
    for (const r of await q("SELECT user_id, jenis, COUNT(*) n FROM ketidakhadiran WHERE status='Disetujui' AND YEAR(tanggal)=? GROUP BY user_id, jenis", [th]))
      (izin[r.user_id] ??= {})[r.jenis] = Number(r.n);
    const hasil = [];
    for (const u of users) {
      const jatah = jatahCuti(u), pakai = await cutiTerpakai(u.id, th), iz = izin[u.id] ?? {};
      hasil.push({
        userId: u.id, nik: u.nik, nama: u.nama, divisi: u.dept, jabatan: u.jabatan, berhak: cutiAktif(u), jatah, terpakai: pakai,
        menunggu: await cutiPending(u.id, th), sisa: jatah - pakai, cuti: detail[u.id] ?? [],
        sakit: iz.sakit ?? 0, izin: (iz.izin ?? 0) + (iz.keperluan ?? 0) + (iz.lainnya ?? 0),
        setengahHari: iz.setengah_hari ?? 0, wfh: iz.wfh ?? 0, dlk: iz.dlk ?? 0,
      });
    }
    return m.all ? hasil : hasilHalaman(hasil, Number(count?.n ?? 0), pg.page);
  },
};
