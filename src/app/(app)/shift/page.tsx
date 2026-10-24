'use client';
/* Shift & jadwal: papan jadwal per tanggal, master shift, roster bulanan (ketuk sel untuk ubah), isi cepat, ekspor */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, NAMA_BULAN, pad, tglIndo, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const kodeShift = (nama: string) => (String(nama || '').replace(/shift/i, '').trim().split(/\s+/).map((w) => w[0]).join('') || 'S').toUpperCase().slice(0, 2);
const HARI = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

export default function ShiftJadwal() {
  const { bukaSheet, galat } = useAplikasi();
  const kini = new Date();
  const [bl, setBl] = useState(kini.getMonth() + 1), [th, setTh] = useState(kini.getFullYear()), [cab, setCab] = useState(0);
  const [shift, setShift] = useState<Data[]>([]), [jd, setJd] = useState<Data | null>(null), [cabang, setCabang] = useState<Data[]>([]);
  const [tglPapan, setTglPapan] = useState(todayStr()), [papan, setPapan] = useState<Data | null>(null);

  const muat = useCallback(() => {
    Promise.all([api<Data[]>('adm_shift', {}, true), api<Data>('adm_jadwal', { bulan: bl, tahun: th, cabangId: cab })])
      .then(([s, j]) => { setShift(s); setJd(j); }).catch(galat);
  }, [bl, th, cab, galat]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { api<Data[]>('adm_cabang', {}, true).then(setCabang).catch(() => {}); }, []);
  useEffect(() => { setPapan(null); api<Data>('adm_jadwal_toko', { tanggal: tglPapan, cabangId: cab }, true).then(setPapan).catch(galat); }, [tglPapan, cab, galat, jd]);

  const nShift = (id: number) => shift.find((x) => x.id === id);
  const jml = new Date(th, bl, 0).getDate();
  const sel = (r: Data, d: number) => {
    const tgl = `${th}-${pad(bl)}-${pad(d)}`, v = r.jadwal?.[tgl];
    let isi: string, warna: string;
    if (v === 0) { isi = 'L'; warna = 'var(--danger)'; }
    else if (v) { isi = nShift(v) ? kodeShift(nShift(v)!.nama) : '?'; warna = 'var(--primary)'; }
    else if (r.jamMode === 'shift' && r.shiftBawaan) { isi = nShift(r.shiftBawaan) ? kodeShift(nShift(r.shiftBawaan)!.nama) : '·'; warna = 'var(--muted)'; }
    else if (r.jamMode === 'fleksibel') { isi = 'F'; warna = 'var(--success)'; }
    else { isi = '·'; warna = 'var(--line-2)'; }
    return (
      <td key={d} style={{ textAlign: 'center', cursor: 'pointer', padding: '4px 6px', color: warna, fontWeight: v !== undefined ? 700 : 400 }}
        title={`${r.nama} · ${tgl}`} onClick={() => bukaSheet(<EditSel r={r} tgl={tgl} shift={shift} selesai={muat} />)}>
        {isi}{r.hasilTukar?.[tgl] && <sup style={{ color: 'var(--purple)' }}>↔</sup>}</td>);
  };
  const ekspor = () => {
    if (!jd) return;
    keExcel(jd.rows.map((r: Data) => {
      const o: Data = { NIK: r.nik, Nama: r.nama, 'Lokasi Kerja': r.cabang || '', 'Pola Jam': r.jamMode };
      for (let d = 1; d <= jml; d++) {
        const tgl = `${th}-${pad(bl)}-${pad(d)}`, v = r.jadwal?.[tgl];
        let n = v === 0 ? 'LIBUR' : v ? nShift(v)?.nama ?? '?' : r.jamMode === 'shift' && r.shiftBawaan ? (nShift(r.shiftBawaan)?.nama ?? '') + ' (bawaan)' : r.jamMode === 'fleksibel' ? 'Fleksibel' : 'Jam tetap';
        if (r.hasilTukar?.[tgl]) n += ' [tukar]';
        o[d] = n;
      }
      return o;
    }), 'Jadwal', `jadwal-${th}-${pad(bl)}`).catch(galat);
  };

  return (<>
    <div className="card"><h3><Ikon n="calendar-days" />Papan Jadwal per Lokasi</h3>
      <div className="lap-filter"><div><label style={{ marginTop: 0 }}>Tanggal</label><input type="date" value={tglPapan} onChange={(e) => setTglPapan(e.target.value)} /></div></div>
      {!papan ? <div className="skel" style={{ height: 80, marginTop: 10 }} /> : !papan.toko.length ? <div className="empty">Belum ada karyawan.</div> : (<>
        <div className="tiny muted" style={{ marginTop: 6 }}>{tglIndo(papan.tanggal)}</div>
        {papan.toko.map((t: Data) => (
          <div key={t.nama} className="item"><div className="nm">{t.nama}{t.tipe === 'pusat' && <> <span className="badge b-purple">Pusat</span></>}</div>
            {t.shift.length ? t.shift.map((sh: Data) => (
              <div key={sh.nama} style={{ marginTop: 8 }}><b>{sh.nama}</b> <span className="tiny muted">{sh.jam}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{sh.orang.map((o: Data) =>
                  <span key={o.id} className={'badge ' + (o.sudahAbsen ? 'b-green' : 'b-blue')}>{o.nama}{o.sudahAbsen && ' ✓'}</span>)}</div></div>))
              : <div className="tiny muted" style={{ marginTop: 6 }}>Tidak ada anggota tim bershift hari ini.</div>}
            {t.libur.length > 0 && <div style={{ marginTop: 8 }}><b className="muted">Libur</b><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {t.libur.map((o: Data) => <span key={o.id} className="badge b-gray">{o.nama}</span>)}</div></div>}
            {t.lain.length > 0 && <div style={{ marginTop: 8 }}><b className="muted">Non-shift</b><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {t.lain.map((o: Data) => <span key={o.id} className="badge b-amber">{o.nama} · {o.ket}</span>)}</div></div>}
          </div>))}
      </>)}
    </div>

    <div className="card"><h3><Ikon n="clock" />Daftar Shift</h3>
      <div className="note">Jam pulang lebih awal dari jam masuk otomatis dianggap <b>shift lintas hari</b> (mis. 23:00–07:00); clock out keesokan paginya tetap dihitung satu hari kerja.</div>
      <button className="btn sm auto" style={{ marginTop: 10 }} onClick={() => bukaSheet(<FormShift sh={null} selesai={muat} />)}><Ikon n="plus" />Tambah Shift</button>
      <div className="tblwrap"><table style={{ minWidth: 520 }}><thead><tr><th>Nama</th><th>Jam</th><th>Durasi</th><th>Toleransi</th><th>Status</th><th /></tr></thead><tbody>
        {shift.map((sh) => (
          <tr key={sh.id}><td><b>{sh.nama}</b> <span className="badge b-gray">{kodeShift(sh.nama)}</span></td>
            <td>{sh.jamMasuk} – {sh.jamPulang}{sh.lintasHari && <> <span className="badge b-purple">lintas hari</span></>}</td>
            <td>{jamKerjaTeks(sh.durasiMenit)}</td><td>{sh.toleransi} m</td>
            <td><span className={'badge ' + (sh.aktif ? 'b-green' : 'b-gray')}>{sh.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
            <td><button className="btn sm auto ghost" onClick={() => bukaSheet(<FormShift sh={sh} selesai={muat} />)}>Edit</button></td></tr>))}
      </tbody></table></div>
    </div>

    <div className="card"><h3><Ikon n="calendar" />Jadwal Kerja <span className="m">{NAMA_BULAN[bl - 1]} {th}</span></h3>
      <div className="lap-filter">
        <div><label style={{ marginTop: 0 }}>Bulan</label><select value={bl} onChange={(e) => setBl(+e.target.value)}>{NAMA_BULAN.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></div>
        <div><label style={{ marginTop: 0 }}>Tahun</label><select value={th} onChange={(e) => setTh(+e.target.value)}>{[1, 0, -1].map((x) => <option key={x}>{kini.getFullYear() + x}</option>)}</select></div>
        <div><label style={{ marginTop: 0 }}>Lokasi kerja</label><select value={cab} onChange={(e) => setCab(+e.target.value)}>
          <option value={0}>— Semua lokasi —</option>{cabang.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => jd && bukaSheet(<IsiCepat jd={jd} shift={shift} selesai={muat} />)}><Ikon n="sparkles" />Isi Jadwal Cepat</button>
        <button className="btn sm ghost" onClick={ekspor}><Ikon n="download" />Export Jadwal</button></div>
      <div className="tiny muted" style={{ marginTop: 8 }}>Ketuk kotak mana pun untuk mengubah jadwal satu orang pada satu tanggal. Huruf abu-abu = shift bawaan,
        <b style={{ color: 'var(--danger)' }}> L</b> = libur, <b style={{ color: 'var(--success)' }}>F</b> = jam fleksibel, <b style={{ color: 'var(--purple)' }}>↔</b> = hasil tukar shift.</div>
      {!jd ? <div className="skel" style={{ height: 140, marginTop: 12 }} /> : jd.rows.length ? (
        <div className="tblwrap"><table style={{ fontSize: 11.5 }}><thead><tr><th style={{ position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2 }}>Karyawan</th>
          {Array.from({ length: jml }, (_, i) => { const dw = new Date(th, bl - 1, i + 1).getDay();
            return <th key={i} style={{ textAlign: 'center', padding: '4px 6px', color: dw === 0 ? 'var(--danger)' : undefined }}>{i + 1}<div className="tiny muted">{HARI[dw]}</div></th>; })}</tr></thead>
          <tbody>{jd.rows.map((r: Data) => (
            <tr key={r.id}><td style={{ position: 'sticky', left: 0, background: 'var(--surface)', minWidth: 130 }}><b>{r.nama}</b><div className="tiny muted">{r.cabang || '-'}</div></td>
              {Array.from({ length: jml }, (_, i) => sel(r, i + 1))}</tr>))}</tbody></table></div>
      ) : <div className="empty">Belum ada karyawan pada filter ini.</div>}
    </div>
  </>);
}

function FormShift({ sh, selesai }: { sh: Data | null; selesai: () => void }) {
  const { tutupSheet, yakin, toast, galat } = useAplikasi();
  const [v, setV] = useState({ nama: sh?.nama ?? '', jamMasuk: sh?.jamMasuk ?? '07:00', jamPulang: sh?.jamPulang ?? '15:00', toleransi: sh?.toleransi ?? 10, aktif: sh ? (sh.aktif ? 1 : 0) : 1 });
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const simpan = () => api<{ pesan: string }>('adm_shift_save', { id: sh?.id ?? 0, ...v, nama: v.nama.trim(), toleransi: +v.toleransi || 0, aktif: +v.aktif })
    .then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  const hapus = async () => {
    if (!sh || !(await yakin('Hapus shift ini?'))) return;
    api<{ pesan: string }>('adm_shift_del', { id: sh.id }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  };
  return (<>
    <h3>{sh ? 'Edit' : 'Tambah'} Shift</h3>
    <label>Nama shift</label><input value={v.nama} onChange={set('nama')} placeholder="mis. Shift Pagi" />
    <div className="row"><div><label>Jam masuk</label><input type="time" value={v.jamMasuk} onChange={set('jamMasuk')} /></div>
      <div><label>Jam pulang</label><input type="time" value={v.jamPulang} onChange={set('jamPulang')} /></div></div>
    <div className="tiny muted" style={{ marginTop: 4 }}>Jam pulang lebih awal dari jam masuk = shift lintas hari.</div>
    <label>Toleransi keterlambatan (menit)</label><input type="number" min={0} max={180} value={v.toleransi} onChange={set('toleransi')} />
    <label>Status</label><select value={v.aktif} onChange={set('aktif')}><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select>
    <button className="btn" onClick={simpan}>Simpan</button>
    {sh && <button className="btn red" onClick={hapus}>Hapus Shift</button>}
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

function EditSel({ r, tgl, shift, selesai }: { r: Data; tgl: string; shift: Data[]; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const kini = r.jadwal?.[tgl];
  const [v, setV] = useState(kini === 0 ? 'libur' : kini ? String(kini) : '');
  const simpan = () => {
    const d: Data = { userId: r.id, mulai: tgl, selesai: tgl };
    if (v === '') d.hapus = 1; else if (v === 'libur') d.shiftId = null; else d.shiftId = +v;
    api<{ pesan: string }>('adm_jadwal_save', d).then((x) => { tutupSheet(); toast(x.pesan); selesai(); }).catch(galat);
  };
  return (<>
    <h3>Jadwal {r.nama}</h3><div className="muted small">{tglIndo(tgl)}</div>
    <label>Tetapkan</label><select value={v} onChange={(e) => setV(e.target.value)}>
      <option value="">— ikuti pola bawaan karyawan —</option>
      {shift.filter((s) => s.aktif).map((s) => <option key={s.id} value={s.id}>{s.nama} ({s.jamMasuk}–{s.jamPulang})</option>)}
      <option value="libur">LIBUR</option></select>
    <button className="btn" onClick={simpan}>Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

function IsiCepat({ jd, shift, selesai }: { jd: Data; shift: Data[]; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [uid, setUid] = useState(jd.rows[0]?.id ?? 0), [mulai, setMulai] = useState(jd.awal), [akhir, setAkhir] = useState(jd.akhir);
  const [hari, setHari] = useState([1, 2, 3, 4, 5, 6]), [v, setV] = useState(String(shift.find((s) => s.aktif)?.id ?? 'libur'));
  const terapkan = () => {
    if (!hari.length) { toast('Pilih minimal satu hari', true); return; }
    const d: Data = { userId: +uid, mulai, selesai: akhir, hari };
    if (v === '') d.hapus = 1; else if (v === 'libur') d.shiftId = null; else d.shiftId = +v;
    api<{ pesan: string }>('adm_jadwal_save', d).then((x) => { tutupSheet(); toast(x.pesan); selesai(); }).catch(galat);
  };
  return (<>
    <h3>Isi Jadwal Cepat</h3>
    <label>Karyawan</label><select value={uid} onChange={(e) => setUid(+e.target.value)}>{jd.rows.map((r: Data) => <option key={r.id} value={r.id}>{r.nama}</option>)}</select>
    <div className="row"><div><label>Dari tanggal</label><input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} /></div>
      <div><label>Sampai tanggal</label><input type="date" value={akhir} onChange={(e) => setAkhir(e.target.value)} /></div></div>
    <label>Hari yang diisi</label>
    <div>{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((n, i) => (
      <label key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 10px 6px 0', fontSize: 13 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={hari.includes(i + 1)} onChange={(e) => setHari((h) => (e.target.checked ? [...h, i + 1] : h.filter((x) => x !== i + 1)))} /> {n}</label>))}</div>
    <label>Tetapkan</label><select value={v} onChange={(e) => setV(e.target.value)}>
      {shift.filter((s) => s.aktif).map((s) => <option key={s.id} value={s.id}>{s.nama} ({s.jamMasuk}–{s.jamPulang})</option>)}
      <option value="libur">LIBUR</option><option value="">— kosongkan (ikuti pola bawaan) —</option></select>
    <button className="btn" onClick={terapkan}>Terapkan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
