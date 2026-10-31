'use client';
/* AI Asisten (HC / Super Admin): tanya-jawab berbasis data HRIS. Percakapan hanya disimpan di tab ini (sessionStorage). */
import { useEffect, useRef, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { Markdown } from '@/components/Markdown';
import { api } from '@/lib/klien/api';
import { NAMA_BULAN } from '@/lib/klien/format';

type Jejak = { alat: string; ket: string; ok: boolean };
type Pesan = { role: 'user' | 'assistant'; content: string; jejak?: Jejak[]; galat?: boolean };
const SIMPAN = 'posi.asisten.v1';
const NAMA_ALAT: Record<string, string> = { cari_karyawan: 'Mencari karyawan', ringkasan_karyawan: 'Ringkasan karyawan', rekap_karyawan: 'Rekap kehadiran',
  struktur_organisasi: 'Struktur organisasi', rekrutmen_lowongan: 'Lowongan rekrutmen', rekrutmen_kandidat: 'Kandidat rekrutmen',
  rekrutmen_detail_kandidat: 'Detail kandidat', kpi_karyawan: 'KPI karyawan', kpi_rekap: 'Peringkat KPI', beban_kerja: 'Beban kerja', log_kerja_karyawan: 'Log kerja', lihat_skema: 'Daftar data', query_sql: 'Kueri data' };

export default function Asisten() {
  const { me } = useAplikasi();
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState(''), [proses, setProses] = useState(false), [tahap, setTahap] = useState(0);
  const bawah = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const bulan = NAMA_BULAN[new Date().getMonth()];
  const contoh = [
    `Siapa 5 karyawan yang paling sering terlambat bulan ${bulan}?`,
    `Bagaimana kehadiran divisi Sales bulan ${bulan}?`,
    'Ringkas performa kehadiran [nama karyawan] 3 bulan terakhir',
    'Apakah [nama karyawan] layak dipertimbangkan untuk promosi?',
    'Siapa saja yang kontraknya berakhir dalam 60 hari ke depan?',
    'Siapa 5 kandidat terbaik untuk lowongan yang sedang dibuka?',
    'Berapa kali [nama karyawan] izin sakit tahun ini?',
  ];

  useEffect(() => { try { const s = sessionStorage.getItem(SIMPAN); if (s) setPesan(JSON.parse(s)); } catch { /* */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(SIMPAN, JSON.stringify(pesan.slice(-30))); } catch { /* */ } bawah.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [pesan, proses]);
  useEffect(() => { if (!proses) return; setTahap(0); const t = setInterval(() => setTahap((x) => x + 1), 2200); return () => clearInterval(t); }, [proses]);

  const kirim = async (isi?: string) => {
    const q = (isi ?? teks).trim();
    if (!q || proses) return;
    const baru: Pesan[] = [...pesan, { role: 'user', content: q }];
    setPesan(baru); setTeks(''); setProses(true);
    try {
      const r = await api<{ jawaban: string; jejak: Jejak[] }>('ai_tanya', { pesan: baru.filter((x) => !x.galat).map(({ role, content }) => ({ role, content })) }, true);
      setPesan((x) => [...x, { role: 'assistant', content: r.jawaban, jejak: r.jejak }]);
    } catch (e) {
      setPesan((x) => [...x, { role: 'assistant', content: e instanceof Error ? e.message : 'Terjadi kesalahan', galat: true }]);
    } finally { setProses(false); setTimeout(() => input.current?.focus(), 50); }
  };

  if (!isAdminUp(me)) return <div className="card"><div className="empty">Menu ini khusus HC dan Super Admin.</div></div>;
  const LANGKAH = ['Memahami pertanyaan…', 'Mengambil data dari database…', 'Menghitung kehadiran & keterlambatan…', 'Menyusun jawaban…'];
  return (
    <div className="ai-wadah">
      <div className="card ai-kepala">
        <span className="ai-logo"><Ikon n="sparkles" /></span>
        <div style={{ flex: 1, minWidth: 0 }}><h3 style={{ margin: 0 }}>AI Asisten HRIS</h3>
          <div className="tiny muted">Tanya apa saja tentang kehadiran, keterlambatan, izin, cuti, dan masa kerja karyawan. Jawaban diambil dari data asli (baca-saja).</div></div>
        {pesan.length > 0 && <button className="btn ghost sm auto" disabled={proses} onClick={() => setPesan([])}><Ikon n="plus" />Obrolan baru</button>}
      </div>

      <div className="ai-obrolan">
        {!pesan.length && (
          <div className="ai-sambut">
            <div className="ai-sambut-ic"><Ikon n="sparkles" /></div>
            <h3>Halo {me?.nama?.split(' ')[0]}, ada yang bisa saya bantu?</h3>
            <div className="ai-contoh">{contoh.map((c) => <button key={c} type="button" onClick={() => (c.includes('[') ? (setTeks(c), setTimeout(() => {
              const el = input.current; if (!el) return; el.focus(); const a = c.indexOf('['); el.setSelectionRange(a, c.indexOf(']') + 1);
            }, 30)) : kirim(c))}><Ikon n="send" />{c}</button>)}</div>
          </div>)}
        {pesan.map((p, i) => (
          <div key={i} className={'ai-pesan ' + (p.role === 'user' ? 'saya' : 'ai') + (p.galat ? ' galat' : '')}>
            {p.role === 'assistant' && <span className="ai-av"><Ikon n={p.galat ? 'circle-alert' : 'sparkles'} /></span>}
            <div className="ai-gelembung">
              {p.role === 'user' ? p.content : <Markdown teks={p.content} />}
              {!!p.jejak?.length && <details className="ai-jejak"><summary><Ikon n="layers" />Data yang dipakai ({p.jejak.length})</summary>
                <ul>{p.jejak.map((j, n) => <li key={n} className={j.ok ? '' : 'gagal'}><b>{NAMA_ALAT[j.alat] ?? j.alat}</b>{j.ket && <span> · {j.ket}</span>}{!j.ok && <span> · gagal</span>}</li>)}</ul></details>}
            </div>
          </div>))}
        {proses && <div className="ai-pesan ai"><span className="ai-av"><Ikon n="sparkles" /></span>
          <div className="ai-gelembung ai-pikir"><span className="ai-titik"><i /><i /><i /></span>{LANGKAH[Math.min(tahap, LANGKAH.length - 1)]}</div></div>}
        <div ref={bawah} />
      </div>

      <div className="ai-input">
        <textarea ref={input} rows={1} value={teks} placeholder="Tulis pertanyaan… (Enter untuk kirim, Shift+Enter baris baru)" disabled={proses}
          onChange={(e) => setTeks(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void kirim(); } }} />
        <button className="btn auto" disabled={proses || !teks.trim()} onClick={() => kirim()} aria-label="Kirim pertanyaan"><Ikon n="send" /></button>
      </div>
      <div className="tiny muted ai-catatan">Pertanyaan & data terkait diproses oleh layanan AI Groq. Data rahasia (PIN, KTP, NPWP, rekening, BPJS) tidak pernah dikirim. AI dapat keliru — periksa kembali sebelum mengambil keputusan.</div>
    </div>
  );
}
