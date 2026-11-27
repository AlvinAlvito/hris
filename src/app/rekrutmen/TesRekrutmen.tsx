'use client';
/* Tes pilihan ganda pelamar (tanpa login, lewat token): petunjuk → mengerjakan (dengan batas waktu bila diatur) → terkirim.
   Jawaban disimpan di perangkat selama mengerjakan, jadi halaman yang tertutup / dimuat ulang bisa dilanjutkan dari tautan yang sama.
   Kunci jawaban & nilai tidak pernah dikirim ke pelamar. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';

type Info = { status: 'belum' | 'mulai' | 'selesai'; judul: string; nama: string; posisi: string; bidang: string; durasi: number; jumlahSoal: number; petunjuk: string };
type Soal = { id: number; p: string; o: string[]; poin: number };
const HURUF = 'ABCDE';

const simpanLokal = (token: string, j: Record<number, number>) => { try { localStorage.setItem('rk-tes-' + token, JSON.stringify(j)); } catch { /* mode privat */ } };
const bacaLokal = (token: string): Record<number, number> => { try { return JSON.parse(localStorage.getItem('rk-tes-' + token) || '{}'); } catch { return {}; } };
const hapusLokal = (token: string) => { try { localStorage.removeItem('rk-tes-' + token); } catch { /* abaikan */ } };
const formatWaktu = (d: number) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;

export function TesPilihanGanda({ token, baruMelamar }: { token: string; baruMelamar?: boolean }) {
  const { galat, toast, yakin } = useAplikasi();
  const [info, setInfo] = useState<Info | null>(null), [salah, setSalah] = useState('');
  const [soal, setSoal] = useState<Soal[] | null>(null), [jawab, setJawab] = useState<Record<number, number>>({});
  const [batas, setBatas] = useState<number | null>(null), [sisa, setSisa] = useState<number | null>(null);
  const [kirim, setKirim] = useState(false), [selesai, setSelesai] = useState(false);
  const terkirim = useRef(false);

  useEffect(() => {
    api<Info>('rk_tes_buka', { token }, true).then((x) => { setInfo(x); if (x.status === 'selesai') setSelesai(true); }).catch((e) => setSalah(e instanceof Error ? e.message : String(e)));
  }, [token]);

  const mulai = async () => {
    try {
      const r = await api<{ soal: Soal[]; sisaDetik: number | null }>('rk_tes_mulai', { token }, true);
      setJawab(bacaLokal(token)); setSoal(r.soal);
      if (r.sisaDetik != null) { setBatas(Date.now() + r.sisaDetik * 1000); setSisa(r.sisaDetik); }
      window.scrollTo({ top: 0 });
    } catch (e) { galat(e); }
  };
  // tes yang sudah dimulai (halaman dimuat ulang) langsung dilanjutkan
  useEffect(() => { if (info?.status === 'mulai' && !soal) mulai(); }, [info?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const kirimJawaban = useCallback(async (otomatis = false) => {
    if (terkirim.current) return;
    terkirim.current = true; setKirim(true);
    try {
      await api('rk_tes_kirim', { token, jawaban: jawab }, true);
      hapusLokal(token); setSelesai(true); window.scrollTo({ top: 0 });
      if (otomatis) toast('Waktu habis — jawaban Anda terkirim otomatis');
    } catch (e) { terkirim.current = false; setKirim(false); galat(e); }
  }, [token, jawab, toast, galat]);

  useEffect(() => {
    if (batas == null || selesai) return;
    const t = setInterval(() => {
      const d = Math.max(0, Math.round((batas - Date.now()) / 1000));
      setSisa(d);
      if (d === 0) { clearInterval(t); kirimJawaban(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [batas, selesai, kirimJawaban]);

  // peringatan saat menutup halaman di tengah tes
  useEffect(() => {
    if (!soal || selesai) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [soal, selesai]);

  const pilih = (id: number, n: number) => setJawab((x) => { const b = { ...x, [id]: n }; simpanLokal(token, b); return b; });
  const ajukan = async () => {
    const kosong = (soal ?? []).filter((x) => jawab[x.id] === undefined).length;
    if (!(await yakin(kosong ? `Masih ada ${kosong} soal belum dijawab` : 'Kirim jawaban sekarang?',
      (kosong ? 'Soal yang tidak dijawab dinilai salah. ' : '') + 'Jawaban hanya bisa dikirim satu kali dan tidak bisa diubah lagi.', { ya: 'Kirim Jawaban' }))) return;
    kirimJawaban();
  };

  if (salah) return <section className="card rk-selesai"><div className="rk-selesai-ic merah"><Ikon n="circle-x" /></div><h2>Tautan tes tidak bisa dibuka</h2><p className="muted">{salah}</p></section>;
  if (!info) return <div className="card"><div className="skel" style={{ height: 200 }} /></div>;
  if (selesai) return (
    <section className="card rk-selesai">
      <div className="rk-selesai-ic"><Ikon n="circle-check" /></div>
      <h2>Terima kasih, {info.nama.split(' ')[0]}!</h2>
      <p>Lamaran dan jawaban tes Anda untuk posisi <b>{info.posisi}{info.bidang && ` — ${info.bidang}`}</b> sudah kami terima.</p>
      <p className="muted">Tim HRD akan menghubungi Anda melalui <b>WhatsApp</b> atau <b>email</b> bila Anda lolos ke tahap berikutnya. Mohon pastikan nomor dan email Anda aktif.</p>
      <a className="btn ghost auto" href="/rekrutmen"><Ikon n="chevron-left" />Lihat lowongan lain</a>
    </section>
  );

  if (!soal) return (
    <section className="card rk-tes-info">
      {baruMelamar && <div className="rk-tes-ok"><Ikon n="circle-check" /><div><b>Lamaran Anda sudah terkirim.</b><span>Satu langkah lagi: kerjakan tes di bawah ini.</span></div></div>}
      <div className="rk-pita"><Ikon n="clipboard-list" />Tes Seleksi</div>
      <h2>{info.judul}</h2>
      <div className="muted">{info.posisi}{info.bidang && ` — ${info.bidang}`} · {info.nama}</div>
      <div className="rk-tes-angka">
        <div><Ikon n="list-checks" /><b>{info.jumlahSoal}</b><span>soal pilihan ganda</span></div>
        <div><Ikon n="timer" /><b>{info.durasi ? info.durasi + ' menit' : 'Bebas'}</b><span>{info.durasi ? 'batas waktu' : 'tanpa batas waktu'}</span></div>
      </div>
      {info.petunjuk && <><h4>Petunjuk</h4><p className="rk-teks">{info.petunjuk}</p></>}
      <ul className="rk-list">
        <li><Ikon n="check" />Pilih satu jawaban yang paling tepat untuk setiap soal.</li>
        {info.durasi > 0 && <li><Ikon n="check" />Waktu mulai berjalan saat Anda menekan <b>Mulai Tes</b>. Jawaban terkirim otomatis ketika waktu habis.</li>}
        <li><Ikon n="check" />Jawaban hanya bisa dikirim <b>satu kali</b>.</li>
        <li><Ikon n="check" />Bila koneksi terputus, buka kembali tautan ini dari perangkat yang sama untuk melanjutkan.</li>
      </ul>
      <div className="rk-tes-tautan"><span className="tiny muted">Tautan tes Anda:</span><code>{typeof window !== 'undefined' ? window.location.origin : ''}/rekrutmen/tes?t={token}</code>
        <button type="button" className="btn ghost sm auto" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/rekrutmen/tes?t=${token}`).then(() => toast('Tautan tes disalin'))}><Ikon n="copy" />Salin</button></div>
      <button className="btn rk-tombol" onClick={mulai} disabled={!info.jumlahSoal}><Ikon n="send" />Mulai Tes</button>
    </section>
  );

  const terjawab = soal.filter((x) => jawab[x.id] !== undefined).length;
  return (<>
    <div className="rk-tes-bar">
      <div><b>{info.judul}</b><span className="tiny muted">{terjawab}/{soal.length} terjawab</span></div>
      {sisa != null && <span className={'rk-tes-waktu' + (sisa <= 60 ? ' kritis' : sisa <= 300 ? ' awas' : '')}><Ikon n="timer" />{formatWaktu(sisa)}</span>}
      <i style={{ width: (terjawab / soal.length) * 100 + '%' }} />
    </div>
    <div className="rk-tes-daftar">{soal.map((x, n) => (
      <section key={x.id} className={'card rk-soal' + (jawab[x.id] !== undefined ? ' dijawab' : '')} id={'soal-' + n}>
        <div className="rk-soal-no">Soal {n + 1}{x.poin > 1 && <span className="tiny muted"> · {x.poin} poin</span>}</div>
        <p className="rk-soal-teks">{x.p}</p>
        <div className="rk-opsi" role="radiogroup" aria-label={'Jawaban soal ' + (n + 1)}>{x.o.map((o, j) => (
          <button key={j} type="button" role="radio" aria-checked={jawab[x.id] === j} className={jawab[x.id] === j ? 'on' : ''} onClick={() => pilih(x.id, j)} disabled={kirim}>
            <span className="h">{HURUF[j]}</span><span>{o}</span></button>))}</div>
      </section>))}</div>
    <div className="rk-tes-nav">{soal.map((x, n) => <a key={x.id} href={'#soal-' + n} className={jawab[x.id] !== undefined ? 'on' : ''}>{n + 1}</a>)}</div>
    <button className="btn rk-tombol" onClick={ajukan} disabled={kirim}>{kirim ? <><span className="spin" /> Mengirim…</> : <><Ikon n="send" />Kirim Jawaban ({terjawab}/{soal.length})</>}</button>
  </>);
}
