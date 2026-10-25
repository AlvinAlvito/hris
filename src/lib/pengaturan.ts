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

/* ---------------- jam kerja per hari ----------------
   Kunci 1..7 = Senin..Minggu (ISO). Nilai [masuk, pulang] atau null bila libur. */
export type JamHari = [string, string] | null;
export type JadwalKerja = Record<string, JamHari>;
export const JADWAL_KERJA_BAWAAN: JadwalKerja = {
  1: ['08:30', '17:00'], 2: ['08:30', '17:00'], 3: ['08:30', '17:00'], 4: ['08:30', '17:00'],
  5: ['08:00', '17:00'], 6: ['08:00', '12:00'], 7: null,
};
const POLA_JAM_HARI = /^([01]\d|2[0-3]):[0-5]\d$/;
/* Bersihkan masukan jadwal; mengembalikan null bila ada isian yang tidak sah */
export function jadwalKerjaSah(v: unknown): JadwalKerja | null {
  const o = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!o || typeof o !== 'object') return null;
  const hasil: JadwalKerja = {};
  for (let d = 1; d <= 7; d++) {
    const x = (o as Record<string, unknown>)[d];
    if (x === null || x === undefined || x === false) { hasil[d] = null; continue; }
    if (!Array.isArray(x) || x.length !== 2 || !POLA_JAM_HARI.test(String(x[0])) || !POLA_JAM_HARI.test(String(x[1]))) return null;
    if (String(x[1]) <= String(x[0])) return null;
    hasil[d] = [String(x[0]), String(x[1])];
  }
  return hasil;
}
export async function jadwalKerja(): Promise<JadwalKerja> {
  return jadwalKerjaSah(await setg('jadwal_kerja', '')) ?? JADWAL_KERJA_BAWAAN;
}
export async function setSetting(k: string, v: string | number): Promise<void> {
  await exec('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, String(v)]);
  hapusSementara('settings');
}

export interface SettingsPublik {
  perusahaan: string; slogan: string; temaDefault: string; warnaBrand: string; logo: string; favicon: string;
  rekomendasiAtasan: boolean; liburMingguNonshift: boolean; liburNasionalAktif: boolean; hariKerjaSeminggu: number;
  batasJamTerbuka: number; lemburMinMenit: number; jamMasuk: string; jamPulang: string;
  toleransi: number; jatahDefault: number; minJarakDefault: number; wajibFoto: boolean; geofenceOn: boolean;
  titikAwalOlehAdmin: boolean; officeLat: number | null; officeLng: number | null; radius: number;
  jadwalKerja: JadwalKerja; potongMangkir: boolean;
}

export async function settingsPublik(): Promise<SettingsPublik> {
  const s = await settings();
  const n = (k: string, d: number) => (s[k] !== undefined && s[k] !== '' ? Number(s[k]) : d);
  const on = (k: string, d = 1) => n(k, d) === 1;
  const jk = await jadwalKerja(), senin = jk[1] ?? Object.values(jk).find(Boolean) ?? ['08:00', '17:00'];
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
    hariKerjaSeminggu: Object.values(jk).filter(Boolean).length,
    batasJamTerbuka: n('batas_jam_terbuka', 18),
    lemburMinMenit: n('lembur_min_menit', 30),
    jamMasuk: senin[0],
    jamPulang: senin[1],
    toleransi: n('toleransi', 10),
    jatahDefault: n('jatah_default', 12),
    minJarakDefault: n('min_jarak_default', 2.5),
    wajibFoto: on('wajib_foto'),
    geofenceOn: on('geofence_on'),
    titikAwalOlehAdmin: on('titik_awal_oleh_admin'),
    officeLat: s.office_lat ? Number(s.office_lat) : null,
    officeLng: s.office_lng ? Number(s.office_lng) : null,
    radius: n('radius', 200),
    jadwalKerja: jk,
    potongMangkir: on('potong_mangkir', 0),
  };
}
