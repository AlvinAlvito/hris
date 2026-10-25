'use client';
/* Satu panel untuk semua pengajuan pegawai, dengan riwayat gabungan */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { FormCuti, FormIzin, FormKoreksiAbsen, FormLembur } from '@/components/FormPengajuan';
import { TautanBukti } from '@/components/BuktiPengajuan';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { teksStatus } from '@/lib/klien/format';

type Data = Record<string, any>;
interface Item { ikon: string; judul: string; waktu: string; status: string; ket: string; catatan: string; diajukan: string; buktiLink?: string; batal: () => Promise<unknown> }

function grupStatus(st: string) {
  if (/^Menunggu/.test(st)) return 'menunggu';
  if (['Disetujui', 'Dibayar', 'Aktif', 'Lunas'].includes(st)) return 'disetujui';
  if (st === 'Dibatalkan') return 'batal';
  return 'ditolak';
}
const WARNA: Record<string, string> = { menunggu: 'b-amber', disetujui: 'b-green', ditolak: 'b-red', batal: 'b-gray' };
const JUDUL_PENGAJUAN = { lembur: 'Lembur', lupa_in: 'Lupa Clock In', lupa_out: 'Lupa Clock Out', izin_telat: 'Izin Terlambat' };
const IKON_PENGAJUAN = { lembur: 'clock', lupa_in: 'log-in', lupa_out: 'log-out', izin_telat: 'alarm-clock' };

export default function Pengajuan() {
  const { me, bukaSheet, yakin, toast, galat, muatInbox } = useAplikasi();
  const [data, setData] = useState<HalamanData<Item> | null>(null);
  const [cuti, setCuti] = useState<Data | null>(null);
  const [filter, setFilter] = useState('semua');
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);

  const muat = useCallback(() => {
    setData(null);
    Promise.all([api<Data>('cuti_saya', {}, true), api<HalamanData<Data>>('pengajuan_riwayat', { filter, search, page }, true)]).then(([c, result]) => {
      setCuti(c);
      const items: Item[] = result.items.map((x: Data) => {
        const tipe = x.tipe, judul = tipe === 'ket'
          ? ({ sakit: 'Sakit', izin: 'Izin', keperluan: 'Keperluan pribadi', setengah_hari: 'Izin Setengah Hari', wfh: 'Work From Home', dlk: 'Dinas Luar Kota', libur: 'Libur', lainnya: 'Lainnya' } as Data)[x.judul] || x.judul
          : tipe === 'pengajuan' ? (JUDUL_PENGAJUAN as Data)[x.judul] || x.judul : x.judul;
        const ikon = tipe === 'cuti' ? 'plane' : tipe === 'ket' ? ({ wfh: 'house', dlk: 'map-pin', setengah_hari: 'timer' } as Data)[x.judul] || 'file-heart'
          : (IKON_PENGAJUAN as Data)[x.judul] || 'clock';
        const batal = tipe === 'cuti' ? () => api('cuti_batal', { id: x.id }) : tipe === 'ket' ? () => api('ketidakhadiran_batal', { id: x.id })
          : () => api('pengajuan_batal', { id: x.id });
        return { ikon, judul, waktu: x.waktu, status: x.status, ket: x.ket, catatan: x.catatan || '', diajukan: x.diajukan, buktiLink: x.buktiLink, batal };
      });
      setData({ ...result, items });
    }).catch(galat);
  }, [galat, filter, search, page]);
  useEffect(() => { muat(); }, [muat]);

  const selesai = () => { muat(); muatInbox(); };
  const jenis: [string, string, ReactNode][] = [
    ['Cuti', 'plane', <FormCuti key="c" selesai={selesai} />],
    ['Izin / Sakit', 'file-heart', <FormIzin key="i" jenis="izin" selesai={selesai} />],
    ['Setengah Hari', 'timer', <FormIzin key="s" jenis="setengah_hari" selesai={selesai} />],
    ['WFH', 'house', <FormIzin key="w" jenis="wfh" selesai={selesai} />],
    ['Dinas Luar Kota', 'map-pin', <FormIzin key="d" jenis="dlk" selesai={selesai} />],
    ['Lembur', 'clock', <FormLembur key="l" selesai={selesai} />],
    ['Lupa Clock In', 'log-in', <FormKoreksiAbsen key="li" jenis="lupa_in" selesai={selesai} />],
    ['Lupa Clock Out', 'log-out', <FormKoreksiAbsen key="lo" jenis="lupa_out" selesai={selesai} />],
    ['Izin Terlambat', 'alarm-clock', <FormKoreksiAbsen key="it" jenis="izin_telat" selesai={selesai} />],
  ];
  const batal = async (x: Item) => {
    if (!(await yakin('Batalkan pengajuan ini?'))) return;
    try { await x.batal(); toast('Pengajuan dibatalkan'); selesai(); } catch (e) { galat(e); }
  };
  const tampil = data?.items ?? [];
  const aktif = me?.cutiAktif;

  return (
    <div className="sempit">
      <div className="card">
        <h3><Ikon n="send" />Buat Pengajuan</h3>
        <div className="quick aj-jenis">
          {jenis.map(([t, ic, form]) => <button key={t} className="qa" onClick={() => bukaSheet(form)}><span className="i"><Ikon n={ic} /></span>{t}</button>)}
        </div>
      </div>
      <div className="card">
        <h3><Ikon n="plane" />Cuti Tahunan</h3>
        {!aktif && cuti && <div className="tiny muted" style={{ marginBottom: 4 }}>
          {me?.cutiMode === 'off' ? 'Hak cuti tahunan dinonaktifkan HC.' : `Hak cuti tahunan aktif setelah 12 bulan bekerja (${Math.max(0, 12 - (me?.masaKerjaBulan ?? 0))} bulan lagi).`}</div>}
        <div className="statgrid g3" id="ajCutiStat" style={{ marginTop: 0 }}>
          <div className="stat"><div className="k">Jatah</div><div className="v">{aktif ? me?.jatahEfektif : '—'}</div></div>
          <div className="stat"><div className="k">Terpakai</div><div className="v">{me?.terpakai ?? 0}</div></div>
          <div className="stat"><div className="k">Sisa</div><div className="v" style={{ color: 'var(--success)' }}>{aktif ? me?.sisa : '—'}</div></div>
        </div>
      </div>
      <div className="card">
        <h3><Ikon n="history" />Riwayat Pengajuan</h3>
        <div className="seg">
          {[['semua', 'Semua'], ['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak']].map(([k, t]) =>
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setPage(1); }}>{t}</button>)}
        </div>
        <label>Cari jenis, status, atau keterangan</label><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari riwayat pengajuan..." />
        {!data ? <div className="skel" style={{ height: 70, marginTop: 12 }} /> : tampil.length ? <>{tampil.map((x, i) => {
          const g = grupStatus(x.status);
          return (
            <div key={i} className="item aj-item">
              <div className="top">
                <div className="orang"><span className="aj-ic"><Ikon n={x.ikon} /></span>
                  <div style={{ minWidth: 0 }}><div className="nm">{x.judul}</div><div className="dt">{x.waktu}</div></div></div>
                <span className={'badge ' + WARNA[g]}>{g === 'menunggu' ? teksStatus(x.status).replace('Menunggu HC', 'Menunggu') : teksStatus(x.status)}</span>
              </div>
              {x.ket && <div className="tiny muted" style={{ marginTop: 6 }}>{x.ket}</div>}
              <TautanBukti link={x.buktiLink} />
              {x.catatan && <div className="kv" style={{ marginTop: 4 }}><span>Catatan atasan</span><span style={{ textAlign: 'right' }}>{x.catatan}</span></div>}
              {g === 'menunggu' && <button className="btn ghost sm auto" style={{ marginTop: 8 }} onClick={() => batal(x)}><Ikon n="x" />Batalkan</button>}
            </div>);
        })}<NavigasiHalaman page={data.page} total={data.total} totalPages={data.totalPages} ubah={setPage} /></> : <div className="empty"><Ikon n="inbox" />{filter === 'semua' ? 'Belum ada pengajuan.' : 'Tidak ada pengajuan dengan status ini.'}</div>}
      </div>
    </div>
  );
}
