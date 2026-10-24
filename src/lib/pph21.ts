/* =====================================================================
   Mesin hitung PPh 21, BPJS, dan lembur — fungsi murni (tanpa database)
   ---------------------------------------------------------------------
   Dasar: PP 58/2023, PMK 168/2023, UU HPP (Pasal 17), PP 35/2021.
   Seluruh nilai dalam rupiah bulat. Diuji oleh tests/pph21.test.ts.
   ===================================================================== */

const MAKS = Number.MAX_SAFE_INTEGER;
type Tabel = [number, number][];

/* ---------- Tabel TER bulanan: [batas atas penghasilan bruto, tarif %] ---------- */
export const TER: Record<'A' | 'B' | 'C', Tabel> = {
  A: [[5400000, 0], [5650000, 0.25], [5950000, 0.5], [6300000, 0.75], [6750000, 1], [7500000, 1.25],
    [8550000, 1.5], [9650000, 1.75], [10050000, 2], [10350000, 2.25], [10700000, 2.5], [11050000, 3],
    [11600000, 3.5], [12500000, 4], [13750000, 5], [15100000, 6], [16950000, 7], [19750000, 8],
    [24150000, 9], [26450000, 10], [28000000, 11], [30050000, 12], [32400000, 13], [35400000, 14],
    [39100000, 15], [43850000, 16], [47800000, 17], [51400000, 18], [56300000, 19], [62200000, 20],
    [68600000, 21], [77500000, 22], [89000000, 23], [103000000, 24], [125000000, 25], [157000000, 26],
    [206000000, 27], [337000000, 28], [454000000, 29], [550000000, 30], [695000000, 31], [910000000, 32],
    [1400000000, 33], [MAKS, 34]],
  B: [[6200000, 0], [6500000, 0.25], [6850000, 0.5], [7300000, 0.75], [9200000, 1], [10750000, 1.5],
    [11250000, 2], [11600000, 2.5], [12600000, 3], [13600000, 4], [14950000, 5], [16400000, 6],
    [18450000, 7], [21850000, 8], [26000000, 9], [27700000, 10], [29350000, 11], [31450000, 12],
    [33950000, 13], [37100000, 14], [41100000, 15], [45800000, 16], [49500000, 17], [53800000, 18],
    [58500000, 19], [64000000, 20], [71000000, 21], [80000000, 22], [93000000, 23], [109000000, 24],
    [129000000, 25], [163000000, 26], [211000000, 27], [374000000, 28], [459000000, 29], [555000000, 30],
    [704000000, 31], [957000000, 32], [1405000000, 33], [MAKS, 34]],
  C: [[6600000, 0], [6950000, 0.25], [7350000, 0.5], [7800000, 0.75], [8850000, 1], [9800000, 1.25],
    [10950000, 1.5], [11200000, 1.75], [12050000, 2], [12950000, 3], [14150000, 4], [15550000, 5],
    [17050000, 6], [19500000, 7], [22700000, 8], [26600000, 9], [28100000, 10], [30100000, 11],
    [32600000, 12], [35400000, 13], [38900000, 14], [43000000, 15], [47400000, 16], [51200000, 17],
    [55800000, 18], [60400000, 19], [66700000, 20], [74500000, 21], [83200000, 22], [95600000, 23],
    [110000000, 24], [134000000, 25], [169000000, 26], [221000000, 27], [390000000, 28], [463000000, 29],
    [561000000, 30], [709000000, 31], [965000000, 32], [1419000000, 33], [MAKS, 34]],
};

/* pembulatan setengah menjauhi nol seperti round() PHP, termasuk presisi desimal */
export function bulat(x: number, desimal = 0): number {
  const k = 10 ** desimal, v = Math.abs(x) * k;
  // koreksi galat biner (mis. 1.005 * 100 = 100.49999…)
  const r = Math.round(+(v.toPrecision(15)));
  return (Math.sign(x) || 1) * r / k;
}

/* Kategori TER menurut status PTKP */
export function kategoriTER(ptkp: string): 'A' | 'B' | 'C' {
  if (['TK/0', 'TK/1', 'K/0'].includes(ptkp)) return 'A';
  if (['TK/2', 'TK/3', 'K/1', 'K/2'].includes(ptkp)) return 'B';
  if (ptkp === 'K/3') return 'C';
  return 'A';
}
export function tarifTER(ptkp: string, bruto: number): number {
  for (const [batas, tarif] of TER[kategoriTER(ptkp)]) if (bruto <= batas) return tarif;
  return 34;
}
/* PPh 21 bulanan Januari–November (metode gross) */
export function pph21TER(ptkp: string, bruto: number): number {
  if (bruto <= 0) return 0;
  return Math.floor(bruto * tarifTER(ptkp, bruto) / 100);
}

/* PTKP setahun (UU HPP): diri 54 jt, kawin +4,5 jt, tiap tanggungan +4,5 jt (maks 3) */
export function ptkpSetahun(ptkp: string): number {
  const m = /^(TK|K)\/([0-3])$/.exec(ptkp);
  if (!m) return 54000000;
  return 54000000 + (m[1] === 'K' ? 4500000 : 0) + Number(m[2]) * 4500000;
}

/* Tarif progresif Pasal 17 UU HPP atas PKP setahun */
export function pasal17(pkp: number): number {
  if (pkp <= 0) return 0;
  const lapis: [number, number][] = [[60000000, 5], [250000000, 15], [500000000, 25], [5000000000, 30], [MAKS, 35]];
  let pajak = 0, bawah = 0;
  for (const [atas, tarif] of lapis) {
    if (pkp <= bawah) break;
    pajak += (Math.min(pkp, atas) - bawah) * tarif / 100;
    bawah = atas;
  }
  return Math.floor(pajak);
}

/* Perhitungan PPh 21 masa pajak terakhir (Desember / bulan terakhir bekerja).
   bruto : total penghasilan bruto setahun (termasuk premi JKK, JKM, BPJS Kes pemberi kerja)
   iuran : total iuran JHT + JP yang dibayar pegawai setahun
   bulan : jumlah bulan bekerja dalam tahun berjalan (untuk batas biaya jabatan)
   sudah : PPh 21 yang sudah dipotong pada masa sebelumnya (Jan–Nov)
   pphBulanIni bisa negatif = kelebihan potong yang dikembalikan ke pegawai. */
export function pph21Tahunan(bruto: number, iuran: number, bulan: number, ptkp: string, sudah: number) {
  bulan = Math.max(1, Math.min(12, bulan));
  const biayaJabatan = Math.min(Math.floor(bruto * 5 / 100), 500000 * bulan, 6000000);
  const neto = bruto - biayaJabatan - iuran;
  const ptkpNilai = ptkpSetahun(ptkp);
  const pkp = Math.floor(Math.max(0, neto - ptkpNilai) / 1000) * 1000;   // dibulatkan ke bawah ribuan penuh
  const setahun = pasal17(pkp);
  return { bruto, biayaJabatan, iuran, neto, ptkp: ptkpNilai, pkp, pphSetahun: setahun, sudahDipotong: sudah, pphBulanIni: setahun - sudah };
}

/* ---------- BPJS ----------
   upah: dasar upah (gaji pokok + tunjangan tetap, atau dasar manual); p: persentase & batas dari pengaturan */
export interface SetelanBpjs { bpjs_kes_p: number; bpjs_kes_k: number; bpjs_kes_batas: number; jht_p: number; jht_k: number;
  jkk: number; jkm: number; jp_p: number; jp_k: number; jp_batas: number }
export function hitungBPJS(upah: number, p: SetelanBpjs, kes: boolean, tk: boolean, jp: boolean) {
  const dasarKes = Math.min(upah, p.bpjs_kes_batas), dasarJp = Math.min(upah, p.jp_batas);
  return {
    kesP: kes ? bulat(dasarKes * p.bpjs_kes_p / 100) : 0, kesK: kes ? bulat(dasarKes * p.bpjs_kes_k / 100) : 0,
    jhtP: tk ? bulat(upah * p.jht_p / 100) : 0, jhtK: tk ? bulat(upah * p.jht_k / 100) : 0,
    jkk: tk ? bulat(upah * p.jkk / 100) : 0, jkm: tk ? bulat(upah * p.jkm / 100) : 0,
    jpP: jp ? bulat(dasarJp * p.jp_p / 100) : 0, jpK: jp ? bulat(dasarJp * p.jp_k / 100) : 0,
  };
}

/* ---------- Upah lembur (PP 35/2021 Pasal 31) ----------
   hari kerja biasa: jam 1 ×1,5, berikutnya ×2
   hari libur, 5 hari kerja: jam 1–8 ×2, jam 9 ×3, jam 10–12 ×4
   hari libur, 6 hari kerja: jam 1–7 ×2, jam 8 ×3, jam 9–11 ×4 */
export function upahLembur(menit: number, upahBulan: number, hariLibur: boolean, pembagi = 173, hariKerja = 5) {
  let jam = menit / 60, kali: number;
  const sejam = upahBulan / Math.max(1, pembagi);
  if (hariLibur) {
    const dasar = hariKerja === 6 ? 7 : 8;            // jam dengan pengali 2
    jam = Math.min(jam, dasar + 4);
    kali = Math.min(jam, dasar) * 2 + Math.max(0, Math.min(jam, dasar + 1) - dasar) * 3 + Math.max(0, jam - dasar - 1) * 4;
  } else {
    kali = Math.min(jam, 1) * 1.5 + Math.max(0, jam - 1) * 2;
  }
  return { jam: bulat(jam, 2), pengali: bulat(kali, 2), upahSejam: bulat(sejam), nominal: bulat(sejam * kali) };
}
