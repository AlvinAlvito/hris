'use client';
/* Satu pintu persetujuan: semua yang menunggu tindakan, dikelompokkan per jenis.
   HC / Super Admin melihat seluruh karyawan; Supervisor hanya timnya (disaring di server). */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { AksiAdmin, FormPengajuanKaryawan, FormUbahKet } from '@/components/PengajuanAdmin';
import { Ikon } from '@/components/Ikon';
import { TautanBukti } from '@/components/BuktiPengajuan';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, teksStatus, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const TUJUAN: Record<string, string> = { cuti: '/cuti', payroll: '/payroll', lupa: '/absensi', absen: '/absensi', kontrak: '/karyawan', rekrutmen: '/kelola-rekrutmen', kpi: '/kelola-kpi' };
const INLINE = ['pengajuan', 'ket'];

function Status({ st }: { st: string }) {
  const c = st === 'Disetujui' ? 'b-green' : /^Menunggu/.test(st) ? 'b-amber' : st === 'Dibatalkan' ? 'b-gray' : 'b-red';
  return <span className={'badge ' + c}>{teksStatus(st)}</span>;
}

export default function Persetujuan() {
  const { me, inbox, muatInbox, bukaSheet } = useAplikasi();
  const router = useRouter();
  const [aktif, setAktif] = useState<string | null>(null), [segar, setSegar] = useState(0);
  useEffect(() => { muatInbox(); }, [muatInbox]);
  const item = inbox.semua;
  const pilih = aktif ?? item.find((x) => x.jumlah && INLINE.includes(x.kunci))?.kunci ?? 'pengajuan';
  const adaTindakLanjut = item.some((x) => x.jumlah > 0 && !INLINE.includes(x.kunci));
  const klik = (k: string) => (INLINE.includes(k) ? setAktif(k) : router.push(TUJUAN[k] ?? '/dashboard'));
  return (<>
    {isAdminUp(me) && <div className="pa-cta">
      <div><b>Karyawan lupa mengajukan?</b><div className="tiny muted">Buat izin, dinas luar kota, WFH, sakit, cuti, atau izin terlambat atas nama karyawan — sekaligus untuk banyak orang.</div></div>
      <button className="btn auto" onClick={() => bukaSheet(<FormPengajuanKaryawan selesai={() => { muatInbox(); setSegar((x) => x + 1); }} />, { besar: true })}>
        <Ikon n="user-plus" />Buat Pengajuan untuk Karyawan</button></div>}
    <div className="kpis">
      {item.map((x) => (
        <button key={x.kunci} className={'kpi lap-k' + (x.jumlah ? '' : ' c-gray') + (pilih === x.kunci ? ' on' : '')} style={{ opacity: x.jumlah ? 1 : 0.6 }} onClick={() => klik(x.kunci)}>
          <div className="ico"><Ikon n={x.ikon} /></div><div className="v">{x.jumlah}</div><div className="k">{x.judul}</div>
          <div className="tiny muted">{INLINE.includes(x.kunci) ? 'Lihat daftar' : 'Buka menu terkait'} →</div></button>))}
    </div>
    {adaTindakLanjut && <div className="note" style={{ marginTop: 14 }}>
      Angka pada kartu termasuk pengingat dan tindak lanjut di menu lain. Klik kartu <b>Absensi menunggu approval</b> atau <b>Lupa clock out</b> untuk membuka Rekap Absensi, <b>Pengajuan cuti</b> untuk membuka Cuti. Daftar pengajuan yang bisa diputus langsung muncul di panel bawah saat kartunya dipilih.
    </div>}
    {pilih === 'pengajuan' && <DaftarPengajuan key={'p' + segar} />}
    {pilih === 'ket' && <DaftarIzin key={'k' + segar} />}
  </>);
}

function Kepala({ ikon, judul, opsi, filter, setFilter, ekspor }: { ikon: string; judul: string; opsi: string[]; filter: string; setFilter: (v: string) => void; ekspor: () => void }) {
  return (
    <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n={ikon} />{judul}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          {opsi.map((o) => <option key={o} value={o}>{o === 'ALL' ? 'Semua' : teksStatus(o)}</option>)}</select>
        <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button></div></div>
  );
}
/* daftar + keputusan; dipakai tiga jenis pengajuan */
function useDaftar(aksi: string, filter: string) {
  const { galat } = useAplikasi();
  const [halaman, setHalaman] = useState<HalamanData<Data> | null>(null), [page, setPage] = useState(1), [search, setSearch] = useState('');
  const muat = useCallback(() => { api<HalamanData<Data>>(aksi, { status: filter, page, search }, true).then(setHalaman).catch(galat); }, [aksi, filter, page, search, galat]);
  useEffect(() => { setPage(1); }, [filter, search]);
  useEffect(() => { setHalaman(null); muat(); }, [muat]);
  return { list: halaman?.items ?? null, halaman, page, setPage, search, setSearch, muat };
}
function KontrolDaftar({ search, setSearch }: { search: string; setSearch: (s: string) => void }) {
  return <><label>Cari nama, NIK, jenis, atau keterangan</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari data pengajuan..." /></>;
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
  const { me, galat, yakin, toast, muatInbox } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu HR');
  const { list, halaman, page, setPage, search, setSearch, muat } = useDaftar('adm_pengajuan', filter);
  const putus = useKeputusan('adm_pengajuan_putus', muat);
  const hapus = async (x: Data) => {
    if (!(await yakin(`Hapus ${x.jenisLabel} ${x.nama} tanggal ${tglPendek(x.tanggal)}?`, 'Data dihapus permanen. Hasil yang sudah diterapkan ke absensi (jam lupa absen) tidak ikut dibatalkan.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('adm_pengajuan_hapus', { id: x.id }).then((r) => { toast(r.pesan); muat(); muatInbox(); }).catch(galat);
  };
  const ekspor = () => api<Data[]>('adm_pengajuan', { status: 'ALL', all: true, search }).then((l) => keExcel(l.map((x) => ({ Nama: x.nama, NIK: x.nik, Lokasi: x.cabang, Jenis: x.jenisLabel,
    Tanggal: x.tanggal, Jam: x.jamMulai ? x.jamMulai + (x.jamSelesai ? `–${x.jamSelesai}` : '') : '', Sebelum: x.jadwalSebelum, Sesudah: x.jadwalSesudah, Alasan: x.alasan,
    Status: teksStatus(x.status), 'Diputus Oleh': x.approver, 'Catatan Atasan': x.catatanHr })), 'Pengajuan', 'pengajuan-lembur-absen-' + todayStr())).catch(galat);
  return (
    <div className="card"><Kepala ikon="clock" judul="Lembur, Lupa Absen & Izin Terlambat" opsi={['Menunggu HR', 'Disetujui', 'Ditolak HR', 'ALL']} filter={filter} setFilter={setFilter} ekspor={ekspor} />
      <KontrolDaftar search={search} setSearch={setSearch} />
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? <>{list.map((x) => (
        <div key={x.id} className="item">
          <div className="top"><div><div className="nm">{x.nama} · {x.jenisLabel}</div>
            <div className="dt">{tglPendek(x.tanggal)} · {x.jenis === 'lembur' ? `${x.jamMulai}–${x.jamSelesai} (${jamKerjaTeks(x.menit)})`
              : <>{x.jadwalSebelum && <>{x.jadwalSebelum} → </>}<b>{x.jadwalSesudah || x.jamMulai}</b></>}
              {x.cabang && ' · ' + x.cabang}</div></div><Status st={x.status} /></div>
          <div className="kv"><span>Alasan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>
          <TautanBukti link={x.buktiLink} />
          {x.approver && <div className="kv"><span>Diputus oleh</span><span>{x.approver}</span></div>}
          {x.catatanHr && <div className="kv"><span>Catatan atasan</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
          {x.dibuatOleh && <div className="kv"><span>Dibuat oleh</span><span><span className="badge b-purple">{x.dibuatOleh}</span></span></div>}
          {/^Menunggu/.test(x.status) && x.userId !== me?.id && <Tombol id={x.id} putus={putus} />}
          {isAdminUp(me) && <AksiAdmin hapus={() => hapus(x)} />}
        </div>))}<NavigasiHalaman page={page} total={halaman?.total ?? 0} totalPages={halaman?.totalPages ?? 1} ubah={setPage} /></> : <div className="empty">Tidak ada pengajuan pada filter ini.</div>}
    </div>
  );
}

function DaftarIzin() {
  const { me, galat, bukaSheet, yakin, toast, muatInbox } = useAplikasi();
  const [filter, setFilter] = useState('Menunggu HR');
  const { list, halaman, page, setPage, search, setSearch, muat } = useDaftar('adm_ketidakhadiran', filter);
  const putus = useKeputusan('adm_ket_putus', muat);
  const hapus = async (x: Data) => {
    if (!(await yakin(`Hapus ${x.jenisLabel} ${x.nama} tanggal ${tglPendek(x.tanggal)}?`, 'Data dihapus permanen.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('adm_ket_hapus', { id: x.id }).then((r) => { toast(r.pesan); muat(); muatInbox(); }).catch(galat);
  };
  const ekspor = () => api<Data[]>('adm_ketidakhadiran', { status: 'ALL', all: true, search }).then((l) => keExcel(l.map((x) => ({ Nama: x.nama, NIK: x.nik, Lokasi: x.cabang,
    Jenis: x.jenisLabel + (x.sesi ? ` (${x.sesi})` : ''), Tanggal: x.tanggal, Keterangan: x.alasan, Status: teksStatus(x.status), 'Diputus Oleh': x.approver,
    'Catatan Atasan': x.catatanHr })), 'Izin', 'izin-wfh-dinas-' + todayStr())).catch(galat);
  return (
    <div className="card"><Kepala ikon="file-heart" judul="Izin, Sakit, WFH & Dinas" opsi={['Menunggu HR', 'Disetujui', 'Ditolak HR', 'ALL']} filter={filter} setFilter={setFilter} ekspor={ekspor} />
      <KontrolDaftar search={search} setSearch={setSearch} />
      {!list ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : list.length ? <>{list.map((x) => (
        <div key={x.id} className="item">
          <div className="top"><div><div className="nm">{x.nama} <span className="tiny muted">({x.nik})</span></div>
            <div className="dt"><b>{x.jenisLabel}{x.sesi && ` (${x.sesi})`}</b> · {tglPendek(x.tanggal)}{x.cabang && ' · ' + x.cabang}</div></div><Status st={x.status} /></div>
          {x.alasan && <div className="kv"><span>Keterangan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>}
          <TautanBukti link={x.buktiLink} />
          {x.catatanHr && <div className="kv"><span>Catatan atasan</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
          {x.approver && <div className="kv"><span>Diputus</span><span style={{ textAlign: 'right' }}>{x.approver}</span></div>}
          {x.dibuatOleh && <div className="kv"><span>Dibuat oleh</span><span><span className="badge b-purple">{x.dibuatOleh}</span></span></div>}
          {/^Menunggu/.test(x.status) && x.userId !== me?.id && <Tombol id={x.id} putus={putus} />}
          {isAdminUp(me) && <AksiAdmin ubah={() => bukaSheet(<FormUbahKet x={x} selesai={() => { muat(); muatInbox(); }} />)} hapus={() => hapus(x)} />}
        </div>))}<NavigasiHalaman page={page} total={halaman?.total ?? 0} totalPages={halaman?.totalPages ?? 1} ubah={setPage} /></> : <div className="empty">Tidak ada pengajuan pada filter ini.</div>}
    </div>
  );
}
