'use client';
/* Flyer lowongan (1080×1350, diekspor 2160×2700) dengan desain template POSI: judul besar, kartu info, jobdesk/bidang,
   kualifikasi, QR menuju halaman lowongan, dan batas lamaran. Isi otomatis dari data lowongan dan bisa disunting sebelum
   diunduh / dibagikan. Suntingan disimpan di browser per lowongan. Gambar dibuat di browser (html-to-image), tanpa server. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';

export type DataFlyer = { id: number; judul: string; divisi: string; lokasi: string; tipeLabel: string; deskripsi: string; kualifikasi: string[];
  nilaiPlus: string[]; kuota: number; batas: string | null; bidang: string[] };
type Isi = { judul: string; sorot: string; tagline: string; kiriJudul: string; kiri: string; kualifikasi: string; nilaiPlus: string; kebutuhan: string; lokasi: string };

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
/* ikon jobdesk bergantian (garis, gaya template) */
const IKON: string[] = [
  'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  'M4 6h16M4 12h16M4 18h10M19 16a2 2 0 1 1 0 4a2 2 0 1 1 0-4',
  'M3 12h4l3-8 4 16 3-8h4',
  'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
];
const IT = /\b(it|teknologi|developer|programmer|software|jaringan|sistem informasi|data)\b/i;

/* isi awal dari data lowongan */
function isiAwal(l: DataFlyer): Isi {
  const kata = l.judul.trim().split(/\s+/);
  const kiri = l.bidang.length ? l.bidang.join('\n') : (() => {
    // baris judul bagian (diakhiri ":") dibuang; bila ada baris "Tugas: keterangan", hanya baris itu yang dipakai
    let baris = l.deskripsi.split('\n').map((x) => x.replace(/^\s*([-•*]|\d+[.)])\s*/, '').trim()).filter((x) => x && !/:\s*$/.test(x));
    const terstruktur = baris.filter((x) => /^[^:|—]{3,60}\s*(:|\||—)\s*\S/.test(x));
    if (terstruktur.length >= 2) baris = terstruktur;
    else if (baris.length <= 2) baris = baris.join(' ').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 3);
    return baris.slice(0, 5).map((x) => {
      const m = /^([^:|—]{3,60}?)\s*(?::|\||—)\s*(.+)$/.exec(x);
      return m ? `${m[1]} | ${pendekkan(m[2], 80)}` : pendekkan(x.replace(/[.]$/, ''), 90);
    }).join('\n');
  })();
  return {
    judul: l.judul, sorot: kata.length > 1 ? kata[kata.length - 1] : '',
    tagline: `Pusat Olimpiade Sains Indonesia (POSI) adalah penyelenggara olimpiade sains swasta terbesar di Indonesia, dengan peserta jenjang SD hingga SMA dari seluruh Indonesia. Kami membuka kesempatan bagi Anda untuk bergabung${l.divisi ? ` di Divisi ${l.divisi}` : ''}.`,
    kiriJudul: l.bidang.length ? 'Bidang' : 'Jobdesk', kiri, kualifikasi: l.kualifikasi.join('\n'), nilaiPlus: l.nilaiPlus.join('\n'),
    kebutuhan: `${l.kuota} Orang`, lokasi: (l.lokasi || 'Medan').split(',')[0].trim(),
  };
}
/* potong teks panjang di batas kalimat / koma / kata */
function pendekkan(s: string, maks: number): string {
  s = s.split(/;\s*/)[0].replace(/[.]$/, '').trim();
  if (s.length <= maks) return s;
  const potong = s.slice(0, maks), koma = potong.lastIndexOf(', ');
  return (koma > maks * 0.55 ? potong.slice(0, koma) : potong.slice(0, potong.lastIndexOf(' '))) + '…';
}
const KUNCI = (id: number) => 'posi-flyer-' + id;
const baris = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);

/* ---------- gambar flyer (ukuran asli 1080×1350) ---------- */
function Flyer({ l, v, qr, logo, refNode }: { l: DataFlyer; v: Isi; qr: string; logo: string; refNode: React.RefObject<HTMLDivElement | null> }) {
  const h1 = useRef<HTMLHeadingElement>(null), atas = useRef<HTMLDivElement>(null), isi = useRef<HTMLDivElement>(null);
  // sesuaikan ukuran huruf agar judul, tagline, dan isi tidak meluap
  useLayoutEffect(() => {
    const el = h1.current, a = atas.current, b = isi.current, root = refNode.current;
    if (!el || !a || !b || !root) return;
    let f = 116; el.style.fontSize = f + 'px';
    while (f > 56 && (el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > 240)) { f -= 4; el.style.fontSize = f + 'px'; }
    // kalimat pembuka harus selesai sebelum kartu info (yang menumpuk 48px ke bagian atas): kecilkan judul dulu, lalu kalimatnya
    const tag = a.querySelector<HTMLElement>('.fl-tagline');
    let t = 22; root.style.setProperty('--fl-tag', t + 'px');
    const luber = () => !!tag && tag.offsetTop + tag.offsetHeight > a.clientHeight - 70;
    while (luber() && (f > 84 || t > 16)) {
      if (f > 84) { f -= 4; el.style.fontSize = f + 'px'; } else { t -= 1; root.style.setProperty('--fl-tag', t + 'px'); }
    }
    // isi kartu info (mis. "Karyawan Tetap") dikecilkan agar tidak terpotong
    root.querySelectorAll<HTMLElement>('.fl-meta strong').forEach((s) => {
      let u = 25; s.style.fontSize = u + 'px';
      while (u > 15 && s.scrollWidth > s.clientWidth + 1) { u -= 1; s.style.fontSize = u + 'px'; }
    });
    let s = 1; root.style.setProperty('--fl-s', String(s));
    while (s > 0.62 && b.scrollHeight > b.clientHeight + 1) { s = Math.round((s - 0.04) * 100) / 100; root.style.setProperty('--fl-s', String(s)); }
  }, [v, refNode]);
  const judul = v.judul.trim(), sorot = v.sorot.trim();
  const i = sorot ? judul.toLowerCase().lastIndexOf(sorot.toLowerCase()) : -1;
  const kiri = baris(v.kiri).map((x) => { const m = /^(.+?)\s*(?:\||—|:)\s*(.+)$/.exec(x); return m ? { b: m[1], s: m[2] } : { b: x, s: '' }; });
  const [hari, bulan] = l.batas ? [String(Number(l.batas.slice(8, 10))), `${BULAN[Number(l.batas.slice(5, 7)) - 1]} ${l.batas.slice(0, 4)}`] : ['', ''];
  const domain = typeof window !== 'undefined' ? window.location.host : 'hris.posi.my.id';
  return (
    <div className="fl" ref={refNode}>
      <section className="fl-top" ref={atas}>
        <div className="fl-grid" /><div className="fl-orb" />
        {IT.test(`${l.judul} ${l.divisi}`)
          ? <pre className="fl-code"><b>$</b> ping posi.id{'\n'}reply: 12ms ✓{'\n'}<b>$</b> status --all{'\n'}web    online ✓{'\n'}event  ready  ✓{'\n'}<b>$</b> join --team {l.divisi || 'IT'}_</pre>
          : <div className="fl-sains">∑ π √x<br />E = mc²<br />H₂O · NaCl<br />a² + b² = c²<br />⚛ ∫ Δ λ</div>}
        <div className="fl-brand">
          <div className="fl-logo"><img src={logo} alt="POSI" /></div>
          <div className="fl-pill">Yayasan Pendidikan Posi</div>
        </div>
        <div className="fl-kicker"><i />WE&apos;RE HIRING</div>
        <h1 ref={h1}>{i > 0 ? <>{judul.slice(0, i)}<span>{judul.slice(i, i + sorot.length)}</span>{judul.slice(i + sorot.length)}</> : i === 0 ? <span>{judul}</span> : judul}</h1>
        <p className="fl-tagline">{v.tagline}</p>
      </section>
      <div className="fl-meta">
        <div><small>Tipe</small><strong>{l.tipeLabel}</strong></div>
        <div><small>Lokasi</small><strong>{v.lokasi}</strong></div>
        <div><small>Divisi</small><strong>{l.divisi || '—'}</strong></div>
        <div><small>Kebutuhan</small><strong>{v.kebutuhan}</strong></div>
      </div>
      <section className="fl-body" ref={isi}>
        {kiri.length > 0 && <div>
          <h2>{v.kiriJudul}</h2>
          <div className="fl-tasks">{kiri.map((x, n) => (
            <div key={n} className="fl-task"><div className="fl-ic"><svg viewBox="0 0 24 24"><path d={IKON[n % IKON.length]} /></svg></div>
              <div><b>{x.b}</b>{x.s && <span>{x.s}</span>}</div></div>))}</div>
        </div>}
        <div>
          <h2>Kualifikasi</h2>
          <ul className="fl-quals">
            {baris(v.kualifikasi).map((x, n) => <li key={n}>{x}</li>)}
            {baris(v.nilaiPlus).map((x, n) => <li key={'p' + n} className="plus">Nilai tambah: {x.replace(/^nilai tambah:\s*/i, '')}</li>)}
          </ul>
        </div>
      </section>
      <section className="fl-foot">
        <div className="fl-qr">{qr && <img src={qr} alt="QR lamaran" />}</div>
        <div className="fl-cta"><small>Cara melamar</small><div>Scan &amp; lamar online</div><p><b>{domain}/rekrutmen</b></p></div>
        <div className="fl-deadline">{l.batas ? <><small>Batas lamaran</small><strong>{hari}</strong><span>{bulan}</span></>
          : <><small>Lamaran</small><strong className="kecil">Dibuka</strong><span>hingga terisi</span></>}</div>
      </section>
    </div>
  );
}

/* ---------- sheet: sunting, pratinjau, unduh, bagikan ---------- */
export function FlyerLowongan({ l, tautan }: { l: DataFlyer; tautan: string }) {
  const { settings, toast, galat } = useAplikasi();
  const [v, setV] = useState<Isi>(() => {
    const awal = isiAwal(l);
    try { const s = JSON.parse(localStorage.getItem(KUNCI(l.id)) || 'null'); return s ? { ...awal, ...s } : awal; } catch { return awal; }
  });
  const [qr, setQr] = useState(''), [proses, setProses] = useState(''), [sunting, setSunting] = useState(false);
  const node = useRef<HTMLDivElement>(null), bingkai = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0.4);
  useEffect(() => { import('qrcode').then((Q) => Q.toDataURL(tautan, { margin: 0, width: 400, errorCorrectionLevel: 'M', color: { dark: '#0B1E3F', light: '#FFFFFF' } })).then(setQr).catch(galat); }, [tautan, galat]);
  useEffect(() => { try { localStorage.setItem(KUNCI(l.id), JSON.stringify(v)); } catch { /* mode privat */ } }, [v, l.id]);
  useLayoutEffect(() => {
    const f = () => { const w = bingkai.current?.clientWidth ?? 400; setSkala(Math.min(1, w / 1080)); };
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  const set = (k: keyof Isi) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const namaBerkas = 'Flyer Lowongan ' + l.judul.replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const caption = `📢 *LOWONGAN KERJA — ${l.judul.toUpperCase()}*\nYayasan Pendidikan Posi (POSI) · ${v.lokasi}\n\nLamar online di sini:\n${tautan}${l.batas ? `\n\nBatas lamaran: ${Number(l.batas.slice(8, 10))} ${BULAN[Number(l.batas.slice(5, 7)) - 1]} ${l.batas.slice(0, 4)}` : ''}`;

  const buatGambar = useCallback(async (jenis: 'png' | 'jpeg'): Promise<Blob> => {
    if (!node.current) throw new Error('Flyer belum siap');
    await document.fonts.ready;
    const { toBlob } = await import('html-to-image');
    const opsi = { width: 1080, height: 1350, pixelRatio: 2, cacheBust: true, type: 'image/' + jenis, quality: 0.93, backgroundColor: '#ffffff' };
    await toBlob(node.current, opsi);   // putaran pertama memuat gambar & huruf (Safari kadang kosong di percobaan pertama)
    const b = await toBlob(node.current, opsi);
    if (!b) throw new Error('Gagal membuat gambar flyer');
    return b;
  }, []);
  const unduh = async (jenis: 'png' | 'jpeg') => {
    setProses(jenis);
    try {
      const b = await buatGambar(jenis), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = `${namaBerkas}.${jenis === 'png' ? 'png' : 'jpg'}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('Flyer diunduh');
    } catch (e) { galat(e); } finally { setProses(''); }
  };
  const bagikan = async () => {
    setProses('bagi');
    try {
      const f = new File([await buatGambar('jpeg')], `${namaBerkas}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: `Lowongan ${l.judul}`, text: caption }).catch((e) => { if (e?.name !== 'AbortError') throw e; });
      } else {
        const u = URL.createObjectURL(f), a = document.createElement('a'); a.href = u; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
        await navigator.clipboard.writeText(caption).catch(() => {});
        toast('Perangkat ini belum mendukung bagikan gambar langsung — flyer diunduh dan teks caption disalin');
      }
    } catch (e) { galat(e); } finally { setProses(''); }
  };

  return (<>
    <h3><Ikon n="image" />Flyer Lowongan · {l.judul}</h3>
    <div className="fl-bingkai" ref={bingkai} style={{ height: 1350 * skala }}>
      <div style={{ transform: `scale(${skala})`, transformOrigin: 'top left', width: 1080, height: 1350 }}>
        <Flyer l={l} v={v} qr={qr} logo={settings.logo || '/logo-posi.png'} refNode={node} />
      </div>
    </div>
    <div className="fl-aksi">
      <button className="btn" disabled={!!proses || !qr} onClick={bagikan}>{proses === 'bagi' ? <><span className="spin" /> Menyiapkan…</> : <><Ikon n="send" />Bagikan gambar</>}</button>
      <button className="btn ghost" disabled={!!proses || !qr} onClick={() => unduh('jpeg')}><Ikon n="download" />{proses === 'jpeg' ? 'Membuat…' : 'Unduh JPG'}</button>
      <button className="btn ghost" disabled={!!proses || !qr} onClick={() => unduh('png')}><Ikon n="download" />{proses === 'png' ? 'Membuat…' : 'Unduh PNG'}</button>
      <button className="btn ghost" onClick={() => navigator.clipboard.writeText(caption).then(() => toast('Teks caption disalin'))}><Ikon n="copy" />Salin caption</button>
    </div>
    <button type="button" className="btn ghost sm auto" style={{ marginTop: 10 }} onClick={() => setSunting((x) => !x)}><Ikon n="pencil" />{sunting ? 'Tutup penyuntingan' : 'Sunting isi flyer'}</button>
    {sunting && <div className="fl-form">
      <div className="row"><div style={{ flex: 2 }}><label>Judul</label><input value={v.judul} onChange={set('judul')} maxLength={60} /></div>
        <div><label>Kata disorot (emas)</label><input value={v.sorot} onChange={set('sorot')} maxLength={30} /></div></div>
      <label>Kalimat pembuka</label><textarea rows={3} value={v.tagline} onChange={set('tagline')} maxLength={320} />
      <div className="row"><div><label>Lokasi (kartu)</label><input value={v.lokasi} onChange={set('lokasi')} maxLength={24} /></div>
        <div><label>Kebutuhan (kartu)</label><input value={v.kebutuhan} onChange={set('kebutuhan')} maxLength={24} /></div>
        <div><label>Judul kolom kiri</label><input value={v.kiriJudul} onChange={set('kiriJudul')} maxLength={20} /></div></div>
      <label>{v.kiriJudul || 'Kolom kiri'} <span className="tiny muted">(satu per baris; tulis "Judul | keterangan" untuk teks kecil di bawahnya; kosongkan untuk menyembunyikan)</span></label>
      <textarea rows={5} value={v.kiri} onChange={set('kiri')} placeholder={'IT support harian | Laptop, printer, WiFi, email\nStandby event & kompetisi | Ujian online & offline'} />
      <label>Kualifikasi <span className="tiny muted">(satu per baris)</span></label><textarea rows={5} value={v.kualifikasi} onChange={set('kualifikasi')} />
      <label>Nilai tambah <span className="tiny muted">(satu per baris)</span></label><textarea rows={2} value={v.nilaiPlus} onChange={set('nilaiPlus')} />
      <div className="tiny muted" style={{ marginTop: 6 }}>Ukuran huruf menyesuaikan otomatis bila isi panjang. Suntingan tersimpan di perangkat ini.
        <button type="button" className="btn ghost sm auto" style={{ marginLeft: 6 }} onClick={() => setV(isiAwal(l))}><Ikon n="undo-2" />Kembalikan isi awal</button></div>
    </div>}
  </>);
}
