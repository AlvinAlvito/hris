'use client';
/* Satu panel untuk semua pengajuan pegawai, dengan riwayat gabungan */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { FormCuti, FormIzin, FormLembur } from '@/components/FormPengajuan';
import { FormKasbon, FormReimburse } from '@/components/Keuangan';
import { api } from '@/lib/klien/api';
import { rentangTgl, rupiah, teksStatus, tglPendek } from '@/lib/klien/format';

type Data = Record<string, any>;
interface Item { ikon: string; judul: string; waktu: string; status: string; ket: string; catatan: string; diajukan: string; batal: () => Promise<unknown> }

function grupStatus(st: string) {
  if (/^Menunggu/.test(st)) return 'menunggu';
  if (['Disetujui', 'Dibayar', 'Aktif', 'Lunas'].includes(st)) return 'disetujui';
  if (st === 'Dibatalkan') return 'batal';
  return 'ditolak';
}
/* WFH / dinas / izin beberapa hari tersimpan per tanggal: satukan lagi per pengajuan */
function kelompokIzin(list: Data[]): Data[] {
  const g = new Map<string, Data[]>();
  for (const k of list) {
    const kunci = [k.jenis, k.sesi, k.alasan, String(k.tglAjukan).slice(0, 16), k.status].join('|');
    g.set(kunci, [...(g.get(kunci) ?? []), k]);
  }
  return [...g.values()].map((l) => { l.sort((a, b) => (a.tanggal < b.tanggal ? -1 : 1)); return { ...l[0], daftar: l, akhir: l[l.length - 1].tanggal }; });
}
const WARNA: Record<string, string> = { menunggu: 'b-amber', disetujui: 'b-green', ditolak: 'b-red', batal: 'b-gray' };

export default function Pengajuan() {
  const { me, bukaSheet, yakin, toast, galat, muatInbox } = useAplikasi();
  const [data, setData] = useState<Item[] | null>(null);
  const [cuti, setCuti] = useState<Data | null>(null);
  const [filter, setFilter] = useState('semua');

  const muat = useCallback(() => {
    Promise.all([api<Data>('cuti_saya', {}, true), api<Data[]>('ketidakhadiran_saya', {}, true), api<Data[]>('pengajuan_saya', {}, true),
      api<Data[]>('rb_saya', {}, true).catch(() => []), api<Data[]>('ks_saya', {}, true).catch(() => [])]).then(([c, k, p, rb, ks]) => {
      setCuti(c);
      const l: Item[] = [
        ...c.list.map((x: Data): Item => ({ ikon: 'plane', judul: x.jenis, waktu: rentangTgl(x.mulai, x.selesai) + ' · ' + x.hari + ' hari', status: x.status,
          ket: x.alasan, catatan: x.catatan, diajukan: x.tglAjukan, batal: () => api('cuti_batal', { id: x.id }) })),
        ...kelompokIzin(k).map((x): Item => ({ ikon: ({ wfh: 'house', dlk: 'map-pin', setengah_hari: 'timer' } as Data)[x.jenis] || 'file-heart',
          judul: x.jenisLabel + (x.sesi ? ` (${x.sesi})` : ''), waktu: rentangTgl(x.tanggal, x.akhir) + (x.daftar.length > 1 ? ` · ${x.daftar.length} hari kerja` : ''),
          status: x.status, ket: x.alasan, catatan: x.catatanHr, diajukan: x.tglAjukan,
          batal: () => Promise.all(x.daftar.map((y: Data) => api('ketidakhadiran_batal', { id: y.id }, true))) })),
        ...p.map((x: Data): Item => ({ ikon: x.jenis === 'lembur' ? 'clock' : 'repeat', judul: x.jenisLabel,
          waktu: tglPendek(x.tanggal) + (x.jenis === 'lembur' ? ` · ${x.jamMulai}–${x.jamSelesai}` : x.jenis === 'ganti_shift' ? ` · ${x.jadwalSebelum} → ${x.jadwalSesudah}` : ''),
          status: x.status, ket: x.alasan, catatan: x.catatanHr, diajukan: x.tglAjukan, batal: () => api('pengajuan_batal', { id: x.id }) })),
        ...rb.map((r: Data): Item => ({ ikon: 'receipt', judul: 'Reimburse · ' + r.kategori, waktu: tglPendek(r.tanggal) + ' · ' + rupiah(r.nominalDisetujui || r.nominal),
          status: r.status, ket: r.keterangan, catatan: r.finCatatan || r.hrCatatan, diajukan: r.tglAjukan, batal: () => api('rb_batal', { id: r.id }) })),
        ...ks.map((x: Data): Item => ({ ikon: 'wallet', judul: 'Kasbon · ' + rupiah(x.nominal), waktu: `${x.tenor}× cicilan ${rupiah(x.cicilan)}`,
          status: x.status, ket: x.alasan, catatan: x.finCatatan || x.hrCatatan, diajukan: x.tglAjukan, batal: () => api('ks_batal', { id: x.id }) })),
      ];
      setData(l.sort((a, b) => String(b.diajukan).localeCompare(String(a.diajukan))));
    }).catch(galat);
  }, [galat]);
  useEffect(() => { muat(); }, [muat]);

  const selesai = () => { muat(); muatInbox(); };
  const jenis: [string, string, ReactNode][] = [
    ['Cuti', 'plane', <FormCuti key="c" selesai={selesai} />],
    ['Izin / Sakit', 'file-heart', <FormIzin key="i" jenis="izin" selesai={selesai} />],
    ['Setengah Hari', 'timer', <FormIzin key="s" jenis="setengah_hari" selesai={selesai} />],
    ['WFH', 'house', <FormIzin key="w" jenis="wfh" selesai={selesai} />],
    ['Dinas Luar Kota', 'map-pin', <FormIzin key="d" jenis="dlk" selesai={selesai} />],
    ['Lembur', 'clock', <FormLembur key="l" selesai={selesai} />],
    ['Reimburse', 'receipt', <FormReimburse key="r" selesai={selesai} />],
    ['Kasbon', 'wallet', <FormKasbon key="k" selesai={selesai} />],
  ];
  const batal = async (x: Item) => {
    if (!(await yakin('Batalkan pengajuan ini?'))) return;
    try { await x.batal(); toast('Pengajuan dibatalkan'); selesai(); } catch (e) { galat(e); }
  };
  const tampil = (data ?? []).filter((x) => { const g = grupStatus(x.status); return filter === 'semua' ? g !== 'batal' : g === filter; });
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
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}
        </div>
        {!data ? <div className="skel" style={{ height: 70, marginTop: 12 }} /> : tampil.length ? tampil.map((x, i) => {
          const g = grupStatus(x.status);
          return (
            <div key={i} className="item aj-item">
              <div className="top">
                <div className="orang"><span className="aj-ic"><Ikon n={x.ikon} /></span>
                  <div style={{ minWidth: 0 }}><div className="nm">{x.judul}</div><div className="dt">{x.waktu}</div></div></div>
                <span className={'badge ' + WARNA[g]}>{g === 'menunggu' ? teksStatus(x.status).replace('Menunggu HC', 'Menunggu') : teksStatus(x.status)}</span>
              </div>
              {x.ket && <div className="tiny muted" style={{ marginTop: 6 }}>{x.ket}</div>}
              {x.catatan && <div className="kv" style={{ marginTop: 4 }}><span>Catatan HC</span><span style={{ textAlign: 'right' }}>{x.catatan}</span></div>}
              {g === 'menunggu' && <button className="btn ghost sm auto" style={{ marginTop: 8 }} onClick={() => batal(x)}><Ikon n="x" />Batalkan</button>}
            </div>);
        }) : <div className="empty"><Ikon n="inbox" />{filter === 'semua' ? 'Belum ada pengajuan.' : 'Tidak ada pengajuan dengan status ini.'}</div>}
      </div>
    </div>
  );
}
