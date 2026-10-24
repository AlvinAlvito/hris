import { exec, q } from './db';
import { hapusSementara, simpanSementara } from './konteks';

/* Pengaturan disimpan di tabel settings (kunci–nilai). */
export async function settings(): Promise<Record<string, string>> {
  return simpanSementara('settings', async () => {
    const o: Record<string, string> = {};
    for (const r of await q<{ k: string; v: string }>('SELECT k,v FROM settings')) o[r.k] = r.v;
    return o;
  });
}
export async function setg(k: string, bawaan: string | number = ''): Promise<string> {
  const s = await settings();
  return k in s ? s[k] : String(bawaan);
}
export async function setgInt(k: string, bawaan: number): Promise<number> {
  const v = parseInt(await setg(k, bawaan), 10);
  return Number.isFinite(v) ? v : bawaan;
}
export async function setSetting(k: string, v: string | number): Promise<void> {
  await exec('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, String(v)]);
  hapusSementara('settings');
}

export interface SettingsPublik {
  perusahaan: string; slogan: string; temaDefault: string; warnaBrand: string; logo: string; favicon: string;
  rekomendasiAtasan: boolean; liburMingguNonshift: boolean; liburNasionalAktif: boolean; hariKerjaSeminggu: number;
  batasJamTerbuka: number; lemburMinMenit: number; reimburseKategori: string[]; reimburseMaksHari: number;
  kasbonMaksKaliGaji: number; kasbonTenorMaks: number; kasbonSatuAktif: boolean; jamMasuk: string; jamPulang: string;
  toleransi: number; jatahDefault: number; minJarakDefault: number; wajibFoto: boolean; geofenceOn: boolean;
  titikAwalOlehAdmin: boolean; officeLat: number | null; officeLng: number | null; radius: number;
}

export async function settingsPublik(): Promise<SettingsPublik> {
  const s = await settings();
  const n = (k: string, d: number) => (s[k] !== undefined && s[k] !== '' ? Number(s[k]) : d);
  const on = (k: string, d = 1) => n(k, d) === 1;
  return {
    perusahaan: s.perusahaan ?? 'Pusat Olimpiade Sains Indonesia',
    slogan: s.slogan ?? '',
    temaDefault: s.tema_default ?? 'posi',
    warnaBrand: s.warna_brand ?? '',
    logo: s.logo_file ? '/brand/' + s.logo_file : '',
    favicon: s.favicon_file ? '/brand/' + s.favicon_file : '',
    rekomendasiAtasan: on('rekomendasi_atasan', 0),
    liburMingguNonshift: on('libur_minggu_nonshift'),
    liburNasionalAktif: on('libur_nasional_aktif'),
    hariKerjaSeminggu: n('hari_kerja_seminggu', 5) === 6 ? 6 : 5,
    batasJamTerbuka: n('batas_jam_terbuka', 18),
    lemburMinMenit: n('lembur_min_menit', 30),
    reimburseKategori: (s.reimburse_kategori ?? 'Lainnya').split('|').map((x) => x.trim()).filter(Boolean),
    reimburseMaksHari: n('reimburse_maks_hari', 60),
    kasbonMaksKaliGaji: n('kasbon_maks_kali_gaji', 1),
    kasbonTenorMaks: n('kasbon_tenor_maks', 12),
    kasbonSatuAktif: on('kasbon_satu_aktif'),
    jamMasuk: s.jam_masuk ?? '08:00',
    jamPulang: s.jam_pulang ?? '17:00',
    toleransi: n('toleransi', 10),
    jatahDefault: n('jatah_default', 12),
    minJarakDefault: n('min_jarak_default', 2.5),
    wajibFoto: on('wajib_foto'),
    geofenceOn: on('geofence_on'),
    titikAwalOlehAdmin: on('titik_awal_oleh_admin'),
    officeLat: s.office_lat ? Number(s.office_lat) : null,
    officeLng: s.office_lng ? Number(s.office_lng) : null,
    radius: n('radius', 200),
  };
}
