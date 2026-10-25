'use client';
/* Ringkasan absensi satu hari: persentase hadir, komposisi status, sebaran jam masuk, per divisi,
   daftar terlambat & yang belum hadir. Dipakai di Rekap Absensi (HC, Super Admin, Supervisor). */
import { useEffect, useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, tglIndo } from '@/lib/klien/format';

type Data = Record<string, any>;
export type FilterRingkasan = { approval?: string; kategori?: string };

const LABEL_STATUS: Record<string, string> = { belum: 'Belum absen', mangkir: 'Tidak hadir', cuti: 'Cuti', ket: 'Izin' };
const WARNA_STATUS: Record<string, string> = { belum: 'b-gray', mangkir: 'b-red', cuti: 'b-blue', ket: 'b-purple' };

export function RingkasanAbsensi({ tanggal, cabangId, filter, setFilter, segar }: {
  tanggal: string; cabangId: number; filter: FilterRingkasan; setFilter: (f: FilterRingkasan) => void; segar: number;
}) {
  const { settings, galat } = useAplikasi();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { setD(null); api<Data>('abs_ringkasan', { tanggal, cabangId }, true).then(setD).catch(galat); }, [tanggal, cabangId, segar, galat]);
  if (!d) return <div className="card"><div className="skel" style={{ height: 220 }} /></div>;

  const r = d.ringkas, wajib = Math.max(1, d.wajib);
  const persen = (n: number) => Math.round((n / wajib) * 100);
  const kartu: [string, string, string, number, string, FilterRingkasan | null][] = [
    ['circle-check', 'Tepat waktu', 'hijau', r.hadir, `${persen(r.hadir)}% dari wajib hadir`, null],
    ['alarm-clock', 'Terlambat', 'kuning', r.telat, `total ${jamKerjaTeks(r.totalMenitTelat)}`, { kategori: 'telat' }],
    ['timer', 'Setengah hari', 'merah', r.setengah, 'tanpa izin → potong ½ hari', null],
    ['file-heart', 'Izin / sakit', 'ungu', r.ket, 'disetujui', null],
    ['plane', 'Cuti', 'biru', r.cuti, 'disetujui', null],
    ['house', 'WFH / dinas', 'biru', r.wfh, 'absen di luar kantor', null],
    ['user-x', 'Belum / tidak hadir', 'merah', r.belum + r.mangkir, r.mangkir ? `${r.mangkir} tidak hadir` : 'belum clock in', null],
    ['hourglass', 'Menunggu approval', 'abu', r.menunggu, r.ditolak ? `${r.ditolak} ditolak` : 'klik untuk menyaring', { approval: 'menunggu' }],
  ];
  const aktif = (f: FilterRingkasan | null) => !!f && Object.entries(f).every(([k, v]) => (filter as Data)[k] === v);
  // slot jam masuk setelah jam masuk + toleransi diwarnai sebagai terlambat
  const batas = d.jamKerja ? (() => { const [h, m] = d.jamKerja[0].split(':').map(Number); return h * 60 + m + (+settings.toleransi || 0); })() : null;
  const maksSlot = Math.max(1, ...d.sebaranMasuk.map((x: Data) => x.jumlah));
  const maksTelat = Math.max(1, ...d.terlambat.map((x: Data) => x.menitTelat));

  const ekspor = () => keExcel([
    ...d.terlambat.map((x: Data) => ({ Status: 'Terlambat', NIK: x.nik, Nama: x.nama, Divisi: x.dept, 'Jam Masuk': x.inTime, Jadwal: x.jadwalIn,
      'Menit Terlambat': x.menitTelat, Keterangan: x.diizinkan ? 'Izin terlambat disetujui' : '' })),
    ...d.tidakHadir.map((x: Data) => ({ Status: LABEL_STATUS[x.status] ?? x.status, NIK: x.nik, Nama: x.nama, Divisi: x.dept, 'Jam Masuk': '', Jadwal: '',
      'Menit Terlambat': '', Keterangan: x.ket })),
  ], 'Ringkasan', `ringkasan-absensi-${d.tanggal}`).catch(galat);

  return (<>
    <div className="card">
      <div className="ra-hero">
        <div className="ra-cincin" style={{ ['--p' as string]: d.persenHadir }}><div><b>{d.persenHadir}%</b><span>hadir</span></div></div>
        <div style={{ minWidth: 0 }}>
          <div className="ra-judul"><h3><Ikon n="chart-pie" />Ringkasan Absensi</h3><span className="muted small">{tglIndo(d.tanggal)}</span></div>
          <div style={{ fontSize: 15, marginTop: 6 }}><b>{d.hadir}</b> dari <b>{d.wajib}</b> karyawan wajib hadir sudah masuk
            {d.totalKaryawan > d.wajib && <span className="muted"> · {d.totalKaryawan - d.wajib} libur</span>}</div>
          <div className="row ra-lencana" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="badge b-gray"><Ikon n="clock" />{d.jamKerja ? `Jam kerja ${d.jamKerja[0]}–${d.jamKerja[1]}` : 'Hari libur mingguan'}</span>
            {d.rataMasuk && <span className="badge b-blue"><Ikon n="log-in" />Rata-rata masuk {d.rataMasuk}</span>}
            {r.luarArea > 0 && <span className="badge b-amber"><Ikon n="map-pin" />{r.luarArea} absen di luar area</span>}
            <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Unduh ringkasan</button>
          </div>
        </div>
      </div>
      <div className="ra-kpis">
        {kartu.map(([ic, judul, warna, n, ket, f]) => (
          <button key={judul} type="button" className={'ra-k ' + warna + (aktif(f) ? ' on' : '')} disabled={!f}
            onClick={() => f && setFilter(aktif(f) ? {} : f)} style={!f ? { cursor: 'default', transform: 'none' } : undefined}>
            <div className="t"><Ikon n={ic} />{judul}</div>
            <div className="v">{n}</div>
            <div className="tiny muted">{ket}</div>
            <div className="bar"><i style={{ width: `${Math.min(100, persen(n))}%` }} /></div>
          </button>))}
      </div>
    </div>

    <div className="ra-grid">
      <div className="card"><h3><Ikon n="log-in" />Sebaran Jam Masuk</h3>
        {d.sebaranMasuk.length ? (<>
          <div className="ra-sebaran">
            {d.sebaranMasuk.map((x: Data) => {
              const [h, m] = x.jam.split(':').map(Number), telat = batas !== null && h * 60 + m + 29 > batas;
              return (<div key={x.jam} className="kol" title={`${x.jam}: ${x.jumlah} orang`}>
                <div className={'btg' + (telat ? ' telat' : '')} style={{ height: `${(x.jumlah / maksSlot) * 100}%` }}><em>{x.jumlah}</em></div>
                <small>{x.jam}</small></div>);
            })}
          </div>
          <div className="ra-legenda"><span style={{ ['--c' as string]: 'var(--sky)' }}>Tepat waktu</span><span style={{ ['--c' as string]: 'var(--danger)' }}>Mendekati / lewat batas telat</span></div>
        </>) : <div className="empty">Belum ada yang clock in.</div>}
      </div>
      <div className="card"><h3><Ikon n="building-2" />Kehadiran per Divisi</h3>
        {d.perDivisi.length ? (<>
          <div className="ra-div ra-gulir">
            {d.perDivisi.map((x: Data) => {
              const tepat = x.hadir - x.telat, p = (n: number) => `${(n / Math.max(1, x.total)) * 100}%`;
              return (<div key={x.nama}>
                <div className="nm"><b>{x.nama}</b><span className="muted">{x.hadir}/{x.total} hadir{x.telat ? ` · ${x.telat} telat` : ''}</span></div>
                <div className="tumpuk"><i style={{ width: p(tepat), background: 'var(--success)' }} /><i style={{ width: p(x.telat), background: 'var(--warning)' }} />
                  <i style={{ width: p(x.tidak), background: 'var(--danger)' }} /></div>
              </div>);
            })}
          </div>
          <div className="ra-legenda" style={{ marginTop: 10 }}><span style={{ ['--c' as string]: 'var(--success)' }}>Tepat waktu</span>
            <span style={{ ['--c' as string]: 'var(--warning)' }}>Terlambat</span><span style={{ ['--c' as string]: 'var(--danger)' }}>Belum / tidak hadir</span>
            <span style={{ ['--c' as string]: 'var(--surface-3)' }}>Izin / cuti</span></div>
        </>) : <div className="empty">Tidak ada karyawan wajib hadir.</div>}
      </div>
    </div>

    <div className="ra-grid">
      <div className="card"><h3><Ikon n="alarm-clock" />Terlambat Hari Ini <span className="m">({d.terlambat.length})</span></h3>
        {d.terlambat.length ? <div className="ra-telat ra-gulir">{d.terlambat.map((x: Data) => (
          <div key={x.id} className="baris">
            <div style={{ minWidth: 0 }}><b>{x.nama}</b><div className="tiny muted">{x.dept || '-'} · masuk {x.inTime}{x.jadwalIn && ` (jadwal ${x.jadwalIn})`}</div></div>
            <div className="gar"><i style={{ width: `${(x.menitTelat / maksTelat) * 100}%` }} /></div>
            <span className={'badge ' + (x.diizinkan ? 'b-amber' : 'b-red')}>{x.menitTelat} menit{x.diizinkan && ' · izin'}</span>
          </div>))}</div> : <div className="empty"><Ikon n="circle-check" />Tidak ada yang terlambat.</div>}
      </div>
      <div className="card"><h3><Ikon n="user-x" />Belum Hadir, Izin & Cuti <span className="m">({d.tidakHadir.length})</span></h3>
        {d.tidakHadir.length ? <div className="ra-telat ra-gulir">{d.tidakHadir.map((x: Data) => (
          <div key={x.id} className="baris" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <div style={{ minWidth: 0 }}><b>{x.nama}</b><div className="tiny muted">{x.dept || '-'}{x.ket && ' · ' + x.ket}</div></div>
            <span className={'badge ' + (WARNA_STATUS[x.status] ?? 'b-gray')}>{LABEL_STATUS[x.status] ?? x.status}</span>
          </div>))}</div> : <div className="empty"><Ikon n="party-popper" />Semua karyawan wajib hadir sudah masuk.</div>}
      </div>
    </div>
  </>);
}
