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
  peserta: number; rataNilai: number | null; dibuatNama: string; diubah: string; lowongan: { id: number; judul: string; status: string }[] };
type Soal = { id: number; pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string; sumber: 'manual' | 'ai' };
type SoalDraf = { pertanyaan: string; opsi: string[]; kunci: number; poin: number; pembahasan: string; ragu?: boolean; jawabPeriksa?: number };
const HURUF = 'ABCDE';

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
  const muat = useCallback(() => { api<{ paket: Paket; soal: Soal[] }>('ts_soal_daftar', { paketId: id }, true).then(setD).catch(galat); }, [id, galat]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const p = d.paket;
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
      </div>
    </div>
    {!d.soal.length ? <div className="card"><div className="empty"><Ikon n="list-checks" />Belum ada soal. Tambahkan manual atau buat dengan AI.</div></div>
      : <div className="rk-tes-daftar">{d.soal.map((s, n) => (
        <section key={s.id} className="card rk-soal">
          <div className="rk-soal-no">Soal {n + 1} · {s.poin} poin{s.sumber === 'ai' && <span className="badge b-blue" style={{ marginLeft: 6 }}><Ikon n="sparkles" />AI</span>}
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
  const [v, setV] = useState({ materi: '', jumlah: 10, tingkat: 'sedang', opsi: 4 });
  const [draf, setDraf] = useState<(SoalDraf & { pilih: boolean })[] | null>(null), [ubah, setUbah] = useState(-1);
  const [proses, setProses] = useState(false), [poin, setPoin] = useState(1);
  const buat = () => {
    if (v.materi.trim().length < 3) { toast('Tulis materi / topik soal dulu', true); return; }
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
    <label style={{ marginTop: 0 }}>Materi / topik yang diuji *</label>
    <textarea rows={3} value={v.materi} onChange={(e) => setV({ ...v, materi: e.target.value })}
      placeholder={'mis. Matematika olimpiade SMA: teori bilangan (FPB, KPK, modulo), kombinatorika dasar, dan aljabar (persamaan kuadrat).'} />
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
