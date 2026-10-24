/* Nomor WhatsApp disimpan sebagai digit internasional tanpa tanda +, siap untuk wa.me. */
export function normalisasiNomorWhatsApp(nilai: unknown): string | null {
  let angka = String(nilai ?? '').trim().replace(/\D/g, '');
  if (!angka) return null;
  if (angka.startsWith('00')) angka = angka.slice(2);
  if (angka.startsWith('620')) angka = '62' + angka.slice(3);
  else if (angka.startsWith('0')) angka = '62' + angka.slice(1);
  else if (angka.startsWith('8')) angka = '62' + angka;
  return /^[1-9]\d{7,14}$/.test(angka) ? angka : null;
}
