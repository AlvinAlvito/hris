'use client';
/* Bank Soal Tes rekrutmen (HC, Super Admin, Supervisor): paket soal pilihan ganda + kunci jawaban + poin per soal.
   Soal dibuat manual atau dibantu AI (ditinjau dulu sebelum disimpan). Paket dipasang di lowongan (menu Rekrutmen → Lowongan);
   pelamar mengerjakannya langsung setelah mengirim lamaran. Nilai = poin soal yang benar ÷ total poin × 100. */
import { useCallback, useEffect, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { tglPendek } from '@/lib/klien/format';

type Paket = { id: number; judul: string; divisi: string; petunjuk: string; durasi: number; nilaiLulus: number; acak: boolean; jumlahSoal: number; totalPoin: number;
  peserta: number; rataNilai: number | null; dibuatNama: string; tujuan: string; diubah: string; lowongan: { id: number; judul: string; status: string }[] };
type Soal = { id: number; pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string; sumber: 'manual' | 'ai' | 'impor' | 'salin' };
type SoalDraf = { pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string; ragu?: boolean; jawabPeriksa?: number };
const HURUF = 'ABCDE';

/* "papan klip" soal: disimpan di browser agar bisa ditempel di paket lain (berlaku di perangkat ini saja) */
type Klip = { ids: number[]; asal: string; paketId: number };
const KUNCI_KLIP = 'posi-salin-soal';
const bacaKlip = (): Klip | null => { try { const k = JSON.parse(localStorage.getItem(KUNCI_KLIP) || 'null'); return k && Array.isArray(k.ids) && k.ids.length ? k : null; } catch { return null; } };
const simpanKlip = (k: Klip | null) => { try { if (k) localStorage.setItem(KUNCI_KLIP, JSON.stringify(k)); else localStorage.removeItem(KUNCI_KLIP); } catch { /* mode privat */ } };

/* ---------- template & impor Excel ---------- */
const KOLOM_EXCEL = ['No', 'Pertanyaan', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Pilihan E', 'Kunci (A-E)', 'Poin', 'Pembahasan'];
async function unduhTemplateSoal() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const contoh = [
    [1, 'FPB dari 12 dan 18 adalah …', '3', '6', '9', '12', '', 'B', 1, '12 = 2²·3, 18 = 2·3², FPB = 2·3 = 6'],
    [2, 'Hasil dari 15% × 200 adalah …', '20', '30', '40', '', '', 'B', 2, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([KOLOM_EXCEL, ...contoh]);
  ws['!cols'] = [{ wch: 5 }, { wch: 60 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 7 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Soal');
  const petunjuk = XLSX.utils.aoa_to_sheet([
    ['Petunjuk pengisian'],
    ['1. Isi soal mulai baris ke-2 sheet "Soal" (hapus/timpa 2 baris contoh). Satu baris = satu soal.'],
    ['2. Pertanyaan wajib. Isi minimal 2 pilihan (A dan B); pilihan C–E boleh dikosongkan.'],
    ['3. Kunci diisi satu huruf A–E sesuai pilihan yang benar, dan pilihan tersebut harus terisi.'],
    ['4. Poin = bobot soal (1–100). Kosong = 1. Soal sulit boleh diberi poin lebih besar.'],
    ['5. Pembahasan opsional (hanya terlihat oleh HC / pembuat soal, tidak oleh pelamar).'],
    ['6. Jangan mengubah urutan atau nama judul kolom di baris pertama.'],
    ['7. Simpan, lalu unggah lewat tombol "Impor Excel" di paket soal. Anda bisa meninjau hasilnya sebelum disimpan.'],
  ]);
  petunjuk['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, petunjuk, 'Petunjuk');
  XLSX.writeFile(wb, 'Template Soal Tes.xlsx');
}
type BarisImpor = { baris: number; soal: SoalDraf; galat: string };
async function bacaExcelSoal(f: File): Promise<BarisImpor[]> {
  if (f.size > 5 * 1024 * 1024) throw new Error('Berkas Excel maksimal 5 MB');
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets['Soal'] ?? wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  const kepala = (data[0] ?? []).map((x) => String(x).trim().toLowerCase());
  const kol = (nama: string) => kepala.findIndex((k) => k.startsWith(nama.toLowerCase()));
  const iTanya = kol('Pertanyaan'), iKunci = kol('Kunci'), iPoin = kol('Poin'), iBahas = kol('Pembahasan');
  const iOpsi = ['A', 'B', 'C', 'D', 'E'].map((h) => kol('Pilihan ' + h));
  if (iTanya < 0 || iKunci < 0 || iOpsi[0] < 0 || iOpsi[1] < 0) throw new Error('Format tidak sesuai template. Unduh "Template Excel" lalu isi soal di sana.');
  const hasil: BarisImpor[] = [];
  data.slice(1).forEach((r, n) => {
    const sel = (i: number) => (i < 0 ? '' : String(r[i] ?? '').trim());
    const pertanyaan = sel(iTanya), opsiMentah = iOpsi.map(sel);
    if (!pertanyaan && opsiMentah.every((o) => !o)) return;   // baris kosong
    const huruf = sel(iKunci).toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
    const poinTeks = sel(iPoin), poin = poinTeks ? Math.round(Number(poinTeks.replace(',', '.'))) : 1;
    // pilihan kosong di tengah dibuang; kunci mengikuti huruf yang dipilih
    const opsi: string[] = []; let kunci = -1;
    opsiMentah.forEach((o, j) => { if (!o) return; if (HURUF[j] === huruf) kunci = opsi.length; opsi.push(o); });
    const galat = pertanyaan.length < 3 ? 'Pertanyaan kosong'
      : opsi.length < 2 ? 'Isi minimal 2 pilihan'
      : !huruf ? 'Kunci belum diisi (A–E)'
      : kunci < 0 ? `Kunci ${huruf} menunjuk pilihan yang kosong`
      : new Set(opsi.map((o) => o.toLowerCase())).size !== opsi.length ? 'Ada pilihan yang sama persis'
      : !Number.isFinite(poin) || poin < 1 || poin > 100 ? 'Poin harus 1–100'
      : pertanyaan.length > 3000 ? 'Pertanyaan terlalu panjang' : '';
    hasil.push({ baris: n + 2, galat, soal: { pertanyaan, opsi, kunci: Math.max(0, kunci), poin: Number.isFinite(poin) ? poin : 1, pembahasan: sel(iBahas).slice(0, 1000) } });
  });
  if (!hasil.length) throw new Error('Tidak ada soal di berkas. Isi soal mulai baris ke-2 sheet "Soal".');
  if (hasil.length > 200) throw new Error('Maksimal 200 soal per impor');
  return hasil;
}

function ImporSoal({ paket, baris, namaBerkas, selesai }: { paket: Paket; baris: BarisImpor[]; namaBerkas: string; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [kirim, setKirim] = useState(false);
  const sah = baris.filter((x) => !x.galat), salah = baris.filter((x) => x.galat);
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string }>('ts_soal_simpan_banyak', { paketId: paket.id, sumber: 'impor', soal: sah.map((x) => x.soal) })
      .then((r) => { toast(r.pesan); tutupSheet(); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n="upload" />Impor Soal dari Excel · {paket.judul}</h3>
    <div className="tiny muted">{namaBerkas} · {baris.length} baris soal</div>
    <div className={salah.length ? 'warn' : 'note'} style={{ marginTop: 10 }}>
      <b>{sah.length}</b> soal siap disimpan{salah.length > 0 && <>, <b>{salah.length}</b> baris bermasalah (dilewati — perbaiki di Excel lalu impor ulang bila perlu)</>}.</div>
    {salah.length > 0 && <ul className="rk-impor-galat">{salah.map((x) => <li key={x.baris}><b>Baris {x.baris}:</b> {x.galat}{x.soal.pertanyaan && <span className="muted"> — {x.soal.pertanyaan.slice(0, 70)}</span>}</li>)}</ul>}
    <div className="rk-tes-daftar" style={{ marginTop: 10 }}>{sah.slice(0, 100).map((x) => (
      <section key={x.baris} className="card rk-soal">
        <div className="rk-soal-no">Baris {x.baris} · {x.soal.poin} poin</div>
        <p className="rk-soal-teks">{x.soal.pertanyaan}</p>
        <div className="rk-opsi statis">{x.soal.opsi.map((o, j) => <div key={j} className={j === x.soal.kunci ? 'on' : ''}><span className="h">{HURUF[j]}</span><span>{o}</span>{j === x.soal.kunci && <Ikon n="circle-check" />}</div>)}</div>
      </section>))}
      {sah.length > 100 && <div className="tiny muted">…dan {sah.length - 100} soal lainnya.</div>}</div>
    <button className="btn" style={{ marginTop: 12 }} disabled={kirim || !sah.length} onClick={simpan}><Ikon n="check" />Simpan {sah.length} soal ke paket ini</button>
  </>);
}

export default function BankSoal() {
  const { me, galat, bukaSheet, toast, yakin } = useAplikasi();
  const [daftar, setDaftar] = useState<Paket[] | null>(null), [buka, setBuka] = useState(0);
  const muat = useCallback(() => { api<Paket[]>('ts_paket_daftar', {}, true).then(setDaftar).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  if (!me || !(isAdminUp(me) || me.role === 'atasan')) return <div className="card"><div className="empty">Menu ini khusus HC, Super Admin, dan Supervisor.</div></div>;
  if (buka) return <DetailPaket id={buka} kembali={() => { setBuka(0); muat(); }} />;

  const form = (p: Paket | null) => bukaSheet(<FormPaket p={p} selesai={(id) => { muat(); if (id && !p) setBuka(id); }} />);
  const duplikat = (p: Paket) => api<{ pesan: string; id: number }>('ts_paket_duplikat', { id: p.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  const hapus = async (p: Paket) => {
    if (!(await yakin(`Hapus paket "${p.judul}"?`, `${p.jumlahSoal} soal di dalamnya ikut terhapus. Hasil tes pelamar yang sudah ada tetap tersimpan.`, { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('ts_paket_hapus', { id: p.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  return (<>
    <div className="card rk-lw-kepala"><div><h3 style={{ margin: 0 }}><Ikon n="clipboard-list" />Bank Soal Tes</h3>
      <div className="tiny muted">Paket soal pilihan ganda untuk seleksi pelamar. Pasang paket di lowongan lewat menu <b>Rekrutmen → Lowongan</b>; pelamar langsung mengerjakannya setelah melamar.</div></div>
      <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Buat Paket Soal</button></div>
    {!daftar ? <div className="card"><div className="skel" style={{ height: 180 }} /></div>
      : !daftar.length ? <div className="card"><div className="empty"><Ikon n="clipboard-list" />Belum ada paket soal. Buat paket pertama, mis. <b>Tes Tutor Matematika</b>.</div></div>
      : <div className="rk-lw-grid">{daftar.map((p) => (
        <div key={p.id} className="card rk-lw">
          <div className="rk-lw-atas"><h4>{p.judul}</h4>{p.lowongan.some((l) => l.status === 'buka') ? <span className="badge b-green">Dipakai</span> : <span className="badge b-gray">Tidak dipakai</span>}</div>
          <div className="rk-meta tiny">{p.divisi && <span><Ikon n="building-2" />{p.divisi}</span>}<span><Ikon n="timer" />{p.durasi ? p.durasi + ' menit' : 'Tanpa batas waktu'}</span>
            {p.nilaiLulus > 0 && <span><Ikon n="target" />Lulus ≥ {p.nilaiLulus}</span>}</div>
          <div className="rk-lw-angka"><div><b>{p.jumlahSoal}</b><span>Soal</span></div><div><b>{p.totalPoin}</b><span>Total poin</span></div>
            <div><b>{p.peserta}</b><span>Peserta</span></div><div><b>{p.rataNilai ?? '—'}</b><span>Rata-rata</span></div></div>
          {p.lowongan.length > 0 && <div className="tiny muted">Lowongan: {p.lowongan.map((l) => l.judul).join(', ')}</div>}
          <div className="rk-lw-aksi">
            <button className="btn sm auto" onClick={() => setBuka(p.id)}><Ikon n="list-checks" />Kelola Soal</button>
            <button className="btn ghost sm auto" onClick={() => form(p)}><Ikon n="pencil" />Ubah</button>
            <button className="btn ghost sm auto" onClick={() => duplikat(p)} title="Salin paket beserta soalnya"><Ikon n="copy" />Duplikat</button>
            <button className="btn ghost sm auto" onClick={() => hapus(p)} aria-label="Hapus paket"><Ikon n="trash-2" /></button>
          </div>
          <div className="tiny muted">Diubah {tglPendek(String(p.diubah).slice(0, 10))}{p.dibuatNama && ' · dibuat ' + p.dibuatNama}</div>
        </div>))}</div>}
  </>);
}

function FormPaket({ p, selesai }: { p: Paket | null; selesai: (id: number) => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState({ judul: p?.judul ?? '', divisi: p?.divisi ?? '', petunjuk: p?.petunjuk ?? '', durasi: p?.durasi ?? 30, nilaiLulus: p?.nilaiLulus ?? 0, acak: p?.acak ?? true });
  const [kirim, setKirim] = useState(false);
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string; id: number }>('ts_paket_simpan', { ...v, id: p?.id ?? 0 }).then((r) => { tutupSheet(); toast(r.pesan); selesai(r.id); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n="clipboard-list" />{p ? 'Ubah' : 'Buat'} Paket Soal</h3>
    <label style={{ marginTop: 0 }}>Nama paket *</label><input value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} placeholder="mis. Tes Tutor Olimpiade Matematika" maxLength={150} />
    <label>Divisi</label><input value={v.divisi} onChange={(e) => setV({ ...v, divisi: e.target.value })} placeholder="mis. Akademik" maxLength={100} />
    <div className="row">
      <div><label>Durasi (menit)</label><input type="number" min={0} max={300} value={v.durasi} onChange={(e) => setV({ ...v, durasi: +e.target.value })} />
        <div className="tiny muted">0 = tanpa batas waktu</div></div>
      <div><label>Nilai minimal lulus</label><input type="number" min={0} max={100} value={v.nilaiLulus} onChange={(e) => setV({ ...v, nilaiLulus: +e.target.value })} />
        <div className="tiny muted">0–100; 0 = tidak ditentukan</div></div>
    </div>
    <label>Petunjuk untuk pelamar <span className="tiny muted">(opsional)</span></label>
    <textarea rows={3} value={v.petunjuk} onChange={(e) => setV({ ...v, petunjuk: e.target.value })} placeholder="mis. Kerjakan secara mandiri tanpa bantuan orang lain. Boleh memakai kertas coretan." />
    <label className="rk-setuju"><input type="checkbox" checked={v.acak} onChange={(e) => setV({ ...v, acak: e.target.checked })} /><span>Acak urutan soal untuk setiap pelamar</span></label>
    <div className="note" style={{ marginTop: 12 }}>Nilai pelamar = jumlah poin soal yang dijawab benar ÷ total poin × 100. Atur poin lebih besar untuk soal yang lebih sulit.</div>
    <button className="btn" style={{ marginTop: 12 }} disabled={kirim} onClick={simpan}><Ikon n="check" />Simpan</button>
  </>);
}

function DetailPaket({ id, kembali }: { id: number; kembali: () => void }) {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<{ paket: Paket; soal: Soal[] } | null>(null), [kunci, setKunci] = useState(true);
  const [pilih, setPilih] = useState<Set<number>>(new Set()), [klip, setKlip] = useState<Klip | null>(null);
  const muat = useCallback(() => { api<{ paket: Paket; soal: Soal[] }>('ts_soal_daftar', { paketId: id }, true).then(setD).catch(galat); }, [id, galat]);
  useEffect(() => { muat(); setKlip(bacaKlip()); }, [muat]);
  if (!d) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const p = d.paket;
  const aturKlip = (k: Klip | null) => { simpanKlip(k); setKlip(k); };
  const salin = () => {
    const ids = d.soal.filter((s) => pilih.has(s.id)).map((s) => s.id);
    aturKlip({ ids, asal: p.judul, paketId: id }); setPilih(new Set());
    toast(`${ids.length} soal disalin. Buka paket tujuan lalu klik "Tempel".`);
  };
  const tempel = () => {
    if (!klip) return;
    api<{ pesan: string }>('ts_soal_salin', { paketId: id, ids: klip.ids }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const imporExcel = async (f: File) => {
    try { const baris = await bacaExcelSoal(f); bukaSheet(<ImporSoal paket={p} baris={baris} namaBerkas={f.name} selesai={muat} />, { besar: true }); }
    catch (e) { galat(e); }
  };
  const formSoal = (s: Soal | null) => bukaSheet(<FormSoal paketId={id} s={s} selesai={muat} />, { besar: true });
  const ai = () => bukaSheet(<SoalAi paket={p} selesai={muat} />, { besar: true });
  const ubahPaket = () => bukaSheet(<FormPaket p={p} selesai={muat} />);
  const hapus = async (s: Soal, n: number) => {
    if (!(await yakin(`Hapus soal nomor ${n + 1}?`, s.pertanyaan.slice(0, 140), { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('ts_soal_hapus', { id: s.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const geser = (s: Soal, arah: 'naik' | 'turun') => api('ts_soal_urut', { id: s.id, arah }, true).then(muat).catch(galat);
  return (<>
    <div className="card rk-lw-kepala">
      <div style={{ minWidth: 0 }}><button className="btn ghost sm auto" onClick={kembali}><Ikon n="chevron-left" />Semua paket</button>
        <h3 style={{ margin: '8px 0 2px' }}>{p.judul}</h3>
        <div className="rk-meta tiny">{p.divisi && <span><Ikon n="building-2" />{p.divisi}</span>}<span><Ikon n="list-checks" />{p.jumlahSoal} soal · {p.totalPoin} poin</span>
          <span><Ikon n="timer" />{p.durasi ? p.durasi + ' menit' : 'Tanpa batas waktu'}</span>{p.nilaiLulus > 0 && <span><Ikon n="target" />Lulus ≥ {p.nilaiLulus}</span>}
          <span>{p.acak ? 'Urutan diacak' : 'Urutan tetap'}</span></div>
        {p.lowongan.length > 0 && <div className="tiny muted" style={{ marginTop: 4 }}>Dipakai lowongan: {p.lowongan.map((l) => l.judul).join(', ')}</div>}</div>
      <div className="rk-lw-aksi">
        <button className="btn sm auto" onClick={() => formSoal(null)}><Ikon n="plus" />Tambah Soal</button>
        <button className="btn ghost sm auto" onClick={ai}><Ikon n="sparkles" />Buat dengan AI</button>
        <button className="btn ghost sm auto" onClick={ubahPaket}><Ikon n="pencil" />Pengaturan</button>
        <button className="btn ghost sm auto" onClick={() => setKunci((x) => !x)}><Ikon n={kunci ? 'eye-off' : 'eye'} />{kunci ? 'Sembunyikan' : 'Tampilkan'} kunci</button>
        <button className="btn ghost sm auto" onClick={() => unduhTemplateSoal().catch(galat)} title="Template Excel untuk mengisi soal"><Ikon n="download" />Template Excel</button>
        <label className="btn ghost sm auto" style={{ margin: 0 }} title="Unggah template Excel yang sudah diisi"><Ikon n="upload" />Impor Excel
          <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) imporExcel(f); }} /></label>
      </div>
    </div>
    {(d.soal.length > 0 || klip) && <div className="card rk-salin-bar">
      {d.soal.length > 0 && <label className="rk-pilih-soal"><input type="checkbox" checked={pilih.size === d.soal.length} onChange={(e) => setPilih(e.target.checked ? new Set(d.soal.map((s) => s.id)) : new Set())} />Pilih semua</label>}
      {pilih.size > 0 && <span className="tiny muted">{pilih.size} soal dipilih</span>}
      <button className="btn ghost sm auto" disabled={!pilih.size} onClick={salin}><Ikon n="copy" />Salin{pilih.size ? ` ${pilih.size} soal` : ''}</button>
      {klip && <button className="btn sm auto" onClick={tempel} title={`Disalin dari "${klip.asal}"`}><Ikon n="clipboard-list" />Tempel {klip.ids.length} soal{klip.paketId !== id ? ` dari "${klip.asal}"` : ''}</button>}
      {klip && <button className="btn ghost sm auto" onClick={() => aturKlip(null)} aria-label="Kosongkan salinan"><Ikon n="x" /></button>}
    </div>}
    {!d.soal.length ? <div className="card"><div className="empty"><Ikon n="list-checks" />Belum ada soal. Tambahkan manual, buat dengan AI, tempel dari paket lain, atau impor dari Excel.</div></div>
      : <div className="rk-tes-daftar">{d.soal.map((s, n) => (
        <section key={s.id} className={'card rk-soal' + (pilih.has(s.id) ? ' dipilih' : '')}>
          <div className="rk-soal-no"><input type="checkbox" className="rk-cek-soal" checked={pilih.has(s.id)} aria-label={'Pilih soal ' + (n + 1)}
            onChange={(e) => setPilih((x) => { const b = new Set(x); if (e.target.checked) b.add(s.id); else b.delete(s.id); return b; })} />
            Soal {n + 1} · {s.poin} poin{s.sumber === 'ai' && <span className="badge b-blue" style={{ marginLeft: 6 }}><Ikon n="sparkles" />AI</span>}
            {s.sumber === 'impor' && <span className="badge b-gray" style={{ marginLeft: 6 }}>Excel</span>}
            <span className="rk-soal-aksi">
              <button className="btn ghost sm auto" disabled={!n} onClick={() => geser(s, 'naik')} aria-label="Naikkan"><Ikon n="chevron-up" /></button>
              <button className="btn ghost sm auto" disabled={n === d.soal.length - 1} onClick={() => geser(s, 'turun')} aria-label="Turunkan"><Ikon n="chevron-down" /></button>
              <button className="btn ghost sm auto" onClick={() => formSoal(s)} aria-label="Ubah"><Ikon n="pencil" /></button>
              <button className="btn ghost sm auto" onClick={() => hapus(s, n)} aria-label="Hapus"><Ikon n="trash-2" /></button></span></div>
          <p className="rk-soal-teks">{s.pertanyaan}</p>
          <div className="rk-opsi statis">{s.opsi.map((o, j) => <div key={j} className={kunci && j === s.kunci ? 'on' : ''}><span className="h">{HURUF[j]}</span><span>{o}</span>
            {kunci && j === s.kunci && <Ikon n="circle-check" />}</div>)}</div>
          {kunci && s.pembahasan && <div className="tiny muted rk-pembahasan"><b>Pembahasan:</b> {s.pembahasan}</div>}
        </section>))}</div>}
  </>);
}

/* isian satu soal; dipakai juga untuk menyunting draf AI sebelum disimpan */
function IsianSoal({ v, setV }: { v: SoalDraf; setV: (x: SoalDraf) => void }) {
  const opsi = v.opsi.length < 5 ? [...v.opsi, ...Array(Math.max(0, 4 - v.opsi.length)).fill('')] : v.opsi;
  const ubahOpsi = (j: number, t: string) => setV({ ...v, opsi: opsi.map((o, k) => (k === j ? t : o)) });
  return (<>
    <label style={{ marginTop: 0 }}>Pertanyaan *</label>
    <textarea rows={4} value={v.pertanyaan} onChange={(e) => setV({ ...v, pertanyaan: e.target.value })} placeholder="Tulis soal…" maxLength={3000} />
    <label>Pilihan jawaban * <span className="tiny muted">(klik huruf untuk menandai jawaban benar; pilihan kosong diabaikan)</span></label>
    <div className="rk-isi-opsi">{opsi.map((o, j) => (
      <div key={j} className={j === v.kunci ? 'on' : ''}>
        <button type="button" className="h" onClick={() => setV({ ...v, opsi, kunci: j })} title="Tandai sebagai jawaban benar" aria-pressed={j === v.kunci}>{HURUF[j]}</button>
        <input value={o} onChange={(e) => ubahOpsi(j, e.target.value)} placeholder={`Pilihan ${HURUF[j]}`} maxLength={500} />
      </div>))}
      {opsi.length < 5 && <button type="button" className="btn ghost sm auto" onClick={() => setV({ ...v, opsi: [...opsi, ''] })}><Ikon n="plus" />Pilihan {HURUF[opsi.length]}</button>}
    </div>
    <div className="row">
      <div><label>Poin</label><input type="number" min={1} max={100} value={v.poin} onChange={(e) => setV({ ...v, poin: +e.target.value })} /></div>
      <div style={{ flex: 3 }}><label>Pembahasan <span className="tiny muted">(opsional, hanya untuk HC)</span></label>
        <input value={v.pembahasan} onChange={(e) => setV({ ...v, pembahasan: e.target.value })} maxLength={1000} /></div>
    </div>
  </>);
}

function FormSoal({ paketId, s, selesai }: { paketId: number; s: Soal | null; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState<SoalDraf>({ pertanyaan: s?.pertanyaan ?? '', opsi: s?.opsi ?? ['', '', '', ''], kunci: s?.kunci ?? 0, poin: s?.poin ?? 1, pembahasan: s?.pembahasan ?? '' });
  const [kirim, setKirim] = useState(false);
  const simpan = (lagi: boolean) => {
    setKirim(true);
    api<{ pesan: string }>('ts_soal_simpan', { ...v, paketId, id: s?.id ?? 0 }).then((r) => {
      toast(r.pesan); selesai();
      if (lagi) { setV({ pertanyaan: '', opsi: ['', '', '', ''], kunci: 0, poin: v.poin, pembahasan: '' }); setKirim(false); } else tutupSheet();
    }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n="list-checks" />{s ? 'Ubah' : 'Tambah'} Soal</h3>
    <IsianSoal v={v} setV={setV} />
    <div className="row" style={{ marginTop: 14 }}>
      <button className="btn" disabled={kirim} onClick={() => simpan(false)}><Ikon n="check" />Simpan</button>
      {!s && <button className="btn ghost" disabled={kirim} onClick={() => simpan(true)}><Ikon n="plus" />Simpan & tambah lagi</button>}
    </div>
  </>);
}

function SoalAi({ paket, selesai }: { paket: Paket; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState({ materi: paket.tujuan || '', jumlah: 10, tingkat: 'sedang', opsi: 4 });
  const [draf, setDraf] = useState<(SoalDraf & { pilih: boolean })[] | null>(null), [ubah, setUbah] = useState(-1);
  const [proses, setProses] = useState(false), [poin, setPoin] = useState(1);
  const buat = () => {
    if (v.materi.trim().length < 3) { toast('Tulis deskripsi tujuan soal dulu', true); return; }
    setProses(true); setUbah(-1);
    // soal yang kuncinya diragukan pemeriksa AI tidak dicentang otomatis
    api<{ soal: SoalDraf[] }>('ts_soal_ai', { ...v, paketId: paket.id }).then((r) => setDraf(r.soal.map((x) => ({ ...x, pilih: !x.ragu })))).catch(galat).finally(() => setProses(false));
  };
  const terpilih = (draf ?? []).filter((x) => x.pilih);
  const simpan = () => {
    setProses(true);
    api<{ pesan: string }>('ts_soal_simpan_banyak', { paketId: paket.id, sumber: 'ai', soal: terpilih.map(({ pilih: _, ragu: __, jawabPeriksa: ___, ...x }) => ({ ...x, poin })) })
      .then((r) => { toast(r.pesan); tutupSheet(); selesai(); }).catch((e) => { galat(e); setProses(false); });
  };
  return (<>
    <h3><Ikon n="sparkles" />Buat Soal dengan AI · {paket.judul}</h3>
    <label style={{ marginTop: 0 }}>Deskripsi tujuan soal *</label>
    <div className="tiny muted" style={{ marginBottom: 4 }}>Jelaskan untuk apa tes ini, kompetensi / materi yang diuji, dan sasaran pesertanya. Makin jelas, makin tepat soal yang dibuat AI. Deskripsi ini disimpan untuk paket ini.</div>
    <textarea rows={5} value={v.materi} onChange={(e) => setV({ ...v, materi: e.target.value })} maxLength={3000}
      placeholder={'mis. Menyaring calon tutor olimpiade Matematika SMA. Uji penguasaan teori bilangan (FPB, KPK, modulo), kombinatorika dasar, dan aljabar (persamaan kuadrat) setara OSN tingkat provinsi, serta kemampuan menjelaskan langkah penyelesaian.'} />
    <div className="row">
      <div><label>Jumlah soal</label><select value={v.jumlah} onChange={(e) => setV({ ...v, jumlah: +e.target.value })}>{[5, 10, 15].map((n) => <option key={n} value={n}>{n} soal</option>)}</select></div>
      <div><label>Tingkat kesulitan</label><select value={v.tingkat} onChange={(e) => setV({ ...v, tingkat: e.target.value })}>
        <option value="mudah">Mudah</option><option value="sedang">Sedang</option><option value="sulit">Sulit (setara olimpiade)</option><option value="campuran">Campuran</option></select></div>
      <div><label>Pilihan per soal</label><select value={v.opsi} onChange={(e) => setV({ ...v, opsi: +e.target.value })}>{[3, 4, 5].map((n) => <option key={n} value={n}>{n} (A–{HURUF[n - 1]})</option>)}</select></div>
    </div>
    <button className="btn ghost" style={{ marginTop: 12 }} disabled={proses} onClick={buat}>{proses && !draf ? <><span className="spin gelap" /> AI sedang menyusun soal…</> : <><Ikon n="sparkles" />{draf ? 'Buat ulang' : 'Buat soal'}</>}</button>
    {draf && <>
      <div className="warn tiny" style={{ marginTop: 12 }}>Periksa setiap soal & kunci jawaban sebelum menyimpan — AI bisa keliru, terutama pada hitungan. Kunci sudah dicek ulang oleh AI kedua; soal bertanda <b>Periksa kunci</b> tidak dicentang otomatis. Klik <b>Ubah</b> untuk membetulkan.</div>
      <div className="rk-tes-daftar" style={{ marginTop: 10 }}>{draf.map((s, n) => (
        <section key={n} className={'card rk-soal' + (s.pilih ? '' : ' redup')}>
          <div className="rk-soal-no"><label className="rk-pilih-soal"><input type="checkbox" checked={s.pilih} onChange={(e) => setDraf((x) => x!.map((y, j) => (j === n ? { ...y, pilih: e.target.checked } : y)))} />Soal {n + 1}</label>
            {s.ragu && <span className="badge b-amber" style={{ marginLeft: 6 }}><Ikon n="circle-alert" />Periksa kunci</span>}
            <span className="rk-soal-aksi"><button className="btn ghost sm auto" onClick={() => setUbah(ubah === n ? -1 : n)}><Ikon n="pencil" />{ubah === n ? 'Selesai' : 'Ubah'}</button></span></div>
          {s.ragu && <div className="warn tiny" style={{ marginTop: 6 }}>Pemeriksa AI mendapat jawaban berbeda{s.jawabPeriksa != null && s.jawabPeriksa >= 0 && s.opsi[s.jawabPeriksa] ? <> (<b>{HURUF[s.jawabPeriksa]}. {s.opsi[s.jawabPeriksa]}</b>)</> : ' (tidak ada pilihan yang tepat)'}. Pastikan kunci benar sebelum mencentang soal ini.</div>}
          {ubah === n ? <IsianSoal v={s} setV={(b) => setDraf((x) => x!.map((y, j) => (j === n ? { ...y, ...b } : y)))} /> : <>
            <p className="rk-soal-teks">{s.pertanyaan}</p>
            <div className="rk-opsi statis">{s.opsi.map((o, j) => <div key={j} className={j === s.kunci ? 'on' : ''}><span className="h">{HURUF[j]}</span><span>{o}</span>{j === s.kunci && <Ikon n="circle-check" />}</div>)}</div>
            {s.pembahasan && <div className="tiny muted rk-pembahasan"><b>Pembahasan:</b> {s.pembahasan}</div>}</>}
        </section>))}</div>
      <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <div style={{ maxWidth: 140 }}><label>Poin tiap soal</label><input type="number" min={1} max={100} value={poin} onChange={(e) => setPoin(+e.target.value)} /></div>
        <button className="btn" disabled={proses || !terpilih.length} onClick={simpan}><Ikon n="check" />Simpan {terpilih.length} soal terpilih</button>
      </div>
    </>}
  </>);
}
