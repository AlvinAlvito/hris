'use client';
/* Rekrutmen (HC / Super Admin): ringkasan, pipeline kanban per lowongan, daftar kandidat berperingkat AI, kelola lowongan,
   dan detail kandidat (CV, analisis AI, tahap, catatan, penilaian HC, jadikan karyawan). */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { tglIndo, tglPendek } from '@/lib/klien/format';

type Data = Record<string, any>;
type Lowongan = { id: number; judul: string; divisi: string; lokasi: string; tipe: string; tipeLabel: string; deskripsi: string; kualifikasiTeks: string;
  nilaiPlusTeks: string; pertanyaan: string[]; kuota: number; batas: string | null; status: 'draf' | 'buka' | 'tutup'; jumlah: number; baru: number; diterima: number;
  wajibVideo: boolean; petunjukVideoTeks: string; bidangAtur: { nama: string; paketId: number | null }[]; tesPaketId: number | null; tes: boolean };
type Kandidat = { id: number; kode: string; nama: string; email: string; noHp: string; lowonganId: number; lowongan: string; tahap: string; skor: number | null;
  kecocokan: string; aiStatus: string; rating: number | null; pendidikan: string; pengalamanBulan: number | null; pengalamanIsian: string; ringkasan: string; dilamar: string; userId: number | null;
  bidang: string; linkVideo: string; tesStatus: 'belum' | 'mulai' | 'selesai' | null; tesNilai: number | null; tesLulus: boolean | null };
type Paket = { id: number; judul: string; divisi: string; jumlahSoal: number };
type Ringkas = { lowongan: Lowongan[]; tahap: { k: string; label: string }[]; tipe: Record<string, string>; stat: Data; paket: Paket[]; petunjukVideo: string };

const WARNA_TAHAP: Record<string, string> = { baru: 'var(--sky)', disaring: '#5b6fd6', tes: '#8b5cf6', wawancara_hc: '#d97706', wawancara_user: '#ea580c',
  penawaran: '#0891b2', diterima: 'var(--success)', ditolak: 'var(--danger)' };
const pengalaman = (b: number | null) => (b == null ? '' : b < 12 ? `${b} bln pengalaman` : `${Math.floor(b / 12)} th${b % 12 ? ` ${b % 12} bln` : ''} pengalaman`);
const tautanPublik = (id: number) => `${window.location.origin}/rekrutmen#lowongan-${id}`;

function Skor({ k, besar }: { k: Pick<Kandidat, 'skor' | 'aiStatus' | 'kecocokan'>; besar?: boolean }) {
  if (k.aiStatus === 'antri' || k.aiStatus === 'proses') return <span className="badge b-gray"><span className="spin gelap" />Dianalisis AI</span>;
  if (k.aiStatus === 'manual') return <span className="badge b-amber" title="CV berupa scan/gambar">Cek manual</span>;
  if (k.aiStatus === 'gagal') return <span className="badge b-red">AI gagal</span>;
  if (k.skor == null) return null;
  const c = k.skor >= 80 ? 'hijau' : k.skor >= 65 ? 'biru' : k.skor >= 50 ? 'kuning' : 'merah';
  return <span className={'rk-skor ' + c + (besar ? ' besar' : '')} title={'Kecocokan: ' + k.kecocokan}><b>{k.skor}</b>{besar && <small>{k.kecocokan}</small>}</span>;
}
/* nilai tes pilihan ganda pelamar (hijau = lulus nilai minimal, merah = di bawahnya) */
function NilaiTes({ k }: { k: Pick<Kandidat, 'tesStatus' | 'tesNilai' | 'tesLulus'> }) {
  if (!k.tesStatus) return null;
  if (k.tesStatus !== 'selesai') return <span className="badge b-gray" title="Tes pilihan ganda">{k.tesStatus === 'mulai' ? 'Tes berjalan' : 'Belum tes'}</span>;
  return <span className={'badge ' + (k.tesLulus === true ? 'b-green' : k.tesLulus === false ? 'b-red' : 'b-blue')} title="Nilai tes pilihan ganda (0–100)"><Ikon n="clipboard-list" />Tes {k.tesNilai}</span>;
}

export default function KelolaRekrutmen() {
  const { me, galat } = useAplikasi();
  const [r, setR] = useState<Ringkas | null>(null);
  const [tab, setTab] = useState<'pipeline' | 'kandidat' | 'lowongan'>('pipeline');
  const [lowId, setLowId] = useState(0);
  const muat = useCallback(() => api<Ringkas>('rk_ringkas', {}, true).then((x) => {
    setR(x);
    setLowId((id) => id || (x.lowongan.find((l) => l.status === 'buka' && l.jumlah) ?? x.lowongan.find((l) => l.status === 'buka') ?? x.lowongan[0])?.id || 0);
  }).catch(galat), [galat]);
  useEffect(() => { muat(); }, [muat]);
  // selama ada CV yang dianalisis, ringkasan disegarkan berkala
  useEffect(() => { if (!r?.stat.antrean) return; const t = setInterval(muat, 15000); return () => clearInterval(t); }, [r?.stat.antrean, muat]);

  if (!isAdminUp(me)) return <div className="card"><div className="empty">Menu ini khusus HC dan Super Admin.</div></div>;
  if (!r) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const st = r.stat;
  return (<>
    <div className="statgrid rk-stat">
      {([['briefcase', 'Lowongan dibuka', st.buka], ['inbox', 'Lamaran baru', st.baru], ['users', 'Kandidat dalam proses', st.proses],
        ['calendar', 'Pelamar bulan ini', st.bulanIni], ['sparkles', 'Antrean analisis AI', st.antrean]] as [string, string, number][]).map(([ic, k, v]) => (
        <div key={k} className="stat"><span className="si"><Ikon n={ic} /></span><div className="k">{k}</div><div className="v">{v}</div></div>))}
    </div>
    <div className="seg rk-tab">{([['pipeline', 'layers', 'Pipeline'], ['kandidat', 'users', 'Kandidat'], ['lowongan', 'briefcase', 'Lowongan']] as const).map(([k, ic, t]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>
    {tab === 'pipeline' && <Pipeline r={r} lowId={lowId} setLowId={setLowId} segarkan={muat} />}
    {tab === 'kandidat' && <DaftarKandidat r={r} segarkan={muat} />}
    {tab === 'lowongan' && <DaftarLowongan r={r} segarkan={muat} lihat={(id) => { setLowId(id); setTab('pipeline'); }} />}
  </>);
}

/* ---------------- detail kandidat dibuka di sheet besar ---------------- */
function useBukaKandidat(segarkan: () => void) {
  const { bukaSheet } = useAplikasi();
  return (id: number) => bukaSheet(<DetailKandidat id={id} segarkan={segarkan} />, { besar: true, saatTutup: segarkan });
}

/* ---------------- PIPELINE (kanban) ---------------- */
function Pipeline({ r, lowId, setLowId, segarkan }: { r: Ringkas; lowId: number; setLowId: (n: number) => void; segarkan: () => void }) {
  const { toast, galat, tanya } = useAplikasi();
  const [list, setList] = useState<Kandidat[] | null>(null);
  const [tarik, setTarik] = useState<number | null>(null), [atas, setAtas] = useState('');
  const muat = useCallback(() => { if (lowId) api<Kandidat[]>('rk_kandidat', { lowonganId: lowId }, true).then(setList).catch(galat); else setList([]); }, [lowId, galat]);
  useEffect(() => { setList(null); muat(); }, [muat]);
  const adaAntrean = list?.some((k) => k.aiStatus === 'antri' || k.aiStatus === 'proses');
  useEffect(() => { if (!adaAntrean) return; const t = setInterval(muat, 10000); return () => clearInterval(t); }, [adaAntrean, muat]);
  const segar = () => { muat(); segarkan(); };
  const buka = useBukaKandidat(segar);
  const lw = r.lowongan.find((l) => l.id === lowId);

  const pindah = async (id: number, ke: string) => {
    const k = list?.find((x) => x.id === id);
    if (!k || k.tahap === ke) return;
    let catatan = '';
    if (ke === 'ditolak' || ke === 'diterima') {
      const c = await tanya(`Catatan ${ke === 'ditolak' ? 'penolakan' : 'penerimaan'} (opsional):`, '', { judul: `${k.nama} → ${ke === 'ditolak' ? 'Ditolak' : 'Diterima'}`, panjang: true });
      if (c === null) return;
      catatan = c;
    }
    setList((l) => l?.map((x) => (x.id === id ? { ...x, tahap: ke } : x)) ?? l);   // langsung tampil, server menyusul
    api<{ pesan: string }>('rk_tahap', { id, tahap: ke, catatan }).then((x) => { toast(x.pesan); segar(); }).catch((e) => { galat(e); muat(); });
  };
  const lepas = (e: DragEvent, ke: string) => { e.preventDefault(); setAtas(''); if (tarik) void pindah(tarik, ke); setTarik(null); };

  if (!r.lowongan.length) return <div className="card"><div className="empty"><Ikon n="briefcase" />Belum ada lowongan. Buat lowongan pertama di tab <b>Lowongan</b>.</div></div>;
  return (<>
    <div className="card rk-pilih">
      <div style={{ flex: 1, minWidth: 220 }}><label style={{ marginTop: 0 }}>Lowongan</label>
        <select value={lowId} onChange={(e) => setLowId(+e.target.value)}>{r.lowongan.map((l) => <option key={l.id} value={l.id}>
          {l.judul}{l.status !== 'buka' ? ` (${l.status})` : ''} · {l.jumlah} pelamar</option>)}</select></div>
      {lw && <div className="rk-pilih-info">
        <span className={'badge ' + (lw.status === 'buka' ? 'b-green' : lw.status === 'draf' ? 'b-gray' : 'b-red')}>{lw.status === 'buka' ? 'Dibuka' : lw.status === 'draf' ? 'Draf' : 'Ditutup'}</span>
        <span className="tiny muted">Kuota {lw.kuota} · diterima {lw.diterima}{lw.batas ? ' · batas ' + tglPendek(lw.batas) : ''}</span>
        {lw.status === 'buka' && <button className="btn ghost sm auto" onClick={() => navigator.clipboard.writeText(tautanPublik(lw.id)).then(() => toast('Tautan lowongan disalin'))}><Ikon n="copy" />Salin tautan</button>}
      </div>}
    </div>
    <div className="tiny muted rk-petunjuk">Seret kartu ke kolom lain untuk memindah tahap, atau klik kartu untuk detail. Kartu diurutkan dari skor AI tertinggi.</div>
    {!list ? <div className="card"><div className="skel" style={{ height: 260 }} /></div> : (
      <div className="rk-kanban">{r.tahap.map(({ k: t, label }) => {
        const isi = list.filter((x) => x.tahap === t);
        return (
          <section key={t} className={'rk-kolom' + (atas === t ? ' atas' : '')} style={{ ['--tc' as string]: WARNA_TAHAP[t] }}
            onDragOver={(e) => { e.preventDefault(); setAtas(t); }} onDragLeave={() => setAtas((x) => (x === t ? '' : x))} onDrop={(e) => lepas(e, t)}>
            <h4><span className="rk-titik" />{label}<span className="m">{isi.length}</span></h4>
            <div className="rk-kolom-isi">
              {isi.map((k) => (
                <article key={k.id} className={'rk-kartu' + (tarik === k.id ? ' tarik' : '')} draggable onDragStart={() => setTarik(k.id)} onDragEnd={() => { setTarik(null); setAtas(''); }}
                  onClick={() => buka(k.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') buka(k.id); }}>
                  <div className="rk-kartu-atas"><b>{k.nama}</b><Skor k={k} /></div>
                  {(k.bidang || k.tesStatus) && <div className="rk-kartu-tes">{k.bidang && <span className="tiny muted">{k.bidang}</span>}<NilaiTes k={k} /></div>}
                  {k.pendidikan && <div className="tiny muted"><Ikon n="graduation-cap" />{k.pendidikan}</div>}
                  {(k.pengalamanBulan != null || k.pengalamanIsian) && <div className="tiny muted"><Ikon n="briefcase" />{k.pengalamanBulan != null ? pengalaman(k.pengalamanBulan) : 'Pengalaman: ' + k.pengalamanIsian}</div>}
                  <div className="rk-kartu-bawah"><span className="tiny muted">{tglPendek(String(k.dilamar).slice(0, 10))}</span>
                    {!!k.rating && <span className="rk-bintang">{'★'.repeat(k.rating)}</span>}{k.userId && <span className="badge b-green">Karyawan</span>}</div>
                </article>))}
              {!isi.length && <div className="rk-kolom-kosong">Kosong</div>}
            </div>
          </section>);
      })}</div>)}
  </>);
}

/* ---------------- DAFTAR KANDIDAT ---------------- */
function DaftarKandidat({ r, segarkan }: { r: Ringkas; segarkan: () => void }) {
  const { galat } = useAplikasi();
  const [f, setF] = useState({ lowonganId: 0, tahap: '', cari: '', urut: 'skor' });
  const [list, setList] = useState<Kandidat[] | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const muat = useCallback(() => api<Kandidat[]>('rk_kandidat', f, true).then(setList).catch(galat), [f, galat]);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(muat, 250); return () => clearTimeout(t.current); }, [muat]);
  const buka = useBukaKandidat(() => { muat(); segarkan(); });
  const label = useMemo(() => Object.fromEntries(r.tahap.map((x) => [x.k, x.label])), [r.tahap]);
  return (
    <div className="card">
      <div className="rk-filter">
        <input placeholder="Cari nama, email, kode, atau keahlian…" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} />
        <select value={f.lowonganId} onChange={(e) => setF({ ...f, lowonganId: +e.target.value })}><option value={0}>Semua lowongan</option>
          {r.lowongan.map((l) => <option key={l.id} value={l.id}>{l.judul}</option>)}</select>
        <select value={f.tahap} onChange={(e) => setF({ ...f, tahap: e.target.value })}><option value="">Semua tahap</option>
          {r.tahap.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
        <select value={f.urut} onChange={(e) => setF({ ...f, urut: e.target.value })}><option value="skor">Skor AI tertinggi</option><option value="tes">Nilai tes tertinggi</option><option value="terbaru">Terbaru</option></select>
      </div>
      {!list ? <div className="skel" style={{ height: 160, marginTop: 12 }} /> : !list.length ? <div className="empty"><Ikon n="users" />Belum ada kandidat.</div> : (
        <div className="rk-tabel">{list.map((k, n) => (
          <button key={k.id} type="button" className="rk-baris" onClick={() => buka(k.id)}>
            <span className="rk-no">{(f.urut === 'skor' && k.skor != null) || (f.urut === 'tes' && k.tesStatus === 'selesai') ? '#' + (n + 1) : ''}</span>
            <span className="rk-nama"><b>{k.nama}</b><span className="tiny muted">{k.lowongan}{k.bidang && ' — ' + k.bidang} · {k.kode}</span>
              {k.ringkasan && <span className="tiny rk-ringkas">{k.ringkasan}</span>}</span>
            <span className="rk-info tiny muted">{k.pendidikan}{(k.pengalamanBulan != null || k.pengalamanIsian) && <><br />{k.pengalamanBulan != null ? pengalaman(k.pengalamanBulan) : k.pengalamanIsian}</>}</span>
            <span><span className="badge" style={{ background: `color-mix(in srgb, ${WARNA_TAHAP[k.tahap]} 15%, transparent)`, color: WARNA_TAHAP[k.tahap] }}>{label[k.tahap]}</span></span>
            <span className="rk-nilai"><NilaiTes k={k} /><Skor k={k} /></span>
          </button>))}</div>)}
    </div>
  );
}

/* ---------------- LOWONGAN ---------------- */
function DaftarLowongan({ r, segarkan, lihat }: { r: Ringkas; segarkan: () => void; lihat: (id: number) => void }) {
  const { bukaSheet, toast, galat, yakin } = useAplikasi();
  const form = (l: Lowongan | null, salin = false) => bukaSheet(<FormLowongan l={l} salin={salin} tipe={r.tipe} paket={r.paket} petunjukVideo={r.petunjukVideo} selesai={segarkan} />, { besar: true });
  const status = (l: Lowongan, s: string) => api<{ pesan: string }>('rk_lowongan_status', { id: l.id, status: s }).then((x) => { toast(x.pesan); segarkan(); }).catch(galat);
  const hapus = async (l: Lowongan) => {
    if (!(await yakin(`Hapus lowongan "${l.judul}"?`, 'Hanya lowongan tanpa pelamar yang bisa dihapus.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('rk_lowongan_hapus', { id: l.id }).then((x) => { toast(x.pesan); segarkan(); }).catch(galat);
  };
  return (<>
    <div className="card rk-lw-kepala"><div><h3 style={{ margin: 0 }}><Ikon n="briefcase" />Lowongan</h3>
      <div className="tiny muted">Lowongan berstatus <b>Dibuka</b> tampil di portal publik <a href="/rekrutmen" target="_blank" rel="noreferrer">/rekrutmen</a>.</div></div>
      <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Buat Lowongan</button></div>
    {!r.lowongan.length ? <div className="card"><div className="empty"><Ikon n="briefcase" />Belum ada lowongan.</div></div> : (
      <div className="rk-lw-grid">{r.lowongan.map((l) => (
        <div key={l.id} className="card rk-lw">
          <div className="rk-lw-atas"><h4>{l.judul}</h4>
            <span className={'badge ' + (l.status === 'buka' ? 'b-green' : l.status === 'draf' ? 'b-gray' : 'b-red')}>{l.status === 'buka' ? 'Dibuka' : l.status === 'draf' ? 'Draf' : 'Ditutup'}</span></div>
          <div className="rk-meta tiny"><span>{l.tipeLabel}</span>{l.divisi && <span><Ikon n="building-2" />{l.divisi}</span>}{l.lokasi && <span><Ikon n="map-pin" />{l.lokasi}</span>}
            <span><Ikon n="calendar" />{l.batas ? 'Batas ' + tglPendek(l.batas) : 'Tanpa batas'}</span>
            {l.wajibVideo && <span><Ikon n="video" />Video</span>}{l.tes && <span><Ikon n="clipboard-list" />Tes</span>}</div>
          <div className="rk-lw-angka"><div><b>{l.jumlah}</b><span>Pelamar</span></div><div><b>{l.baru}</b><span>Baru</span></div><div><b>{l.diterima}/{l.kuota}</b><span>Diterima</span></div></div>
          <div className="rk-lw-aksi">
            <button className="btn sm auto" onClick={() => lihat(l.id)}><Ikon n="layers" />Pipeline</button>
            <button className="btn ghost sm auto" onClick={() => form(l)}><Ikon n="pencil" />Ubah</button>
            {l.status === 'buka' ? <button className="btn ghost sm auto" onClick={() => status(l, 'tutup')}><Ikon n="lock" />Tutup</button>
              : <button className="btn ghost sm auto" onClick={() => status(l, 'buka')}><Ikon n="send" />Buka</button>}
            {l.status === 'buka' && <button className="btn ghost sm auto" onClick={() => navigator.clipboard.writeText(tautanPublik(l.id)).then(() => toast('Tautan lowongan disalin'))}><Ikon n="copy" />Tautan</button>}
            <button className="btn ghost sm auto" onClick={() => form(l, true)} title="Salin jadi lowongan baru"><Ikon n="plus" />Duplikat</button>
            {!l.jumlah && <button className="btn ghost sm auto" onClick={() => hapus(l)} aria-label="Hapus lowongan"><Ikon n="trash-2" /></button>}
          </div>
        </div>))}</div>)}
  </>);
}

function FormLowongan({ l, salin, tipe, paket, petunjukVideo, selesai }: { l: Lowongan | null; salin: boolean; tipe: Record<string, string>; paket: Paket[]; petunjukVideo: string; selesai: () => void }) {
  const { tutupSheet, toast, galat, yakin } = useAplikasi();
  const [buatAi, setBuatAi] = useState(false);
  const [v, setV] = useState({ judul: (l?.judul ?? '') + (salin ? ' (salinan)' : ''), divisi: l?.divisi ?? '', lokasi: l?.lokasi ?? '', tipe: l?.tipe ?? 'kontrak',
    deskripsi: l?.deskripsi ?? '', kualifikasi: l?.kualifikasiTeks ?? '', nilaiPlus: l?.nilaiPlusTeks ?? '', pertanyaan: (l?.pertanyaan ?? []).join('\n'),
    kuota: l?.kuota ?? 1, batas: salin ? '' : l?.batas ?? '', status: salin ? 'draf' : l?.status ?? 'draf',
    wajibVideo: l?.wajibVideo ?? false, petunjukVideo: l?.petunjukVideoTeks ?? '', tesPaketId: l?.tesPaketId ?? 0 });
  const [bidang, setBidang] = useState<{ nama: string; paketId: number | null }[]>(l?.bidangAtur ?? []);
  const opsiPaket = (kosong: string) => [<option key={0} value={0}>{kosong}</option>,
    ...paket.map((p) => <option key={p.id} value={p.id}>{p.judul}{p.divisi ? ` · ${p.divisi}` : ''} ({p.jumlahSoal} soal)</option>)];
  const [kirim, setKirim] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const simpan = (status?: string) => {
    setKirim(true);
    api<{ pesan: string }>('rk_lowongan_simpan', { ...v, bidang, status: status ?? v.status, id: salin ? 0 : l?.id ?? 0, kuota: +v.kuota })
      .then((x) => { tutupSheet(); toast(x.pesan); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  // draf kualifikasi wajib dari isian di atasnya; HC tetap meninjau & mengubahnya sebelum menyimpan
  const kualifikasiAi = async () => {
    if (v.judul.trim().length < 3) { toast('Isi judul posisi dulu', true); return; }
    if (v.kualifikasi.trim() && !(await yakin('Ganti kualifikasi wajib?', 'Isi kualifikasi yang sekarang akan diganti dengan saran AI.', { ya: 'Ganti' }))) return;
    setBuatAi(true);
    api<{ kualifikasi: string[] }>('rk_kualifikasi_ai', { judul: v.judul, divisi: v.divisi, lokasi: v.lokasi, tipe: v.tipe, deskripsi: v.deskripsi })
      .then((r) => { setV((x) => ({ ...x, kualifikasi: r.kualifikasi.join('\n') })); toast('Saran AI terisi. Periksa dan sesuaikan sebelum menyimpan.'); })
      .catch(galat).finally(() => setBuatAi(false));
  };
  return (<>
    <h3><Ikon n="briefcase" />{l && !salin ? 'Ubah' : 'Buat'} Lowongan</h3>
    <label style={{ marginTop: 0 }}>Judul posisi *</label><input value={v.judul} onChange={set('judul')} placeholder="mis. Staff Akademik Olimpiade" />
    <div className="row"><div><label>Divisi</label><input value={v.divisi} onChange={set('divisi')} placeholder="mis. Akademik" /></div>
      <div><label>Lokasi</label><input value={v.lokasi} onChange={set('lokasi')} placeholder="mis. Medan (WFO)" /></div></div>
    <div className="row"><div><label>Tipe pekerjaan</label><select value={v.tipe} onChange={set('tipe')}>{Object.entries(tipe).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div><label>Kuota</label><input type="number" min={1} value={v.kuota} onChange={set('kuota')} /></div>
      <div><label>Batas lamaran</label><input type="date" value={v.batas ?? ''} onChange={set('batas')} /></div></div>
    <label>Deskripsi pekerjaan</label><textarea rows={5} value={v.deskripsi} onChange={set('deskripsi')} placeholder="Tanggung jawab utama, lingkungan kerja, dll." />
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <label>Kualifikasi wajib * <span className="tiny muted">(satu per baris — dipakai AI untuk menilai CV)</span></label>
      <button type="button" className="btn ghost sm auto" disabled={buatAi} onClick={kualifikasiAi} title="Dibuat dari judul, divisi, lokasi, tipe, dan deskripsi pekerjaan">
        <Ikon n="sparkles" />{buatAi ? 'Membuat…' : 'Buat dengan AI'}</button></div>
    <textarea rows={5} value={v.kualifikasi} onChange={set('kualifikasi')} placeholder={'Minimal S1 Pendidikan Matematika / Fisika\nPengalaman mengajar minimal 1 tahun\nMenguasai Microsoft Office'} />
    <label>Nilai tambah <span className="tiny muted">(opsional, satu per baris)</span></label>
    <textarea rows={3} value={v.nilaiPlus} onChange={set('nilaiPlus')} placeholder={'Pernah menjadi peserta / pembina olimpiade sains\nDomisili Medan'} />
    <label>Pertanyaan tambahan untuk pelamar <span className="tiny muted">(opsional, satu per baris, maks. 5)</span></label>
    <textarea rows={3} value={v.pertanyaan} onChange={set('pertanyaan')} placeholder={'Berapa ekspektasi gaji Anda?\nKapan Anda bisa mulai bekerja?'} />

    <h4 className="rk-sub"><Ikon n="sliders-horizontal" />Seleksi tambahan <span className="tiny muted">(opsional — mis. rekrutmen tutor)</span></h4>
    <label className="rk-setuju" style={{ marginTop: 4 }}><input type="checkbox" checked={v.wajibVideo} onChange={(e) => setV((x) => ({ ...x, wajibVideo: e.target.checked }))} />
      <span><b>Wajib menyertakan tautan video</b> — mis. video mengajar yang diunggah pelamar ke YouTube / Google Drive.</span></label>
    {v.wajibVideo && <><label>Petunjuk video untuk pelamar <span className="tiny muted">(kosongkan untuk memakai petunjuk bawaan)</span></label>
      <textarea rows={2} value={v.petunjukVideo} onChange={set('petunjukVideo')} placeholder={petunjukVideo} maxLength={500} /></>}
    <label>Tes pilihan ganda setelah melamar</label>
    <select value={v.tesPaketId ?? 0} onChange={(e) => setV((x) => ({ ...x, tesPaketId: +e.target.value }))}>{opsiPaket('— tanpa tes —')}</select>
    {!paket.length && <div className="tiny muted" style={{ marginTop: 4 }}>Belum ada paket soal. Buat dulu di menu <a href="/bank-soal" target="_blank" rel="noreferrer">Bank Soal Tes</a>.</div>}
    <label>Pilihan bidang <span className="tiny muted">(opsional — pelamar memilih salah satu; tiap bidang boleh punya paket tes sendiri)</span></label>
    <div className="rk-bidang">{bidang.map((b, n) => (
      <div key={n} className="rk-bidang-baris">
        <input value={b.nama} onChange={(e) => setBidang((x) => x.map((y, j) => (j === n ? { ...y, nama: e.target.value } : y)))} placeholder="mis. Matematika" maxLength={100} />
        <select value={b.paketId ?? 0} onChange={(e) => setBidang((x) => x.map((y, j) => (j === n ? { ...y, paketId: +e.target.value || null } : y)))}>{opsiPaket('Paket tes di atas')}</select>
        <button type="button" className="btn ghost sm auto" onClick={() => setBidang((x) => x.filter((_, j) => j !== n))} aria-label="Hapus bidang"><Ikon n="x" /></button>
      </div>))}
      <button type="button" className="btn ghost sm auto" onClick={() => setBidang((x) => [...x, { nama: '', paketId: null }])} disabled={bidang.length >= 20}><Ikon n="plus" />Tambah bidang</button>
    </div>
    <div className="note" style={{ marginTop: 12 }}>AI menilai CV berdasarkan <b>kualifikasi wajib</b> dan <b>nilai tambah</b>. Tulis syarat yang jelas dan terukur agar peringkat kandidat akurat.</div>
    <div className="row" style={{ marginTop: 12 }}>
      <button className="btn ghost" disabled={kirim} onClick={() => simpan(v.status === 'buka' ? 'buka' : 'draf')}><Ikon n="check" />{v.status === 'buka' ? 'Simpan' : 'Simpan Draf'}</button>
      {v.status !== 'buka' && <button className="btn" disabled={kirim} onClick={() => simpan('buka')}><Ikon n="send" />Simpan & Buka</button>}
    </div>
  </>);
}

/* ---------------- DETAIL KANDIDAT ---------------- */
function DetailKandidat({ id, segarkan }: { id: number; segarkan: () => void }) {
  const { tutupSheet, toast, galat, yakin } = useAplikasi();
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [tahap, setTahap] = useState(''), [catatan, setCatatan] = useState(''), [kirim, setKirim] = useState(false);
  const [tahapList, setTahapList] = useState<{ k: string; label: string }[]>([]);
  const muat = useCallback(() => api<Data>('rk_detail', { id }, true).then((x) => { setD(x); setTahap(x.tahap); }).catch(galat), [id, galat]);
  useEffect(() => { muat(); api<Ringkas>('rk_ringkas', {}, true).then((x) => setTahapList(x.tahap)).catch(() => {}); }, [muat]);
  const menunggu = d?.aiStatus === 'antri' || d?.aiStatus === 'proses';
  useEffect(() => { if (!menunggu) return; const t = setInterval(muat, 8000); return () => clearInterval(t); }, [menunggu, muat]);
  if (!d) return <div className="skel" style={{ height: 320 }} />;
  const a = d.analisis, p = d.profil, label = Object.fromEntries(tahapList.map((x) => [x.k, x.label]));
  const wa = 'https://wa.me/' + String(d.noHp).replace(/^0/, '62').replace(/\D/g, '');

  const simpan = async () => {
    setKirim(true);
    try {
      if (tahap !== d.tahap) toast((await api<{ pesan: string }>('rk_tahap', { id, tahap, catatan })).pesan);
      else if (catatan.trim()) toast((await api<{ pesan: string }>('rk_catatan', { id, catatan })).pesan);
      setCatatan(''); await muat(); segarkan();
    } catch (e) { galat(e); } finally { setKirim(false); }
  };
  const rating = (n: number) => api('rk_rating', { id, rating: n === d.rating ? 0 : n }, true).then(() => { muat(); segarkan(); }).catch(galat);
  const ulang = () => api<{ pesan: string }>('rk_analisis_ulang', { id }).then((x) => { toast(x.pesan); muat(); }).catch(galat);
  const hapus = async () => {
    if (!(await yakin(`Hapus lamaran ${d.nama}?`, 'Data lamaran dan berkas CV dihapus permanen.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('rk_hapus', { id }).then((x) => { toast(x.pesan); tutupSheet(); segarkan(); }).catch(galat);
  };

  return (<div className="rk-det">
    <div className="rk-det-kepala">
      <div style={{ minWidth: 0 }}><h3 style={{ margin: 0 }}>{d.nama}</h3>
        <div className="tiny muted">{d.lowongan} · {d.kode} · melamar {tglIndo(String(d.dilamar).slice(0, 10))}</div>
        <div className="rk-kontak">
          <a className="btn ghost sm auto" href={wa} target="_blank" rel="noreferrer"><Ikon n="whatsapp" />{d.noHp}</a>
          <a className="btn ghost sm auto" href={'mailto:' + d.email}><Ikon n="mail" />{d.email}</a>
          <a className="btn ghost sm auto" href={d.cvUrl} target="_blank" rel="noreferrer"><Ikon n="file-text" />Buka CV</a>
          {d.tautan && <a className="btn ghost sm auto" href={d.tautan} target="_blank" rel="noreferrer noopener"><Ikon n="external-link" />Portofolio</a>}
          {d.linkVideo && <a className="btn sm auto" href={d.linkVideo} target="_blank" rel="noreferrer noopener"><Ikon n="video" />Tonton video</a>}
        </div></div>
      <Skor k={d as Kandidat} besar />
    </div>

    {menunggu && <div className="note"><span className="spin gelap" /> CV sedang dianalisis AI. Hasil muncul otomatis dalam 1–2 menit.</div>}
    {d.aiStatus === 'manual' && <div className="warn">{d.aiGalat || 'CV tidak bisa dibaca AI.'} <button className="btn ghost sm auto" onClick={ulang}><Ikon n="repeat" />Coba analisis lagi</button></div>}
    {d.aiStatus === 'gagal' && <div className="err">Analisis AI gagal: {d.aiGalat} <button className="btn ghost sm auto" onClick={ulang}><Ikon n="repeat" />Ulangi</button></div>}

    <div className="grid-2 rk-det-grid"><div>
      {d.tes && <HasilTes t={d.tes} id={id} muat={muat} />}
      {a && <div className="card"><h3><Ikon n="sparkles" />Analisis AI</h3>
        {a.rekomendasi && <div className="note"><b>Rekomendasi:</b> {a.rekomendasi}</div>}
        {a.dibatasi && <div className="warn tiny" style={{ marginTop: 8 }}>{a.dibatasi}</div>}
        <div className="rk-rinci">{Object.entries({ kualifikasi_wajib: 'Kualifikasi wajib', pengalaman: 'Pengalaman', keahlian: 'Keahlian', pendidikan: 'Pendidikan', nilai_plus: 'Nilai tambah' })
          .map(([k, t]) => <div key={k}><span>{t}</span><div className="bar"><i style={{ width: (a.skor_rinci?.[k] ?? 0) + '%' }} /></div><b>{a.skor_rinci?.[k] ?? 0}</b></div>)}</div>
        {a.syarat?.length > 0 && <><h4>Pemenuhan kualifikasi wajib</h4><ul className="rk-syarat">{a.syarat.map((x: Data, n: number) => {
          const st = x.status ?? (x.terpenuhi ? 'ya' : 'tidak');
          return <li key={n} className={st}><Ikon n={st === 'ya' ? 'circle-check' : st === 'sebagian' ? 'circle-alert' : 'circle-x'} />
            <div><b>{x.syarat}</b><span className="tiny muted">{st === 'sebagian' ? 'Sebagian · ' : ''}{x.bukti}</span></div></li>;
        })}</ul></>}
        {a.kekuatan?.length > 0 && <><h4>Kekuatan</h4><ul className="rk-poin ya">{a.kekuatan.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
        {a.kekurangan?.length > 0 && <><h4>Kekurangan</h4><ul className="rk-poin tidak">{a.kekurangan.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
        {a.bendera_merah?.length > 0 && <><h4>Perlu diklarifikasi</h4><ul className="rk-poin waspada">{a.bendera_merah.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
        {a.pertanyaan_wawancara?.length > 0 && <><h4>Saran pertanyaan wawancara</h4><ol className="rk-tanya">{a.pertanyaan_wawancara.map((x: string) => <li key={x}>{x}</li>)}</ol></>}
        <div className="tiny muted" style={{ marginTop: 10 }}>Analisis AI membantu penyaringan awal. Keputusan tetap di tangan HC. <button className="btn ghost sm auto" onClick={ulang}><Ikon n="repeat" />Analisis ulang</button></div>
      </div>}
      {p && <div className="card"><h3><Ikon n="id-card" />Profil dari CV</h3>
        {p.ringkasan && <p style={{ marginTop: 0 }}>{p.ringkasan}</p>}
        {p.pengalaman?.length > 0 && <><h4>Pengalaman{p.total_pengalaman_bulan ? ` · ${pengalaman(p.total_pengalaman_bulan).replace(' pengalaman', '')}` : ''}</h4>
          <ul className="rk-garis">{p.pengalaman.map((x: Data, n: number) => <li key={n}><b>{x.posisi}</b>{x.perusahaan && ' · ' + x.perusahaan}
            <span className="tiny muted">{[x.periode, x.bulan ? x.bulan + ' bln' : ''].filter(Boolean).join(' · ')}</span>{x.ringkas && <span className="tiny">{x.ringkas}</span>}</li>)}</ul></>}
        {p.pendidikan?.length > 0 && <><h4>Pendidikan</h4><ul className="rk-garis">{p.pendidikan.map((x: Data, n: number) => <li key={n}>
          <b>{[x.jenjang, x.jurusan].filter(Boolean).join(' ')}</b><span className="tiny muted">{[x.institusi, x.tahun].filter(Boolean).join(' · ')}</span></li>)}</ul></>}
        {p.keahlian?.length > 0 && <><h4>Keahlian</h4><div className="rk-chip">{p.keahlian.map((x: string) => <span key={x}>{x}</span>)}</div></>}
        {p.sertifikat?.length > 0 && <><h4>Sertifikat</h4><div className="rk-chip">{p.sertifikat.map((x: string) => <span key={x}>{x}</span>)}</div></>}
        {p.bahasa?.length > 0 && <><h4>Bahasa</h4><div className="rk-chip">{p.bahasa.map((x: string) => <span key={x}>{x}</span>)}</div></>}
      </div>}
    </div><div>
      <div className="card"><h3><Ikon n="layers" />Tahap & Catatan</h3>
        <label style={{ marginTop: 0 }}>Tahap</label>
        <select value={tahap} onChange={(e) => setTahap(e.target.value)}>{tahapList.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
        <label>Catatan {tahap !== d.tahap ? 'perpindahan tahap' : ''} <span className="tiny muted">(opsional)</span></label>
        <textarea rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. hasil wawancara, jadwal tes, alasan keputusan" />
        <button className="btn" disabled={kirim || (tahap === d.tahap && !catatan.trim())} onClick={simpan}><Ikon n="check" />{tahap !== d.tahap ? 'Pindahkan tahap' : 'Simpan catatan'}</button>
        <label>Penilaian HC</label>
        <div className="rk-rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={(d.rating ?? 0) >= n ? 'on' : ''} onClick={() => rating(n)} aria-label={n + ' bintang'}>★</button>)}</div>
        {d.tahap === 'diterima' && !d.userId && <button className="btn green" style={{ marginTop: 14 }} onClick={() => { tutupSheet(); router.push('/karyawan?dari_lamaran=' + id); }}>
          <Ikon n="user-plus" />Jadikan Karyawan</button>}
        {d.userId && <div className="note" style={{ marginTop: 12 }}><Ikon n="circle-check" /> Sudah terdaftar sebagai karyawan.</div>}
      </div>
      <div className="card"><h3><Ikon n="info" />Data Pelamar</h3>
        <div className="tiny muted" style={{ marginBottom: 4 }}>Diisi sendiri oleh pelamar saat melamar.</div>
        {d.bidang && <div className="kv"><span>Bidang yang dilamar</span><span style={{ textAlign: 'right' }}><b>{d.bidang}</b></span></div>}
        {d.linkVideo && <div className="kv"><span>Tautan video</span><a href={d.linkVideo} target="_blank" rel="noreferrer noopener" style={{ textAlign: 'right', wordBreak: 'break-all' }}>{d.linkVideo}</a></div>}
        <div className="kv"><span>Pendidikan terakhir</span><span style={{ textAlign: 'right' }}>{[d.pendidikanIsian, d.jurusan].filter(Boolean).join(' · ') || '—'}</span></div>
        <div className="kv"><span>Lama pengalaman kerja</span><span style={{ textAlign: 'right' }}>{d.pengalamanIsian || '—'}</span></div>
        <div className="kv"><span>Pekerjaan terakhir</span><span style={{ textAlign: 'right' }}>{d.kerjaTerakhir || '—'}</span></div>
        <div className="kv"><span>Domisili</span><span style={{ textAlign: 'right' }}>{d.domisili || '—'}</span></div>
        {Object.entries(d.jawaban ?? {}).map(([q, j]) => <div key={q} className="rk-jawab"><b>{q}</b><span>{String(j)}</span></div>)}
      </div>
      <div className="card"><h3><Ikon n="history" />Riwayat</h3>
        <ul className="rk-riwayat">{d.riwayat.map((x: Data) => <li key={x.id} className={x.jenis}>
          <div>{x.jenis === 'tahap' ? <><b>{label[x.dari] ?? x.dari} → {label[x.ke] ?? x.ke}</b>{x.catatan && <span>{x.catatan}</span>}</> : <span>{x.catatan}</span>}</div>
          <span className="tiny muted">{x.oleh ? x.oleh + ' · ' : ''}{String(x.waktu).slice(0, 16)}</span></li>)}</ul>
      </div>
      <button className="btn ghost red-teks" onClick={hapus}><Ikon n="trash-2" />Hapus lamaran</button>
    </div></div>
  </div>);
}

/* ---------------- hasil tes pilihan ganda kandidat ---------------- */
function HasilTes({ t, id, muat }: { t: Data; id: number; muat: () => void }) {
  const { toast, galat, yakin } = useAplikasi();
  const [rinci, setRinci] = useState(false);
  const tautan = (tok: string) => `${window.location.origin}/rekrutmen/tes?t=${tok}`;
  const salin = () => navigator.clipboard.writeText(tautan(t.token)).then(() => toast('Tautan tes disalin — kirim ke pelamar'));
  const ulang = async () => {
    if (!(await yakin('Atur ulang tes pelamar ini?', 'Jawaban dan nilai sebelumnya dihapus, lalu dibuat tautan tes baru dengan soal terbaru dari bank soal.', { ya: 'Atur ulang' }))) return;
    api<{ pesan: string; token: string }>('rk_tes_ulang', { id }).then((r) => { navigator.clipboard.writeText(tautan(r.token)).catch(() => {}); toast(r.pesan + ' (tautan disalin)'); muat(); }).catch(galat);
  };
  const menit = (d: number | null) => (d == null ? '—' : d < 60 ? `${d} detik` : `${Math.floor(d / 60)} mnt ${d % 60} dtk`);
  return (
    <div className="card rk-hasil-tes"><h3><Ikon n="clipboard-list" />Tes: {t.judul}</h3>
      {t.status !== 'selesai' ? (<>
        <div className="note">{t.status === 'mulai' ? <>Pelamar sedang / sempat mengerjakan tes (mulai {String(t.mulai).slice(0, 16)}), belum mengirim jawaban.</> : 'Pelamar belum mengerjakan tes.'}</div>
        <div className="rk-kontak"><button className="btn ghost sm auto" onClick={salin}><Ikon n="copy" />Salin tautan tes</button>
          {t.status === 'mulai' && <button className="btn ghost sm auto" onClick={ulang}><Ikon n="repeat" />Atur ulang</button>}</div>
      </>) : (<>
        <div className="rk-tes-skor">
          <div className={'besar ' + (t.lulus === true ? 'hijau' : t.lulus === false ? 'merah' : '')}><b>{t.nilai}</b><span>nilai</span></div>
          <div><b>{t.benar}/{t.jumlah}</b><span>benar</span></div>
          <div><b>{t.poin}/{t.maks}</b><span>poin</span></div>
          <div><b>{menit(t.lamaDetik)}</b><span>lama mengerjakan</span></div>
        </div>
        {t.lulus !== null && <div className={t.lulus ? 'note' : 'warn'} style={{ marginTop: 8 }}>{t.lulus ? 'Lulus' : 'Belum lulus'} nilai minimal {t.nilaiLulus}.</div>}
        {t.lewatWaktu && <div className="warn tiny" style={{ marginTop: 8 }}>Jawaban terkirim setelah batas waktu {t.durasi} menit.</div>}
        <div className="rk-kontak"><button className="btn ghost sm auto" onClick={() => setRinci((x) => !x)}><Ikon n={rinci ? 'chevron-up' : 'chevron-down'} />{rinci ? 'Sembunyikan' : 'Lihat'} jawaban</button>
          <button className="btn ghost sm auto" onClick={ulang}><Ikon n="repeat" />Atur ulang tes</button></div>
        {rinci && <ol className="rk-tes-rinci">{(t.rincian as Data[]).map((x, n) => (
          <li key={n} className={x.jawab === x.kunci ? 'ya' : 'tidak'}>
            <div className="p">{x.p}{x.poin > 1 && <span className="tiny muted"> ({x.poin} poin)</span>}</div>
            <div className="tiny">{x.jawab == null ? <span className="muted">Tidak dijawab</span> : <>Jawab: <b>{'ABCDE'[x.jawab]}. {x.o[x.jawab]}</b></>}
              {x.jawab !== x.kunci && <> · Kunci: <b>{'ABCDE'[x.kunci]}. {x.o[x.kunci]}</b></>}</div>
          </li>))}</ol>}
      </>)}
    </div>
  );
}
