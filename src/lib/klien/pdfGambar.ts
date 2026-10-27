/* Pembuat PDF satu halaman berisi satu gambar JPEG (tanpa pustaka tambahan).
   Ukuran halaman mengikuti gambar, jadi seluruh isi terlihat utuh; pembaca PDF / printer bisa menskalakan sendiri. */
export async function pdfDariJpeg(jpeg: Blob, lebarPx: number, tinggiPx: number, lebarPt: number, tinggiPt: number, judul = ''): Promise<Blob> {
  const data = new Uint8Array(await jpeg.arrayBuffer());
  const enc = new TextEncoder();
  const bagian: Uint8Array[] = [];
  const offset: number[] = [];
  let pos = 0;
  const tulis = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; bagian.push(b); pos += b.length; };
  const obj = (n: number, isi: string) => { offset[n] = pos; tulis(`${n} 0 obj\n${isi}\nendobj\n`); };
  const W = lebarPt.toFixed(2), H = tinggiPt.toFixed(2);
  // judul PDF ditulis sebagai teks UTF-16BE heksadesimal agar huruf apa pun aman
  const hex = (s: string) => '<FEFF' + [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';

  tulis('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offset[4] = pos;
  tulis(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${lebarPx} /Height ${tinggiPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`);
  tulis(data);
  tulis('\nendstream\nendobj\n');
  const isi = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${isi.length} >>\nstream\n${isi}\nendstream`);
  obj(6, `<< /Title ${hex(judul)} /Producer (POSI HRIS) >>`);

  const xref = pos;
  tulis(`xref\n0 7\n0000000000 65535 f \n${offset.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`);
  tulis(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(bagian as BlobPart[], { type: 'application/pdf' });
}
