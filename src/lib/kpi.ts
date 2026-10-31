/* KPI: pencarian template per karyawan, pembuatan laporan bulanan (salinan target & bobot), indikator otomatis dari absensi,
   serta perhitungan pencapaian, skor, dan predikat. */
import { exec, q, q1, sisipkan, type Baris } from './db';
import { gagal } from './http';
import { hitungStatus, statusHarian } from './statusHarian';
import { tglWIB } from './waktu';
import { nilaiLogUntukKpi } from './logKerja';

export const POLA_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const SUMBER_ABSEN = ['kehadiran', 'tepat_waktu'];
export const SUMBER_LOG = ['utilisasi', 'log_selesai', 'log_persen_selesai', 'log_kelengkapan'];
export const SUMBER_OTOMATIS = [...SUMBER_ABSEN, ...SUMBER_LOG];
export const LABEL_SUMBER: Record<string, string> = { manual: 'Diisi karyawan', kehadiran: 'Otomatis: % kehadiran', tepat_waktu: 'Otomatis: % tepat waktu',
  utilisasi: 'Otomatis: % utilisasi beban kerja (log kerja)', log_selesai: 'Otomatis: jumlah pekerjaan selesai (log kerja)',
  log_persen_selesai: 'Otomatis: % pekerjaan selesai (log kerja)', log_kelengkapan: 'Otomatis: % hari kerja yang terisi log' };
export const SATUAN_SUMBER: Record<string, string> = { kehadiran: '%', tepat_waktu: '%', utilisasi: '%', log_selesai: 'pekerjaan', log_persen_selesai: '%', log_kelengkapan: '%' };
export const LABEL_STATUS: Record<string, string> = { draf: 'Draf', diajukan: 'Menunggu verifikasi', disetujui: 'Disetujui', dikembalikan: 'Dikembalikan' };

export function predikat(skor: number | null): string {
  if (skor == null) return '';
  return skor >= 100 ? 'Sangat Baik' : skor >= 90 ? 'Baik' : skor >= 75 ? 'Cukup' : 'Perlu Perbaikan';
}
/* pencapaian satu indikator dalam persen, dibatasi 0..120 agar satu indikator tidak menutupi yang lain */
export function pencapaian(arah: string, target: number, realisasi: number | null, sumber = 'manual'): number | null {
  if (realisasi == null || !Number.isFinite(realisasi)) return null;
  let p: number;
  if (arah === 'ya_tidak') p = realisasi >= 1 ? 100 : 0;
  else if (arah === 'turun') p = realisasi <= 0 ? 120 : target <= 0 ? 0 : (target / realisasi) * 100;
  else p = target <= 0 ? 100 : (realisasi / target) * 100;
  // utilisasi beban kerja: kerja berlebih (overload) tidak diberi nilai tambah agar tidak mendorong lembur berlebihan
  const maks = sumber === 'utilisasi' ? 100 : 120;
  return Math.round(Math.max(0, Math.min(maks, p)) * 100) / 100;
}
export function periodeKini(): string { return tglWIB().slice(0, 7); }
export function cekPeriode(p: string): string {
  if (!POLA_PERIODE.test(p)) gagal('Periode tidak sah');
  if (p > periodeKini()) gagal('KPI bulan depan belum bisa diisi');
  return p;
}
const jsonArr = (t: unknown): string[] => { try { const a = JSON.parse(String(t ?? '[]')); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
export const jabatanTemplate = (t: Baris) => jsonArr(t.jabatan);
const normal = (s: unknown) => String(s ?? '').trim().toLowerCase();

/* template yang berlaku: penugasan khusus > kecocokan nama jabatan (template aktif) */
export async function templateUntuk(u: Baris): Promise<Baris | null> {
  const khusus = await q1('SELECT t.* FROM kpi_penugasan p JOIN kpi_template t ON t.id=p.template_id WHERE p.user_id=? AND t.aktif=1', [u.id]);
  if (khusus) return khusus;
  const jab = normal(u.jabatan);
  if (!jab) return null;
  for (const t of await q('SELECT * FROM kpi_template WHERE aktif=1 ORDER BY id')) if (jabatanTemplate(t).some((j) => normal(j) === jab)) return t;
  return null;
}

/* indikator otomatis dari absensi pada bulan itu (sampai hari ini bila bulan berjalan) */
export async function nilaiOtomatis(u: Baris, periode: string): Promise<{ kehadiran: number | null; tepat_waktu: number | null }> {
  // hari sebelum HRIS dipakai (pengaturan "tanggal mulai HRIS", atau absensi pertama) tidak dihitung
  const setelan = String((await q1("SELECT v FROM settings WHERE k='tanggal_mulai_hris'"))?.v ?? '');
  const mulai = /^\d{4}-\d{2}-\d{2}$/.test(setelan) ? setelan : String((await q1('SELECT MIN(tanggal) t FROM absensi'))?.t ?? '9999-12-31').slice(0, 10);
  const dari = (periode + '-01') > mulai ? periode + '-01' : mulai;
  const akhirBulan = new Date(Date.UTC(+periode.slice(0, 4), +periode.slice(5, 7), 0)).toISOString().slice(0, 10);
  const sampai = akhirBulan < tglWIB() ? akhirBulan : tglWIB();
  if (sampai < dari || dari.slice(0, 7) !== periode) return { kehadiran: null, tepat_waktu: null };
  const n = hitungStatus((await statusHarian([u], dari, sampai))[u.id] ?? {});
  const hadir = n.hadir + n.telat + n.setengah, wajib = hadir + n.mangkir;   // cuti & izin disetujui tidak mengurangi kehadiran
  return {
    kehadiran: wajib > 0 ? Math.round((hadir / wajib) * 10000) / 100 : null,
    tepat_waktu: hadir > 0 ? Math.round((n.hadir / hadir) * 10000) / 100 : null,
  };
}

/* ambil laporan bulan itu; bila belum ada dan karyawan punya template, buat dari template */
export async function pastikanLapor(u: Baris, periode: string): Promise<Baris | null> {
  const ada = await q1('SELECT * FROM kpi_lapor WHERE user_id=? AND periode=?', [u.id, periode]);
  if (ada) return ada;
  const t = await templateUntuk(u);
  if (!t) return null;
  let id: number;
  try { id = await sisipkan('kpi_lapor', { user_id: u.id, periode, template_id: t.id, template_nama: t.nama }); }
  catch (e) { if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') return q1('SELECT * FROM kpi_lapor WHERE user_id=? AND periode=?', [u.id, periode]); throw e; }
  await salinIndikator(id, t.id);
  return q1('SELECT * FROM kpi_lapor WHERE id=?', [id]);
}
/* salin indikator template ke laporan; realisasi lama dipertahankan bila indikatornya sama */
export async function salinIndikator(laporId: number, templateId: number) {
  const lama = new Map((await q('SELECT * FROM kpi_nilai WHERE lapor_id=?', [laporId])).map((x) => [x.indikator_id, x]));
  await exec('DELETE FROM kpi_nilai WHERE lapor_id=?', [laporId]);
  for (const x of await q('SELECT * FROM kpi_indikator WHERE template_id=? ORDER BY urut, id', [templateId])) {
    const l = lama.get(x.id);
    await sisipkan('kpi_nilai', { lapor_id: laporId, indikator_id: x.id, nama: x.nama, deskripsi: x.deskripsi, satuan: x.satuan, target: x.target, bobot: x.bobot,
      arah: x.arah, sumber: x.sumber, urut: x.urut, realisasi: l?.realisasi ?? null, bukti: l?.bukti ?? '', keterangan: l?.keterangan ?? '' });
  }
}

/* hitung ulang indikator otomatis (selama belum final), pencapaian, dan skor */
export async function segarkanLapor(laporId: number): Promise<void> {
  const l = await q1('SELECT * FROM kpi_lapor WHERE id=?', [laporId]);
  if (!l) return;
  const nilai = await q('SELECT * FROM kpi_nilai WHERE lapor_id=?', [laporId]);
  if (l.status !== 'disetujui' && nilai.some((x) => SUMBER_OTOMATIS.includes(x.sumber))) {
    const u = await q1('SELECT * FROM users WHERE id=?', [l.user_id]);
    const oto: Record<string, number | null> = {};
    if (u && nilai.some((x) => SUMBER_ABSEN.includes(x.sumber))) Object.assign(oto, await nilaiOtomatis(u, l.periode));
    if (u && nilai.some((x) => SUMBER_LOG.includes(x.sumber))) Object.assign(oto, await nilaiLogUntukKpi(u, l.periode));
    for (const x of nilai) if (SUMBER_OTOMATIS.includes(x.sumber)) x.realisasi = oto[x.sumber] ?? null;
  }
  // skor = rata-rata berbobot dari indikator yang punya nilai. Indikator otomatis tanpa data (mis. belum ada hari hadir)
  // tidak dihitung dan bobotnya terbagi ke indikator lain; indikator manual yang kosong membuat skor "sementara".
  let jumlah = 0, bobotTerisi = 0;
  for (const x of nilai) {
    const p = pencapaian(x.arah, Number(x.target), x.realisasi == null ? null : Number(x.realisasi), x.sumber);
    await exec('UPDATE kpi_nilai SET realisasi=?, pencapaian=? WHERE id=?', [x.realisasi, p, x.id]);
    if (p != null) { jumlah += p * Number(x.bobot); bobotTerisi += Number(x.bobot); }
  }
  const lengkap = nilai.every((x) => x.sumber !== 'manual' || x.realisasi != null);
  // belum ada satu pun isian karyawan: skor belum bermakna (jangan tampilkan angka dari indikator otomatis saja)
  const adaManual = nilai.some((x) => x.sumber === 'manual' && x.realisasi != null) || !nilai.some((x) => x.sumber === 'manual');
  const skor = bobotTerisi > 0 && adaManual ? Math.round((jumlah / bobotTerisi) * 100) / 100 : null;
  await exec('UPDATE kpi_lapor SET skor=?, predikat=? WHERE id=?', [skor, lengkap ? predikat(skor) : '', laporId]);
}

/* data lengkap satu laporan untuk ditampilkan */
export async function detailLapor(laporId: number) {
  const l = await q1(`SELECT k.*, u.nama, u.nik, u.jabatan, u.dept, u.foto_profil FROM kpi_lapor k JOIN users u ON u.id=k.user_id WHERE k.id=?`, [laporId]);
  if (!l) gagal('Laporan KPI tidak ditemukan', 404);
  const nilai = await q('SELECT * FROM kpi_nilai WHERE lapor_id=? ORDER BY urut, id', [laporId]);
  const lengkap = nilai.every((x) => x.sumber !== 'manual' || x.realisasi != null);
  return {
    id: l.id, userId: l.user_id, nama: l.nama, nik: l.nik, jabatan: l.jabatan, dept: l.dept, foto: l.foto_profil ? '/uploads/avatar/' + l.foto_profil : '',
    periode: l.periode, template: l.template_nama, templateId: l.template_id, status: l.status, statusLabel: LABEL_STATUS[l.status],
    skor: l.skor == null ? null : Number(l.skor), predikat: l.predikat, lengkap, catatan: l.catatan, catatanVerifikator: l.catatan_verifikator,
    diajukan: l.diajukan_at, diverifikasiOleh: l.diverifikasi_oleh, diverifikasi: l.diverifikasi_at,
    nilai: nilai.map((x) => ({ id: x.id, nama: x.nama, deskripsi: x.deskripsi, satuan: x.satuan, target: Number(x.target), bobot: Number(x.bobot), arah: x.arah,
      sumber: x.sumber, sumberLabel: LABEL_SUMBER[x.sumber], realisasi: x.realisasi == null ? null : Number(x.realisasi), bukti: x.bukti, keterangan: x.keterangan,
      pencapaian: x.pencapaian == null ? null : Number(x.pencapaian) })),
  };
}

/* simpan isian realisasi (karyawan: hanya indikator manual; verifikator boleh juga mengubah target) */
export async function simpanIsian(laporId: number, isian: unknown, bolehTarget: boolean) {
  if (!Array.isArray(isian)) return;
  const nilai = new Map((await q('SELECT * FROM kpi_nilai WHERE lapor_id=?', [laporId])).map((x) => [x.id as number, x]));
  for (const raw of isian as Baris[]) {
    const x = nilai.get(Number(raw?.id));
    if (!x) continue;
    const ubah: Baris = {};
    if (x.sumber === 'manual' && 'realisasi' in raw) {
      const v = raw.realisasi === '' || raw.realisasi == null ? null : Number(String(raw.realisasi).replace(',', '.'));
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 1e12)) gagal(`Realisasi "${x.nama}" tidak valid`);
      ubah.realisasi = x.arah === 'ya_tidak' && v != null ? (v >= 1 ? 1 : 0) : v;
    }
    if ('bukti' in raw) {
      const b = String(raw.bukti ?? '').trim();
      if (b && (!/^https?:\/\/\S+$/i.test(b) || b.length > 1000)) gagal(`Tautan bukti "${x.nama}" harus diawali http:// atau https://`);
      ubah.bukti = b;
    }
    if ('keterangan' in raw) ubah.keterangan = String(raw.keterangan ?? '').trim().slice(0, 500);
    if (bolehTarget && 'target' in raw && x.arah !== 'ya_tidak' && x.sumber === 'manual') {
      const t = Number(String(raw.target).replace(',', '.'));
      if (!Number.isFinite(t) || t <= 0) gagal(`Target "${x.nama}" harus lebih dari 0`);
      ubah.target = t;
    }
    const k = Object.keys(ubah);
    if (k.length) await exec(`UPDATE kpi_nilai SET ${k.map((c) => `${c}=:${c}`).join(',')} WHERE id=:__id`, { ...ubah, __id: x.id });
  }
}
