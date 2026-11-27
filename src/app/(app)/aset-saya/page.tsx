'use client';
/* Aset Saya: karyawan mencatat sendiri aset kantor yang ia pegang (jenis, merk/tipe, sejak kapan). HC memverifikasi di menu Aset. */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { FormAset, FormKembali, LABEL_KONDISI, WARNA_KONDISI, type AsetBarang } from '@/components/FormAset';
import { api } from '@/lib/klien/api';
import { tglIndo } from '@/lib/klien/format';

type Data = { barang: AsetBarang[]; kendaraan: { id: number; jenis: string; brand: string; merk: string; plat: string; tahun: number | null }[]; jenis: string[] };

export default function AsetSaya() {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<Data | null>(null);
  const muat = useCallback(() => { api<Data>('asb_saya', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = (a: AsetBarang | null) => d && bukaSheet(<FormAset a={a} jenis={d.jenis} selesai={muat} />);
  const hapus = async (a: AsetBarang) => {
    if (!(await yakin(`Hapus ${a.jenis} ${a.tipe}?`, 'Gunakan hapus hanya untuk data yang salah input. Bila aset dikembalikan, pilih "Dikembalikan".', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('asb_hapus', { id: a.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  if (!d) return <div className="card"><div className="skel" style={{ height: 200 }} /></div>;
  const dipegang = d.barang.filter((x) => x.status === 'dipegang'), kembali = d.barang.filter((x) => x.status === 'dikembalikan');
  return (<>
    <div className="card kp-pilih-bulan">
      <div><h3 style={{ margin: 0 }}><Ikon n="briefcase" />Aset Saya</h3>
        <div className="tiny muted">Catat aset kantor yang Anda pegang (laptop, HP, monitor, dll.). Data diperiksa HC.</div></div>
      <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Tambah Aset</button>
    </div>
    {d.kendaraan.length > 0 && <div className="card"><h3><Ikon n="car" />Kendaraan yang Anda pegang</h3>
      {d.kendaraan.map((k) => <div key={k.id} className="kv"><span>{k.jenis === 'mobil' ? 'Mobil' : 'Motor'} {k.brand} {k.merk}{k.tahun ? ` (${k.tahun})` : ''}</span><b>{k.plat}</b></div>)}
      <div className="tiny muted" style={{ marginTop: 6 }}>Data kendaraan dikelola HC.</div></div>}
    {!dipegang.length ? <div className="card"><div className="empty"><Ikon n="briefcase" />Belum ada aset yang Anda catat.
      <div style={{ marginTop: 10 }}><button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Tambah Aset</button></div></div></div>
      : <div className="as-daftar">{dipegang.map((a) => (
        <div key={a.id} className="card as-item">
          <div className="as-atas"><div><b>{a.jenis}</b><div>{a.tipe}</div></div>
            {a.diverifikasi ? <span className="badge b-green"><Ikon n="badge-check" />Terverifikasi</span> : <span className="badge b-gray">Menunggu verifikasi HC</span>}</div>
          <div className="rk-meta tiny"><span><Ikon n="calendar" />Sejak {a.sejak ? tglIndo(a.sejak) : '—'}</span><span className={'badge ' + WARNA_KONDISI[a.kondisi]}>{LABEL_KONDISI[a.kondisi]}</span>
            {a.nomorSeri && <span>SN/Kode: {a.nomorSeri}</span>}</div>
          {a.keterangan && <div className="tiny muted" style={{ marginTop: 4 }}>{a.keterangan}</div>}
          <div className="rk-lw-aksi" style={{ marginTop: 10 }}>
            <button className="btn ghost sm auto" onClick={() => form(a)}><Ikon n="pencil" />Ubah</button>
            <button className="btn ghost sm auto" onClick={() => bukaSheet(<FormKembali a={a} selesai={muat} />)}><Ikon n="undo-2" />Dikembalikan</button>
            {!a.diverifikasi && <button className="btn ghost sm auto" onClick={() => hapus(a)} aria-label="Hapus"><Ikon n="trash-2" /></button>}
          </div>
        </div>))}</div>}
    {kembali.length > 0 && <div className="card"><h3><Ikon n="history" />Riwayat aset yang sudah dikembalikan</h3>
      {kembali.map((a) => <div key={a.id} className="kv"><span>{a.jenis} · {a.tipe}</span><span className="tiny muted">{a.sejak ? tglIndo(a.sejak) : '?'} – {a.tglKembali ? tglIndo(a.tglKembali) : '?'}</span></div>)}</div>}
  </>);
}
