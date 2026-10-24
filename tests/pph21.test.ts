/* Uji unit mesin hitung payroll. Jalankan: npm test
   Setiap nilai harapan dihitung manual (lihat komentar). */
import { test } from 'node:test';
import { deepStrictEqual as sama } from 'node:assert';
import { hitungBPJS, kategoriTER, pasal17, pph21Tahunan, pph21TER, ptkpSetahun, tarifTER, TER, upahLembur } from '../src/lib/pph21';

test('TER bulanan', () => {
  sama(pph21TER('TK/0', 10000000), 200000, 'TK/0 Rp10.000.000 → 2%');
  sama(pph21TER('TK/0', 5400000), 0, 'TK/0 Rp5.400.000 → 0%');
  sama(pph21TER('TK/0', 5400001), 13500, 'TK/0 Rp5.400.001 → 0,25%');
  sama(pph21TER('K/1', 15000000), 900000, 'K/1 (B) Rp15.000.000 → 6%');
  sama(pph21TER('K/3', 12050000), 241000, 'K/3 (C) batas atas → 2%');
  sama(pph21TER('K/3', 12050001), 361500, 'K/3 (C) → 3%');
  sama(tarifTER('TK/0', 1400000001), 34, 'TK/0 > Rp1,4 M → 34%');
  sama(kategoriTER('TK/2'), 'B');
  sama(kategoriTER('K/0'), 'A');
  sama([TER.A.length, TER.B.length, TER.C.length], [44, 40, 41], 'jumlah lapisan');
});

test('PTKP & Pasal 17', () => {
  sama(ptkpSetahun('TK/0'), 54000000);
  sama(ptkpSetahun('K/0'), 58500000);
  sama(ptkpSetahun('TK/3'), 67500000);
  sama(ptkpSetahun('K/3'), 72000000);
  sama(pasal17(60000000), 3000000);
  sama(pasal17(300000000), 44000000, '3 + 28,5 + 12,5');
  sama(pasal17(600000000), 124000000, '3 + 28,5 + 62,5 + 30');
});

test('Masa pajak terakhir', () => {
  // bruto 120 jt, iuran 3,6 jt, BJ 6 jt → neto 110,4 jt − PTKP 54 jt = PKP 56,4 jt × 5% = 2,82 jt; sudah 2,2 jt → 620 rb
  let t = pph21Tahunan(120000000, 3600000, 12, 'TK/0', 2200000);
  sama(t.biayaJabatan, 6000000);
  sama(t.pkp, 56400000);
  sama(t.pphSetahun, 2820000);
  sama(t.pphBulanIni, 620000);
  // bekerja 3 bulan, bruto 30 jt: BJ 5% = 1,5 jt (≤ 500rb×3); PKP negatif → 0; kelebihan 300 rb dikembalikan
  t = pph21Tahunan(30000000, 0, 3, 'TK/0', 300000);
  sama(t.biayaJabatan, 1500000);
  sama(t.pkp, 0);
  sama(t.pphBulanIni, -300000);
  sama(pph21Tahunan(66317894, 0, 12, 'TK/0', 0).pkp % 1000, 0, 'PKP dibulatkan ke bawah ribuan');
});

test('BPJS', () => {
  const p = { bpjs_kes_p: 4, bpjs_kes_k: 1, bpjs_kes_batas: 12000000, jht_p: 3.7, jht_k: 2, jkk: 0.24, jkm: 0.3, jp_p: 2, jp_k: 1, jp_batas: 11086300 };
  let b = hitungBPJS(15000000, p, true, true, true);
  sama(b.kesP, 480000);
  sama(b.kesK, 120000);
  sama(b.jhtP, 555000);
  sama(b.jhtK, 300000);
  sama(b.jkk, 36000);
  sama(b.jkm, 45000);
  sama(b.jpP, 221726);
  sama(b.jpK, 110863);
  b = hitungBPJS(5000000, p, true, false, false);
  sama(b.jhtP, 0, 'tidak ikut BPJS TK → JHT 0');
});

test('Lembur', () => {
  // upah 5.190.000 / 173 = 30.000 per jam
  sama(upahLembur(180, 5190000, false).nominal, 165000, 'hari kerja 3 jam: 5,5 × 30rb');
  sama(upahLembur(600, 5190000, true).nominal, 690000, 'hari libur 10 jam: 23 × 30rb');
  sama(upahLembur(600, 5190000, true, 173, 6).nominal, 750000, 'hari libur (6 hari kerja) 10 jam: 25 × 30rb');
  sama(upahLembur(900, 5190000, true, 173, 5).nominal, 930000, 'dibatasi 12 jam: 31 × 30rb');
  sama(upahLembur(30, 5190000, false).nominal, 22500, '30 menit: 0,75 × 30rb');
});
