/* Data grafik dashboard & ringkasan */
import { q, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { labelKet, need } from '@/lib/aturan';
import { statusHarian } from '@/lib/statusHarian';
import { POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const LABEL: Record<string, string> = { hadir: 'Tepat waktu', telat: 'Terlambat', setengah: 'Setengah hari', cuti: 'Cuti', ket: 'Izin', libur: 'Libur', belum: 'Belum absen', luar: 'Belum / sudah tidak bekerja', mangkir: 'Tidak hadir' };
const SQL_USERS = `SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id WHERE u.aktif=1 AND u.role<>'direktur'`;

/* satu baris daftar orang di balik kartu dashboard; izin = izin yang disetujui walau tetap masuk (izin terlambat, WFH, setengah hari) */
function barisOrang(x: Baris, st: string, a: Baris | undefined, keterangan: string, izin = '') {
  const telatIzin = st === 'telat' && a?.telat_diizinkan === 1;
  return { id: x.id, nik: x.nik, nama: x.nama, divisi: x.dept, jabatan: x.jabatan, lokasi: x.cnama || '', statusKerja: x.status_kerja, tglMasuk: x.tgl_masuk,
    foto: x.foto_profil ? '/uploads/avatar/' + x.foto_profil : '', status: st, statusLabel: telatIzin ? 'Terlambat (izin)' : LABEL[st] ?? st, izin,
    masuk: a?.in_time ? String(a.in_time).slice(0, 5) : '', pulang: a?.out_time ? String(a.out_time).slice(0, 5) : '',
    telat: st === 'telat' ? Number(a?.menit_telat ?? 0) : 0, dari: a?.kerja_dari === 'wfh' ? 'WFH' : a?.kerja_dari === 'dlk' ? 'Dinas' : '', keterangan };
}
/* cuti & izin yang disetujui pada satu tanggal: user_id -> keterangan */
async function cutiKetPada(t: string) {
  const ket = new Map((await q("SELECT user_id, jenis, sesi FROM ketidakhadiran WHERE tanggal=? AND status='Disetujui'", [t]))
    .map((r) => [r.user_id as number, labelKet(r.jenis) + (r.sesi ? ` (${r.sesi})` : '')]));
  const cuti = new Map((await q("SELECT user_id, jenis FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [t, t])).map((r) => [r.user_id as number, r.jenis as string]));
  return { ket, cuti };
}
/* izin yang disetujui tetapi karyawan tetap bekerja pada tanggal itu: WFH, setengah hari (ketidakhadiran), izin terlambat & pulang lebih awal (pengajuan) */
async function izinHadirPada(t: string) {
  const izin = new Map<number, string[]>();
  const tambah = (uid: number, teks: string) => { const l = izin.get(uid) ?? []; if (!l.includes(teks)) l.push(teks); izin.set(uid, l); };
  for (const r of await q("SELECT user_id, jenis, sesi FROM ketidakhadiran WHERE tanggal=? AND status='Disetujui' AND jenis IN ('wfh','setengah_hari')", [t]))
    tambah(r.user_id, labelKet(r.jenis) + (r.sesi ? ` (${r.sesi})` : ''));
  for (const r of await q("SELECT user_id, jenis, jam_mulai FROM pengajuan WHERE tanggal=? AND status='Disetujui' AND jenis IN ('izin_telat','pulang_awal')", [t]))
    tambah(r.user_id, r.jenis === 'pulang_awal' ? 'Pulang lebih awal' + (r.jam_mulai ? ` (${String(r.jam_mulai).slice(0, 5)})` : '')
      : 'Izin terlambat' + (r.jam_mulai ? ` (tiba ${String(r.jam_mulai).slice(0, 5)})` : ''));
  return new Map([...izin.entries()].map(([k, v]) => [k, v.join(' + ')]));
}
/* status harian menganggap terlambat dengan izin sebagai hadir (untuk payroll & KPI); di dashboard tetap ditampilkan terlambat (izin) */
const KOLOM_ABS = 'user_id, in_time, out_time, menit_telat, kerja_dari, terlambat, telat_diizinkan, jam_mode, approval';
function statusTampil(st: string, a: Baris | undefined) {
  return st === 'hadir' && a && a.terlambat === 1 && a.telat_diizinkan === 1 && a.jam_mode !== 'fleksibel' && a.approval !== 'ditolak' ? 'telat' : st;
}

/* status yang termasuk tiap kartu dashboard yang bisa dilihat per tanggal (sama dengan kartu hari ini) */
const KARTU_TANGGAL: Record<string, string[]> = { cuti: ['cuti', 'ket'], hadir: ['hadir', 'telat', 'setengah'], telat: ['telat'] };

/* Kartu Cuti / izin, Hadir, atau Terlambat untuk tanggal pilihan. Sampai hari ini memakai status harian yang sama
   dengan kartu (yang tetap absen masuk dihitung hadir). Tanggal mendatang hanya untuk Cuti / izin: cuti & izin yang sudah disetujui. */
async function rincianTanggal(t: string, kartu: string) {
  const status = KARTU_TANGGAL[kartu];
  if (!status) gagal('Kartu tidak dikenal.');
  const hariIni = tglWIB();
  if (!POLA_TGL.test(t) || t < '2020-01-01' || t > tambahHari(hariIni, 366)) gagal('Tanggal tidak valid.');
  if (kartu !== 'cuti' && t > hariIni) gagal('Tanggal tersebut belum terjadi, belum ada data absensi.');
  const users = await q(SQL_USERS);
  const { ket, cuti } = await cutiKetPada(t);
  const izin = await izinHadirPada(t);
  const peta = t <= hariIni ? await statusHarian(users, t, t) : null;
  const abs = new Map((await q(`SELECT ${KOLOM_ABS} FROM absensi WHERE tanggal=? AND in_time IS NOT NULL`, [t])).map((r) => [r.user_id as number, r]));
  const orang = [];
  for (const x of users) {
    let st = statusTampil(peta?.[x.id]?.[t] ?? 'luar', abs.get(x.id));
    const masihBekerja = !x.tgl_keluar || t <= x.tgl_keluar;
    if (!peta && masihBekerja) st = cuti.has(x.id) ? 'cuti' : ket.has(x.id) && !izin.has(x.id) ? 'ket' : st;
    const iz = masihBekerja ? izin.get(x.id) ?? '' : '';
    // kartu Cuti / izin: juga yang izin tetapi tetap bekerja (izin terlambat, WFH, setengah hari)
    if (!status.includes(st) && !(kartu === 'cuti' && iz)) continue;
    orang.push(barisOrang(x, st, abs.get(x.id), st === 'cuti' ? cuti.get(x.id) ?? 'Cuti' : st === 'ket' ? ket.get(x.id) ?? 'Izin' : iz, iz));
  }
  return { tanggal: t, kartu, mendatang: !peta, orang: orang.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')) };
}

export const aksiDashboard: KumpulanAksi = {
  async dash_rincian(m) {
    await need(['admin', 'finance']);
    return rincianTanggal(s(m, 'tanggal'), s(m, 'kartu'));
  },
  /* nama lama (rilis f4370fa), tetap ada agar tab yang masih terbuka tidak error */
  async dash_cuti_izin(m) {
    await need(['admin', 'finance']);
    return rincianTanggal(s(m, 'tanggal'), 'cuti');
  },
  async dash_grafik(m) {
    await need(['admin', 'finance']);
    const hari = Math.max(7, Math.min(62, i(m, 'hari', 30)));
    const sampai = tglWIB(), dari = tambahHari(sampai, -(hari - 1));
    const users = await q(SQL_USERS);
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
    const hariIni: Record<string, number> = { hadir: 0, telat: 0, cuti: 0, ket: 0, libur: 0, belum: 0, cutiIzin: 0 };
    const lokasi = new Map<string, Baris>();
    const abs = new Map((await q(`SELECT ${KOLOM_ABS} FROM absensi WHERE tanggal=? AND in_time IS NOT NULL`, [sampai])).map((r) => [r.user_id as number, r]));
    const izinHari = await izinHadirPada(sampai);
    const { ket: ketHari, cuti: cutiHari } = await cutiKetPada(sampai);
    const orang: Baris[] = [];
    for (const x of users) {
      const st = statusTampil(peta[x.id]?.[sampai] ?? 'luar', abs.get(x.id)), iz = izinHari.get(x.id) ?? '';
      if (st in hariIni) hariIni[st]++;
      else if (st === 'setengah') hariIni.hadir++;
      if (st === 'cuti' || st === 'ket' || iz) hariIni.cutiIzin = (hariIni.cutiIzin ?? 0) + 1;
      orang.push(barisOrang(x, st, abs.get(x.id), st === 'cuti' ? cutiHari.get(x.id) ?? 'Cuti' : st === 'ket' ? ketHari.get(x.id) ?? 'Izin' : iz, iz));
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
