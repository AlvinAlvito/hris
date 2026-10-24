'use client';
/* Pengajuan cuti seluruh pegawai — diputus HC (bukan pengajuan sendiri) */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const WARNA: Record<string, string> = { Disetujui: 'b-green', Ditolak: 'b-red', Dibatalkan: 'b-gray', Menunggu: 'b-amber' };

export default function CutiHC() {
  const { me, tanya, toast, galat, muatInbox } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu');
  const [list, setList] = useState<Data[] | null>(null);
  const muat = useCallback(() => { setList(null); api<Data[]>('adm_cuti', { status: filter }).then(setList).catch(galat); }, [filter, galat]);
  useEffect(() => { muat(); }, [muat]);
  const putus = async (id: number, st: 'Disetujui' | 'Ditolak') => {
    const cat = await tanya((st === 'Disetujui' ? 'Catatan persetujuan' : 'Alasan penolakan') + ' (opsional):', '', { judul: st === 'Disetujui' ? 'Setujui cuti' : 'Tolak cuti' });
    if (cat === null) return;
    api<{ pesan: string }>('adm_cuti_putus', { id, status: st, catatan: cat }).then((r) => { toast(r.pesan); muat(); muatInbox(); }).catch(galat);
  };
  const ekspor = () => api<Data[]>('adm_cuti', { status: 'ALL' }).then((l) => keExcel(l.map((c) => ({ NIK: c.nik, Nama: c.nama, Divisi: c.dept, Jenis: c.jenis,
    Mulai: c.mulai, Selesai: c.selesai, 'Jumlah Hari': c.hari, Alasan: c.alasan, Status: c.status, 'Diputus Oleh': c.approver, Catatan: c.catatan || '',
    'Tanggal Ajukan': String(c.tglAjukan).slice(0, 10) })), 'Cuti', 'pengajuan-cuti-' + todayStr())).catch(galat);
  return (
    <div className="card sempit">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="plane" />Pengajuan Cuti</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['Menunggu', 'Disetujui', 'Ditolak', 'ALL'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'Semua status' : s}</option>)}</select>
          <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? list.map((c) => (
        <div key={c.id} className="item">
          <div className="top"><div><div className="nm">{c.nama} <span className="tiny muted">({c.nik}{c.role === 'admin' && ' · HC'})</span></div>
            <div className="dt">{c.jenis} · {tglPendek(c.mulai)} – {tglPendek(c.selesai)} · <b>{c.hari} hari</b></div></div>
            <span className={'badge ' + (WARNA[c.status] ?? 'b-gray')}>{c.status}</span></div>
          <div className="sep" style={{ margin: '8px 0' }} />
          <div className="kv"><span>Alasan</span><span style={{ textAlign: 'right' }}>{c.alasan}</span></div>
          {c.sisaPemohon != null && <div className="kv"><span>Sisa cuti tahunan</span><span><b>{c.sisaPemohon} hari</b></span></div>}
          <div className="kv"><span>Diajukan</span><span>{tglPendek(c.tglAjukan)}</span></div>
          {c.approver && <div className="kv"><span>Diputus oleh</span><span>{c.approver}</span></div>}
          {c.catatan && <div className="kv"><span>Catatan</span><span style={{ textAlign: 'right' }}>{c.catatan}</span></div>}
          {c.status === 'Menunggu' && (c.userId === me?.id
            ? <div className="warn" style={{ marginTop: 9 }}>Pengajuan Anda sendiri — diputus HC lain atau Super Admin.</div>
            : <div className="row" style={{ marginTop: 9 }}>
              <button className="btn sm green" onClick={() => putus(c.id, 'Disetujui')}><Ikon n="check" />Setujui</button>
              <button className="btn sm red" onClick={() => putus(c.id, 'Ditolak')}><Ikon n="x" />Tolak</button></div>)}
        </div>)) : <div className="empty">Tidak ada pengajuan pada filter ini.</div>}
    </div>
  );
}
