/* Kesalahan yang memang ditujukan ke pengguna (pesan tampil apa adanya). */
export class Gagal extends Error {
  constructor(pesan: string, public kode = 400) {
    super(pesan);
  }
}
export function gagal(pesan: string, kode = 400): never {
  throw new Gagal(pesan, kode);
}

/* Pembaca isian permintaan, setara s()/f()/i() di versi lama */
export type Masukan = Record<string, any>;
export function s(m: Masukan, k: string, bawaan = ''): string {
  return m[k] !== undefined && m[k] !== null ? String(m[k]).trim() : bawaan;
}
export function f(m: Masukan, k: string, bawaan: number | null = null): number | null {
  const v = m[k];
  if (v === undefined || v === null || v === '') return bawaan;
  const n = Number(v);
  return Number.isFinite(n) ? n : bawaan;
}
export function i(m: Masukan, k: string, bawaan = 0): number {
  if (m[k] === undefined || m[k] === null || m[k] === '') return bawaan;
  const n = parseInt(String(m[k]), 10);
  return Number.isFinite(n) ? n : bawaan;
}
export function b(m: Masukan, k: string): boolean {
  const v = m[k];
  return v === true || v === 1 || v === '1' || v === 'true';
}
