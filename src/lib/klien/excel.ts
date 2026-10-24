'use client';
/* Ekspor ke Excel. SheetJS dimuat hanya saat dibutuhkan agar halaman lain tetap ringan. */
export async function keExcel(rows: Record<string, unknown>[], sheet: string, file: string) {
  if (!rows.length) throw new Error('Tidak ada data untuk diekspor');
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  XLSX.writeFile(wb, file + '.xlsx');
}
export async function keExcelBanyak(sheets: [string, Record<string, unknown>[]][], file: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [nama, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Keterangan: 'Tidak ada data' }]), nama);
  XLSX.writeFile(wb, file + '.xlsx');
}
