'use client';
/* Laporan absensi per tanggal / rentang tanggal: status setiap pegawai, bisa difilter & diekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { geserTgl, jamKerjaTeks, tglIndo, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const KAT: [string, string, string][] = [['hadir', 'Hadir', 'circle-check'], ['telat', 'Terlambat', 'clock-alert'], ['wfh', 'WFH', 'house'],
  ['dlk', 'Dinas', 'map-pin'], ['cuti', 'Cuti', 'plane'], ['izin', 'Izin / Sakit', 'file-heart'], ['alpa', 'Tanpa Ket.', 'circle-x'], ['libur', 'Libur', 'coffee']];
const WARNA: Record<string, string> = { hadir: 'b-green', cuti: 'b-purple', izin: 'b-amber', libur: 'b-gray', alpa: 'b-red', belum: 'b-gray' };

export default function LaporanAbsensi() {
  const { galat } = useAplikasi();
  const [dari, setDari] = useState(todayStr()), [sampai, setSampai] = useState(todayStr());
  const [data, setData] = useState<Data | null>(null);
  const [kat, setKat] = useState(''), [cari, setCari] = useState('');
  const muat = useCallback((a: string, b: string) => {
    setData(null); setKat('');
    api<Data>('lap_harian', { dari: a, sampai: b || a }).then(setData).catch(galat);
  }, [galat]);
  useEffect(() => { muat(todayStr(), todayStr()); }, [muat]);
  const cepat = (p: string) => {
    const h = todayStr();
    const [a, b] = p === 'kemarin' ? [geserTgl(h, -1), geserTgl(h, -1)] : p === 'bulan' ? [h.slice(0, 8) + '01', h] : [h, h];
    setDari(a); setSampai(b); muat(a, b);
  };
  const q = cari.trim().toLowerCase();
  const baris = (data?.baris ?? []).filter((b: Data) => {
    if (q && !`${b.nama} ${b.nik} ${b.divisi}`.toLowerCase().includes(q)) return false;
    if (!kat) return true;
    if (kat === 'telat') return b.menitTelat > 0 && b.kategori === 'hadir';
    if (kat === 'wfh') return b.status === 'WFH';
    if (kat === 'dlk') return b.status === 'Dinas Luar Kota';
    return b.kategori === kat;
  });
  const banyakHari = data && data.dari !== data.sampai;
  const ekspor = () => keExcel(baris.map((b: Data) => ({ Tanggal: b.tanggal, NIK: b.nik, Nama: b.nama, Divisi: b.divisi, Jabatan: b.jabatan, Status: b.status,
    Masuk: b.masuk, Pulang: b.pulang, 'Telat (menit)': b.menitTelat, 'Jam Kerja': b.menitKerja ? jamKerjaTeks(b.menitKerja) : '', Catatan: b.catatan })),
  'Absensi', 'laporan-absensi-' + data?.dari + (banyakHari ? '_sd_' + data?.sampai : '')).catch(galat);

  return (<>
    <div className="card">
      <div className="lap-filter">
        <div><label style={{ marginTop: 0 }}>Dari</label><input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
        <div><label style={{ marginTop: 0 }}>Sampai</label><input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
        <button className="btn sm auto" onClick={() => muat(dari, sampai)}><Ikon n="search" />Tampilkan</button>
      </div>
      <div className="seg" style={{ marginTop: 12 }}>{[['hari', 'Hari ini'], ['kemarin', 'Kemarin'], ['bulan', 'Bulan ini']].map(([k, t]) =>
        <button key={k} onClick={() => cepat(k)}>{t}</button>)}</div>
    </div>
    <div className="kpis lap-kpi">{KAT.map(([k, t, ic]) => (
      <button key={k} className={'kpi lap-k' + (kat === k ? ' on' : '')} onClick={() => setKat(kat === k ? '' : k)}>
        <div className="ico"><Ikon n={ic} /></div><div className="v">{data?.ringkas[k] ?? 0}</div><div className="k">{t}</div></button>))}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="file-spreadsheet" />Absensi
        {data && <span className="m">{data.dari === data.sampai ? tglIndo(data.dari) : `${tglPendek(data.dari)} – ${tglPendek(data.sampai)}`}</span>}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Cari nama / NIK / divisi" style={{ width: 220 }} value={cari} onChange={(e) => setCari(e.target.value)} />
          <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
      {!data ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : baris.length ? (
        <div className="tblwrap"><table><thead><tr>{banyakHari && <th>Tanggal</th>}<th>NIK</th><th>Nama</th><th>Divisi</th><th>Status</th><th>Masuk</th>
          <th>Pulang</th><th className="r">Telat</th><th>Catatan</th></tr></thead><tbody>
          {baris.map((b: Data, i: number) => (
            <tr key={i}>{banyakHari && <td>{tglPendek(b.tanggal)}</td>}<td>{b.nik}</td><td><b>{b.nama}</b></td><td>{b.divisi || '-'}</td>
              <td><span className={'badge ' + (b.status === 'WFH' || b.status === 'Dinas Luar Kota' ? 'b-blue' : WARNA[b.kategori] ?? 'b-gray')}>{b.status}</span></td>
              <td className="num">{b.masuk || '-'}</td><td className="num">{b.pulang || '-'}</td>
              <td className="r num">{b.menitTelat ? <b style={{ color: 'var(--warning)' }}>{b.menitTelat} mnt</b> : '-'}</td>
              <td className="tiny muted" style={{ whiteSpace: 'normal', minWidth: 160 }}>{b.catatan}</td></tr>))}
        </tbody></table></div>) : <div className="empty"><Ikon n="inbox" />Tidak ada data.</div>}
    </div>
  </>);
}
