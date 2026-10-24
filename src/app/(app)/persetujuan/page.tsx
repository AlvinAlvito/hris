'use client';
/* Satu pintu persetujuan HC: semua yang menunggu tindakan, dikelompokkan per jenis */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, teksStatus, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const TUJUAN: Record<string, string> = { cuti: '/cuti', rb_hr: '/reimburse', rb_fin: '/reimburse', rb_transfer: '/reimburse', ks_hr: '/kasbon',
  ks_fin: '/kasbon', payroll: '/payroll', lupa: '/absensi', kontrak: '/karyawan', rekan: '/jadwal' };
const INLINE = ['pengajuan', 'ket', 'tukar'];

function Status({ st }: { st: string }) {
  const c = st === 'Disetujui' ? 'b-green' : /^Menunggu/.test(st) ? 'b-amber' : st === 'Dibatalkan' ? 'b-gray' : 'b-red';
  return <span className={'badge ' + c}>{teksStatus(st)}</span>;
}

export default function Persetujuan() {
  const { inbox, muatInbox } = useAplikasi();
  const router = useRouter();
  const [aktif, setAktif] = useState<string | null>(null);
  useEffect(() => { muatInbox(); }, [muatInbox]);
  const item = inbox.semua.filter((x) => x.kunci !== 'rekan' && x.kunci !== 'rekomendasi');
  const pilih = aktif ?? item.find((x) => x.jumlah && INLINE.includes(x.kunci))?.kunci ?? 'pengajuan';
  const klik = (k: string) => (INLINE.includes(k) ? setAktif(k) : router.push(TUJUAN[k] ?? '/dashboard'));
  return (<>
    <div className="kpis">
      {item.map((x) => (
        <button key={x.kunci} className={'kpi lap-k' + (x.jumlah ? '' : ' c-gray') + (pilih === x.kunci ? ' on' : '')} style={{ opacity: x.jumlah ? 1 : 0.6 }} onClick={() => klik(x.kunci)}>
          <div className="ico"><Ikon n={x.ikon} /></div><div className="v">{x.jumlah}</div><div className="k">{x.judul}</div></button>))}
    </div>
    {pilih === 'pengajuan' && <DaftarPengajuan />}
    {pilih === 'ket' && <DaftarIzin />}
    {pilih === 'tukar' && <DaftarTukar />}
  </>);
}

function Kepala({ ikon, judul, opsi, filter, setFilter, ekspor }: { ikon: string; judul: string; opsi: string[]; filter: string; setFilter: (v: string) => void; ekspor: () => void }) {
  return (
    <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n={ikon} />{judul}</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          {opsi.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua' : teksStatus(o)}</option>)}</select>
        <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
  );
}
/* daftar + keputusan; dipakai tiga jenis pengajuan */
function useDaftar(aksi: string, filter: string) {
  const { galat } = useAplikasi();
  const [list, setList] = useState<Data[] | null>(null);
  const muat = useCallback(() => { api<Data[]>(aksi, { status: filter }, true).then(setList).catch(galat); }, [aksi, filter, galat]);
  useEffect(() => { setList(null); muat(); }, [muat]);
  return { list, muat };
}
function useKeputusan(aksi: string, muat: () => void) {
  const { tanya, toast, galat, muatInbox } = useAplikasi();
  return async (id: number, setuju: boolean) => {
    const c = await tanya(setuju ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (opsional):', '', { judul: setuju ? 'Setujui' : 'Tolak' });
    if (c === null) return;
    api<{ pesan: string }>(aksi, { id, setuju: setuju ? 1 : 0, catatan: c }).then((r) => { toast(r.pesan); muat(); muatInbox(); }).catch(galat);
  };
}
const Tombol = ({ id, putus, ya = 'Setujui' }: { id: number; putus: (id: number, s: boolean) => void; ya?: string }) => (
  <div className="row" style={{ marginTop: 9 }}>
    <button className="btn sm green" onClick={() => putus(id, true)}><Ikon n="check" />{ya}</button>
    <button className="btn sm red" onClick={() => putus(id, false)}><Ikon n="x" />Tolak</button></div>
);

function DaftarPengajuan() {
  const { me, galat } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu HR');
  const { list, muat } = useDaftar('adm_pengajuan', filter);
  const putus = useKeputusan('adm_pengajuan_putus', muat);
  const ekspor = () => api<Data[]>('adm_pengajuan', { status: 'ALL' }).then((l) => keExcel(l.map((x) => ({ Nama: x.nama, NIK: x.nik, Lokasi: x.cabang, Jenis: x.jenisLabel,
    Tanggal: x.tanggal, 'Jam Lembur': x.jamMulai ? `${x.jamMulai}–${x.jamSelesai}` : '', Sebelum: x.jadwalSebelum, Sesudah: x.jadwalSesudah, Alasan: x.alasan,
    Status: teksStatus(x.status), 'Diputus Oleh': x.approver, 'Catatan HC': x.catatanHr })), 'Pengajuan', 'pengajuan-jadwal-lembur-' + todayStr())).catch(galat);
  return (
    <div className="card"><Kepala ikon="repeat" judul="Lembur, Ganti Shift & Libur" opsi={['Menunggu HR', 'Disetujui', 'Ditolak HR', 'ALL']} filter={filter} setFilter={setFilter} ekspor={ekspor} />
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? list.map((x) => (
        <div key={x.id} className="item">
          <div className="top"><div><div className="nm">{x.nama} · {x.jenisLabel}</div>
            <div className="dt">{tglPendek(x.tanggal)} · {x.jenis === 'lembur' ? `${x.jamMulai}–${x.jamSelesai} (${jamKerjaTeks(x.menit)})`
              : x.jenis === 'ganti_shift' ? <>{x.jadwalSebelum} → <b>{x.jadwalSesudah}</b></> : <>Jadi LIBUR{x.tanggal2 && ', jadwalnya dipindah ke ' + tglPendek(x.tanggal2)}</>}
              {x.cabang && ' · ' + x.cabang}</div></div><Status st={x.status} /></div>
          <div className="kv"><span>Alasan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>
          {x.approver && <div className="kv"><span>Diputus oleh</span><span>{x.approver}</span></div>}
          {x.catatanHr && <div className="kv"><span>Catatan HC</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
          {/^Menunggu/.test(x.status) && x.userId !== me?.id && <Tombol id={x.id} putus={putus} />}
        </div>)) : <div className="empty">Tidak ada pengajuan pada filter ini.</div>}
    </div>
  );
}

function DaftarIzin() {
  const { me, galat } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu HR');
  const { list, muat } = useDaftar('adm_ketidakhadiran', filter);
  const putus = useKeputusan('adm_ket_putus', muat);
  const ekspor = () => api<Data[]>('adm_ketidakhadiran', { status: 'ALL' }).then((l) => keExcel(l.map((x) => ({ Nama: x.nama, NIK: x.nik, Lokasi: x.cabang,
    Jenis: x.jenisLabel + (x.sesi ? ` (${x.sesi})` : ''), Tanggal: x.tanggal, Keterangan: x.alasan, Status: teksStatus(x.status), 'Diputus Oleh': x.approver,
    'Catatan HC': x.catatanHr })), 'Izin', 'izin-wfh-dinas-' + todayStr())).catch(galat);
  return (
    <div className="card"><Kepala ikon="file-heart" judul="Izin, Sakit, WFH & Dinas" opsi={['Menunggu HR', 'Disetujui', 'Ditolak HR', 'ALL']} filter={filter} setFilter={setFilter} ekspor={ekspor} />
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? list.map((x) => (
        <div key={x.id} className="item">
          <div className="top"><div><div className="nm">{x.nama} <span className="tiny muted">({x.nik})</span></div>
            <div className="dt"><b>{x.jenisLabel}{x.sesi && ` (${x.sesi})`}</b> · {tglPendek(x.tanggal)}{x.cabang && ' · ' + x.cabang}</div></div><Status st={x.status} /></div>
          {x.alasan && <div className="kv"><span>Keterangan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>}
          {x.catatanHr && <div className="kv"><span>Catatan HC</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
          {x.approver && <div className="kv"><span>Diputus</span><span style={{ textAlign: 'right' }}>{x.approver}</span></div>}
          {/^Menunggu/.test(x.status) && x.userId !== me?.id && <Tombol id={x.id} putus={putus} />}
        </div>)) : <div className="empty">Tidak ada pengajuan pada filter ini.</div>}
    </div>
  );
}

function DaftarTukar() {
  const { galat } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu HR');
  const { list, muat } = useDaftar('adm_tukar', filter);
  const putus = useKeputusan('adm_tukar_putus', muat);
  const ekspor = () => api<Data[]>('adm_tukar', { status: 'ALL' }).then((l) => keExcel(l.map((x) => ({ Pemohon: x.pemohon, 'Tanggal Pemohon': x.tglPemohon,
    Rekan: x.rekan, 'Tanggal Rekan': x.tglRekan, Jenis: x.jenis, Alasan: x.alasan, Status: teksStatus(x.status), 'Diputus Oleh': x.approver })), 'Tukar', 'tukar-jadwal-' + todayStr())).catch(galat);
  return (
    <div className="card"><Kepala ikon="arrow-left-right" judul="Tukar Shift / Libur" opsi={['Menunggu HR', 'Menunggu Rekan', 'Disetujui', 'Ditolak HR', 'Ditolak Rekan', 'ALL']} filter={filter} setFilter={setFilter} ekspor={ekspor} />
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? list.map((x) => (
        <div key={x.id} className="item">
          <div className="top"><div><div className="nm">{x.pemohon} ↔ {x.rekan}</div><div className="dt">{x.jenis === 'libur' ? 'Tukar libur' : 'Tukar shift'}{x.cabang && ' · ' + x.cabang}</div></div>
            <Status st={x.status} /></div>
          <div className="sep" style={{ margin: '8px 0' }} />
          <div className="kv"><span>{x.pemohon}</span><span>{tglPendek(x.tglPemohon)} · <b>{x.shiftPemohonSebelum}</b>{x.status === 'Disetujui' && <> → <b style={{ color: 'var(--success)' }}>{x.shiftPemohonSesudah}</b></>}</span></div>
          <div className="kv"><span>{x.rekan}</span><span>{tglPendek(x.tglRekan)} · <b>{x.shiftRekanSebelum}</b>{x.status === 'Disetujui' && <> → <b style={{ color: 'var(--success)' }}>{x.shiftRekanSesudah}</b></>}</span></div>
          <div className="kv"><span>Alasan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>
          {x.catatanRekan && <div className="kv"><span>Catatan rekan</span><span style={{ textAlign: 'right' }}>{x.catatanRekan}</span></div>}
          {x.approver && <div className="kv"><span>Diputus oleh</span><span>{x.approver}</span></div>}
          {x.status === 'Menunggu HR' ? <Tombol id={x.id} putus={putus} ya="Setujui & Tukar" />
            : x.status === 'Menunggu Rekan' ? <div className="warn" style={{ marginTop: 9 }}>Menunggu persetujuan {x.rekan} lebih dulu.</div> : null}
        </div>)) : <div className="empty">Tidak ada permintaan pada filter ini.</div>}
    </div>
  );
}
