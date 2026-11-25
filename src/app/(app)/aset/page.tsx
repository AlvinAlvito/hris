'use client';
/* Aset: kendaraan operasional (motor / mobil) dan jatuh tempo pajaknya — HC & Super Admin.
   Pengingat otomatis H-30, H-7, dan hari jatuh tempo dikirim ke HC & Super Admin. */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { tglIndo, todayStr } from '@/lib/klien/format';

type Kendaraan = { id: number; jenis: 'motor' | 'mobil'; brand: string; merk: string; tahun: number | null; plat: string; tglPajak: string | null; sisaHari: number | null;
  tglStnk: string | null; sisaHariStnk: number | null; keterangan: string };
type Data = { kendaraan: Kendaraan[]; ringkas: { mobil: number; motor: number; segera: number; lewat: number } };

/* status jatuh tempo: merah = lewat / hari ini, kuning = ≤30 hari, hijau = aman */
function StatusTempo({ sisa }: { sisa: number | null }) {
  if (sisa == null) return <span className="badge b-gray">belum diisi</span>;
  if (sisa < 0) return <span className="badge b-red">Lewat {-sisa} hari</span>;
  if (sisa === 0) return <span className="badge b-red">Hari ini</span>;
  if (sisa <= 30) return <span className="badge b-amber">{sisa} hari lagi</span>;
  return <span className="badge b-green">{sisa} hari lagi</span>;
}
const tglPendekId = (t: string) => t.split('-').reverse().join('/');

export default function Aset() {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<Data | null>(null), [filter, setFilter] = useState<'' | 'mobil' | 'motor'>(''), [cari, setCari] = useState('');
  const muat = useCallback(() => { api<Data>('aset_kendaraan_daftar', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = (k: Kendaraan | null, jenis?: 'motor' | 'mobil') => bukaSheet(<FormKendaraan k={k} jenisAwal={jenis ?? (filter || undefined)} selesai={muat} />);
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
    'Sisa Hari STNK': k.sisaHariStnk ?? '', Keterangan: k.keterangan })), 'Kendaraan', 'aset-kendaraan-' + todayStr()).catch(galat);

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
                <div><b>{k.brand} {k.merk}</b><div className="tiny muted">{k.jenis === 'mobil' ? 'Mobil' : 'Motor'}{k.keterangan && ' · ' + k.keterangan}</div></div></div></td>
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

function FormKendaraan({ k, jenisAwal, selesai }: { k: Kendaraan | null; jenisAwal?: 'motor' | 'mobil'; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState({ jenis: k?.jenis ?? jenisAwal ?? '', brand: k?.brand ?? '', merk: k?.merk ?? '', tahun: k?.tahun ? String(k.tahun) : '', plat: k?.plat ?? '',
    tglPajak: k?.tglPajak ?? '', tglStnk: k?.tglStnk ?? '', keterangan: k?.keterangan ?? '' });
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
    <label>Keterangan</label><input value={v.keterangan} onChange={set('keterangan')} placeholder="opsional, mis. dipakai tim Operasional / warna putih" />
    <button className="btn" style={{ marginTop: 14 }} disabled={kirim} onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
