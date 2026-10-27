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
      while (i < baris.length && /^\s*\|.*\|\s*$/.test(baris[i])) isi.push(sel(baris[i++]));
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
      const urut = /^\s*\d+[.)]/.test(b), item: ReactNode[] = [];
      while (i < baris.length && /^\s*([-*•]|\d+[.)])\s+/.test(baris[i])) {
        const dalam = /^\s{2,}/.test(baris[i]);
        item.push(<li key={i} className={dalam ? 'md-dalam' : undefined}>{sebaris(baris[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''), 'l' + i)}</li>);
        i++;
      }
      blok.push(urut ? <ol key={k++}>{item}</ol> : <ul key={k++}>{item}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < baris.length && baris[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s+|\s*\||\s*>)/.test(baris[i])) para.push(baris[i++]);
    if (!para.length) { para.push(baris[i++]); }
    blok.push(<p key={k++}>{para.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{sebaris(x, 'p' + j)}</Fragment>)}</p>);
  }
  return <div className="md">{blok}</div>;
}
