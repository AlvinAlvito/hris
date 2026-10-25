'use client';
/* Rekap absensi harian: ringkasan visual, approval absensi (Supervisor untuk timnya, HC & Super Admin untuk semua),
   lupa clock out, koreksi manual (HC), ekspor detail & rekap per karyawan */
import { useCallback, useEffect, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { BadgeApproval } from '@/components/BadgeApproval';
import { RingkasanAbsensi, type FilterRingkasan } from '@/components/RingkasanAbsensi';
import { useLihatFoto } from '@/components/FotoAbsen';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { jamKerjaTeks, km, labelRole, NAMA_BULAN, NAMA_HARI, pad, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function Absensi() {
  const { me, bukaSheet, tanya, toast, galat, muatInbox } = useAplikasi();
  const admin = isAdminUp(me);
  const [tgl, setTgl] = useState(todayStr());
  const [filter, setFilterAsli] = useState<FilterRingkasan>({}), [pilih, setPilih] = useState<Set<number>>(() => new Set()), [segar, setSegar] = useState(0);
  const [cab, setCab] = useState(0), [uid, setUid] = useState(0);
  const [data, setData] = useState<HalamanData<Data> | null>(null), [lupa, setLupa] = useState<Data[]>([]);
  const [cari, setCari] = useState(''), [page, setPage] = useState(1);
  const [users, setUsers] = useState<Data[]>([]), [cabang, setCabang] = useState<Data[]>([]);
  const lihatFoto = useLihatFoto();
  const setFilter = (f: FilterRingkasan) => { setFilterAsli(f); setPage(1); };

  const muat = useCallback(() => {
    setData(null);
    setPilih(new Set());
    api<HalamanData<Data>>('adm_absensi', { tanggal: tgl, userId: uid, cabangId: cab, search: cari, page, ...filter }).then(setData).catch(galat);
    api<Data[]>('adm_lupa_out', { cabangId: cab }, true).then(setLupa).catch(() => {});
  }, [tgl, uid, cab, cari, page, filter, galat]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => {
    if (admin) api<Data[]>('adm_users', {}, true).then(setUsers).catch(() => {});
    api<Data[]>('adm_cabang', {}, true).then(setCabang).catch(() => {});
  }, [admin]);
  const segarkan = () => { muat(); setSegar((x) => x + 1); muatInbox(); };
  const koreksi = (a: Data) => bukaSheet(<FormKoreksi a={a} selesai={segarkan} />);
  const bolehPutus = (a: Data) => !!a.inTime && a.userId !== me?.id;
  const putus = async (a: Data, setuju: boolean) => {
    const c = await tanya(setuju ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (wajib, terlihat oleh karyawan):', '',
      { judul: setuju ? `Setujui absensi ${a.nama}` : `Tolak absensi ${a.nama}`, wajib: !setuju });
    if (c === null) return;
    api<{ pesan: string }>('abs_putus', { id: a.id, setuju: setuju ? 1 : 0, catatan: c }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  };
  const setujuiTerpilih = () => api<{ pesan: string }>('abs_putus_massal', { ids: [...pilih] }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  const ubahPilih = (id: number) => setPilih((x) => { const b = new Set(x); if (b.has(id)) b.delete(id); else b.add(id); return b; });

  const eksporDetail = () => api<Data[]>('adm_absensi', { tanggal: tgl, userId: uid, cabangId: cab, search: cari, all: true }).then((rows) => keExcel(rows.map((a) => ({
    Tanggal: a.tanggal, Hari: NAMA_HARI[new Date(a.tanggal + 'T00:00:00').getDay()], NIK: a.nik, Nama: a.nama, 'Lokasi Kerja': a.cabangNama || '', Divisi: a.dept,
    'Mode Absen': a.mode, 'Kerja Dari': a.kerjaDari === 'wfh' ? 'WFH' : a.kerjaDari === 'dlk' ? 'Dinas Luar Kota' : 'Kantor', 'Pola Jam': a.jamMode, Shift: a.shiftNama || '',
    'Jadwal Masuk': a.jadwalIn || '', 'Jadwal Pulang': a.jadwalOut || '', 'Target (jam)': a.targetMenit ? +(a.targetMenit / 60).toFixed(2) : '',
    'Kurang (jam)': a.kurangMenit ? +(a.kurangMenit / 60).toFixed(2) : 0, 'Lembur (jam)': a.lemburMenit ? +(a.lemburMenit / 60).toFixed(2) : 0,
    'Izin ½ Hari': a.izinSesi || '', 'Tanggal Pulang': a.tglPulang || '', 'Clock In': a.inTime, 'Clock Out': a.outTime, Durasi: a.durasi,
    Terlambat: a.terlambat ? 'Ya' : 'Tidak', 'Menit Telat': a.menitTelat, 'Di Luar Area': a.inLuar || a.outLuar ? 'Ya' : 'Tidak',
    'Koordinat In': a.inLat != null ? `${a.inLat.toFixed(6)}, ${a.inLng.toFixed(6)}` : '', 'Koordinat Out': a.outLat != null ? `${a.outLat.toFixed(6)}, ${a.outLng.toFixed(6)}` : '',
    'Lupa Clock Out': a.lupaOut ? 'Ya' : 'Tidak', Dikoreksi: a.dikoreksi ? 'Ya' : 'Tidak', 'Dikoreksi Oleh': a.koreksiOleh || '', 'Catatan Koreksi': a.koreksiCatatan || '',
    'Izin Terlambat': a.telatDiizinkan ? 'Ya' : 'Tidak', 'Setengah Hari Tanpa Izin': a.setengahHari ? 'Ya' : 'Tidak',
    Approval: a.approval, 'Approval Oleh': a.approvalOleh || '', 'Catatan Approval': a.approvalCatatan || '',
  })), 'Absensi', `absensi-${tgl}`)).catch(galat);
  const [th, bl] = tgl.split('-').map(Number);
  const eksporRekap = () => api<Data[]>('adm_rekap', { bulan: bl, tahun: th, cabangId: cab }).then((rows) => keExcel(rows.map((r) => ({
    NIK: r.nik, Nama: r.nama, 'Lokasi Kerja': r.cabang || '', Divisi: r.dept, Jabatan: r.jabatan, Peran: labelRole(r.peran), 'Pola Jam': r.polaJam,
    Hadir: r.hadir, Terlambat: r.telat, 'Total Menit Telat': r.menitTelat, 'Belum Clock Out': r.belumOut,
    'Total Jam Kerja': r.jamKerja, 'Total Target (jam)': r.targetJam, 'Kurang Jam': r.kurangJam, 'Lembur (jam)': r.lemburJam,
    'Lembur Disetujui (jam)': r.lemburDisetujuiJam, 'Pengajuan Disetujui': r.pengajuanDisetujui, 'Izin Disetujui': r.ketDisetujui || 0,
    'Absen Lapangan': r.lapangan, 'Cuti (hari)': r.cutiBulanIni, 'Sisa Cuti Tahunan': r.sisaCuti,
  })), 'Rekap', `rekap-absensi-${th}-${pad(bl)}`)).catch(galat);

  const l = data?.items ?? [];
  const bisaPilih = l.filter((a) => a.approval === 'menunggu' && bolehPutus(a));
  return (<>
    <RingkasanAbsensi tanggal={tgl} cabangId={cab} filter={filter} setFilter={setFilter} segar={segar} />
    {lupa.length > 0 && (
      <div className="card" style={{ borderColor: 'var(--danger)' }}><h3><Ikon n="clock-alert" />Lupa Clock Out ({lupa.length})</h3>
        <div className="note">Karyawan berikut clock in tapi tidak pernah clock out. Mereka <b>tetap bisa absen seperti biasa</b> — baris ini menunggu pengajuan lupa clock out atau koreksi HC.</div>
        {lupa.map((a) => (
          <div key={a.id} className="item"><div className="top"><div><div className="nm">{a.nama} <span className="tiny muted">({a.nik})</span></div>
            <div className="dt">{tglPendek(a.tanggal)} · masuk {a.inTime || '-'}{a.shiftNama && ' · ' + a.shiftNama}{a.cabangNama && ' · ' + a.cabangNama}</div></div>
            <span className="badge b-red">Belum pulang</span></div>
            {admin ? <button className="btn sm auto" style={{ marginTop: 8 }} onClick={() => koreksi(a)}>Isi jam pulang</button>
              : <div className="tiny muted" style={{ marginTop: 6 }}>Minta karyawan mengajukan <b>Lupa Clock Out</b>, lalu setujui di menu Persetujuan.</div>}</div>))}
      </div>)}
    <div className="card"><h3><Ikon n="fingerprint" />Rekap Absensi</h3>
      <div className="lap-filter">
        <div><label style={{ marginTop: 0 }}>Tanggal absensi</label><input type="date" value={tgl} onChange={(e) => { setTgl(e.target.value || todayStr()); setPage(1); }} /></div>
        <div><label style={{ marginTop: 0 }}>Lokasi kerja</label><select value={cab} onChange={(e) => { setCab(+e.target.value); setUid(0); setPage(1); }}>
          <option value={0}>— Semua lokasi —</option>{cabang.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select></div>
        {admin && <div><label style={{ marginTop: 0 }}>Karyawan</label><select value={uid} onChange={(e) => { setUid(+e.target.value); setPage(1); }}>
          <option value={0}>— Semua karyawan —</option>{users.filter((u) => u.role !== 'direktur' && (!cab || u.cabangId === cab)).map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.nik})</option>)}</select></div>}
        <div><label style={{ marginTop: 0 }}>Status approval</label><select value={filter.approval ?? ''} onChange={(e) => setFilter({ ...filter, approval: e.target.value || undefined })}>
          <option value="">— Semua —</option><option value="menunggu">Menunggu</option><option value="disetujui">Disetujui</option><option value="ditolak">Ditolak</option></select></div>
      </div>
      <label>Cari nama, NIK, atau divisi</label><input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Ketik nama / NIK / divisi" />
      {(filter.kategori || filter.approval) && <div className="note" style={{ marginTop: 10 }}>Disaring: {filter.kategori === 'telat' && <b>hanya yang terlambat</b>}
        {filter.kategori && filter.approval && ' · '}{filter.approval && <b>approval {filter.approval}</b>}{' '}
        <button className="btn ghost sm auto" onClick={() => setFilter({})}><Ikon n="x" />Hapus saringan</button></div>}
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn sm green" disabled={!pilih.size} onClick={setujuiTerpilih}><Ikon n="check-check" />Setujui terpilih ({pilih.size})</button>
        <button className="btn sm" onClick={eksporDetail}><Ikon n="download" />Export Excel (detail)</button>
        {admin && <button className="btn sm ghost" onClick={eksporRekap}><Ikon n="download" />Export Rekap Bulanan ({NAMA_BULAN[bl - 1]} {th})</button>}</div>
      {!data ? <div className="skel" style={{ height: 140, marginTop: 12 }} /> : l.length ? (<>
        <div className="tblwrap"><table><thead><tr>
          <th><input type="checkbox" className="ra-pilih" aria-label="Pilih semua yang menunggu" disabled={!bisaPilih.length}
            checked={!!bisaPilih.length && bisaPilih.every((a) => pilih.has(a.id))}
            onChange={(e) => setPilih(e.target.checked ? new Set(bisaPilih.map((a) => a.id)) : new Set())} /></th>
          <th>Tanggal</th><th>NIK</th><th>Nama</th><th>In</th><th>Out</th><th>Durasi</th>
          <th>Telat</th><th>Jadwal</th><th>Kurang/Lembur</th><th>Lokasi</th><th>Foto</th><th>Approval</th>{admin && <th>Koreksi</th>}</tr></thead><tbody>
          {l.map((a) => (
            <tr key={a.id}><td>{a.approval === 'menunggu' && bolehPutus(a) && <input type="checkbox" className="ra-pilih" aria-label={'Pilih ' + a.nama}
              checked={pilih.has(a.id)} onChange={() => ubahPilih(a.id)} />}</td>
              <td>{tglPendek(a.tanggal)}</td><td>{a.nik}</td><td>{a.nama}{a.cabangNama && <div className="tiny muted">{a.cabangNama}</div>}</td>
              <td>{a.inTime || '-'}</td><td>{a.outTime || '-'}</td><td>{a.durasi || '-'}</td>
              <td>{a.jamMode === 'fleksibel' || a.izinSesi === 'pagi' ? <span className="badge b-gray">—</span>
                : a.terlambat ? <span className={'badge ' + (a.telatDiizinkan ? 'b-amber' : 'b-red')} title={a.telatDiizinkan ? 'Izin terlambat disetujui' : undefined}>{a.menitTelat} menit{a.telatDiizinkan && ' · izin'}</span>
                  : <span className="badge b-green">OK</span>}</td>
              <td>{a.jamMode === 'fleksibel' ? <span className="badge b-green">Fleksibel</span> : a.jadwalIn ? `${a.jadwalIn}–${a.jadwalOut}` : <span className="badge b-gray">{a.shiftNama || 'Tetap'}</span>}
                {a.izinSesi && <div className="tiny muted">½ hari {a.izinSesi}</div>}
                {a.setengahHari && <div><span className="badge b-red">½ hari tanpa izin</span></div>}</td>
              <td>{a.kurangMenit > 0 ? <span className="badge b-amber">-{jamKerjaTeks(a.kurangMenit)}</span> : a.lemburMenit > 0 ? <span className="badge b-purple">+{jamKerjaTeks(a.lemburMenit)}</span> : <span className="badge b-green">pas</span>}</td>
              <td>{a.kerjaDari ? <span className="badge b-blue">{a.kerjaDari === 'wfh' ? 'WFH' : 'Dinas'}</span>
                : a.mode === 'lapangan' ? <span className="badge b-purple">{km(a.inJarakBase || 0)} dari {a.baseLabel || 'titik awal'}</span>
                  : a.inLuar || a.outLuar ? <span className="badge b-amber">Luar area</span> : <span className="badge b-green">Kantor</span>}</td>
              <td>{a.inPhoto ? <button className="btn sm auto ghost" onClick={() => lihatFoto(a, 'in')}>In</button> : '-'}{a.outPhoto && <> <button className="btn sm auto ghost" onClick={() => lihatFoto(a, 'out')}>Out</button></>}</td>
              <td><BadgeApproval a={a} />{a.approvalOleh && <div className="tiny muted" title={a.approvalCatatan}>{a.approvalOleh}</div>}
                {a.approval !== 'disetujui' && bolehPutus(a) && <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: 'nowrap' }}>
                  <button className="btn sm auto green" title="Setujui" aria-label={'Setujui absensi ' + a.nama} onClick={() => putus(a, true)}><Ikon n="check" /></button>
                  {a.approval !== 'ditolak' && <button className="btn sm auto red" title="Tolak" aria-label={'Tolak absensi ' + a.nama} onClick={() => putus(a, false)}><Ikon n="x" /></button>}</div>}</td>
              {admin && <td>{a.dikoreksi && <span className="badge b-amber" title={a.koreksiCatatan}>✎ {a.koreksiOleh}</span>} {a.lupaOut && <span className="badge b-red">Lupa out</span>}{' '}
                <button className="btn sm auto ghost" onClick={() => koreksi(a)}>Koreksi</button></td>}</tr>))}
        </tbody></table></div><NavigasiHalaman page={data.page} total={data.total} totalPages={data.totalPages} ubah={setPage} /></>) : <div className="empty">Tidak ada data absensi pada {tgl ? tglPendek(tgl) : 'tanggal ini'}{(filter.kategori || filter.approval) && ' dengan saringan ini'}.</div>}
      <div className="tiny muted" style={{ marginTop: 10 }}>Absensi yang <b>ditolak</b> dihitung tidak hadir di payroll. Absensi yang belum diputus tetap dihitung hadir. Anda tidak dapat menyetujui absensi sendiri.</div>
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
