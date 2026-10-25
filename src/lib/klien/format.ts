/* Format tampilan (tanggal, uang, durasi) — dipakai di semua halaman */
export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
export function todayStr(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function jamStr(d = new Date()) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const keDate = (s: string) => { const p = s.slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
export function tglIndo(s?: string | null) {
  if (!s) return '-';
  const d = keDate(s);
  return NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
}
export function tglPendek(s?: string | null) {
  if (!s) return '-';
  const d = keDate(s);
  return d.getDate() + ' ' + NAMA_BULAN[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
}
export function rentangTgl(a: string, b?: string | null) { return !b || a === b ? tglPendek(a) : tglPendek(a) + ' – ' + tglPendek(b); }
export function geserTgl(t: string, n: number) { const d = keDate(t); d.setDate(d.getDate() + n); return todayStr(d); }
export function rupiah(n: number) { n = Math.round(+n || 0); return (n < 0 ? '-' : '') + 'Rp' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
export function angka(n: number) { return Math.round(+n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
export function jamKerjaTeks(m: number) { return Math.floor(m / 60) + 'j' + (m % 60 ? ' ' + (m % 60) + 'm' : ''); }
export function masaKerjaTeks(bl: number) { return Math.floor(bl / 12) + 'th ' + (bl % 12) + 'bl'; }
export function km(m: number) { return (m / 1000).toFixed(2).replace('.', ',') + ' km'; }
export function periodeTeks(p?: string | null) { if (!p) return '-'; const a = p.split('-'); return NAMA_BULAN[+a[1] - 1] + ' ' + a[0]; }
export function jarakMeter(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}
export function salam(d = new Date()) {
  const h = d.getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}
/* nilai status yang tersimpan di database -> teks tampilan */
export function teksStatus(s?: string) {
  return String(s || '').replace('Menunggu Finance', 'Menunggu Pencairan').replace('Ditolak Finance', 'Ditolak')
    .replace('Ditolak Kepala Toko', 'Ditolak').replace('Menunggu Rekomendasi', 'Menunggu').replace('Menunggu HR', 'Menunggu Persetujuan')
    .replace('Ditolak HR', 'Ditolak');
}
export function labelRole(r: string) {
  return ({ direktur: 'Super Admin', admin: 'HC', finance: 'Finance', atasan: 'Supervisor' } as Record<string, string>)[r] || 'Staff';
}
