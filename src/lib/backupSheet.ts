/* Backup seluruh tabel database ke Google Spreadsheet lewat Google Apps Script milik pemilik sheet (docs/backup-spreadsheet.gs).
   - Tiap tabel = 1 sheet, isinya diganti dengan data terbaru; versi lama tetap ada di riwayat versi Google Sheets.
   - Kolom & pengaturan rahasia tidak pernah keluar dari server (lihat KOLOM_RAHASIA, SETELAN_RAHASIA, TABEL_DILEWATI).
   - Berjalan tiap 3 jam dari src/instrumentation.ts, hanya bila SHEET_BACKUP_URL & SHEET_BACKUP_TOKEN diisi (di server produksi).
   - Berkas unggahan (foto absen, dokumen, CV) tidak ikut: yang tersimpan hanya nama berkasnya. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { q } from './db';
import { kirimNotif } from './notifikasi';
import { tglWIB } from './waktu';

export const SELANG_BACKUP_MS = 3 * 3600_000;
const COBA_LAGI_MS = 30 * 60_000;
const BATAS_KIRIM_MS = 5 * 60_000;
/* batas isi 1 sel Google Sheets = 50.000 karakter */
const MAKS_SEL = 45_000;
/* satu kiriman dibatasi agar selesai sebelum batas 6 menit Apps Script */
const MAKS_SHEET_PER_KIRIM = 8, MAKS_BARIS_PER_KIRIM = 3000;

const KOLOM_RAHASIA = /pin_hash|password|sandi|secret|token/i;
const SETELAN_RAHASIA = /privat|secret|token|api_?key|password|sandi/i;
/* langganan notifikasi berisi kunci perangkat dan dibuat ulang saat karyawan mengaktifkan notifikasi */
const TABEL_DILEWATI = new Set(['push_langganan']);

export interface HasilSheet { name: string; rows: number; status: string }
export interface StatusBackup {
  lastSuccessAt?: string; lastAttemptAt?: string; lastError?: string | null; durationMs?: number;
  sheets?: HasilSheet[]; selTerpotong?: number;
}
interface Sheet { name: string; columns: string[]; rows: (string | number)[][] }

export const backupAktif = () => !!(process.env.SHEET_BACKUP_URL && process.env.SHEET_BACKUP_TOKEN);
const berkasStatus = () => path.resolve(process.env.STORAGE_DIR || './storage', 'sheet-backup.json');

export async function bacaStatusBackup(): Promise<StatusBackup> {
  try { return JSON.parse(await readFile(berkasStatus(), 'utf8')) as StatusBackup; } catch { return {}; }
}
async function tulisStatus(st: StatusBackup) {
  await mkdir(path.dirname(berkasStatus()), { recursive: true });
  await writeFile(berkasStatus(), JSON.stringify(st, null, 2), { mode: 0o600 });
}
const wib = (d = new Date()) => new Date(d.getTime() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

export async function susunSheet(): Promise<{ sheets: Sheet[]; terpotong: number }> {
  let terpotong = 0;
  const sel = (v: unknown): string | number => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v;
    if (v instanceof Date) return wib(v);
    const t = Buffer.isBuffer(v) ? v.toString('utf8') : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (t.length <= MAKS_SEL) return t;
    terpotong++;
    return t.slice(0, MAKS_SEL) + ' …[terpotong]';
  };
  const tabel = (await q<Record<string, string>>('SHOW TABLES')).map((x) => Object.values(x)[0]).filter((t) => !TABEL_DILEWATI.has(t));
  // data karyawan di sheet pertama; tabel baru otomatis ikut
  tabel.sort((a, b) => Number(b === 'users') - Number(a === 'users') || a.localeCompare(b));
  const sheets: Sheet[] = [];
  for (const nama of tabel) {
    const kolom = (await q<{ Field: string; Key: string }>(`SHOW COLUMNS FROM \`${nama}\``));
    const tampil = kolom.map((k) => k.Field).filter((k) => !KOLOM_RAHASIA.test(k));
    const urut = kolom.find((k) => k.Key === 'PRI')?.Field;
    let baris = await q(`SELECT * FROM \`${nama}\`` + (urut ? ` ORDER BY \`${urut}\`` : ''));
    if (nama === 'settings') baris = baris.filter((b) => !SETELAN_RAHASIA.test(String(b.k)));
    sheets.push({ name: nama, columns: tampil, rows: baris.map((b) => tampil.map((k) => sel(b[k]))) });
  }
  return { sheets, terpotong };
}

function bagiKiriman(sheets: Sheet[]): Sheet[][] {
  const hasil: Sheet[][] = [];
  let kini: Sheet[] = [], baris = 0;
  for (const s of sheets) {
    if (kini.length && (kini.length >= MAKS_SHEET_PER_KIRIM || baris + s.rows.length > MAKS_BARIS_PER_KIRIM)) { hasil.push(kini); kini = []; baris = 0; }
    kini.push(s); baris += s.rows.length;
  }
  if (kini.length) hasil.push(kini);
  return hasil;
}

async function kirim(isi: Record<string, unknown>): Promise<{ sheets?: HasilSheet[] }> {
  const res = await fetch(process.env.SHEET_BACKUP_URL!, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: process.env.SHEET_BACKUP_TOKEN, ...isi }), redirect: 'follow', signal: AbortSignal.timeout(BATAS_KIRIM_MS),
  });
  const teks = await res.text();
  let data: { ok?: boolean; error?: string; sheets?: HasilSheet[] };
  try { data = JSON.parse(teks); } catch { throw new Error(`Balasan Apps Script bukan JSON (HTTP ${res.status}). Pastikan web app di-deploy untuk "Anyone" dan URL berakhiran /exec.`); }
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const g = globalThis as unknown as { __posiBackupJalan?: boolean; __posiBackupTimer?: NodeJS.Timeout };
export const backupBerjalan = () => !!g.__posiBackupJalan;

export async function jalankanBackup(pemicu: 'jadwal' | 'manual'): Promise<StatusBackup & { ok: boolean }> {
  if (!backupAktif()) return { ok: false, lastError: 'Backup belum dikonfigurasi (SHEET_BACKUP_URL / SHEET_BACKUP_TOKEN).' };
  if (g.__posiBackupJalan) return { ok: false, lastError: 'Backup sedang berjalan.' };
  g.__posiBackupJalan = true;
  const mulai = Date.now();
  const st: StatusBackup = { ...(await bacaStatusBackup()), lastAttemptAt: new Date().toISOString() };
  try {
    await tulisStatus(st);
    const { sheets, terpotong } = await susunSheet();
    const generatedAt = wib() + ' WIB', hasil: HasilSheet[] = [];
    let urutan = 0;
    for (const bagian of bagiKiriman(sheets)) {
      const r = await kirim({ sheets: bagian.map((s) => ({ ...s, index: urutan++ })) });
      hasil.push(...(r.sheets ?? []));
    }
    await kirim({ selesai: true, generatedAt, reason: pemicu, result: hasil });
    Object.assign(st, { lastSuccessAt: new Date().toISOString(), lastError: null, durationMs: Date.now() - mulai, sheets: hasil, selTerpotong: terpotong });
    await tulisStatus(st);
    return { ...st, ok: true };
  } catch (e) {
    st.lastError = String((e as Error).message).slice(0, 500);
    await tulisStatus(st).catch(() => {});
    console.error('[backup-sheet] gagal:', st.lastError);
    return { ...st, ok: false };
  } finally {
    g.__posiBackupJalan = false;
  }
}

/* dipanggil berkala: jalan bila sukses terakhir sudah 3 jam; gagal dicoba lagi 30 menit kemudian dan HC diberi tahu sekali sehari */
export async function backupBilaWaktunya(): Promise<void> {
  if (!backupAktif() || g.__posiBackupJalan) return;
  const st = await bacaStatusBackup(), kini = Date.now();
  if (kini - (st.lastSuccessAt ? Date.parse(st.lastSuccessAt) : 0) < SELANG_BACKUP_MS) return;
  if (kini - (st.lastAttemptAt ? Date.parse(st.lastAttemptAt) : 0) < COBA_LAGI_MS) return;
  const r = await jalankanBackup('jadwal');
  if (r.ok) return;
  const hc = (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
  await kirimNotif(hc, { jenis: 'sistem', kunci: `backup-gagal:${tglWIB()}`, tautan: '/backup', judul: 'Backup spreadsheet gagal', isi: String(r.lastError ?? '').slice(0, 200) });
}

export function mulaiBackupTerjadwal(jalankan: (f: () => Promise<void>) => Promise<void>): void {
  if (!backupAktif() || g.__posiBackupTimer) return;
  const tick = () => { void jalankan(backupBilaWaktunya).catch((e) => console.error('[backup-sheet]', e)); };
  g.__posiBackupTimer = setInterval(tick, 10 * 60_000);
  setTimeout(tick, 2 * 60_000);
  console.log('[backup-sheet] backup terjadwal aktif');
}
