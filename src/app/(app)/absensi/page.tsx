'use client';
/* Rekap absensi harian: daftar detail, lupa clock out, koreksi manual, ekspor detail & rekap per karyawan */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { useLihatFoto } from '@/components/FotoAbsen';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, km, labelRole, NAMA_BULAN, NAMA_HARI, pad, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function Absensi() {
  const { bukaSheet, galat } = useAplikasi();
  const [tgl, setTgl] = useState(todayStr());
  const [cab, setCab] = useState(0), [uid, setUid] = useState(0);
  const [data, setData] = useState<HalamanData<Data> | null>(null), [lupa, setLupa] = useState<Data[]>([]);
  const [cari, setCari] = useState(''), [page, setPage] = useState(1);
  const [users, setUsers] = useState<Data[]>([]), [cabang, setCabang] = useState<Data[]>([]);
  const lihatFoto = useLihatFoto();

  const muat = useCallback(() => {
    setData(null);
    api<HalamanData<Data>>('adm_absensi', { tanggal: tgl, userId: uid, cabangId: cab, search: cari, page }).then(setData).catch(galat);
    api<Data[]>('adm_lupa_out', { cabangId: cab }, true).then(setLupa).catch(() => {});
  }, [tgl, uid, cab, cari, page, galat]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { api<Data[]>('adm_users', {}, true).then(setUsers).catch(() => {}); api<Data[]>('adm_cabang', {}, true).then(setCabang).catch(() => {}); }, []);
  const koreksi = (a: Data) => bukaSheet(<FormKoreksi a={a} selesai={muat} />);

  const eksporDetail = () => api<Data[]>('adm_absensi', { tanggal: tgl, userId: uid, cabangId: cab, search: cari, all: true }).then((rows) => keExcel(rows.map((a) => ({
    Tanggal: a.tanggal, Hari: NAMA_HARI[new Date(a.tanggal + 'T00:00:00').getDay()], NIK: a.nik, Nama: a.nama, 'Lokasi Kerja': a.cabangNama || '', Divisi: a.dept,
    'Mode Absen': a.mode, 'Kerja Dari': a.kerjaDari === 'wfh' ? 'WFH' : a.kerjaDari === 'dlk' ? 'Dinas Luar Kota' : 'Kantor', 'Pola Jam': a.jamMode, Shift: a.shiftNama || '',
    'Jadwal Masuk': a.jadwalIn || '', 'Jadwal Pulang': a.jadwalOut || '', 'Target (jam)': a.targetMenit ? +(a.targetMenit / 60).toFixed(2) : '',
    'Kurang (jam)': a.kurangMenit ? +(a.kurangMenit / 60).toFixed(2) : 0, 'Lembur (jam)': a.lemburMenit ? +(a.lemburMenit / 60).toFixed(2) : 0,
    'Izin ½ Hari': a.izinSesi || '', 'Tanggal Pulang': a.tglPulang || '', 'Clock In': a.inTime, 'Clock Out': a.outTime, Durasi: a.durasi,
    Terlambat: a.terlambat ? 'Ya' : 'Tidak', 'Menit Telat': a.menitTelat, 'Di Luar Area': a.inLuar || a.outLuar ? 'Ya' : 'Tidak',
    'Koordinat In': a.inLat != null ? `${a.inLat.toFixed(6)}, ${a.inLng.toFixed(6)}` : '', 'Koordinat Out': a.outLat != null ? `${a.outLat.toFixed(6)}, ${a.outLng.toFixed(6)}` : '',
    'Lupa Clock Out': a.lupaOut ? 'Ya' : 'Tidak', Dikoreksi: a.dikoreksi ? 'Ya' : 'Tidak', 'Dikoreksi Oleh': a.koreksiOleh || '', 'Catatan Koreksi': a.koreksiCatatan || '',
  })), 'Absensi', `absensi-${tgl}`)).catch(galat);
  const [th, bl] = tgl.split('-').map(Number);
  const eksporRekap = () => api<Data[]>('adm_rekap', { bulan: bl, tahun: th, cabangId: cab }).then((rows) => keExcel(rows.map((r) => ({
    NIK: r.nik, Nama: r.nama, 'Lokasi Kerja': r.cabang || '', Divisi: r.dept, Jabatan: r.jabatan, Peran: labelRole(r.peran), 'Pola Jam': r.polaJam,
    'Shift Bawaan': r.shiftBawaan || '', Hadir: r.hadir, Terlambat: r.telat, 'Total Menit Telat': r.menitTelat, 'Belum Clock Out': r.belumOut,
    'Total Jam Kerja': r.jamKerja, 'Total Target (jam)': r.targetJam, 'Kurang Jam': r.kurangJam, 'Lembur (jam)': r.lemburJam,
    'Lembur Disetujui (jam)': r.lemburDisetujuiJam, 'Pengajuan Disetujui': r.pengajuanDisetujui, 'Izin Disetujui': r.ketDisetujui || 0,
    'Absen Lapangan': r.lapangan, 'Cuti (hari)': r.cutiBulanIni, 'Sisa Cuti Tahunan': r.sisaCuti,
  })), 'Rekap', `rekap-absensi-${th}-${pad(bl)}`)).catch(galat);

  const l = data?.items ?? [];
  return (<>
    {lupa.length > 0 && (
      <div className="card" style={{ borderColor: 'var(--danger)' }}><h3><Ikon n="clock-alert" />Lupa Clock Out ({lupa.length})</h3>
        <div className="note">Karyawan berikut clock in tapi tidak pernah clock out. Mereka <b>tetap bisa absen seperti biasa</b> — baris ini menunggu koreksi Anda.</div>
        {lupa.map((a) => (
          <div key={a.id} className="item"><div className="top"><div><div className="nm">{a.nama} <span className="tiny muted">({a.nik})</span></div>
            <div className="dt">{tglPendek(a.tanggal)} · masuk {a.inTime || '-'}{a.shiftNama && ' · ' + a.shiftNama}{a.cabangNama && ' · ' + a.cabangNama}</div></div>
            <span className="badge b-red">Belum pulang</span></div>
            <button className="btn sm auto" style={{ marginTop: 8 }} onClick={() => koreksi(a)}>Isi jam pulang</button></div>))}
      </div>)}
    <div className="card"><h3><Ikon n="fingerprint" />Rekap Absensi</h3>
      <div className="lap-filter">
        <div><label style={{ marginTop: 0 }}>Tanggal absensi</label><input type="date" value={tgl} onChange={(e) => { setTgl(e.target.value || todayStr()); setPage(1); }} /></div>
        <div><label style={{ marginTop: 0 }}>Lokasi kerja</label><select value={cab} onChange={(e) => { setCab(+e.target.value); setUid(0); setPage(1); }}>
          <option value={0}>— Semua lokasi —</option>{cabang.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select></div>
        <div><label style={{ marginTop: 0 }}>Karyawan</label><select value={uid} onChange={(e) => { setUid(+e.target.value); setPage(1); }}>
          <option value={0}>— Semua karyawan —</option>{users.filter((u) => u.role !== 'direktur' && (!cab || u.cabangId === cab)).map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.nik})</option>)}</select></div>
      </div>
      <label>Cari nama, NIK, atau divisi</label><input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Ketik nama / NIK / divisi" />
      <div className="statgrid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat"><div className="k">Total Record</div><div className="v">{data?.total ?? 0}</div></div>
        <div className="stat"><div className="k">Terlambat</div><div className="v">{l.filter((a) => a.terlambat).length}</div></div>
        <div className="stat"><div className="k">Belum Clock Out</div><div className="v">{l.filter((a) => !a.outTime).length}</div></div>
        <div className="stat"><div className="k">WFH / Dinas</div><div className="v">{l.filter((a) => a.kerjaDari).length}</div></div>
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={eksporDetail}><Ikon n="download" />Export Excel (detail)</button>
        <button className="btn sm ghost" onClick={eksporRekap}><Ikon n="download" />Export Rekap Bulanan ({NAMA_BULAN[bl - 1]} {th})</button></div>
      {!data ? <div className="skel" style={{ height: 140, marginTop: 12 }} /> : l.length ? (<>
        <div className="tblwrap"><table><thead><tr><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Lokasi Kerja</th><th>In</th><th>Out</th><th>Durasi</th>
          <th>Telat</th><th>Pola/Shift</th><th>Kurang/Lembur</th><th>Lokasi</th><th>Foto</th><th>Koreksi</th></tr></thead><tbody>
          {l.map((a) => (
            <tr key={a.id}><td>{tglPendek(a.tanggal)}</td><td>{a.nik}</td><td>{a.nama}</td><td>{a.cabangNama || '-'}</td>
              <td>{a.inTime || '-'}</td><td>{a.outTime || '-'}</td><td>{a.durasi || '-'}</td>
              <td>{a.jamMode === 'fleksibel' || a.izinSesi === 'pagi' ? <span className="badge b-gray">—</span> : a.terlambat ? <span className="badge b-red">{a.menitTelat}m</span> : <span className="badge b-green">OK</span>}</td>
              <td>{a.jamMode === 'shift' ? a.shiftNama || '-' : a.jamMode === 'fleksibel' ? <span className="badge b-green">Fleksibel</span> : <span className="badge b-gray">Tetap</span>}
                {a.izinSesi && <div className="tiny muted">½ hari {a.izinSesi}</div>}</td>
              <td>{a.kurangMenit > 0 ? <span className="badge b-amber">-{jamKerjaTeks(a.kurangMenit)}</span> : a.lemburMenit > 0 ? <span className="badge b-purple">+{jamKerjaTeks(a.lemburMenit)}</span> : <span className="badge b-green">pas</span>}</td>
              <td>{a.kerjaDari ? <span className="badge b-blue">{a.kerjaDari === 'wfh' ? 'WFH' : 'Dinas'}</span>
                : a.mode === 'lapangan' ? <span className="badge b-purple">{km(a.inJarakBase || 0)} dari {a.baseLabel || 'titik awal'}</span>
                  : a.inLuar || a.outLuar ? <span className="badge b-amber">Luar area</span> : <span className="badge b-green">Kantor</span>}</td>
              <td>{a.inPhoto ? <button className="btn sm auto ghost" onClick={() => lihatFoto(a, 'in')}>In</button> : '-'}{a.outPhoto && <> <button className="btn sm auto ghost" onClick={() => lihatFoto(a, 'out')}>Out</button></>}</td>
              <td>{a.dikoreksi && <span className="badge b-amber" title={a.koreksiCatatan}>✎ {a.koreksiOleh}</span>} {a.lupaOut && <span className="badge b-red">Lupa out</span>}{' '}
                <button className="btn sm auto ghost" onClick={() => koreksi(a)}>Koreksi</button></td></tr>))}
        </tbody></table></div><NavigasiHalaman page={data.page} total={data.total} totalPages={data.totalPages} ubah={setPage} /></>) : <div className="empty">Tidak ada data absensi pada {tgl ? tglPendek(tgl) : 'tanggal ini'}.</div>}
    </div>
  </>);
}

function FormKoreksi({ a, selesai }: { a: Data; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [jIn, setIn] = useState(a.inTime || '08:00'), [jOut, setOut] = useState(a.outTime || ''), [tgl, setTgl] = useState(a.tglPulang || a.tanggal), [cat, setCat] = useState('');
  const [kirim, setKirim] = useState(false);
  const simpan = async () => {
    if (!cat.trim()) { toast('Catatan koreksi wajib diisi', true); return; }
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('adm_absen_koreksi', { id: a.id, jamMasuk: jIn, jamPulang: jOut, tglPulang: tgl, catatan: cat.trim() });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (<>
    <h3>Koreksi Absensi</h3>
    <div className="note"><b>{a.nama}</b> · {tglPendek(a.tanggal)}{a.shiftNama && ' · ' + a.shiftNama}{a.jadwalIn && <><br />Jadwal seharusnya {a.jadwalIn}–{a.jadwalOut || '?'}</>}</div>
    <div className="row"><div><label>Jam masuk</label><input type="time" value={jIn} onChange={(e) => setIn(e.target.value)} /></div>
      <div><label>Jam pulang</label><input type="time" value={jOut} onChange={(e) => setOut(e.target.value)} /></div></div>
    <label>Tanggal pulang <span className="tiny">(isi bila shift malam, pulang keesokan harinya)</span></label>
    <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
    <label>Catatan koreksi <span className="tiny">(wajib)</span></label>
    <textarea value={cat} onChange={(e) => setCat(e.target.value)} placeholder="mis. lupa clock out, dikonfirmasi atasan pulang 17:10" />
    <div className="note">Koreksi tercatat atas nama Anda beserta waktunya, dan terlihat di rekap serta Excel. Kosongkan jam pulang bila memang belum diketahui.</div>
    <button className="btn" disabled={kirim} onClick={simpan}>Simpan Koreksi</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
