'use client';
/* Laporan lembur per pegawai dari pengajuan lembur: HC melihat semua, Supervisor hanya timnya */
import { useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcelBanyak } from '@/lib/klien/excel';
import { jamKerjaTeks, NAMA_HARI, teksStatus, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
type Hasil = HalamanData<Data> & { ringkas: { orang: number; menitDisetujui: number; menitMenunggu: number; jumlahMenunggu: number } };
const hari = (t: string) => NAMA_HARI[new Date(t + 'T00:00:00').getDay()];
const JENIS_HARI: Record<string, [string, string]> = { biasa: ['Hari biasa', 'b-gray'], sabtu: ['Sabtu', 'b-purple'], minggu: ['Minggu', 'b-red'], libur: ['Libur nasional', 'b-red'] };
const jamDes = (m: number) => +(m / 60).toFixed(2);
const warna = (st: string) => (st === 'Disetujui' ? 'b-green' : /^Menunggu/.test(st) ? 'b-amber' : 'b-red');

export default function LaporanLembur() {
  const { bukaSheet, tutupSheet, galat } = useAplikasi();
  const kini = todayStr();
  const [dari, setDari] = useState(kini.slice(0, 8) + '01'), [sampai, setSampai] = useState(kini), [cari, setCari] = useState('');
  const [list, setList] = useState<Hasil | null>(null), [page, setPage] = useState(1);
  useEffect(() => { setList(null); api<Hasil>('lap_lembur', { dari, sampai, search: cari, page }).then(setList).catch(galat); }, [dari, sampai, cari, page, galat]);
  const tampil = list?.items ?? [];
  const rincian = (u: Data) => bukaSheet(<>
    <h3><Ikon n="clock" />{u.nama}</h3><div className="tiny muted">{u.nik} · {u.divisi || '-'} · {tglPendek(dari)} – {tglPendek(sampai)}</div>
    {u.rincian.map((r: Data, i: number) => (
      <div key={i} className="item"><div className="top"><div><div className="nm">{hari(r.tanggal)}, {tglPendek(r.tanggal)} · {r.jamMulai}–{r.jamSelesai}</div><div className="dt">{jamKerjaTeks(r.menit)}{r.approver && ' · ' + r.approver}</div>
          {r.jenisHari !== 'biasa' && <span className={'badge ' + JENIS_HARI[r.jenisHari][1]} style={{ marginTop: 4 }}>{r.namaLibur || JENIS_HARI[r.jenisHari][0]}</span>}</div>
        <span className={'badge ' + warna(r.status)}>{teksStatus(r.status)}</span></div>{r.alasan && <div className="tiny muted" style={{ marginTop: 4 }}>{r.alasan}</div>}</div>))}
    <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
  </>);
  const ekspor = async () => {
    try {
      const semua = await api<Data[]>('lap_lembur', { dari, sampai, search: cari, all: true });
      return await keExcelBanyak([
        ['Ringkasan', semua.map((u) => ({ NIK: u.nik, Nama: u.nama, Divisi: u.divisi, Jabatan: u.jabatan, 'Lembur Disetujui (jam)': jamDes(u.menitDisetujui), 'Hari Biasa (jam)': jamDes(u.menitPerHari.biasa), 'Sabtu (jam)': jamDes(u.menitPerHari.sabtu),
          'Minggu (jam)': jamDes(u.menitPerHari.minggu), 'Libur Nasional (jam)': jamDes(u.menitPerHari.libur), 'Jumlah Disetujui': u.jumlahDisetujui,
          'Menunggu (jam)': +(u.menitMenunggu / 60).toFixed(2), 'Jumlah Menunggu': u.jumlahMenunggu, 'Jumlah Ditolak': u.jumlahDitolak }))],
        ['Rincian', semua.flatMap((u) => u.rincian.map((r: Data) => ({ NIK: u.nik, Nama: u.nama, Divisi: u.divisi, Hari: hari(r.tanggal), Tanggal: r.tanggal,
          'Jenis Hari': r.namaLibur ? `Libur nasional (${r.namaLibur})` : JENIS_HARI[r.jenisHari][0], Mulai: r.jamMulai, Selesai: r.jamSelesai,
          'Durasi (jam)': +(r.menit / 60).toFixed(2), Alasan: r.alasan, Status: teksStatus(r.status), 'Diputus Oleh': r.approver })))],
      ], `laporan-lembur-${dari}-${sampai}`);
    } catch (e) { galat(e); }
  };

  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="clock" />Lembur per Pegawai</h3>
        <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div>
      <div className="lap-filter">
        <div><label style={{ marginTop: 0 }}>Dari tanggal</label><input type="date" value={dari} onChange={(e) => { if (e.target.value) { setDari(e.target.value); setPage(1); } }} /></div>
        <div><label style={{ marginTop: 0 }}>Sampai tanggal</label><input type="date" value={sampai} onChange={(e) => { if (e.target.value) { setSampai(e.target.value); setPage(1); } }} /></div>
        <div><label style={{ marginTop: 0 }}>Cari</label><input placeholder="Nama / NIK / divisi" value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} /></div>
      </div>
      {list && <div className="statgrid g3">
        <div className="stat"><div className="k">Karyawan lembur</div><div className="v">{list.ringkas.orang}</div></div>
        <div className="stat"><div className="k">Total disetujui</div><div className="v">{jamKerjaTeks(list.ringkas.menitDisetujui)}</div></div>
        <div className="stat"><div className="k">Menunggu ({list.ringkas.jumlahMenunggu})</div><div className="v">{jamKerjaTeks(list.ringkas.menitMenunggu)}</div></div></div>}
      {!list ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : tampil.length ? (
        <div className="tblwrap"><table><thead><tr><th>NIK</th><th>Nama</th><th>Divisi</th><th className="r">Disetujui</th><th className="r">Hari biasa</th><th className="r">Sabtu</th><th className="r">Minggu & libur</th><th className="r">Menunggu</th><th className="r">Ditolak</th><th /></tr></thead><tbody>
          {tampil.map((u) => (
            <tr key={u.userId}><td>{u.nik}</td><td><b>{u.nama}</b></td><td>{u.divisi || '-'}</td>
              <td className="r"><b>{jamKerjaTeks(u.menitDisetujui)}</b> <span className="tiny muted">({u.jumlahDisetujui}x)</span></td>
              <td className="r">{u.menitPerHari.biasa ? jamKerjaTeks(u.menitPerHari.biasa) : '-'}</td><td className="r">{u.menitPerHari.sabtu ? jamKerjaTeks(u.menitPerHari.sabtu) : '-'}</td>
              <td className="r">{u.menitPerHari.minggu + u.menitPerHari.libur ? jamKerjaTeks(u.menitPerHari.minggu + u.menitPerHari.libur) : '-'}</td>
              <td className="r">{u.jumlahMenunggu ? <>{jamKerjaTeks(u.menitMenunggu)} <span className="tiny muted">({u.jumlahMenunggu}x)</span></> : '-'}</td>
              <td className="r">{u.jumlahDitolak || '-'}</td>
              <td><button className="btn ghost sm auto" onClick={() => rincian(u)}>Rincian</button></td></tr>))}
        </tbody></table></div>) : <div className="empty"><Ikon n="inbox" />Tidak ada pengajuan lembur pada periode ini.</div>}
      {list && <NavigasiHalaman page={list.page} total={list.total} totalPages={list.totalPages} ubah={setPage} />}
    </div>
  );
}
