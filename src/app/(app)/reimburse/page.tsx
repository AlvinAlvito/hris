'use client';
/* Reimburse (HC): verifikasi, persetujuan pembayaran, tandai transfer, ekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { ItemReimburse } from '@/components/Keuangan';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { rupiah, teksStatus, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const OPSI = ['Menunggu HR', 'Menunggu Finance', 'Disetujui', 'Dibayar', 'Ditolak HR', 'Ditolak Finance', 'ALL'];

export default function ReimburseAdmin() {
  const { galat } = useAplikasi();
  const [semua, setSemua] = useState<Data[] | null>(null), [f, setF] = useState('Menunggu HR');
  const muat = useCallback(() => { api<Data[]>('rb_daftar', { status: 'ALL' }, true).then(setSemua).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const dg = (st: string) => (semua ?? []).filter((r) => r.status === st);
  const tot = (l: Data[]) => l.reduce((a, r) => a + (r.nominalDisetujui || r.nominal), 0);
  const bln = todayStr().slice(0, 7);
  const kpi: [string, string, string | number, string][] = [['hourglass', 'Menunggu verifikasi', dg('Menunggu HR').length, 'c-amber'],
    ['badge-check', 'Menunggu persetujuan bayar', dg('Menunggu Finance').length, ''], ['banknote', 'Siap dibayar', rupiah(tot(dg('Disetujui'))), 'c-cyan'],
    ['circle-check', 'Dibayar bulan ini', rupiah(tot((semua ?? []).filter((r) => r.status === 'Dibayar' && String(r.tglBayar).startsWith(bln)))), 'c-green']];
  const ekspor = () => keExcel((semua ?? []).map((r) => ({
    No: r.id, NIK: r.nik, Nama: r.nama, Kategori: r.kategori, Kegiatan: r.kegiatan, 'Tanggal Transaksi': r.tanggal, 'Nominal Diajukan': r.nominal,
    'Nominal Disetujui': r.nominalDisetujui ?? '', Keterangan: r.keterangan, Status: r.status, 'Diverifikasi Oleh': r.hrOleh, 'Catatan Verifikasi': r.hrCatatan,
    'Disetujui Oleh': r.finOleh, 'Catatan Persetujuan': r.finCatatan, 'Metode Bayar': r.metodeBayar, 'Periode Gaji': r.periodeGaji || '', 'Tanggal Bayar': r.tglBayar || '',
    Bank: r.bankNama, Rekening: r.bankRekening, 'Atas Nama': r.bankAtasNama, 'Jumlah Bukti': r.bukti.length, 'Tanggal Ajukan': String(r.tglAjukan).slice(0, 10) })),
  'Reimburse', 'reimburse-' + todayStr());
  const tampil = f === 'ALL' ? semua ?? [] : dg(f);
  return (<>
    <div className="kpis" style={{ marginTop: 0 }}>{kpi.map(([ic, k, v, w]) => <div key={k} className={'kpi ' + w}><div className="ico"><Ikon n={ic} /></div><div className="v">{semua ? v : '…'}</div><div className="k">{k}</div></div>)}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="receipt" />Klaim Reimburse</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 'auto' }} value={f} onChange={(e) => setF(e.target.value)}>{OPSI.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua status' : teksStatus(o)}</option>)}</select>
          <button className="btn ghost sm auto" disabled={!semua?.length} onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      {!semua ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : tampil.length ? tampil.map((r) => <ItemReimburse key={r.id} r={r} admin segarkan={muat} />)
        : <div className="empty"><Ikon n="inbox" />Tidak ada klaim pada status ini.</div>}
    </div>
  </>);
}
