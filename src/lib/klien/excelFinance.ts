/* Excel rekap finance (Overtime, DLK, Present) meniru format rekap manual HC.
   Periode 27 bulan lalu – 26 bulan ini. Angka uang memakai rumus Excel agar HC tetap bisa menyesuaikan seperti di sheet manual. */
import { NAMA_BULAN, NAMA_HARI } from './format';

type Data = Record<string, any>;
const RP = '_-"Rp"* #,##0_-;\\-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@_-';
const KUNING = 'FFFFC000', ORANYE = 'FFF4B083', BIRU = 'FF0070C0', NAVY = 'FF44546A', MERAH = 'FFC00000', PUTIH = 'FFFFFFFF', HITAM = 'FF000000';
const HURUF = ['M', 'S', 'S', 'R', 'K', 'J', 'SB'];
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const garis = { style: 'thin' as const, color: { argb: HITAM } }, KOTAK = { top: garis, left: garis, bottom: garis, right: garis };
const tglKe = (t: string) => new Date(t + 'T00:00:00');
const tglExcel = (t: string) => { const [y, m, d] = t.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const jamExcel = (j: string) => { const [h, mi] = j.split(':').map(Number); return (h * 60 + mi) / 1440; };
const judulBulan = (periode: string) => { const [th, bl] = periode.split('-').map(Number); return `${NAMA_BULAN[bl - 1].toUpperCase()} ${th}`; };

async function buku() {
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}
function gaya(c: any, o: { isi?: string; warna?: string; tebal?: boolean; ukuran?: number; rata?: 'left' | 'center' | 'right'; bungkus?: boolean; fmt?: string }) {
  if (o.isi) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.isi } };
  c.font = { name: 'Calibri', size: o.ukuran ?? 11, bold: !!o.tebal, color: { argb: o.warna ?? HITAM } };
  c.alignment = { horizontal: o.rata ?? 'center', vertical: 'middle', wrapText: !!o.bungkus };
  c.border = KOTAK;
  if (o.fmt) c.numFmt = o.fmt;
}
async function unduh(wb: any, nama: string) {
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = nama; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===================== OVERTIME ===================== */
export async function unduhRekapLembur(d: Data) {
  const wb = await buku(), ws = wb.addWorksheet('Overtime', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
  [32, 22, 14, 16, 11, 11, 14, 18, 20, 22, 70].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.mergeCells('A1:K2');
  const j = ws.getCell('A1');
  j.value = `Perhitungan Lembur Bulan ${judulBulan(d.periode)}` + (d.dasar === 'tanggal' ? ' (berdasarkan tanggal lembur)' : ' (lembur yang disetujui di periode ini)');
  gaya(j, { isi: KUNING, tebal: true, ukuran: 14 });
  const kepala: [string, string][] = [['A3:A4', 'Nama'], ['B3:B4', 'UNIT'], ['C3:C4', 'Hari Lembur'], ['D3:D4', 'Tanggal Lembur'], ['E3:F3', 'Jam Lembur (WIB)'],
    ['G3:G4', 'Jumlah Jam Lembur Per Hari'], ['H3:H4', 'Tempat Lembur'], ['I3:I4', 'Upah Lembur Yang Diperoleh'], ['J3:J4', 'TOTAL UPAH LEMBUR'], ['K3:K4', 'Alasan Lembur']];
  for (const [rg, t] of kepala) { ws.mergeCells(rg); ws.getCell(rg.split(':')[0]).value = t; }
  ws.getCell('E4').value = 'Dari'; ws.getCell('F4').value = 'Sampai';
  for (let r = 3; r <= 4; r++) for (let c = 1; c <= 11; c++) gaya(ws.getCell(r, c), { isi: ORANYE, tebal: true, ukuran: 12, bungkus: true });
  ws.getRow(3).height = 30; ws.getRow(4).height = 20;

  let r = 5;
  for (const o of d.orang) {
    const awal = r;
    for (const l of o.lembur) {
      const row = ws.getRow(r);
      row.getCell(1).value = r === awal ? o.nama : null; row.getCell(2).value = r === awal ? o.divisi : null;
      row.getCell(3).value = NAMA_HARI[tglKe(l.tanggal).getDay()] + (l.libur ? ` (${l.libur})` : '');
      row.getCell(4).value = tglExcel(l.tanggal);
      row.getCell(5).value = l.mulai ? jamExcel(l.mulai) : null; row.getCell(6).value = l.selesai ? jamExcel(l.selesai) : null;
      // MOD agar lembur yang lewat tengah malam (mis. 21:00–00:00) tidak negatif
      row.getCell(7).value = { formula: `MOD(F${r}-E${r},1)*24`, result: l.menit / 60 };
      row.getCell(8).value = '';
      row.getCell(9).value = { formula: `15000+(G${r}-1)*10000`, result: 15000 + (l.menit / 60 - 1) * 10000 };
      row.getCell(11).value = l.alasan;
      for (let c = 1; c <= 11; c++) gaya(row.getCell(c), { ukuran: 12, rata: c === 11 ? 'left' : 'center', bungkus: c === 11 });
      row.getCell(4).numFmt = 'dd/mm/yyyy'; row.getCell(5).numFmt = 'hh:mm'; row.getCell(6).numFmt = 'hh:mm';
      row.getCell(7).numFmt = '0.0'; row.getCell(9).numFmt = RP;
      r++;
    }
    if (r - 1 > awal) { ws.mergeCells(awal, 10, r - 1, 10); ws.mergeCells(awal, 1, r - 1, 1); ws.mergeCells(awal, 2, r - 1, 2); }
    const t = ws.getCell(awal, 10);
    t.value = { formula: `SUM(I${awal}:I${r - 1})`, result: o.lembur.reduce((a: number, l: Data) => a + 15000 + (l.menit / 60 - 1) * 10000, 0) };
    gaya(t, { ukuran: 12, fmt: RP, tebal: true });
  }
  if (r > 5) {
    ws.mergeCells(r, 1, r, 9);
    const tl = ws.getCell(r, 1); tl.value = 'TOTAL'; gaya(tl, { isi: KUNING, tebal: true, ukuran: 12 });
    const tt = ws.getCell(r, 10); tt.value = { formula: `SUM(J5:J${r - 1})` }; gaya(tt, { isi: KUNING, tebal: true, ukuran: 12, fmt: RP });
    gaya(ws.getCell(r, 11), { isi: KUNING });
    r += 2;
  } else { ws.getCell(r, 1).value = 'Tidak ada lembur disetujui pada periode ini.'; r += 2; }
  ws.getCell(r, 1).value = 'Catatan: upah = Rp15.000 jam pertama + Rp10.000 per jam berikutnya (rumus rekap HC; ubah sel Upah bila tarif berbeda, mis. hari libur).';
  ws.getCell(r + 1, 1).value = 'Kolom Tempat Lembur belum dicatat di HRIS, silakan diisi bila diperlukan.';
  ws.getCell(r, 1).font = ws.getCell(r + 1, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF595959' } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  await unduh(wb, `rekap-lembur-${d.periode}.xlsx`);
}

/* ===================== DLK ===================== */
export async function unduhRekapDlk(d: Data) {
  const wb = await buku(), ws = wb.addWorksheet('DLK', { views: [{ state: 'frozen', ySplit: 4 }] });
  [3, 5, 28, 24, 20, 18, 18, 14, 18, 50, 20, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.mergeCells('B1:M2');
  const j = ws.getCell('B1'); j.value = `REKAPAN PERJALANAN DINAS KARYAWAN ${judulBulan(d.periode)}`; gaya(j, { isi: KUNING, tebal: true, ukuran: 16 });
  const kepala: [string, string][] = [['B3:B4', 'No'], ['C3:C4', 'Nama Karyawan'], ['D3:D4', 'Jabatan/Posisi'], ['E3:E4', 'Departement'], ['F3:G3', 'Waktu Keberangkatan Perjalanan'],
    ['H3:H4', 'Jumlah Hari Perjalanan Dinas'], ['I3:I4', 'Keterangan Hari'], ['J3:J4', 'Keterangan'], ['K3:K4', 'Daerah Perjalanan Dinas'], ['L3:L4', 'Jumlah Kompensasi Perjalanan'], ['M3:M4', 'TOTAL DLK']];
  for (const [rg, t] of kepala) { ws.mergeCells(rg); ws.getCell(rg.split(':')[0]).value = t; }
  ws.getCell('F4').value = 'Tanggal Berangkat'; ws.getCell('G4').value = 'Tanggal Kembali';
  for (let r = 3; r <= 4; r++) for (let c = 2; c <= 13; c++) gaya(ws.getCell(r, c), { isi: KUNING, tebal: true, bungkus: true });
  ws.getRow(3).height = 24; ws.getRow(4).height = 40.5;
  // kompensasi per hari: satu sel yang dirujuk semua baris, agar HC cukup mengubah satu angka
  let r = 5; const totalSel: [string, string][] = [];
  d.orang.forEach((o: Data, i: number) => {
    const awal = r;
    for (const p of o.perjalanan) {
      const row = ws.getRow(r);
      row.getCell(6).value = tglExcel(p.berangkat); row.getCell(7).value = tglExcel(p.kembali);
      row.getCell(8).value = p.jumlahHari; row.getCell(9).value = p.ketHari; row.getCell(10).value = p.tujuan; row.getCell(11).value = '';
      row.getCell(12).value = { formula: `H${r}*$D$${0}`, result: p.jumlahHari * 25000 };   // diperbaiki setelah tabel selesai
      for (let c = 2; c <= 13; c++) gaya(row.getCell(c), { rata: c === 10 ? 'left' : 'center', bungkus: c === 10 });
      row.getCell(6).numFmt = row.getCell(7).numFmt = 'd mmmm yyyy'; row.getCell(12).numFmt = RP;
      row.height = 27.75; r++;
    }
    for (const [c, v] of [[2, i + 1], [3, o.nama], [4, o.jabatan || '-'], [5, o.divisi || '-']] as [number, any][]) {
      if (r - 1 > awal) ws.mergeCells(awal, c, r - 1, c);
      ws.getCell(awal, c).value = v;
    }
    if (r - 1 > awal) ws.mergeCells(awal, 13, r - 1, 13);
    const t = ws.getCell(awal, 13); t.value = { formula: `SUM(L${awal}:L${r - 1})` }; gaya(t, { fmt: RP, tebal: true });
    totalSel.push([o.nama, `M${awal}`]);
  });
  const akhirData = r - 1;
  ws.mergeCells(r, 2, r, 12);
  const tl = ws.getCell(r, 2); tl.value = 'TOTAL'; gaya(tl, { tebal: true });
  const tt = ws.getCell(r, 13); tt.value = { formula: d.orang.length ? `SUM(M5:M${akhirData})` : '0' }; gaya(tt, { tebal: true, fmt: RP });
  r += 3;
  const kSel = r;   // tabel kecil: kompensasi per hari + rekap per nama
  ws.getCell(kSel, 3).value = 'Kompensasi per hari'; ws.getCell(kSel, 4).value = 25000;
  gaya(ws.getCell(kSel, 3), { isi: KUNING, tebal: true }); gaya(ws.getCell(kSel, 4), { fmt: RP, tebal: true });
  for (let rr = 5; rr <= akhirData; rr++) {
    const c = ws.getCell(rr, 12);
    if (c.value && typeof c.value === 'object' && 'formula' in c.value) c.value = { formula: `H${rr}*$D$${kSel}`, result: (c.value as any).result };
  }
  r = kSel + 2;
  ws.getCell(r, 3).value = 'Keterangan'; ws.getCell(r, 4).value = 'Jumlah';
  gaya(ws.getCell(r, 3), { isi: KUNING, tebal: true }); gaya(ws.getCell(r, 4), { isi: KUNING, tebal: true });
  const awalRekap = r + 1;
  for (const [n, sel] of totalSel) { r++; ws.getCell(r, 3).value = n; ws.getCell(r, 4).value = { formula: sel }; gaya(ws.getCell(r, 3), { rata: 'left' }); gaya(ws.getCell(r, 4), { fmt: RP }); }
  r++; ws.getCell(r, 4).value = { formula: totalSel.length ? `SUM(D${awalRekap}:D${r - 1})` : '0' }; gaya(ws.getCell(r, 4), { isi: KUNING, tebal: true, fmt: RP });
  r += 2;
  ws.getCell(r, 3).value = 'Kolom Daerah Perjalanan Dinas belum dipisah di HRIS (tujuan & keperluan ada di kolom Keterangan).';
  ws.getCell(r, 3).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF595959' } };
  if (!d.orang.length) ws.getCell(5, 3).value = 'Tidak ada perjalanan dinas disetujui pada periode ini.';
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  await unduh(wb, `rekap-dlk-${d.periode}.xlsx`);
}

/* ===================== PRESENT ===================== */
export async function unduhRekapHadir(d: Data) {
  const wb = await buku(), ws = wb.addWorksheet('Present', { views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }] });
  const tgl: string[] = d.tanggal, nT = tgl.length, k0 = 6, kAkhirTgl = k0 + nT - 1;
  const merah = (t: string) => tglKe(t).getDay() === 0 || d.libur.includes(t);
  // kolom rekap sesudah tanggal
  const REKAP = ['TOTAL HADIR', 'PD', 'S', 'I', 'C.K', 'C', 'A', 'WFH', 'TOTAL', 'HARI KERJA', 'TOTAL KETIDAKHADIRAN', 'PERHITUNGAN POTONGAN KETIDAKHADIRAN',
    'Tunjangan Kehadiran', 'Potongan Ketidakhadiran/Hari', 'Total Potongan Ketidakhadiran', 'Sisa Cuti', 'Cuti Muncul', 'Total Sisa Cuti'];
  const kR = (i: number) => kAkhirTgl + 1 + i, L = (c: number) => ws.getColumn(c).letter;
  [5, 34, 26, 20, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let c = k0; c <= kAkhirTgl; c++) ws.getColumn(c).width = 4.2;
  REKAP.forEach((_, i) => { ws.getColumn(kR(i)).width = i >= 1 && i <= 7 ? 5.5 : i >= 12 ? 16 : 11; });

  ws.mergeCells(1, 1, 2, kR(REKAP.length - 1));
  const j = ws.getCell(1, 1); j.value = `REKAP KEHADIRAN KARYAWAN POSI ${judulBulan(d.periode)}`; gaya(j, { tebal: true, ukuran: 14, isi: KUNING });
  ws.mergeCells(3, 1, 3, kR(REKAP.length - 1));
  const sub = ws.getCell(3, 1);
  sub.value = `Periode ${tglKe(d.dari).getDate()} ${NAMA_BULAN[tglKe(d.dari).getMonth()]} ${tglKe(d.dari).getFullYear()} – ${tglKe(d.sampai).getDate()} ${NAMA_BULAN[tglKe(d.sampai).getMonth()]} ${tglKe(d.sampai).getFullYear()}`;
  sub.font = { name: 'Calibri', size: 11, italic: true }; sub.alignment = { horizontal: 'center' };

  for (const [c, t] of [[1, 'No'], [2, 'Nama Karyawan'], [3, 'Jabatan'], [4, 'Divisi'], [5, 'Tanggal Masuk']] as [number, string][]) { ws.mergeCells(5, c, 7, c); ws.getCell(5, c).value = t; }
  // baris 5 nama bulan, 6 huruf hari, 7 tanggal
  let awal = 0;
  for (let i = 1; i <= nT; i++) {
    if (i === nT || tgl[i].slice(0, 7) !== tgl[awal].slice(0, 7)) {
      const [y, mo] = tgl[awal].split('-').map(Number);
      if (i - 1 > awal) ws.mergeCells(5, k0 + awal, 5, k0 + i - 1);
      ws.getCell(5, k0 + awal).value = awal === 0 ? `${NAMA_BULAN[mo - 1]} ${y}` : `${BULAN_SINGKAT[mo - 1]}-${String(y).slice(2)}`;
      awal = i;
    }
  }
  tgl.forEach((t, i) => { ws.getCell(6, k0 + i).value = HURUF[tglKe(t).getDay()]; ws.getCell(7, k0 + i).value = tglKe(t).getDate(); });
  ws.mergeCells(5, kR(0), 7, kR(0)); ws.getCell(5, kR(0)).value = REKAP[0];
  ws.mergeCells(5, kR(1), 6, kR(7)); ws.getCell(5, kR(1)).value = 'ABSENSI';
  for (let i = 1; i <= 7; i++) ws.getCell(7, kR(i)).value = REKAP[i];
  for (let i = 8; i < REKAP.length; i++) { ws.mergeCells(5, kR(i), 7, kR(i)); ws.getCell(5, kR(i)).value = REKAP[i]; }
  for (let r = 5; r <= 7; r++) for (let c = 1; c <= kR(REKAP.length - 1); c++) {
    const kolTgl = c >= k0 && c <= kAkhirTgl;
    gaya(ws.getCell(r, c), { isi: kolTgl ? (r > 5 && merah(tgl[c - k0]) ? MERAH : NAVY) : BIRU, warna: PUTIH, tebal: true, bungkus: true, ukuran: 10 });
  }
  ws.getRow(5).height = 22; ws.getRow(6).height = 18; ws.getRow(7).height = 30;

  let r = 8, no = 1;
  const baris = (u: Data, direksi: boolean) => {
    const row = ws.getRow(r);
    row.getCell(1).value = no++; row.getCell(2).value = String(u.nama).toUpperCase(); row.getCell(3).value = u.jabatan || '-';
    row.getCell(4).value = direksi ? '-' : u.divisi || '-'; row.getCell(5).value = !direksi && u.tglMasuk ? tglExcel(u.tglMasuk) : '-';
    if (!direksi) {
      tgl.forEach((t, i) => { const v = u.kode[t]; if (v !== undefined && v !== '') row.getCell(k0 + i).value = v; });
      const rg = `${L(k0)}${r}:${L(kAkhirTgl)}${r}`, C = (i: number) => `${L(kR(i))}${r}`;
      const f: [number, string][] = [[0, `SUM(${rg})`], [1, `COUNTIF(${rg},"PD")`], [2, `COUNTIF(${rg},"S")`], [3, `COUNTIF(${rg},"I")`], [4, `COUNTIF(${rg},"C.K")`],
        [5, `COUNTIF(${rg},"C")`], [6, `COUNTIF(${rg},"A")`], [7, `COUNTIF(${rg},"W")`], [8, `SUM(${C(0)}:${C(7)})`], [10, `${C(2)}+${C(3)}+${C(4)}+${C(5)}+${C(6)}`],
        [11, `${C(3)}+${C(6)}+${C(2)}`], [13, `IF(${C(12)}="","",${C(12)}/${C(9)})`], [14, `IF(${C(12)}="","",(${C(13)}*${C(2)}*50%)+(${C(13)}*${C(3)}*100%)+(${C(13)}*${C(6)}*100%))`],
        [17, `IF(${C(15)}="","",${C(15)}+N(${C(16)})-${C(5)})`]];
      for (const [i, fm] of f) row.getCell(kR(i)).value = { formula: fm };
      row.getCell(kR(9)).value = u.hariKerja;
      row.getCell(kR(12)).value = null;                            // tunjangan kehadiran: diisi HC
      // sisa cuti sebelum cuti di periode ini, agar Total Sisa Cuti = sisa cuti saat ini di HRIS
      const cutiDiPeriode = Object.values(u.kode).filter((v) => v === 'C').length;
      row.getCell(kR(15)).value = u.sisaCuti === null ? null : u.sisaCuti + cutiDiPeriode;
    }
    for (let c = 1; c <= kR(REKAP.length - 1); c++) {
      const kolTgl = c >= k0 && c <= kAkhirTgl;
      gaya(row.getCell(c), { isi: direksi ? KUNING : kolTgl && merah(tgl[c - k0]) ? MERAH : undefined, rata: c === 2 || c === 3 ? 'left' : 'center', ukuran: 10 });
    }
    row.getCell(5).numFmt = 'dd/mm/yyyy';
    for (const i of [12, 13, 14]) row.getCell(kR(i)).numFmt = RP;
    row.height = 18; r++;
  };
  for (const u of d.direksi) baris(u, true);
  for (const u of d.karyawan) baris(u, false);
  r++;
  const cat = ['Catatan :', '1    : Hadir', 'PD  : Perjalanan Dinas', 'W    : WFH', 'S    : Sakit (potongan 50%)', 'I     : Izin (potongan 100%)', 'C    : Cuti Tahunan',
    'C.K : Cuti Khusus / cuti lain', 'A    : Alfa (potongan 100%)', 'Kosong / merah: libur, belum terjadi, atau belum bekerja. Tunjangan Kehadiran diisi HC, potongan terhitung otomatis.'];
  for (const t of cat) { ws.getCell(r, 2).value = t; ws.getCell(r, 2).font = { name: 'Calibri', size: 10, bold: t === 'Catatan :' }; r++; }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  await unduh(wb, `rekap-kehadiran-${d.periode}.xlsx`);
}
