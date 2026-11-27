'use client';
/* Aset: kendaraan operasional (motor / mobil) dan jatuh tempo pajaknya — HC & Super Admin.
   Pengingat otomatis H-30, H-7, dan hari jatuh tempo dikirim ke HC & Super Admin. */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { tglIndo, todayStr } from '@/lib/klien/format';
import { FormAset, FormKembali, LABEL_KONDISI, WARNA_KONDISI, type AsetBarang } from '@/components/FormAset';

type Kendaraan = { id: number; jenis: 'motor' | 'mobil'; brand: string; merk: string; tahun: number | null; plat: string; tglPajak: string | null; sisaHari: number | null;
  tglStnk: string | null; sisaHariStnk: number | null; keterangan: string; pemegangId: number | null; pemegang: string };
type Data = { kendaraan: Kendaraan[]; karyawan: { id: number; nama: string }[]; ringkas: { mobil: number; motor: number; segera: number; lewat: number } };

/* status jatuh tempo: merah = lewat / hari ini, kuning = ≤30 hari, hijau = aman */
function StatusTempo({ sisa }: { sisa: number | null }) {
  if (sisa == null) return <span className="badge b-gray">belum diisi</span>;
  if (sisa < 0) return <span className="badge b-red">Lewat {-sisa} hari</span>;
  if (sisa === 0) return <span className="badge b-red">Hari ini</span>;
  if (sisa <= 30) return <span className="badge b-amber">{sisa} hari lagi</span>;
  return <span className="badge b-green">{sisa} hari lagi</span>;
}
const tglPendekId = (t: string) => t.split('-').reverse().join('/');

/* Aset (HC & Super Admin): tab Kendaraan dan tab Aset Karyawan (barang yang dipegang karyawan) */
export default function Aset() {
  const [tab, setTab] = useState<'kendaraan' | 'karyawan'>('kendaraan');
  useEffect(() => { try { if (localStorage.getItem('aset-tab') === 'karyawan') setTab('karyawan'); } catch { /* abaikan */ } }, []);
  const pilih = (t: 'kendaraan' | 'karyawan') => { setTab(t); try { localStorage.setItem('aset-tab', t); } catch { /* abaikan */ } };
  return (<>
    <div className="seg" style={{ marginBottom: 12 }}>{([['kendaraan', 'car', 'Kendaraan'], ['karyawan', 'users', 'Aset Karyawan']] as const).map(([k, ic, t]) =>
      <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => pilih(k)}><Ikon n={ic} />{t}</button>)}</div>
    {tab === 'kendaraan' ? <TabKendaraan /> : <TabAsetKaryawan />}
  </>);
}

function TabKendaraan() {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<Data | null>(null), [filter, setFilter] = useState<'' | 'mobil' | 'motor'>(''), [cari, setCari] = useState('');
  const muat = useCallback(() => { api<Data>('aset_kendaraan_daftar', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = (k: Kendaraan | null, jenis?: 'motor' | 'mobil') => bukaSheet(<FormKendaraan k={k} jenisAwal={jenis ?? (filter || undefined)} karyawan={d?.karyawan ?? []} selesai={muat} />);
  const bayar = async (k: Kendaraan, apa: 'pajak' | 'stnk') => {
    const stnk = apa === 'stnk', t = stnk ? k.tglStnk : k.tglPajak;
    if (!(await yakin(stnk ? `STNK ${k.plat} sudah diperpanjang?` : `Pajak ${k.plat} sudah dibayar?`,
      `${stnk ? 'Masa berlaku STNK' : 'Jatuh tempo pajak'} ${t ? tglIndo(t) : ''} ditandai selesai dan dimajukan ${stnk ? 'lima tahun' : 'satu tahun'}. Pengingat berikutnya berjalan otomatis.`,
      { ya: stnk ? 'Sudah diperpanjang' : 'Sudah dibayar' }))) return;
    api<{ pesan: string }>('aset_pajak_bayar', { id: k.id, apa }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const hapus = async (k: Kendaraan) => {
    if (!(await yakin(`Hapus ${k.plat} dari daftar aset?`, 'Pengingat pajak kendaraan ini ikut berhenti.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('aset_kendaraan_hapus', { id: k.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const tampil = (d?.kendaraan ?? []).filter((k) => (!filter || k.jenis === filter)
    && (!cari || [k.brand, k.merk, k.plat, k.keterangan, String(k.tahun ?? '')].some((v) => v.toLowerCase().includes(cari.toLowerCase()))));
  const ekspor = () => d && keExcel(tampil.map((k, n) => ({ No: n + 1, Jenis: k.jenis === 'mobil' ? 'Mobil' : 'Motor', Brand: k.brand, Merk: k.merk, Tahun: k.tahun ?? '',
    'Plat Kendaraan': k.plat, 'Jatuh Tempo Pajak Tahunan': k.tglPajak ?? '', 'Sisa Hari Pajak': k.sisaHari ?? '', 'Masa Berlaku STNK (5 Tahunan)': k.tglStnk ?? '',
    'Sisa Hari STNK': k.sisaHariStnk ?? '', Pemegang: k.pemegang, Keterangan: k.keterangan })), 'Kendaraan', 'aset-kendaraan-' + todayStr()).catch(galat);

  return (<>
    <div className="card kp-pilih-bulan">
      <div><h3 style={{ margin: 0 }}><Ikon n="car" />Aset · Kendaraan</h3>
        <div className="tiny muted">Pengingat pajak tahunan & STNK 5 tahunan otomatis ke HC & Super Admin: 30 hari, 7 hari, dan pada hari jatuh tempo.</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn ghost sm auto" onClick={ekspor} disabled={!d?.kendaraan.length}><Ikon n="download" />Excel</button>
        <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Tambah Kendaraan</button></div>
    </div>
    {d && <div className="statgrid kp-stat">{([['car', 'Mobil', d.ringkas.mobil, 'mobil'], ['bike', 'Motor', d.ringkas.motor, 'motor'],
      ['hourglass', 'Pajak / STNK ≤ 30 hari', d.ringkas.segera, ''], ['circle-alert', 'Pajak / STNK lewat', d.ringkas.lewat, '']] as [string, string, number, '' | 'mobil' | 'motor'][]).map(([ic, k, v, f]) => (
      <button key={k} type="button" className={'stat kp-stat-btn' + (f && filter === f ? ' on' : '')} onClick={() => f && setFilter((x) => (x === f ? '' : f))}>
        <span className="si"><Ikon n={ic} /></span><div className="k">{k}</div><div className="v">{v}</div></button>))}</div>}
    <div className="card">
      <div className="kp-filter">
        <div className="seg" style={{ margin: 0 }}>{([['', 'Semua'], ['mobil', 'Mobil'], ['motor', 'Motor']] as const).map(([k, t]) =>
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}</div>
        <input placeholder="Cari brand, merk, plat…" value={cari} onChange={(e) => setCari(e.target.value)} />
      </div>
      {!d ? <div className="skel" style={{ height: 200, marginTop: 12 }} /> : !tampil.length ? (
        <div className="empty"><Ikon n={filter === 'motor' ? 'bike' : 'car'} />{d.kendaraan.length ? 'Tidak ada kendaraan pada filter ini.' : 'Belum ada kendaraan.'}
          <div style={{ marginTop: 10 }}><button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Tambah {filter === 'motor' ? 'Motor' : filter === 'mobil' ? 'Mobil' : 'Kendaraan'}</button></div></div>
      ) : (
        <div className="tblwrap"><table><thead><tr><th>Kendaraan</th><th>Tahun</th><th>Plat</th><th>Pajak tahunan</th><th>STNK 5 tahunan</th><th /></tr></thead><tbody>
          {tampil.map((k) => (
            <tr key={k.id}>
              <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ikon n={k.jenis === 'mobil' ? 'car' : 'bike'} />
                <div><b>{k.brand} {k.merk}</b><div className="tiny muted">{k.jenis === 'mobil' ? 'Mobil' : 'Motor'}{k.pemegang && ' · dipegang ' + k.pemegang}{k.keterangan && ' · ' + k.keterangan}</div></div></div></td>
              <td>{k.tahun ?? '—'}</td><td><b style={{ letterSpacing: '.04em' }}>{k.plat}</b></td>
              {([['pajak', k.tglPajak, k.sisaHari, 'Sudah bayar', 'Pajak sudah dibayar: maju satu tahun'], ['stnk', k.tglStnk, k.sisaHariStnk, 'Sudah diperpanjang', 'STNK sudah diperpanjang: maju lima tahun']] as const).map(([apa, t, sisa, tombol, judul]) => (
                <td key={apa} style={{ whiteSpace: 'nowrap' }}>{t ? <>{tglPendekId(t)}<div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}><StatusTempo sisa={sisa} />
                  {sisa != null && sisa <= 30 && <button className="btn green sm auto" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '2px 8px' }} onClick={() => bayar(k, apa)} title={judul}><Ikon n="check" />{tombol}</button>}</div></>
                  : <span className="tiny muted">—</span>}</td>))}
              <td style={{ width: 1, whiteSpace: 'nowrap' }}><div className="row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <button className="btn ghost sm auto" onClick={() => form(k)} aria-label={'Ubah ' + k.plat}><Ikon n="pencil" /></button>
                <button className="btn ghost sm auto" onClick={() => hapus(k)} aria-label={'Hapus ' + k.plat}><Ikon n="trash-2" /></button></div></td>
            </tr>))}
        </tbody></table></div>)}
    </div>
  </>);
}

function FormKendaraan({ k, jenisAwal, karyawan, selesai }: { k: Kendaraan | null; jenisAwal?: 'motor' | 'mobil'; karyawan: { id: number; nama: string }[]; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState({ jenis: k?.jenis ?? jenisAwal ?? '', brand: k?.brand ?? '', merk: k?.merk ?? '', tahun: k?.tahun ? String(k.tahun) : '', plat: k?.plat ?? '',
    tglPajak: k?.tglPajak ?? '', tglStnk: k?.tglStnk ?? '', keterangan: k?.keterangan ?? '', pemegangId: k?.pemegangId ? String(k.pemegangId) : '' });
  const [kirim, setKirim] = useState(false);
  const set = (f: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [f]: e.target.value }));
  const simpan = () => {
    if (!v.jenis) { toast('Pilih jenis kendaraan: Motor atau Mobil', true); return; }
    setKirim(true);
    api<{ pesan: string }>('aset_kendaraan_simpan', { id: k?.id ?? 0, ...v }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n={v.jenis === 'motor' ? 'bike' : 'car'} />{k ? 'Ubah' : 'Tambah'} Kendaraan</h3>
    <label style={{ marginTop: 0 }}>Jenis *</label>
    <div className="seg" style={{ margin: 0 }}>{([['motor', 'bike', 'Motor'], ['mobil', 'car', 'Mobil']] as const).map(([j, ic, t]) =>
      <button key={j} type="button" className={v.jenis === j ? 'on' : ''} onClick={() => setV((x) => ({ ...x, jenis: j }))}><Ikon n={ic} />{t}</button>)}</div>
    <div className="row"><div><label>Brand *</label><input value={v.brand} onChange={set('brand')} placeholder={v.jenis === 'motor' ? 'mis. Honda' : 'mis. Toyota'} /></div>
      <div><label>Merk / tipe</label><input value={v.merk} onChange={set('merk')} placeholder={v.jenis === 'motor' ? 'mis. Vario 125' : 'mis. Avanza'} /></div></div>
    <div className="row"><div><label>Tahun</label><input type="number" inputMode="numeric" min={1970} max={new Date().getFullYear() + 1} value={v.tahun} onChange={set('tahun')} placeholder="mis. 2021" /></div>
      <div><label>Plat kendaraan *</label><input value={v.plat} onChange={set('plat')} placeholder="mis. BK 1234 ABC" style={{ textTransform: 'uppercase' }} /></div></div>
    <div className="row"><div><label>Jatuh tempo pajak tahunan</label><input type="date" value={v.tglPajak} onChange={set('tglPajak')} /></div>
      <div><label>Masa berlaku STNK (5 tahunan)</label><input type="date" value={v.tglStnk} onChange={set('tglStnk')} /></div></div>
    <div className="tiny muted" style={{ marginTop: 4 }}>Keduanya tertulis di STNK: pajak dibayar tiap tahun, STNK diperpanjang tiap 5 tahun (ganti plat). Pengingat dikirim 30 hari, 7 hari, dan pada hari jatuh tempo.</div>
    <label>Dipegang / dipakai oleh <span className="tiny muted">(opsional)</span></label>
    <select value={v.pemegangId} onChange={set('pemegangId')}><option value="">— tidak ada / kendaraan bersama —</option>{karyawan.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}</select>
    <label>Keterangan</label><input value={v.keterangan} onChange={set('keterangan')} placeholder="opsional, mis. dipakai tim Operasional / warna putih" />
    <button className="btn" style={{ marginTop: 14 }} disabled={kirim} onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

/* ---------------- ASET KARYAWAN ---------------- */
type DataBarang = { barang: AsetBarang[]; jenis: string[]; karyawan: { id: number; nama: string; nik: string; divisi: string }[];
  ringkas: { dipegang: number; pemegang: number; belum: number; bermasalah: number; perJenis: Record<string, number> } };
function TabAsetKaryawan() {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<DataBarang | null>(null);
  const [f, setF] = useState({ cari: '', jenis: '', divisi: '', status: 'dipegang', verif: '' });
  const muat = useCallback(() => { api<DataBarang>('asb_daftar', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = (a: AsetBarang | null) => d && bukaSheet(<FormAset a={a} jenis={d.jenis} karyawan={d.karyawan} selesai={muat} />);
  const verifikasi = (ids: number[]) => api<{ pesan: string }>('asb_verifikasi', { ids }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  const hapus = async (a: AsetBarang) => {
    if (!(await yakin(`Hapus ${a.jenis} ${a.tipe} (${a.nama || 'tanpa pemegang'})?`, 'Data dihapus permanen. Bila aset dikembalikan ke kantor, pilih "Dikembalikan" agar riwayatnya tersimpan.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('asb_hapus', { id: a.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  if (!d) return <div className="card"><div className="skel" style={{ height: 220 }} /></div>;
  const divisi = [...new Set(d.barang.map((x) => x.divisi).filter(Boolean))].sort();
  const jenisAda = [...new Set(d.barang.map((x) => x.jenis))].sort();
  const k = f.cari.trim().toLowerCase();
  const tampil = d.barang.filter((x) => (!f.status || x.status === f.status) && (!f.jenis || x.jenis === f.jenis) && (!f.divisi || x.divisi === f.divisi)
    && (!f.verif || (f.verif === 'belum' ? !x.diverifikasi : f.verif === 'masalah' ? x.kondisi !== 'baik' : x.diverifikasi))
    && (!k || [x.nama, x.nik, x.jenis, x.tipe, x.nomorSeri, x.keterangan].some((v) => (v ?? '').toLowerCase().includes(k))));
  const belumTampil = tampil.filter((x) => !x.diverifikasi && x.status === 'dipegang');
  const ekspor = () => keExcel(tampil.map((x, n) => ({ No: n + 1, Pemegang: x.nama, NIK: x.nik, Divisi: x.divisi, Jenis: x.jenis, 'Merk / Tipe': x.tipe,
    'Nomor Seri / Kode': x.nomorSeri, 'Dipegang Sejak': x.sejak ?? '', Kondisi: LABEL_KONDISI[x.kondisi], Status: x.status === 'dipegang' ? 'Dipegang' : 'Dikembalikan',
    'Tanggal Kembali': x.tglKembali ?? '', Verifikasi: x.diverifikasi ? 'Sudah' : 'Belum', Keterangan: x.keterangan })), 'Aset Karyawan', 'aset-karyawan-' + todayStr()).catch(galat);
  return (<>
    <div className="card kp-pilih-bulan">
      <div><h3 style={{ margin: 0 }}><Ikon n="users" />Aset · Aset Karyawan</h3>
        <div className="tiny muted">Karyawan mencatat sendiri aset yang dipegang lewat menu <b>Aset Saya</b>; HC memverifikasi. HC juga bisa mencatat atas nama karyawan.</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn ghost sm auto" onClick={ekspor} disabled={!tampil.length}><Ikon n="download" />Excel</button>
        <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Tambah Aset</button></div>
    </div>
    <div className="statgrid kp-stat">{([['briefcase', 'Aset dipegang', d.ringkas.dipegang, ''], ['users', 'Karyawan pemegang', d.ringkas.pemegang, ''],
      ['hourglass', 'Belum diverifikasi', d.ringkas.belum, 'belum'], ['circle-alert', 'Perlu perbaikan / rusak', d.ringkas.bermasalah, 'masalah']] as [string, string, number, string][]).map(([ic, t, v, fv]) => (
      <button key={t} type="button" className={'stat kp-stat-btn' + (fv && f.verif === fv ? ' on' : '')} onClick={() => fv && setF((x) => ({ ...x, verif: x.verif === fv ? '' : fv, status: 'dipegang' }))}>
        <span className="si"><Ikon n={ic} /></span><div className="k">{t}</div><div className="v">{v}</div></button>))}</div>
    {Object.keys(d.ringkas.perJenis).length > 0 && <div className="rk-chip" style={{ margin: '0 0 12px' }}>{Object.entries(d.ringkas.perJenis).sort((a, b) => b[1] - a[1]).map(([j, n]) =>
      <span key={j} role="button" style={{ cursor: 'pointer' }} onClick={() => setF((x) => ({ ...x, jenis: x.jenis === j ? '' : j }))}>{j}: {n}</span>)}</div>}
    <div className="card">
      <div className="kp-filter as-filter">
        <input placeholder="Cari nama, merk, nomor seri…" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} />
        <select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}><option value="">Semua jenis</option>{jenisAda.map((j) => <option key={j}>{j}</option>)}</select>
        <select value={f.divisi} onChange={(e) => setF({ ...f, divisi: e.target.value })}><option value="">Semua divisi</option>{divisi.map((j) => <option key={j}>{j}</option>)}</select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="dipegang">Masih dipegang</option><option value="dikembalikan">Sudah dikembalikan</option><option value="">Semua status</option></select>
      </div>
      {belumTampil.length > 1 && <div className="note" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{belumTampil.length} aset belum diverifikasi.
        <button className="btn green sm auto" onClick={() => verifikasi(belumTampil.map((x) => x.id))}><Ikon n="badge-check" />Verifikasi semua yang tampil</button></div>}
      {!tampil.length ? <div className="empty"><Ikon n="briefcase" />{d.barang.length ? 'Tidak ada aset pada filter ini.' : 'Belum ada aset yang dicatat. Minta karyawan mengisi menu Aset Saya, atau tambahkan di sini.'}</div> : (
        <div className="tblwrap"><table><thead><tr><th>Pemegang</th><th>Aset</th><th>Sejak</th><th>Kondisi</th><th>Status</th><th /></tr></thead><tbody>
          {tampil.map((x) => (
            <tr key={x.id}>
              <td><b>{x.nama || '—'}</b><div className="tiny muted">{[x.nik, x.divisi].filter(Boolean).join(' · ')}</div></td>
              <td><b>{x.jenis}</b><div>{x.tipe}</div>{(x.nomorSeri || x.keterangan) && <div className="tiny muted">{[x.nomorSeri && 'SN/Kode ' + x.nomorSeri, x.keterangan].filter(Boolean).join(' · ')}</div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{x.sejak ? tglPendekId(x.sejak) : '—'}{x.tglKembali && <div className="tiny muted">kembali {tglPendekId(x.tglKembali)}</div>}</td>
              <td><span className={'badge ' + WARNA_KONDISI[x.kondisi]}>{LABEL_KONDISI[x.kondisi]}</span></td>
              <td>{x.status === 'dikembalikan' ? <span className="badge b-gray">Dikembalikan</span> : x.diverifikasi
                ? <span className="badge b-green" title={x.verifikasiOleh}><Ikon n="badge-check" />Terverifikasi</span> : <span className="badge b-amber">Belum diverifikasi</span>}</td>
              <td style={{ width: 1, whiteSpace: 'nowrap' }}><div className="row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                {!x.diverifikasi && x.status === 'dipegang' && <button className="btn green sm auto" onClick={() => verifikasi([x.id])} title="Verifikasi"><Ikon n="badge-check" /></button>}
                <button className="btn ghost sm auto" onClick={() => form(x)} aria-label="Ubah"><Ikon n="pencil" /></button>
                {x.status === 'dipegang' && <button className="btn ghost sm auto" onClick={() => bukaSheet(<FormKembali a={x} selesai={muat} />)} title="Dikembalikan"><Ikon n="undo-2" /></button>}
                <button className="btn ghost sm auto" onClick={() => hapus(x)} aria-label="Hapus"><Ikon n="trash-2" /></button></div></td>
            </tr>))}
        </tbody></table></div>)}
    </div>
  </>);
}
