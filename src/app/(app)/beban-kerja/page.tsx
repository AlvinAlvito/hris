'use client';
/* Beban Kerja (Supervisor: timnya, HC: semua): utilisasi per karyawan per minggu / bulan, porsi kategori, detail log & komentar,
   rekap tahunan (heatmap), serta pengaturan kategori & batas beban kerja (HC). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { DaftarLog, MeterUtilisasi, PerKategori, PilihPeriode, WARNA_BEBAN, jam, type Log, type Periode, type Ringkas } from '@/components/LogKerja';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { NAMA_BULAN, todayStr } from '@/lib/klien/format';

type Baris = Ringkas & { userId: number; nama: string; nik: string; jabatan: string; dept: string };
type DataTim = { periode: Periode; batas: { bawah: number; atas: number }; admin: boolean; divisi: string[]; baris: Baris[];
  stat: { rata: number | null; overload: number; optimal: number; underload: number; belum: number; jam: number }; perKategori: { kategori: string; menit: number; jumlah: number }[] };

export default function BebanKerja() {
  const { me } = useAplikasi();
  const admin = isAdminUp(me);
  const [tab, setTab] = useState<'periode' | 'tahunan' | 'atur'>('periode');
  return (<>
    <div className="seg lk-tab">{([['periode', 'chart-pie', 'Per Periode'], ['tahunan', 'calendar-days', 'Rekap Tahunan'], ...(admin ? [['atur', 'settings', 'Pengaturan']] : [])] as [typeof tab, string, string][]).map(([k, ic, t]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>
    {tab === 'periode' ? <PerPeriode /> : tab === 'tahunan' ? <RekapTahunan /> : <Pengaturan />}
  </>);
}

function PerPeriode() {
  const { galat, bukaSheet } = useAplikasi();
  const [pilih, setPilih] = useState<{ jenis: 'minggu' | 'bulan'; tanggal: string; divisi: string }>({ jenis: 'minggu', tanggal: todayStr(), divisi: '' });
  const [d, setD] = useState<DataTim | null>(null);
  const [filter, setFilter] = useState(''), [cari, setCari] = useState('');
  const muat = useCallback(() => { api<DataTim>('beban_tim', pilih, true).then(setD).catch(galat); }, [pilih, galat]);
  useEffect(() => { muat(); }, [muat]);
  const tampil = useMemo(() => (d?.baris ?? []).filter((x) => (!filter || x.status === filter) && (!cari || [x.nama, x.jabatan, x.dept].some((v) => String(v ?? '').toLowerCase().includes(cari.toLowerCase()))))
    .sort((a, b) => (b.utilisasi ?? -1) - (a.utilisasi ?? -1) || a.nama.localeCompare(b.nama, 'id')), [d, filter, cari]);
  const ekspor = async () => {
    if (!d) return;
    try {
      const ringkas = d.baris.map((x) => ({ NIK: x.nik, Nama: x.nama, Jabatan: x.jabatan, Divisi: x.dept, 'Jam Kerja': Math.round(x.menit / 6) / 10, 'Kapasitas (jam)': Math.round(x.kapasitas / 6) / 10,
        'Utilisasi (%)': x.utilisasi ?? '', Status: x.statusLabel, Pekerjaan: x.jumlah, Selesai: x.selesai, 'Hari Terisi': x.hariTerisi, 'Hari Kerja': x.hariKerja }));
      await keExcel(ringkas, 'Ringkasan', 'beban-kerja-' + d.periode.dari);
      const detail = await api<Record<string, unknown>[]>('beban_ekspor', pilih);
      if (detail.length) await keExcel(detail, 'Detail Log', 'log-kerja-' + d.periode.dari);
    } catch (e) { galat(e); }
  };
  const buka = (x: Baris) => bukaSheet(<DetailKaryawan userId={x.userId} jenis={pilih.jenis} tanggal={d?.periode.dari ?? pilih.tanggal} segarkan={muat} />, { besar: true, saatTutup: muat });
  return (<>
    <div className="card lk-atas">
      <PilihPeriode p={d?.periode ?? null} ubah={(jenis, tanggal) => setPilih((x) => ({ ...x, jenis, tanggal }))} />
      <div className="lk-atas-kanan">
        <select value={pilih.divisi} onChange={(e) => setPilih((x) => ({ ...x, divisi: e.target.value }))} style={{ width: 'auto' }}><option value="">Semua divisi</option>
          {(d?.divisi ?? []).map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn ghost sm auto" disabled={!d} onClick={ekspor}><Ikon n="download" />Excel</button></div>
    </div>
    {!d ? <div className="card"><div className="skel" style={{ height: 260 }} /></div> : (<>
      <div className="statgrid lk-stat">{([['chart-pie', 'Rata-rata utilisasi', d.stat.rata == null ? '—' : d.stat.rata + '%', ''], ['circle-alert', 'Overload', d.stat.overload, 'overload'],
        ['circle-check', 'Optimal', d.stat.optimal, 'optimal'], ['hourglass', 'Underload', d.stat.underload, 'underload'], ['circle-x', 'Belum mengisi', d.stat.belum, 'belum']] as [string, string, string | number, string][]).map(([ic, k, v, f]) => (
        <button key={k} type="button" className={'stat kp-stat-btn' + (f && filter === f ? ' on' : '')} onClick={() => f && setFilter((x) => (x === f ? '' : f))}>
          <span className="si"><Ikon n={ic} /></span><div className="k">{k}</div><div className="v">{v}</div></button>))}</div>
      <div className="grid-2 lk-grid">
        <div className="card">
          <div className="kp-filter"><input placeholder="Cari nama, jabatan, divisi…" value={cari} onChange={(e) => setCari(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Semua status</option>
              {['overload', 'optimal', 'underload', 'belum'].map((k) => <option key={k} value={k}>{k === 'belum' ? 'Belum mengisi' : k[0].toUpperCase() + k.slice(1)}</option>)}</select></div>
          <div className="tiny muted" style={{ margin: '8px 2px 0' }}>Garis tipis pada bilah = batas optimal {d.batas.bawah}–{d.batas.atas}%. Klik nama untuk melihat catatan pekerjaan.
            <b> Kapasitas</b> = jam kerja per hari sesuai jadwal (dibatasi jam kerja efektif di tab Pengaturan) pada hari kerja periode ini, dikurangi libur, cuti, dan izin.</div>
          {!tampil.length ? <div className="empty">Tidak ada karyawan pada filter ini.</div> : (
            <div className="lk-tabel">{tampil.map((x) => (
              <button key={x.userId} type="button" className="lk-baris" onClick={() => buka(x)}>
                <span className="lk-nama"><b>{x.nama}</b><span className="tiny muted">{x.jabatan}{x.dept ? ' · ' + x.dept : ''}</span></span>
                <span className="lk-baris-meter"><MeterUtilisasi r={x} batas={d.batas} ringkas /><span className="tiny muted" title={`Kapasitas ${x.hariKerja} hari kerja`}>{jam(x.menit)} dari kapasitas {jam(x.kapasitas)} · {x.jumlah} pekerjaan</span></span>
                <span className="lk-baris-nilai"><b className={'lk-util ' + WARNA_BEBAN[x.status]}>{x.utilisasi == null ? '—' : x.utilisasi + '%'}</b>
                  <span className={'badge lk-st ' + WARNA_BEBAN[x.status]}>{x.statusLabel}</span></span>
              </button>))}</div>)}
        </div>
        <div className="card"><h3><Ikon n="layers" />Waktu per Kategori</h3><div className="tiny muted" style={{ marginBottom: 8 }}>Total {d.stat.jam} jam tercatat.</div>
          <PerKategori data={d.perKategori} /></div>
      </div>
    </>)}
  </>);
}

function DetailKaryawan({ userId, jenis, tanggal, segarkan }: { userId: number; jenis: 'minggu' | 'bulan'; tanggal: string; segarkan: () => void }) {
  const { galat, tutupSheet } = useAplikasi();
  const [pilih, setPilih] = useState({ jenis, tanggal });
  const [d, setD] = useState<{ periode: Periode; ringkas: Ringkas & { nama: string; jabatan: string; dept: string }; kapasitasHarian: Record<string, number>; log: Log[];
    batas: { bawah: number; atas: number }; perKategori: { kategori: string; menit: number; jumlah: number }[]; bolehKomentar: boolean } | null>(null);
  const muat = useCallback(() => { api<typeof d>('beban_detail', { userId, ...pilih }, true).then(setD).catch((e) => { galat(e); tutupSheet(); }); }, [userId, pilih, galat, tutupSheet]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="skel" style={{ height: 320 }} />;
  const hari = Object.keys(d.kapasitasHarian).sort(), perHari = (t: string) => d.log.filter((x) => x.tanggal === t && x.status !== 'rencana').reduce((a, x) => a + x.durasi, 0);
  const maks = Math.max(1, ...hari.map((t) => Math.max(perHari(t), d.kapasitasHarian[t])));
  return (<div className="lk-detail">
    <div className="lk-detail-kepala"><div><h3 style={{ margin: 0 }}>{d.ringkas.nama}</h3><div className="tiny muted">{d.ringkas.jabatan}{d.ringkas.dept ? ' · ' + d.ringkas.dept : ''}</div></div></div>
    <PilihPeriode p={d.periode} ubah={(j, t) => setPilih({ jenis: j, tanggal: t })} />
    <div className="grid-2 lk-grid" style={{ marginTop: 12 }}>
      <div className="card"><MeterUtilisasi r={d.ringkas} batas={d.batas} />
        {hari.length > 0 && <><h4 style={{ margin: '16px 0 6px' }}>Jam kerja per hari</h4>
          <div className="lk-harian">{hari.map((t) => (
            <div key={t} className="lk-harian-kol" title={`${t}: ${jam(perHari(t))} dari ${jam(d.kapasitasHarian[t])}`}>
              <span className="lk-harian-tiang"><i className="kap" style={{ height: (d.kapasitasHarian[t] / maks) * 100 + '%' }} /><i className="isi" style={{ height: (perHari(t) / maks) * 100 + '%' }} /></span>
              <span className="tiny muted">{+t.slice(8, 10)}</span></div>))}</div>
          <div className="tiny muted">Batang biru = jam tercatat, latar abu = kapasitas hari itu.</div></>}
        <h4 style={{ margin: '16px 0 6px' }}>Waktu per kategori</h4><PerKategori data={d.perKategori} /></div>
      <div className="card"><h3><Ikon n="list-checks" />Catatan Pekerjaan</h3>
        <DaftarLog log={d.log} kapasitasHarian={d.kapasitasHarian} pemilik={false} hariIni={todayStr()} segarkan={() => { muat(); segarkan(); }} bolehKomentar={d.bolehKomentar} /></div>
    </div>
  </div>);
}

function RekapTahunan() {
  const { galat } = useAplikasi();
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [d, setD] = useState<{ tahun: number; karyawan: { id: number; nama: string; dept: string }[]; bulan: { bulan: string; data: Record<number, { u: number | null; s: string }> }[] } | null>(null);
  useEffect(() => { setD(null); api<typeof d>('beban_tahunan', { tahun }, true).then(setD).catch(galat); }, [tahun, galat]);
  return (
    <div className="card">
      <div className="kp-pilih-bulan"><h3 style={{ margin: 0 }}><Ikon n="calendar-days" />Rekap Utilisasi Tahunan</h3>
        <select value={tahun} onChange={(e) => setTahun(+e.target.value)} style={{ width: 'auto' }}>{[0, 1, 2].map((x) => <option key={x}>{new Date().getFullYear() - x}</option>)}</select></div>
      {!d ? <div className="skel" style={{ height: 240, marginTop: 12 }} /> : !d.bulan.length ? <div className="empty">Belum ada data tahun ini.</div> : (
        <div className="tblwrap lk-heat"><table><thead><tr><th>Karyawan</th>{d.bulan.map((b) => <th key={b.bulan}>{NAMA_BULAN[+b.bulan.slice(5, 7) - 1].slice(0, 3)}</th>)}</tr></thead>
          <tbody>{d.karyawan.map((k) => (
            <tr key={k.id}><td><b>{k.nama}</b><div className="tiny muted">{k.dept}</div></td>
              {d.bulan.map((b) => { const x = b.data[k.id]; return <td key={b.bulan} className={'lk-sel ' + (x ? WARNA_BEBAN[x.s] : 'abu')} title={x?.s}>{x?.s === 'belum' ? <span className="tiny">belum</span> : x?.u == null ? '—' : Math.round(x.u) + '%'}</td>; })}</tr>))}
          </tbody></table></div>)}
      <div className="lk-legenda tiny"><span className="lk-sel hijau">Optimal</span><span className="lk-sel kuning">Underload</span><span className="lk-sel merah">Overload</span><span className="lk-sel abu">Belum mengisi / tanpa hari kerja</span></div>
    </div>
  );
}

function Pengaturan() {
  const { galat, toast, yakin } = useAplikasi();
  const [d, setD] = useState<{ kategori: { id: number; nama: string; divisi: string; aktif: boolean; dipakai: number }[]; divisi: string[];
    pengaturan: { jamEfektif: number; bawah: number; atas: number; mulai: string } } | null>(null);
  const [baru, setBaru] = useState({ nama: '', divisi: '' });
  const [set, setSet] = useState({ jamEfektif: 7, bawah: 70, atas: 100, mulai: '' });
  const muat = useCallback(() => { api<typeof d>('log_kategori_daftar', {}, true).then((x) => { setD(x); if (x) setSet({ ...x.pengaturan, jamEfektif: x.pengaturan.jamEfektif / 60 }); }).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const simpanKat = (x: { id?: number; nama: string; divisi: string; aktif?: boolean }) => api<{ pesan: string }>('log_kategori_simpan', x).then((r) => { toast(r.pesan); setBaru({ nama: '', divisi: '' }); muat(); }).catch(galat);
  const hapus = async (id: number, nama: string) => { if (await yakin(`Hapus kategori "${nama}"?`, 'Bila sudah dipakai, kategori hanya dinonaktifkan.', { ya: 'Hapus' })) api<{ pesan: string }>('log_kategori_hapus', { id }).then((r) => { toast(r.pesan); muat(); }).catch(galat); };
  return (<div className="grid-2 lk-grid">
    <div className="card"><h3><Ikon n="layers" />Kategori Pekerjaan</h3>
      <div className="tiny muted" style={{ marginBottom: 10 }}>Kategori tanpa divisi muncul untuk semua karyawan; kategori berdivisi hanya muncul untuk divisi tersebut.</div>
      <div className="row"><div style={{ flex: 2 }}><input placeholder="Nama kategori baru, mis. Koordinasi PS" value={baru.nama} onChange={(e) => setBaru({ ...baru, nama: e.target.value })} /></div>
        <div><select value={baru.divisi} onChange={(e) => setBaru({ ...baru, divisi: e.target.value })}><option value="">Semua divisi</option>{d.divisi.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div style={{ flex: '0 0 auto' }}><button className="btn auto" disabled={baru.nama.trim().length < 2} onClick={() => simpanKat(baru)}><Ikon n="plus" />Tambah</button></div></div>
      <div className="lk-kat-daftar">{d.kategori.map((k) => (
        <div key={k.id} className={'lk-kat-baris' + (k.aktif ? '' : ' mati')}>
          <span><b>{k.nama}</b><span className="tiny muted"> · {k.divisi || 'Semua divisi'} · dipakai {k.dipakai}×</span></span>
          <button className="btn ghost sm auto" onClick={() => simpanKat({ ...k, aktif: !k.aktif })}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
          <button className="btn ghost sm auto" onClick={() => hapus(k.id, k.nama)} aria-label="Hapus"><Ikon n="trash-2" /></button></div>))}</div>
    </div>
    <div className="card"><h3><Ikon n="sliders-horizontal" />Perhitungan Beban Kerja</h3>
      <label style={{ marginTop: 0 }}>Jam kerja efektif per hari</label><input type="number" min={1} max={12} step={0.5} value={set.jamEfektif} onChange={(e) => setSet({ ...set, jamEfektif: +e.target.value })} />
      <div className="tiny muted" style={{ marginTop: 4 }}>Kapasitas harian = nilai ini, atau jam kerja hari itu bila lebih pendek (mis. Sabtu setengah hari). Hari libur, cuti, dan izin tidak dihitung; izin setengah hari = separuh.</div>
      <div className="row"><div><label>Batas underload (%)</label><input type="number" min={10} max={199} value={set.bawah} onChange={(e) => setSet({ ...set, bawah: +e.target.value })} /></div>
        <div><label>Batas overload (%)</label><input type="number" min={11} max={200} value={set.atas} onChange={(e) => setSet({ ...set, atas: +e.target.value })} /></div></div>
      <label>Mulai menghitung sejak</label><input type="date" value={set.mulai} onChange={(e) => setSet({ ...set, mulai: e.target.value })} />
      <div className="tiny muted" style={{ marginTop: 4 }}>Isi dengan tanggal karyawan mulai mencatat pekerjaan di aplikasi, agar minggu/bulan sebelumnya tidak terhitung underload. Kosong = ikut tanggal mulai pemakaian HRIS.</div>
      <button className="btn" onClick={() => api<{ pesan: string }>('log_pengaturan_simpan', set).then((r) => { toast(r.pesan); muat(); }).catch(galat)}><Ikon n="check" />Simpan Pengaturan</button>
    </div>
  </div>);
}
