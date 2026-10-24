'use client';
/* Laporan cuti per pegawai: jatah, terpakai, sisa, dan tanggal cuti yang diambil */
import { useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcelBanyak } from '@/lib/klien/excel';
import { rentangTgl } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function LaporanCuti() {
  const { bukaSheet, tutupSheet, galat } = useAplikasi();
  const thIni = new Date().getFullYear();
  const [tahun, setTahun] = useState(thIni), [cari, setCari] = useState('');
  const [list, setList] = useState<HalamanData<Data> | null>(null), [page, setPage] = useState(1);
  useEffect(() => { setList(null); api<HalamanData<Data>>('lap_cuti', { tahun, search: cari, page }).then(setList).catch(galat); }, [tahun, cari, page, galat]);
  const tampil = list?.items ?? [];
  const rincian = (u: Data) => bukaSheet(<>
    <h3><Ikon n="plane" />{u.nama}</h3><div className="tiny muted">{u.nik} · {u.divisi || '-'} · tahun {tahun}</div>
    <div className="statgrid g3">
      <div className="stat"><div className="k">Jatah</div><div className="v">{u.berhak ? u.jatah : '—'}</div></div>
      <div className="stat"><div className="k">Terpakai</div><div className="v">{u.terpakai}</div></div>
      <div className="stat"><div className="k">Sisa</div><div className="v" style={{ color: 'var(--success)' }}>{u.berhak ? u.sisa : '—'}</div></div></div>
    <div className="judul-seksi" style={{ marginTop: 18 }}>Cuti yang diambil</div>
    {u.cuti.length ? u.cuti.map((c: Data, i: number) => (
      <div key={i} className="item"><div className="top"><div><div className="nm">{c.jenis}</div><div className="dt">{rentangTgl(c.mulai, c.selesai)}</div></div>
        <span className="badge b-purple">{c.hari} hari</span></div>{c.alasan && <div className="tiny muted" style={{ marginTop: 4 }}>{c.alasan}</div>}</div>))
      : <div className="empty">Belum ada cuti yang disetujui.</div>}
    <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
  </>);
  const ekspor = async () => {
    try { const semua = await api<Data[]>('lap_cuti', { tahun, search: cari, all: true }); return await keExcelBanyak([
    ['Ringkasan', semua.map((u) => ({ NIK: u.nik, Nama: u.nama, Divisi: u.divisi, Jabatan: u.jabatan, 'Jatah Cuti': u.berhak ? u.jatah : 'belum berhak',
      Terpakai: u.terpakai, Menunggu: u.menunggu, Sisa: u.berhak ? u.sisa : '', 'Sakit (hari)': u.sakit, 'Izin (hari)': u.izin, 'Izin ½ Hari': u.setengahHari,
      'WFH (hari)': u.wfh, 'Dinas Luar Kota (hari)': u.dlk }))],
    ['Rincian Tanggal', semua.flatMap((u) => u.cuti.map((c: Data) => ({ NIK: u.nik, Nama: u.nama, Divisi: u.divisi, Jenis: c.jenis, Mulai: c.mulai,
      Selesai: c.selesai, 'Jumlah Hari': c.hari, Alasan: c.alasan })))],
  ], 'laporan-cuti-' + tahun); } catch (e) { galat(e); }
  };

  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="plane" />Cuti per Pegawai</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 'auto' }} value={tahun} onChange={(e) => { setTahun(+e.target.value); setPage(1); }}>{[-1, 0, 1].map((x) => <option key={x}>{thIni + x}</option>)}</select>
          <input placeholder="Cari nama / NIK / divisi" style={{ width: 220 }} value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} />
          <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      {!list ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : tampil.length ? (
        <div className="tblwrap"><table><thead><tr><th>NIK</th><th>Nama</th><th>Divisi</th><th className="r">Jatah</th><th className="r">Terpakai</th><th className="r">Menunggu</th>
          <th className="r">Sisa</th><th className="r">Sakit</th><th className="r">Izin</th><th className="r">½ Hari</th><th className="r">WFH</th><th className="r">Dinas</th><th /></tr></thead><tbody>
          {tampil.map((u) => (
            <tr key={u.userId}><td>{u.nik}</td><td><b>{u.nama}</b></td><td>{u.divisi || '-'}</td>
              <td className="r">{u.berhak ? u.jatah : <span className="tiny muted">belum berhak</span>}</td><td className="r">{u.terpakai}</td><td className="r">{u.menunggu || '-'}</td>
              <td className="r"><b style={{ color: u.sisa > 0 ? 'var(--success)' : 'var(--muted)' }}>{u.berhak ? u.sisa : '-'}</b></td>
              <td className="r">{u.sakit || '-'}</td><td className="r">{u.izin || '-'}</td><td className="r">{u.setengahHari || '-'}</td><td className="r">{u.wfh || '-'}</td><td className="r">{u.dlk || '-'}</td>
              <td><button className="btn ghost sm auto" onClick={() => rincian(u)}>Rincian</button></td></tr>))}
        </tbody></table></div>) : <div className="empty"><Ikon n="inbox" />Tidak ada data.</div>}
      {list && <NavigasiHalaman page={list.page} total={list.total} totalPages={list.totalPages} ubah={setPage} />}
    </div>
  );
}
