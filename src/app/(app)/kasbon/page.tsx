'use client';
/* Kasbon (HC): verifikasi, pencairan, pelunasan manual, ekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { ItemKasbon } from '@/components/Keuangan';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { rupiah, teksStatus, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const OPSI = ['Menunggu HR', 'Menunggu Finance', 'Aktif', 'Lunas', 'Ditolak HR', 'Ditolak Finance', 'ALL'];

export default function KasbonAdmin() {
  const { galat } = useAplikasi();
  const [semua, setSemua] = useState<(HalamanData<Data> & { stats: Record<string, { jumlah: number; sisa: number }> }) | null>(null), [f, setF] = useState('Menunggu HR');
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const muat = useCallback(() => { setSemua(null); api<any>('ks_daftar', { status: f, page, search }, true).then(setSemua).catch(galat); }, [galat, f, page, search]);
  useEffect(() => { muat(); }, [muat]);
  const dg = (st: string) => semua?.stats?.[st] ?? { jumlah: 0, sisa: 0 };
  const kpi: [string, string, string | number, string][] = [['hourglass', 'Menunggu verifikasi', dg('Menunggu HR').jumlah, 'c-amber'],
    ['badge-check', 'Menunggu pencairan', dg('Menunggu Finance').jumlah, ''], ['wallet', 'Kasbon aktif', dg('Aktif').jumlah, 'c-cyan'],
    ['hand-coins', 'Total sisa pinjaman', rupiah(dg('Aktif').sisa), 'c-green']];
  const ekspor = () => api<Data[]>('ks_daftar', { status: 'ALL', all: true, search }).then((rows) => keExcel(rows.map((k) => ({
    No: k.id, NIK: k.nik, Nama: k.nama, Nominal: k.nominal, Tenor: k.tenor, Cicilan: k.cicilan, Terbayar: k.terbayar, Sisa: k.sisa, Status: k.status,
    Alasan: k.alasan, 'Diverifikasi Oleh': k.hrOleh, 'Dicairkan Oleh': k.finOleh, 'Tanggal Cair': k.tglCair || '', 'Mulai Potong': k.mulaiPotong || '',
    'Tanggal Ajukan': String(k.tglAjukan).slice(0, 10) })), 'Kasbon', 'kasbon-' + todayStr())).catch(galat);
  const tampil = semua?.items ?? [];
  return (<>
    <div className="kpis" style={{ marginTop: 0 }}>{kpi.map(([ic, k, v, w]) => <div key={k} className={'kpi ' + w}><div className="ico"><Ikon n={ic} /></div><div className="v">{semua ? v : '…'}</div><div className="k">{k}</div></div>)}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="hand-coins" />Kasbon Karyawan</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 'auto' }} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}>{OPSI.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua status' : teksStatus(o)}</option>)}</select>
          <button className="btn ghost sm auto" disabled={!semua?.total} onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      <label>Cari nama, NIK, atau alasan</label><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari kasbon..." />
      {!semua ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : tampil.length ? <>{tampil.map((k) => <ItemKasbon key={k.id} k={k} admin segarkan={muat} />)}
        <NavigasiHalaman page={semua.page} total={semua.total} totalPages={semua.totalPages} ubah={setPage} /></>
        : <div className="empty"><Ikon n="inbox" />Tidak ada kasbon pada status ini.</div>}
    </div>
  </>);
}
