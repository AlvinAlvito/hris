/* Excel "Rekap Keterlambatan" untuk finance: periode 27 bulan lalu – 26 bulan ini, satu kolom per tanggal,
   Minggu & libur nasional merah, baris Direksi kuning dan kosong. Meniru format rekap manual HC. */
import { NAMA_BULAN } from './format';

type Data = Record<string, any>;
const HURUF = ['M', 'S', 'S', 'R', 'K', 'J', 'SB'];          // Minggu..Sabtu
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAVY = 'FF44546A', BIRU = 'FF4472C4', MERAH = 'FFC00000', KUNING = 'FFFFC000', ABU = 'FFD9D9D9', PUTIH = 'FFFFFFFF';
const RP = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

export async function unduhRekapTelat(d: Data) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Rekap Keterlambatan', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
  const tgl: string[] = d.tanggal, nT = tgl.length, kTotal = 3 + nT, kPot = kTotal + 1;
  const tanggalKe = (t: string) => new Date(t + 'T00:00:00');
  const merah = (t: string) => tanggalKe(t).getDay() === 0 || d.libur.includes(t);
  const garis = { style: 'thin' as const, color: { argb: 'FF000000' } }, kotak = { top: garis, left: garis, bottom: garis, right: garis };
  const isi = (c: any, argb: string) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };
  const font = (c: any, warna = 'FF000000', tebal = false, ukuran = 11) => { c.font = { name: 'Times New Roman', size: ukuran, bold: tebal, color: { argb: warna } }; };

  ws.getColumn(1).width = 5; ws.getColumn(2).width = 38;
  for (let i = 0; i < nT; i++) ws.getColumn(3 + i).width = 4.6;
  ws.getColumn(kTotal).width = 11; ws.getColumn(kPot).width = 20;

  const [th, bl] = d.periode.split('-').map(Number);
  ws.mergeCells(1, 3, 1, kPot);
  const judul = ws.getCell(1, 3); judul.value = `REKAP KETERLAMBATAN ${NAMA_BULAN[bl - 1].toUpperCase()} ${th}`;
  font(judul, 'FF000000', true, 16); judul.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  /* kepala tabel: baris 3 bulan, baris 4 huruf hari, baris 5 tanggal */
  for (const [k, teks] of [[1, 'No'], [2, 'Nama'], [kTotal, 'TOTAL\n(Dalam\nMenit)'], [kPot, 'JUMLAH\nPOTONGAN']] as [number, string][]) {
    ws.mergeCells(3, k, 5, k);
    const c = ws.getCell(3, k); c.value = teks;
  }
  let awal = 0;
  for (let i = 1; i <= nT; i++) {
    if (i === nT || tgl[i].slice(0, 7) !== tgl[awal].slice(0, 7)) {
      const [y, mo] = tgl[awal].split('-').map(Number);
      if (i - 1 > awal) ws.mergeCells(3, 3 + awal, 3, 3 + i - 1);
      ws.getCell(3, 3 + awal).value = awal === 0 && tgl[nT - 1].slice(0, 7) !== tgl[0].slice(0, 7) ? `${NAMA_BULAN[mo - 1]} ${y}` : `${BULAN_SINGKAT[mo - 1]}-${String(y).slice(2)}`;
      awal = i;
    }
  }
  tgl.forEach((t, i) => { ws.getCell(4, 3 + i).value = HURUF[tanggalKe(t).getDay()]; ws.getCell(5, 3 + i).value = tanggalKe(t).getDate(); });
  for (let r = 3; r <= 5; r++) for (let k = 1; k <= kPot; k++) {
    const c = ws.getCell(r, k), kolTgl = k >= 3 && k < kTotal;
    isi(c, kolTgl && r > 3 ? (merah(tgl[k - 3]) ? MERAH : BIRU) : NAVY);
    font(c, PUTIH, true, 11); c.border = kotak; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  ws.getRow(3).height = 22; ws.getRow(4).height = 20; ws.getRow(5).height = 20;

  /* isi: Direksi dulu (kuning, kosong), baris pemisah abu-abu, lalu karyawan */
  let r = 6, no = 1;
  const tulisBaris = (u: Data, direksi: boolean) => {
    const row = ws.getRow(r);
    row.getCell(1).value = no++; row.getCell(2).value = String(u.nama).toUpperCase();
    if (!direksi) {
      tgl.forEach((t, i) => { const m = u.menit[t]; if (m) row.getCell(3 + i).value = m; });
      row.getCell(kTotal).value = u.totalMenit; row.getCell(kPot).value = u.potongan;
    }
    for (let k = 1; k <= kPot; k++) {
      const c = row.getCell(k), kolTgl = k >= 3 && k < kTotal;
      c.border = kotak; font(c);
      c.alignment = { horizontal: k === 2 ? 'left' : 'center', vertical: 'middle' };
      if (direksi) isi(c, KUNING); else if (kolTgl && merah(tgl[k - 3])) isi(c, MERAH);
    }
    if (!direksi) row.getCell(kPot).numFmt = RP;
    row.height = 20; r++;
  };
  for (const u of d.direksi) tulisBaris(u, true);
  if (d.direksi.length) { for (let k = 1; k <= kPot; k++) isi(ws.getCell(r, k), ABU); ws.getRow(r).height = 6; r++; }
  for (const u of d.karyawan) tulisBaris(u, false);

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `rekap-keterlambatan-${d.periode}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
