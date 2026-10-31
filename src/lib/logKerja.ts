/* Log kerja & beban kerja: periode mingguan / bulanan, kapasitas per karyawan (jadwal kerja dikurangi libur, cuti, izin),
   utilisasi = durasi pekerjaan ÷ kapasitas, dan status beban kerja (underload / optimal / overload). */
import { q, type Baris } from './db';
import { gagal } from './http';
import { hariLiburMingguan, inList, liburResmi } from './aturan';
import { jadwalKerja, setg, setgInt } from './pengaturan';
import { hariIso, POLA_TGL, tambahHari, tglWIB } from './waktu';

export const STATUS_LOG = ['rencana', 'proses', 'selesai', 'tertunda'] as const;
export const LABEL_STATUS_LOG: Record<string, string> = { rencana: 'Rencana', proses: 'Proses', selesai: 'Selesai', tertunda: 'Tertunda' };
export const LABEL_BEBAN: Record<string, string> = { underload: 'Underload', optimal: 'Optimal', overload: 'Overload', belum: 'Belum mengisi', kosong: 'Tidak ada hari kerja' };
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = NAMA_BULAN.map((x) => x.slice(0, 3));
const tgl = (t: string) => `${+t.slice(8, 10)} ${BLN[+t.slice(5, 7) - 1]}`;
const menit = (j: string) => { const [h, m] = String(j).split(':').map(Number); return h * 60 + (m || 0); };

/* periode berisi tanggal t: minggu (Senin–Minggu) atau bulan kalender */
export function periode(jenis: string, t: string) {
  if (!POLA_TGL.test(t)) t = tglWIB();
  if (jenis === 'bulan') {
    const dari = t.slice(0, 8) + '01';
    const sampai = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 0)).toISOString().slice(0, 10);
    return { jenis: 'bulan', dari, sampai, label: `${NAMA_BULAN[+t.slice(5, 7) - 1]} ${t.slice(0, 4)}`, sebelum: tambahHari(dari, -1), sesudah: tambahHari(sampai, 1) };
  }
  const dari = tambahHari(t, 1 - hariIso(t)), sampai = tambahHari(dari, 6);
  // nomor minggu ISO 8601 (minggu yang memuat Kamis)
  const kamis = new Date(tambahHari(dari, 3) + 'T00:00:00Z'), awalTahun = new Date(Date.UTC(kamis.getUTCFullYear(), 0, 1));
  const no = Math.ceil(((+kamis - +awalTahun) / 864e5 + 1) / 7);
  return { jenis: 'minggu', dari, sampai, label: `Minggu ${no} · ${tgl(dari)} – ${tgl(sampai)} ${sampai.slice(0, 4)}`, sebelum: tambahHari(dari, -1), sesudah: tambahHari(sampai, 1) };
}

export async function pengaturanLog() {
  const mulai = await setg('log_mulai', '') || await setg('tanggal_mulai_hris', '');
  return { jamEfektif: await setgInt('log_jam_efektif', 420), bawah: await setgInt('log_batas_bawah', 70), atas: await setgInt('log_batas_atas', 100),
    mulai: POLA_TGL.test(mulai) ? mulai : '' };
}
export function statusBeban(utilisasi: number | null, adaLog: boolean, bawah: number, atas: number): string {
  if (utilisasi == null) return 'kosong';
  if (!adaLog) return 'belum';
  return utilisasi < bawah ? 'underload' : utilisasi > atas ? 'overload' : 'optimal';
}

/* kapasitas (menit) per karyawan per hari pada rentang tanggal — hari setelah hari ini tidak dihitung */
export async function kapasitas(users: Baris[], dari: string, sampai: string) {
  const hasil: Record<number, { menit: number; hariKerja: number; perHari: Record<string, number> }> = {};
  if (!users.length) return hasil;
  const ids = inList(users.map((u) => u.id)), hariIni = tglWIB(), set = await pengaturanLog(), jk = await jadwalKerja();
  const shift = new Map((await q('SELECT id, jam_masuk, jam_pulang, lintas_hari FROM shift')).map((s) => [s.id as number, s]));
  const durShift = (id: number | null | undefined) => {
    const s = id ? shift.get(id) : null;
    if (!s) return 0;
    let d = menit(s.jam_pulang) - menit(s.jam_masuk);
    if (d <= 0 || s.lintas_hari) d += 1440;
    return d;
  };
  const cuti: Record<number, Set<string>> = {}, izin: Record<number, Record<string, string>> = {}, jdw: Record<number, Record<string, number | null>> = {};
  for (const r of await q(`SELECT user_id, mulai, selesai FROM cuti WHERE user_id IN (${ids}) AND status='Disetujui' AND mulai<=? AND selesai>=?`, [sampai, dari]))
    for (let t = r.mulai > dari ? r.mulai : dari, e = r.selesai < sampai ? r.selesai : sampai; t <= e; t = tambahHari(t, 1)) (cuti[r.user_id] ??= new Set()).add(t);
  for (const r of await q(`SELECT user_id, tanggal, jenis FROM ketidakhadiran WHERE user_id IN (${ids}) AND status='Disetujui' AND tanggal BETWEEN ? AND ?`, [dari, sampai]))
    (izin[r.user_id] ??= {})[r.tanggal] = r.jenis;
  for (const r of await q(`SELECT user_id, tanggal, shift_id FROM jadwal_shift WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ?`, [dari, sampai]))
    (jdw[r.user_id] ??= {})[r.tanggal] = r.shift_id;
  for (const u of users) {
    const awal = [u.tgl_masuk ?? '1970-01-01', set.mulai || '1970-01-01', dari].sort().pop()!, akhir = [u.tgl_keluar ?? '9999-12-31', hariIni, sampai].sort()[0];
    const mingguan = await hariLiburMingguan(u), perHari: Record<string, number> = {};
    let total = 0, hariKerja = 0;
    for (let t = awal; t <= akhir; t = tambahHari(t, 1)) {
      // jadwal hari itu: roster shift khusus > libur mingguan > libur resmi (non-shift) > jam kerja pola karyawan
      let jadwal: number;
      if (jdw[u.id] && t in jdw[u.id]) jadwal = jdw[u.id][t] === null ? 0 : durShift(jdw[u.id][t]);
      else if (mingguan.includes(hariIso(t))) jadwal = 0;
      else if ((u.jam_mode ?? 'tetap') !== 'shift' && (await liburResmi(t))) jadwal = 0;
      else if (u.jam_mode === 'shift') jadwal = durShift(u.shift_id);
      else if (u.jam_mode === 'fleksibel') jadwal = Number(u.target_menit) || set.jamEfektif;
      else { const j = jk[hariIso(t)]; jadwal = j ? menit(j[1]) - menit(j[0]) : 0; }
      if (!jadwal || cuti[u.id]?.has(t)) continue;
      const jenisIzin = izin[u.id]?.[t];
      let m = Math.min(set.jamEfektif, jadwal);
      if (jenisIzin === 'setengah_hari') m = Math.round(m / 2);
      else if (jenisIzin && !['wfh', 'dlk'].includes(jenisIzin)) continue;   // sakit / izin / keperluan: tidak bekerja
      perHari[t] = m; total += m; hariKerja++;
    }
    hasil[u.id] = { menit: total, hariKerja, perHari };
  }
  return hasil;
}

/* ringkasan beban kerja banyak karyawan pada satu periode */
export async function ringkasBeban(users: Baris[], dari: string, sampai: string) {
  const set = await pengaturanLog(), kap = await kapasitas(users, dari, sampai);
  const ids = inList(users.map((u) => u.id));
  const agg = new Map((await q(`SELECT user_id, SUM(IF(status<>'rencana', durasi_menit, 0)) menit, COUNT(*) jumlah, SUM(status='selesai') selesai,
      SUM(status='tertunda') tertunda, COUNT(DISTINCT IF(status<>'rencana', tanggal, NULL)) hari_terisi
    FROM log_kerja WHERE user_id IN (${ids}) AND tanggal BETWEEN ? AND ? GROUP BY user_id`, [dari, sampai])).map((r) => [r.user_id as number, r]));
  return users.map((u) => {
    const k = kap[u.id] ?? { menit: 0, hariKerja: 0, perHari: {} }, a = agg.get(u.id);
    const m = Number(a?.menit ?? 0), util = k.menit > 0 ? Math.round((m / k.menit) * 1000) / 10 : null;
    return { userId: u.id, nama: u.nama, nik: u.nik, jabatan: u.jabatan, dept: u.dept, menit: m, kapasitas: k.menit, hariKerja: k.hariKerja,
      utilisasi: util, status: statusBeban(util, !!a && Number(a.jumlah) > 0, set.bawah, set.atas), jumlah: Number(a?.jumlah ?? 0),
      selesai: Number(a?.selesai ?? 0), tertunda: Number(a?.tertunda ?? 0), hariTerisi: Number(a?.hari_terisi ?? 0) };
  });
}

/* nilai otomatis untuk indikator KPI bulanan yang bersumber dari log kerja */
export async function nilaiLogUntukKpi(u: Baris, periodeBulan: string) {
  const p = periode('bulan', periodeBulan + '-01');
  const [r] = await ringkasBeban([u], p.dari, p.sampai);
  const set = await pengaturanLog();
  if (!r || !r.kapasitas) return { utilisasi: null, log_selesai: null, log_persen_selesai: null, log_kelengkapan: null, batasAtas: set.atas };
  const nonRencana = Number((await q("SELECT COUNT(*) n FROM log_kerja WHERE user_id=? AND tanggal BETWEEN ? AND ? AND status<>'rencana'", [u.id, p.dari, p.sampai]))[0]?.n ?? 0);
  return {
    utilisasi: r.utilisasi, log_selesai: r.selesai,
    log_persen_selesai: nonRencana ? Math.round((r.selesai / nonRencana) * 1000) / 10 : null,
    log_kelengkapan: r.hariKerja ? Math.round((Math.min(r.hariTerisi, r.hariKerja) / r.hariKerja) * 1000) / 10 : null,
    batasAtas: set.atas,
  };
}

export function cekTanggalLog(t: string, status: string) {
  if (!POLA_TGL.test(t)) gagal('Tanggal tidak sah');
  const hariIni = tglWIB();
  if (t < tambahHari(hariIni, -31)) gagal('Catatan pekerjaan hanya bisa untuk 31 hari terakhir');
  if (t > hariIni && status !== 'rencana') gagal('Pekerjaan di hari mendatang hanya bisa berstatus Rencana');
  if (t > tambahHari(hariIni, 30)) gagal('Rencana paling jauh 30 hari ke depan');
}
