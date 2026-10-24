'use client';
/* Reimburse (HC): verifikasi, persetujuan pembayaran, tandai transfer, ekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { ItemReimburse } from '@/components/Keuangan';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { rupiah, teksStatus, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const OPSI = ['Menunggu HR', 'Menunggu Finance', 'Disetujui', 'Dibayar', 'Ditolak HR', 'Ditolak Finance', 'ALL'];

export default function ReimburseAdmin() {
  const { galat } = useAplikasi();
  const [semua, setSemua] = useState<(HalamanData<Data> & { stats: Record<string, { jumlah: number; nominal: number }> }) | null>(null), [f, setF] = useState('Menunggu HR');
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const muat = useCallback(() => { setSemua(null); api<any>('rb_daftar', { status: f, page, search }, true).then(setSemua).catch(galat); }, [galat, f, page, search]);
  useEffect(() => { muat(); }, [muat]);
  const dg = (st: string) => semua?.stats?.[st] ?? { jumlah: 0, nominal: 0 };
  const kpi: [string, string, string | number, string][] = [['hourglass', 'Menunggu verifikasi', dg('Menunggu HR').jumlah, 'c-amber'],
    ['badge-check', 'Menunggu persetujuan bayar', dg('Menunggu Finance').jumlah, ''], ['banknote', 'Siap dibayar', rupiah(dg('Disetujui').nominal), 'c-cyan'],
    ['circle-check', 'Total dibayar', rupiah(dg('Dibayar').nominal), 'c-green']];
  const ekspor = () => api<Data[]>('rb_daftar', { status: 'ALL', all: true, search }).then((rows) => keExcel(rows.map((r) => ({
    No: r.id, NIK: r.nik, Nama: r.nama, Kategori: r.kategori, Kegiatan: r.kegiatan, 'Tanggal Transaksi': r.tanggal, 'Nominal Diajukan': r.nominal,
    'Nominal Disetujui': r.nominalDisetujui ?? '', Keterangan: r.keterangan, Status: r.status, 'Diverifikasi Oleh': r.hrOleh, 'Catatan Verifikasi': r.hrCatatan,
    'Disetujui Oleh': r.finOleh, 'Catatan Persetujuan': r.finCatatan, 'Metode Bayar': r.metodeBayar, 'Periode Gaji': r.periodeGaji || '', 'Tanggal Bayar': r.tglBayar || '',
    Bank: r.bankNama, Rekening: r.bankRekening, 'Atas Nama': r.bankAtasNama, 'Jumlah Bukti': r.bukti.length, 'Tanggal Ajukan': String(r.tglAjukan).slice(0, 10) })),
  'Reimburse', 'reimburse-' + todayStr())).catch(galat);
  const tampil = semua?.items ?? [];
  return (<>
    <div className="kpis" style={{ marginTop: 0 }}>{kpi.map(([ic, k, v, w]) => <div key={k} className={'kpi ' + w}><div className="ico"><Ikon n={ic} /></div><div className="v">{semua ? v : '…'}</div><div className="k">{k}</div></div>)}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="receipt" />Klaim Reimburse</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 'auto' }} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}>{OPSI.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua status' : teksStatus(o)}</option>)}</select>
          <button className="btn ghost sm auto" disabled={!semua?.total} onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      <label>Cari nama, NIK, kategori, atau keterangan</label><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari klaim reimburse..." />
      {!semua ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : tampil.length ? <>{tampil.map((r) => <ItemReimburse key={r.id} r={r} admin segarkan={muat} />)}
        <NavigasiHalaman page={semua.page} total={semua.total} totalPages={semua.totalPages} ubah={setPage} /></>
        : <div className="empty"><Ikon n="inbox" />Tidak ada klaim pada status ini.</div>}
    </div>
  </>);
}
