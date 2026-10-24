/* Semua tanggal & jam aplikasi memakai WIB (Asia/Jakarta), tidak bergantung pada
   zona waktu komputer server. */
export const ZONA = 'Asia/Jakarta';
const OFFSET = '+07:00';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function bagian(d: Date) {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return o;
}
/* 'YYYY-MM-DD' WIB */
export function tglWIB(d: Date = new Date()): string {
  const o = bagian(d);
  return `${o.year}-${o.month}-${o.day}`;
}
/* 'HH:MM:SS' WIB */
export function jamWIB(d: Date = new Date()): string {
  const o = bagian(d);
  return `${o.hour}:${o.minute}:${o.second}`;
}
export function sekarangSql(d: Date = new Date()): string {
  return tglWIB(d) + ' ' + jamWIB(d);
}
/* epoch (detik) dari 'YYYY-MM-DD' + 'HH:MM[:SS]' WIB, setara strtotime() */
export function epoch(tgl: string, jam = '00:00:00'): number {
  const j = jam.length === 5 ? jam + ':00' : jam;
  return Math.floor(Date.parse(`${tgl}T${j}${OFFSET}`) / 1000);
}
export function detikSekarang(): number {
  return Math.floor(Date.now() / 1000);
}
export function tambahHari(tgl: string, n: number): string {
  const d = new Date(Date.parse(`${tgl}T12:00:00${OFFSET}`) + n * 86400000);
  return tglWIB(d);
}
/* 1 = Senin … 7 = Minggu (setara date('N')) */
export function hariIso(tgl: string): number {
  const d = new Date(Date.parse(`${tgl}T12:00:00${OFFSET}`)).getUTCDay();
  return d === 0 ? 7 : d;
}
export function selisihHari(dari: string, ke: string): number {
  return Math.round((epoch(ke) - epoch(dari)) / 86400);
}
export const POLA_TGL = /^\d{4}-\d{2}-\d{2}$/;
export const POLA_JAM = /^\d{2}:\d{2}$/;
