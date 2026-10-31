'use client';
/* Penampil Markdown ringkas & aman (tanpa HTML mentah): judul, paragraf, tebal/miring/kode, daftar, tabel GFM, garis */
import { Fragment, type ReactNode } from 'react';

function sebaris(teks: string, kunci = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const pola = /(\\[\\*_`#>|~-]|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let akhir = 0, m: RegExpExecArray | null, i = 0;
  while ((m = pola.exec(teks))) {
    if (m.index > akhir) out.push(teks.slice(akhir, m.index));
    const t = m[0];
    if (t.startsWith('\\')) out.push(t.slice(1));   // karakter yang di-escape ditampilkan apa adanya
    else if (t.startsWith('**')) out.push(<b key={kunci + i++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={kunci + i++}>{t.slice(1, -1)}</code>);
    else out.push(<em key={kunci + i++}>{t.slice(1, -1)}</em>);
    akhir = m.index + t.length;
  }
  if (akhir < teks.length) out.push(teks.slice(akhir));
  return out;
}
const sel = (baris: string) => baris.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());

export function Markdown({ teks }: { teks: string }) {
  const baris = teks.replace(/\r/g, '').split('\n');
  const blok: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < baris.length) {
    const b = baris[i];
    if (!b.trim()) { i++; continue; }
    // tabel: baris | a | b | diikuti pemisah |---|---|
    if (/^\s*\|.*\|\s*$/.test(b) && i + 1 < baris.length && /^\s*\|?\s*:?-{2,}/.test(baris[i + 1])) {
      const kepala = sel(b); i += 2;
      const isi: string[][] = [];
      // baris isi cukup diawali "|" (model kadang lupa menutup baris dengan "|")
      while (i < baris.length && /^\s*\|/.test(baris[i])) isi.push(sel(baris[i++]));
      blok.push(<div key={k++} className="tblwrap md-tabel"><table><thead><tr>{kepala.map((h, j) => <th key={j}>{sebaris(h)}</th>)}</tr></thead>
        <tbody>{isi.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j}>{sebaris(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*>/.test(b)) {   // kutipan / catatan
      const isi: string[] = [];
      while (i < baris.length && /^\s*>/.test(baris[i])) isi.push(baris[i++].replace(/^\s*>\s?/, ''));
      blok.push(<blockquote key={k++} className="md-kutip">{isi.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{sebaris(x, 'q' + j)}</Fragment>)}</blockquote>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(b);
    if (h) { blok.push(<div key={k++} className={'md-h md-h' + h[1].length}>{sebaris(h[2])}</div>); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(b)) { blok.push(<hr key={k++} className="md-hr" />); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(b)) {
      // daftar bertingkat: butir menjorok (≥2 spasi) menjadi sub-daftar milik butir di atasnya;
      // nomor mengikuti angka yang ditulis, sehingga daftar yang terpotong baris kosong tetap bernomor benar
      type Butir = { no: number | null; teks: string; anak: { no: number | null; teks: string }[] };
      const butir: Butir[] = [];
      while (i < baris.length && /^\s*([-*•]|\d+[.)])\s+/.test(baris[i])) {
        const m = /^(\s*)([-*•]|(\d+)[.)])\s+(.*)$/.exec(baris[i])!;
        const x = { no: m[3] ? Number(m[3]) : null, teks: m[4] };
        if (m[1].length >= 2 && butir.length) butir[butir.length - 1].anak.push(x); else butir.push({ ...x, anak: [] });
        i++;
      }
      const daftar = (l: { no: number | null; teks: string; anak?: { no: number | null; teks: string }[] }[], kunci: string): ReactNode => {
        const isi = l.map((x, j) => <li key={j} value={x.no ?? undefined}>{sebaris(x.teks, kunci + j)}{x.anak?.length ? daftar(x.anak, kunci + j + '-') : null}</li>);
        return l[0].no !== null ? <ol key={kunci}>{isi}</ol> : <ul key={kunci}>{isi}</ul>;
      };
      blok.push(<Fragment key={k++}>{daftar(butir, 'l' + i + '-')}</Fragment>);
      continue;
    }
    const para: string[] = [];
    while (i < baris.length && baris[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s+|\s*\||\s*>)/.test(baris[i])) para.push(baris[i++]);
    if (!para.length) { para.push(baris[i++]); }
    blok.push(<p key={k++}>{para.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{sebaris(x, 'p' + j)}</Fragment>)}</p>);
  }
  return <div className="md">{blok}</div>;
}
