/* Utilitas periode gaji (YYYY-MM) dan nominal uang dari isian */
import type { Masukan } from './http';
import { nilai } from './db';

export const periodeSah = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
export const periodeAwal = (p: string) => p + '-01';
export const hariDalamBulan = (p: string) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)).getUTCDate();
export const periodeAkhir = (p: string) => p + '-' + String(hariDalamBulan(p)).padStart(2, '0');
export function periodeBerikut(p: string): string {
  const d = new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export async function periodeTerkunci(p: string): Promise<boolean> {
  return !!(await nilai("SELECT 1 FROM payroll_periode WHERE periode=? AND status='final'", [p]));
}

/* nominal uang: "Rp1.500.000" → 1500000 */
export function uang(m: Masukan, k: string): number {
  const v = m[k];
  if (typeof v === 'number') return Math.trunc(v);
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
/* bendera 0/1 yang bisa dikirim sebagai boolean atau angka; tidak ada = bawaan */
export function bendera(m: Masukan, k: string, bawaan: boolean): boolean {
  const v = m[k];
  if (v === undefined || v === null || v === '') return bawaan;
  if (typeof v === 'boolean') return v;
  return !['0', 'false'].includes(String(v));
}
