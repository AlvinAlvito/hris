/* Bentuk data yang dikirim ke tampilan (sama dengan versi PHP). */
import type { Baris } from './db';
import {
  bulanKerja, cabangById, cutiAktif, cutiTerpakai, hariLiburMingguan, jatahCuti, labelJenis, labelKet, shiftById, sisaCuti, type User,
} from './aturan';
import { gagal, type Masukan } from './http';
import { POLA_TGL } from './waktu';

const jam5 = (t: string | null) => (t ? String(t).slice(0, 5) : '');

export async function userPublik(u: User) {
  const c = await cabangById(u.cabang_id);
  const sh = await shiftById(u.shift_id);
  const aktif = cutiAktif(u);
  return {
    id: u.id, nik: u.nik, nama: u.nama, jabatan: u.jabatan, dept: u.dept, tglMasuk: u.tgl_masuk, role: u.role,
    cutiMode: u.cuti_mode, jatah: u.jatah, lokasiMode: u.lokasi_mode, minJarakKm: Number(u.min_jarak_km),
    baseLat: u.base_lat, baseLng: u.base_lng, baseLabel: u.base_label, baseSetBy: u.base_set_by, baseSetAt: u.base_set_at,
    aktif: u.aktif === 1, cabangId: u.cabang_id,
    cabangNama: c?.nama ?? '', cabangTipe: c?.tipe ?? '', cabangSiap: !!c && c.lat !== null,
    cabangRadius: c?.radius ?? 0, cabangLat: c?.lat ?? null, cabangLng: c?.lng ?? null,
    jamMode: u.jam_mode, shiftId: u.shift_id, shiftNama: sh?.nama ?? '', targetMenit: u.target_menit,
    intiMulai: jam5(u.inti_mulai), intiSelesai: jam5(u.inti_selesai),
    liburHari: u.libur_hari ?? null, liburHariEfektif: await hariLiburMingguan(u),
    cutiAktif: aktif, jatahEfektif: jatahCuti(u), terpakai: await cutiTerpakai(u.id), sisa: aktif ? await sisaCuti(u) : 0,
    masaKerjaBulan: bulanKerja(u.tgl_masuk),
    atasanId: u.atasan_id || null, statusKerja: u.status_kerja ?? 'tetap',
    kontrakMulai: u.kontrak_mulai ?? null, kontrakSelesai: u.kontrak_selesai ?? null, tglKeluar: u.tgl_keluar ?? null,
    jk: u.jk ?? '', tempatLahir: u.tempat_lahir ?? '', tglLahir: u.tgl_lahir ?? null, agama: u.agama ?? '',
    statusNikah: u.status_nikah ?? '', noKtp: u.no_ktp ?? '', npwp: u.npwp ?? '', noHp: u.no_hp ?? '', email: u.email ?? '',
    alamat: u.alamat ?? '', alamatDomisili: u.alamat_domisili ?? '', pendidikan: u.pendidikan ?? '', jurusan: u.jurusan ?? '',
    institusi: u.institusi ?? '', bankNama: u.bank_nama ?? '', bankRekening: u.bank_rekening ?? '', bankAtasNama: u.bank_atas_nama ?? '',
    bpjsKesNo: u.bpjs_kes_no ?? '', bpjsTkNo: u.bpjs_tk_no ?? '', daruratNama: u.darurat_nama ?? '',
    daruratHubungan: u.darurat_hubungan ?? '', daruratHp: u.darurat_hp ?? '',
    foto: u.foto_profil ? '/uploads/avatar/' + u.foto_profil : '',
    tema: u.tema ?? '', modeTampilan: u.mode_tampilan ?? 'auto',
  };
}
export type UserPublik = Awaited<ReturnType<typeof userPublik>>;

export function absRow(a: Baris) {
  const mk = Number(a.menit_kerja);
  return {
    id: a.id, userId: a.user_id, nik: a.nik ?? '', nama: a.nama ?? '', dept: a.dept ?? '', tanggal: a.tanggal, mode: a.mode,
    inTime: jam5(a.in_time), outTime: jam5(a.out_time),
    inPhoto: a.in_photo ? '/uploads/' + a.in_photo : '', outPhoto: a.out_photo ? '/uploads/' + a.out_photo : '',
    inLat: a.in_lat, inLng: a.in_lng, outLat: a.out_lat, outLng: a.out_lng,
    inJarakBase: a.in_jarak, outJarakBase: a.out_jarak, inLuar: a.in_luar === 1, outLuar: a.out_luar === 1,
    baseLabel: a.base_label, cabangId: a.cabang_id, cabangNama: a.cabang_nama,
    jamMode: a.jam_mode ?? 'tetap', kerjaDari: a.kerja_dari ?? '', izinSesi: a.izin_sesi ?? '', shiftNama: a.shift_nama ?? '',
    jadwalIn: jam5(a.jadwal_in), jadwalOut: jam5(a.jadwal_out),
    targetMenit: a.target_menit ?? 0, kurangMenit: a.kurang_menit ?? 0, lemburMenit: a.lembur_menit ?? 0,
    tglPulang: a.tgl_pulang ?? null, langgarInti: a.langgar_inti === 1, terlambat: a.terlambat === 1,
    menitTelat: a.menit_telat, menitKerja: mk, durasi: mk > 0 ? Math.floor(mk / 60) + 'j ' + (mk % 60) + 'm' : '',
    lupaOut: a.lupa_out === 1, dikoreksi: a.dikoreksi === 1, koreksiOleh: a.koreksi_oleh ?? '',
    koreksiCatatan: a.koreksi_catatan ?? '', tglKoreksi: a.tgl_koreksi ?? null,
  };
}
export function cutiRow(c: Baris) {
  return {
    id: c.id, userId: c.user_id, nik: c.nik ?? '', nama: c.nama ?? '', dept: c.dept ?? '', role: c.role ?? 'karyawan',
    jenis: c.jenis, mulai: c.mulai, selesai: c.selesai, hari: c.hari, alasan: c.alasan, status: c.status,
    approver: c.approver, catatan: c.catatan, tglAjukan: c.created_at,
  };
}
export async function pengajuanRow(x: Baris) {
  const sh = await shiftById(x.shift_id);
  return {
    id: x.id, userId: x.user_id, nama: x.nama ?? '', nik: x.nik ?? '', cabang: x.cabang_nama ?? '',
    jenis: x.jenis, jenisLabel: labelJenis(x.jenis), tanggal: x.tanggal, tanggal2: x.tanggal2,
    shiftId: x.shift_id, shiftNama: sh?.nama ?? '', jamMulai: jam5(x.jam_mulai), jamSelesai: jam5(x.jam_selesai),
    menit: x.menit, alasan: x.alasan, status: x.status, rekomendasi: x.rekomendasi, perekomendasi: x.perekomendasi,
    catatanRekomendasi: x.catatan_rekomendasi, approver: x.approver, catatanHr: x.catatan_hr,
    jadwalSebelum: x.jadwal_sebelum, jadwalSesudah: x.jadwal_sesudah, tglAjukan: x.created_at, tglPutusan: x.tgl_putusan,
  };
}
export function ketRow(x: Baris) {
  return {
    id: x.id, userId: x.user_id, nama: x.nama ?? '', nik: x.nik ?? '', cabang: x.cabang_nama ?? '',
    jenis: x.jenis, jenisLabel: labelKet(x.jenis), tanggal: x.tanggal, sesi: x.sesi ?? '', alasan: x.alasan, status: x.status,
    rekomendasi: x.rekomendasi, perekomendasi: x.perekomendasi, catatanRekomendasi: x.catatan_rekomendasi,
    approver: x.approver, catatanHr: x.catatan_hr, tglAjukan: x.created_at, tglPutusan: x.tgl_putusan,
  };
}
export function tukarRow(t: Baris) {
  return {
    id: t.id, jenis: t.jenis, pemohonId: t.pemohon_id, pemohon: t.pemohon_nama ?? '', tglPemohon: t.tgl_pemohon,
    rekanId: t.rekan_id, rekan: t.rekan_nama ?? '', tglRekan: t.tgl_rekan, alasan: t.alasan, status: t.status,
    catatanRekan: t.catatan_rekan, catatanHr: t.catatan_hr, approver: t.approver,
    shiftPemohonSebelum: t.shift_pemohon_sebelum, shiftRekanSebelum: t.shift_rekan_sebelum,
    shiftPemohonSesudah: t.shift_pemohon_sesudah, shiftRekanSesudah: t.shift_rekan_sesudah,
    cabang: t.cabang_nama ?? '', rekomendasi: t.rekomendasi, perekomendasi: t.perekomendasi,
    catatanRekomendasi: t.catatan_rekomendasi, tglAjukan: t.created_at, tglPutusan: t.tgl_putusan,
  };
}

/* Kolom biodata yang boleh diisi lewat formulir: kunci input => [kolom, aturan] */
export const KOLOM_BIODATA: Record<string, [string, string | number]> = {
  statusKerja: ['status_kerja', 'enum:tetap,kontrak,probation,magang,harian,freelance'],
  kontrakMulai: ['kontrak_mulai', 'date'], kontrakSelesai: ['kontrak_selesai', 'date'], tglKeluar: ['tgl_keluar', 'date'],
  jk: ['jk', 'enum:,L,P'], tempatLahir: ['tempat_lahir', 80], tglLahir: ['tgl_lahir', 'date'], agama: ['agama', 30],
  statusNikah: ['status_nikah', 'enum:,lajang,menikah,cerai'], noKtp: ['no_ktp', 30], npwp: ['npwp', 30],
  noHp: ['no_hp', 30], email: ['email', 120], alamat: ['alamat', 255], alamatDomisili: ['alamat_domisili', 255],
  pendidikan: ['pendidikan', 40], jurusan: ['jurusan', 100], institusi: ['institusi', 120],
  bankNama: ['bank_nama', 60], bankRekening: ['bank_rekening', 40], bankAtasNama: ['bank_atas_nama', 120],
  bpjsKesNo: ['bpjs_kes_no', 30], bpjsTkNo: ['bpjs_tk_no', 30],
  daruratNama: ['darurat_nama', 120], daruratHubungan: ['darurat_hubungan', 40], daruratHp: ['darurat_hp', 30],
};
/* Periksa satu nilai biodata; mengembalikan [nilai, pesan kesalahan] */
export function periksaBiodata(k: string, v: string): [string | null, string] {
  const [, aturan] = KOLOM_BIODATA[k];
  if (aturan === 'date') {
    if (v === '') return [null, ''];
    return POLA_TGL.test(v) ? [v, ''] : [null, 'Format tanggal tidak sah: ' + k];
  }
  if (typeof aturan === 'string' && aturan.startsWith('enum:')) {
    const pil = aturan.slice(5).split(',');
    return pil.includes(v) ? [v, ''] : [null, 'Pilihan tidak sah: ' + k];
  }
  if (k === 'email' && v !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return [null, 'Format email tidak sah'];
  return [v.slice(0, Number(aturan)), ''];
}
/* Ambil biodata dari input; hanya kunci yang dikirim yang diubah */
export function ambilBiodata(m: Masukan, hanya?: string[]): Baris {
  const data: Baris = {};
  for (const [k, [kol]] of Object.entries(KOLOM_BIODATA)) {
    if (hanya && !hanya.includes(k)) continue;
    if (!(k in m)) continue;
    const [v, salah] = periksaBiodata(k, String(m[k] ?? '').trim());
    if (salah) gagal(salah);
    data[kol] = v;
  }
  return data;
}
