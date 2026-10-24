'use client';
/* Kasbon (HC): verifikasi, pencairan, pelunasan manual, ekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { ItemKasbon } from '@/components/Keuangan';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { rupiah, teksStatus, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const OPSI = ['Menunggu HR', 'Menunggu Finance', 'Aktif', 'Lunas', 'Ditolak HR', 'Ditolak Finance', 'ALL'];

export default function KasbonAdmin() {
  const { galat } = useAplikasi();
  const [semua, setSemua] = useState<Data[] | null>(null), [f, setF] = useState('Menunggu HR');
  const muat = useCallback(() => { api<Data[]>('ks_daftar', { status: 'ALL' }, true).then(setSemua).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const dg = (st: string) => (semua ?? []).filter((k) => k.status === st);
  const aktif = dg('Aktif');
  const kpi: [string, string, string | number, string][] = [['hourglass', 'Menunggu verifikasi', dg('Menunggu HR').length, 'c-amber'],
    ['badge-check', 'Menunggu pencairan', dg('Menunggu Finance').length, ''], ['wallet', 'Kasbon aktif', aktif.length, 'c-cyan'],
    ['hand-coins', 'Total sisa pinjaman', rupiah(aktif.reduce((a, k) => a + k.sisa, 0)), 'c-green']];
  const ekspor = () => keExcel((semua ?? []).map((k) => ({
    No: k.id, NIK: k.nik, Nama: k.nama, Nominal: k.nominal, Tenor: k.tenor, Cicilan: k.cicilan, Terbayar: k.terbayar, Sisa: k.sisa, Status: k.status,
    Alasan: k.alasan, 'Diverifikasi Oleh': k.hrOleh, 'Dicairkan Oleh': k.finOleh, 'Tanggal Cair': k.tglCair || '', 'Mulai Potong': k.mulaiPotong || '',
    'Tanggal Ajukan': String(k.tglAjukan).slice(0, 10) })), 'Kasbon', 'kasbon-' + todayStr());
  const tampil = f === 'ALL' ? semua ?? [] : dg(f);
  return (<>
    <div className="kpis" style={{ marginTop: 0 }}>{kpi.map(([ic, k, v, w]) => <div key={k} className={'kpi ' + w}><div className="ico"><Ikon n={ic} /></div><div className="v">{semua ? v : '…'}</div><div className="k">{k}</div></div>)}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="hand-coins" />Kasbon Karyawan</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 'auto' }} value={f} onChange={(e) => setF(e.target.value)}>{OPSI.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua status' : teksStatus(o)}</option>)}</select>
          <button className="btn ghost sm auto" disabled={!semua?.length} onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      {!semua ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : tampil.length ? tampil.map((k) => <ItemKasbon key={k.id} k={k} admin segarkan={muat} />)
        : <div className="empty"><Ikon n="inbox" />Tidak ada kasbon pada status ini.</div>}
    </div>
  </>);
}
