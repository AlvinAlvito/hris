'use client';
/* Komponen log kerja: pemilih periode (mingguan/bulanan), meter utilisasi, form catat pekerjaan, daftar pekerjaan per hari */
import { useEffect, useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { jamKerjaTeks, jamStr, tglIndo, todayStr } from '@/lib/klien/format';

export type Periode = { jenis: 'minggu' | 'bulan'; dari: string; sampai: string; label: string; sebelum: string; sesudah: string };
export type Kategori = { id: number; nama: string; divisi?: string };
export type Komentar = { id: number; oleh: string; isi: string; waktu: string };
export type Log = { id: number; tanggal: string; kategoriId: number | null; kategori: string; uraian: string; jamMulai: string; jamSelesai: string; durasi: number;
  status: string; statusLabel: string; keterangan: string; tautan: string; komentar: Komentar[] };
export type Ringkas = { menit: number; kapasitas: number; hariKerja: number; utilisasi: number | null; status: string; statusLabel: string; jumlah: number;
  selesai: number; tertunda: number; hariTerisi: number };

export const STATUS = [['rencana', 'Rencana'], ['proses', 'Proses'], ['selesai', 'Selesai'], ['tertunda', 'Tertunda']] as const;
export const WARNA_BEBAN: Record<string, string> = { underload: 'kuning', optimal: 'hijau', overload: 'merah', belum: 'abu', kosong: 'abu' };
export const jam = (m: number) => (!m ? '0j' : m < 60 ? m + 'm' : jamKerjaTeks(m));

export function PilihPeriode({ p, ubah }: { p: Periode | null; ubah: (jenis: 'minggu' | 'bulan', tanggal: string) => void }) {
  const jenis = p?.jenis ?? 'minggu';
  return (
    <div className="lk-periode">
      <div className="seg lk-jenis">{([['minggu', 'Mingguan'], ['bulan', 'Bulanan']] as const).map(([k, t]) =>
        <button key={k} type="button" className={jenis === k ? 'on' : ''} onClick={() => ubah(k, p?.dari ?? todayStr())}>{t}</button>)}</div>
      <div className="lk-geser">
        <button type="button" className="btn ghost sm auto" disabled={!p} onClick={() => p && ubah(jenis, p.sebelum)} aria-label="Periode sebelumnya"><Ikon n="chevron-left" /></button>
        <b>{p?.label ?? '…'}</b>
        <button type="button" className="btn ghost sm auto" disabled={!p || p.sesudah > todayStr()} onClick={() => p && ubah(jenis, p.sesudah)} aria-label="Periode berikutnya"><Ikon n="chevron-right" /></button>
        <button type="button" className="btn ghost sm auto" onClick={() => ubah(jenis, todayStr())}>Hari ini</button>
      </div>
    </div>
  );
}

/* meter utilisasi: bilah 0–150% dengan penanda batas underload & overload */
export function MeterUtilisasi({ r, batas, ringkas }: { r: Ringkas; batas: { bawah: number; atas: number }; ringkas?: boolean }) {
  const u = r.utilisasi ?? 0, skala = 150;
  return (
    <div className={'lk-meter' + (ringkas ? ' ringkas' : '')}>
      {!ringkas && <div className="lk-meter-atas"><b className={'lk-util ' + WARNA_BEBAN[r.status]}>{r.utilisasi == null ? '—' : r.utilisasi.toLocaleString('id-ID') + '%'}</b>
        <span className={'badge lk-st ' + WARNA_BEBAN[r.status]}>{r.statusLabel}</span></div>}
      <div className="lk-bar"><i className={WARNA_BEBAN[r.status]} style={{ width: Math.min(100, (u / skala) * 100) + '%' }} />
        <span className="lk-batas" style={{ left: (batas.bawah / skala) * 100 + '%' }} /><span className="lk-batas" style={{ left: (batas.atas / skala) * 100 + '%' }} /></div>
      {!ringkas && <div className="tiny muted lk-meter-bawah"><span>{jam(r.menit)} dari kapasitas {jam(r.kapasitas)}</span><span>Optimal {batas.bawah}–{batas.atas}%</span></div>}
    </div>
  );
}

/* ---------- form catat / ubah pekerjaan ---------- */
const DURASI_CEPAT = [15, 30, 60, 90, 120, 180, 240];
const KUNCI_TIMER = 'posi.timer.kerja';
export function FormLog({ kategori, awal, hariIni, selesai, batal }: { kategori: Kategori[]; awal?: Partial<Log> & { tanggal?: string }; hariIni: string; selesai: () => void; batal?: () => void }) {
  const { toast, galat } = useAplikasi();
  const kosong = { tanggal: awal?.tanggal ?? hariIni, kategoriId: awal?.kategoriId ?? 0, uraian: awal?.uraian ?? '', jamMulai: awal?.jamMulai ?? '', jamSelesai: awal?.jamSelesai ?? '',
    durasi: awal?.durasi ?? 0, status: awal?.status ?? 'selesai', keterangan: awal?.keterangan ?? '', tautan: awal?.tautan ?? '' };
  const [v, setV] = useState(kosong);
  const [pakaiJam, setPakaiJam] = useState(!!(awal?.jamMulai && awal?.jamSelesai));
  const [lain, setLain] = useState(!!(awal?.keterangan || awal?.tautan));
  const [timer, setTimer] = useState<string | null>(null), [kirim, setKirim] = useState(false);
  useEffect(() => { if (!awal?.id) try { setTimer(localStorage.getItem(KUNCI_TIMER)); } catch { /* */ } }, [awal?.id]);
  const set = (k: keyof typeof v, x: string | number) => setV((y) => ({ ...y, [k]: x }));
  const durasiJam = pakaiJam && v.jamMulai && v.jamSelesai ? (() => { const [a, b] = [v.jamMulai, v.jamSelesai].map((t) => +t.slice(0, 2) * 60 + +t.slice(3, 5)); return b - a > 0 ? b - a : b - a + 1440; })() : null;
  const durasi = durasiJam ?? +v.durasi;
  const mulaiTimer = () => { const t = jamStr(); try { localStorage.setItem(KUNCI_TIMER, t); } catch { /* */ } setTimer(t); toast('Timer berjalan sejak ' + t); };
  const stopTimer = () => {
    if (!timer) return;
    setPakaiJam(true); setV((y) => ({ ...y, jamMulai: timer, jamSelesai: jamStr(), tanggal: hariIni }));
    try { localStorage.removeItem(KUNCI_TIMER); } catch { /* */ } setTimer(null);
  };
  const simpan = async () => {
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('log_simpan', { ...v, id: awal?.id ?? 0, durasi, jamMulai: pakaiJam ? v.jamMulai : '', jamSelesai: pakaiJam ? v.jamSelesai : '' });
      toast(r.pesan);
      if (!awal?.id) setV({ ...kosong, tanggal: v.tanggal, kategoriId: v.kategoriId, status: v.status, uraian: '', durasi: 0, jamMulai: '', jamSelesai: '', keterangan: '', tautan: '' });
      selesai();
    } catch (e) { galat(e); } finally { setKirim(false); }
  };
  return (
    <div className="lk-form">
      <div className="row">
        <div><label style={{ marginTop: 0 }}>Tanggal</label><input type="date" value={v.tanggal} max={v.status === 'rencana' ? undefined : hariIni} onChange={(e) => set('tanggal', e.target.value)} /></div>
        <div><label style={{ marginTop: 0 }}>Kategori *</label><select value={v.kategoriId} onChange={(e) => set('kategoriId', +e.target.value)}>
          <option value={0}>— pilih —</option>{kategori.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}</select></div>
      </div>
      <label>Uraian pekerjaan *</label>
      <textarea rows={2} value={v.uraian} maxLength={500} onChange={(e) => set('uraian', e.target.value)} placeholder="mis. Koordinasi dengan PS FSN Kalbar terkait pembayaran" />
      <label>Durasi * {durasi > 0 && <span className="tiny muted">· {jam(durasi)}</span>}</label>
      {!pakaiJam ? (<>
        <div className="lk-cepat">{DURASI_CEPAT.map((m) => <button key={m} type="button" className={+v.durasi === m ? 'on' : ''} onClick={() => set('durasi', m)}>{m < 60 ? m + ' mnt' : jamKerjaTeks(m)}</button>)}
          <input type="number" min={1} max={960} value={v.durasi || ''} onChange={(e) => set('durasi', +e.target.value)} placeholder="menit lain" aria-label="Durasi dalam menit" /></div>
        <button type="button" className="lk-link" onClick={() => setPakaiJam(true)}><Ikon n="clock" />Isi jam mulai & selesai</button>
      </>) : (<>
        <div className="row">
          <div><input type="time" value={v.jamMulai} onChange={(e) => set('jamMulai', e.target.value)} aria-label="Jam mulai" /></div>
          <div><input type="time" value={v.jamSelesai} onChange={(e) => set('jamSelesai', e.target.value)} aria-label="Jam selesai" /></div>
        </div>
        <button type="button" className="lk-link" onClick={() => { setPakaiJam(false); setV((y) => ({ ...y, jamMulai: '', jamSelesai: '' })); }}><Ikon n="timer" />Pakai pilihan durasi saja</button>
      </>)}
      {!awal?.id && <div className="lk-timer">{timer
        ? <><span className="lk-titik-merah" />Timer berjalan sejak <b>{timer}</b><button type="button" className="btn sm auto" onClick={stopTimer}><Ikon n="check" />Stop & isi jam</button></>
        : <button type="button" className="btn ghost sm auto" onClick={mulaiTimer}><Ikon n="timer" />Mulai timer</button>}</div>}
      <label>Status</label>
      <div className="seg lk-status">{STATUS.map(([k, t]) => <button key={k} type="button" className={v.status === k ? 'on' : ''} onClick={() => set('status', k)}>{t}</button>)}</div>
      {lain ? (<div className="row">
        <div><label>Keterangan</label><input value={v.keterangan} maxLength={500} onChange={(e) => set('keterangan', e.target.value)} placeholder="opsional" /></div>
        <div><label>Tautan (hasil kerja)</label><input value={v.tautan} onChange={(e) => set('tautan', e.target.value)} placeholder="https://" /></div>
      </div>) : <button type="button" className="lk-link" onClick={() => setLain(true)}><Ikon n="plus" />Tambah keterangan / tautan</button>}
      <div className="row" style={{ marginTop: 12 }}>
        {batal && <button type="button" className="btn ghost" onClick={batal}>Batal</button>}
        <button type="button" className="btn" disabled={kirim} onClick={simpan}><Ikon n="check" />{awal?.id ? 'Simpan Perubahan' : 'Catat Pekerjaan'}</button>
      </div>
    </div>
  );
}

/* ---------- daftar pekerjaan dikelompokkan per hari ---------- */
export function DaftarLog({ log, kapasitasHarian, pemilik, kategori, hariIni, segarkan, bolehKomentar }: {
  log: Log[]; kapasitasHarian: Record<string, number>; pemilik: boolean; kategori?: Kategori[]; hariIni: string; segarkan: () => void; bolehKomentar?: boolean;
}) {
  const { toast, galat, yakin, tanya, bukaSheet, tutupSheet } = useAplikasi();
  const hari = [...new Set(log.map((x) => x.tanggal))];
  if (!log.length) return <div className="empty"><Ikon n="list-checks" />Belum ada catatan pekerjaan pada periode ini.</div>;
  const ubahStatus = (x: Log, st: string) => api<{ pesan: string }>('log_status', { id: x.id, status: st }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  const hapus = async (x: Log) => { if (await yakin('Hapus catatan ini?', x.uraian, { ya: 'Hapus' })) api<{ pesan: string }>('log_hapus', { id: x.id }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat); };
  const ubah = (x: Log) => bukaSheet(<><h3><Ikon n="pencil" />Ubah Catatan</h3><FormLog kategori={kategori ?? []} awal={x} hariIni={hariIni} selesai={() => { tutupSheet(); segarkan(); }} batal={tutupSheet} /></>);
  const komentar = async (x: Log) => {
    const isi = await tanya('Komentar untuk pekerjaan ini:', '', { judul: x.uraian.slice(0, 60), panjang: true, wajib: true });
    if (isi) api<{ pesan: string }>('log_komentar', { id: x.id, isi }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  };
  return (<div className="lk-hari-daftar">{hari.map((t) => {
    const isi = log.filter((x) => x.tanggal === t), total = isi.filter((x) => x.status !== 'rencana').reduce((a, x) => a + x.durasi, 0), kap = kapasitasHarian[t] ?? 0;
    return (
      <section key={t} className="lk-hari">
        <h4><span>{tglIndo(t)}</span><span className="tiny muted">{jam(total)}{kap ? ` / ${jam(kap)}` : ' · bukan hari kerja'} · {isi.length} pekerjaan</span></h4>
        {isi.map((x) => (
          <div key={x.id} className={'lk-item st-' + x.status}>
            <div className="lk-item-atas">
              <span className="lk-kat">{x.kategori || 'Tanpa kategori'}</span>
              <span className="tiny muted">{x.jamMulai && x.jamSelesai ? `${x.jamMulai}–${x.jamSelesai} · ` : ''}{jam(x.durasi)}</span>
            </div>
            <div className="lk-uraian">{x.uraian}</div>
            {(x.keterangan || x.tautan) && <div className="tiny muted lk-ket">{x.keterangan}{x.tautan && <a href={x.tautan} target="_blank" rel="noreferrer noopener"><Ikon n="external-link" />tautan</a>}</div>}
            {x.komentar.map((k) => <div key={k.id} className="lk-komentar"><Ikon n="message-circle" /><div><b>{k.oleh}</b><span>{k.isi}</span></div></div>)}
            <div className="lk-item-bawah">
              {pemilik ? <select className={'lk-st-pilih st-' + x.status} value={x.status} onChange={(e) => ubahStatus(x, e.target.value)} aria-label="Ubah status">
                {STATUS.map(([k, tt]) => <option key={k} value={k}>{tt}</option>)}</select>
                : <span className={'badge lk-st-badge st-' + x.status}>{x.statusLabel}</span>}
              {pemilik && <><button type="button" className="btn ghost sm auto" onClick={() => ubah(x)} aria-label="Ubah"><Ikon n="pencil" /></button>
                <button type="button" className="btn ghost sm auto" onClick={() => hapus(x)} aria-label="Hapus"><Ikon n="trash-2" /></button></>}
              {bolehKomentar && <button type="button" className="btn ghost sm auto" onClick={() => komentar(x)}><Ikon n="message-circle" />Komentar</button>}
            </div>
          </div>))}
      </section>);
  })}</div>);
}

/* porsi waktu per kategori */
export function PerKategori({ data }: { data: { kategori: string; menit: number; jumlah: number }[] }) {
  const total = data.reduce((a, x) => a + x.menit, 0);
  if (!total) return <div className="empty tiny">Belum ada data.</div>;
  return (<div className="lk-kategori">{data.map((x) => (
    <div key={x.kategori}><span className="lk-kat-nama">{x.kategori}</span><div className="bar"><i style={{ width: (x.menit / total) * 100 + '%' }} /></div>
      <span className="tiny muted">{jam(x.menit)} · {Math.round((x.menit / total) * 100)}%</span></div>))}</div>);
}
