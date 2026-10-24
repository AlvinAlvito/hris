'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isDir, useAplikasi, type Me } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { BadgeStatusKerja } from '@/components/BadgeStatusKerja';
import { DaftarDokumen } from '@/components/Dokumen';
import { Ikon } from '@/components/Ikon';
import { ImportKaryawan } from '@/components/ImportKaryawan';
import { PilihPeta } from '@/components/PilihPeta';
import { api } from '@/lib/klien/api';
import { bacaBerkas } from '@/lib/klien/berkas';
import { FIELD_BIO, STATUS_KERJA } from '@/lib/klien/biodata';
import { keExcel } from '@/lib/klien/excel';
import { labelRole, masaKerjaTeks, tglPendek, todayStr } from '@/lib/klien/format';
import { normalisasiNomorWhatsApp } from '@/lib/telepon';

type Data = Record<string, any>;

export default function Karyawan() {
  const { bukaSheet, galat } = useAplikasi();
  const [list, setList] = useState<Data[] | null>(null);
  const [cabang, setCabang] = useState<Data[]>([]);
  const [shift, setShift] = useState<Data[]>([]);
  const [kontrak, setKontrak] = useState<Data[]>([]);
  const [cari, setCari] = useState('');

  const muat = useCallback(() => {
    Promise.all([api<Data[]>('adm_users'), api<Data[]>('adm_cabang', {}, true), api<Data[]>('adm_shift', {}, true)])
      .then(([u, c, s]) => { setList(u); setCabang(c); setShift(s); }).catch(galat);
    api<Data[]>('kr_kontrak', { hari: 45 }, true).then(setKontrak).catch(() => {});
  }, [galat]);
  useEffect(() => { muat(); }, [muat]);

  const form = (u: Data | null) => bukaSheet(<FormKaryawan u={u} list={list ?? []} cabang={cabang} shift={shift} selesai={muat} />);
  const profil = (id: number) => bukaSheet(<ProfilKaryawan id={id} edit={(u) => form(u)} />, { besar: true });
  const ekspor = () => api<Data[]>('adm_users').then((l) => keExcel(l.map((u) => ({
    NIK: u.nik, Nama: u.nama, Jabatan: u.jabatan, Divisi: u.dept, Peran: labelRole(u.role), 'Lokasi Kerja': u.cabangNama || '',
    'Pola Jam': u.jamMode, 'Shift Bawaan': u.shiftNama || '', 'Target Jam/Hari': u.targetMenit / 60, 'Jam Inti': u.intiMulai ? u.intiMulai + '–' + u.intiSelesai : '',
    'Tanggal Masuk': u.tglMasuk, 'Masa Kerja': masaKerjaTeks(u.masaKerjaBulan), Status: STATUS_KERJA[u.statusKerja] || '', 'Kontrak Selesai': u.kontrakSelesai || '',
    'Hak Cuti': u.cutiAktif ? 'Aktif' : 'Nonaktif', Jatah: u.jatahEfektif, Terpakai: u.terpakai, Sisa: u.sisa, 'Mode Absen': u.lokasiMode,
    'No HP': u.noHp, Email: u.email, Alamat: u.alamat, 'Status Akun': u.aktif ? 'Aktif' : 'Nonaktif',
  })), 'Karyawan', 'data-karyawan-' + todayStr())).catch(galat);
  const q = cari.trim().toLowerCase();
  const tampil = (list ?? []).filter((u) => !q || `${u.nama} ${u.nik} ${u.jabatan} ${u.dept}`.toLowerCase().includes(q));

  return (<>
    {kontrak.length > 0 && (
      <div className="card glow"><h3><Ikon n="file-clock" />Kontrak berakhir dalam 45 hari <span className="badge b-amber">{kontrak.length}</span></h3>
        {kontrak.map((k) => (
          <div key={k.id} className="item"><div className="top">
            <div className="orang"><Avatar u={k} ukuran={34} /><div><b>{k.nama}</b><div className="tiny muted">{k.jabatan} · {STATUS_KERJA[k.statusKerja] || k.statusKerja}</div></div></div>
            <div style={{ textAlign: 'right' }}><span className={'badge ' + (k.sisaHari < 0 ? 'b-red' : k.sisaHari <= 14 ? 'b-amber' : 'b-blue')}>
              {k.sisaHari < 0 ? `lewat ${-k.sisaHari} hari` : k.sisaHari === 0 ? 'hari ini' : `${k.sisaHari} hari lagi`}</span>
              <div className="tiny muted">{tglPendek(k.kontrakSelesai)}</div></div></div>
            <button className="btn ghost sm auto" style={{ marginTop: 8 }} onClick={() => profil(k.id)}><Ikon n="eye" />Lihat profil</button></div>))}
      </div>)}
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="users" />Data Karyawan <span className="m">({list?.length ?? 0} akun)</span></h3>
        <input placeholder="Cari nama / NIK / divisi" style={{ width: 240 }} value={cari} onChange={(e) => setCari(e.target.value)} /></div>
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => form(null)}><Ikon n="plus" />Tambah Karyawan</button>
        <button className="btn sm ghost" onClick={() => bukaSheet(<ImportKaryawan selesai={muat} />, { besar: true })}><Ikon n="upload" />Import Excel</button>
        <button className="btn sm ghost" onClick={ekspor}><Ikon n="download" />Export Excel</button>
      </div>
      {!list ? <div className="skel" style={{ height: 160, marginTop: 12 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>NIK</th><th>Nama</th><th>WhatsApp</th><th>Status</th><th>Lokasi Kerja</th><th>Pola Jam</th><th>Divisi</th>
          <th>Masuk Kerja</th><th>Hak Cuti</th><th>Sisa/Jatah</th><th>Mode Absen</th><th>Peran</th><th></th></tr></thead>
          <tbody>{tampil.map((u) => {
            const atasan = u.atasanId ? list.find((x) => x.id === u.atasanId)?.nama : '';
            const wa = normalisasiNomorWhatsApp(u.noHp);
            return (
              <tr key={u.id}>
                <td><b>{u.nik}</b></td>
                <td><div className="orang" style={{ cursor: 'pointer' }} onClick={() => profil(u.id)}><Avatar u={u} ukuran={34} />
                  <div><b>{u.nama}</b><div className="tiny muted">{u.jabatan}{atasan && ' · atasan ' + atasan}</div></div></div></td>
                <td>{wa ? <a className="btn icon ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                  aria-label={`WhatsApp ${u.nama}`} title={`WhatsApp ${u.noHp}`} style={{ color: '#25d366' }}><Ikon n="whatsapp" /></a> : <span className="muted" title="Nomor WhatsApp belum diisi">—</span>}</td>
                <td><BadgeStatusKerja u={u} /></td>
                <td>{u.cabangNama ? <>{u.cabangNama}{u.cabangTipe === 'pusat' && <> <span className="badge b-purple">Pusat</span></>}</> : <span className="badge b-red">belum diatur</span>}</td>
                <td>{u.jamMode === 'shift' ? <><span className="badge b-blue">Shift</span><div className="tiny muted">{u.shiftNama || 'belum diatur'}</div></>
                  : u.jamMode === 'fleksibel' ? <><span className="badge b-green">Fleksibel</span><div className="tiny muted">{u.targetMenit / 60} jam/hari{u.intiMulai && ` · inti ${u.intiMulai}–${u.intiSelesai}`}</div></>
                    : <span className="badge b-gray">Tetap</span>}</td>
                <td>{u.dept || '-'}</td>
                <td>{tglPendek(u.tglMasuk)}<div className="tiny muted">{masaKerjaTeks(u.masaKerjaBulan)}</div></td>
                <td>{u.role === 'direktur' ? <span className="badge b-purple">Super Admin</span> : <>
                  <span className={'badge ' + (u.cutiAktif ? 'b-green' : 'b-gray')}>{u.cutiAktif ? 'Aktif' : 'Nonaktif'}</span>{' '}
                  <span className="tiny muted">{u.cutiMode === 'on' ? 'Manual ON' : u.cutiMode === 'off' ? 'Manual OFF' : 'Otomatis'}</span></>}</td>
                <td>{u.cutiAktif ? `${u.sisa} / ${u.jatahEfektif}` : '—'}</td>
                <td>{u.lokasiMode === 'lapangan' ? <span className="badge b-purple">Lapangan {String(u.minJarakKm).replace('.', ',')} km</span>
                  : u.lokasiMode === 'bebas' ? <span className="badge b-gray">Bebas</span> : <span className="badge b-blue">Kantor</span>}</td>
                <td>{!u.aktif ? <span className="badge b-red">Nonaktif</span> : <span className="badge b-blue">{labelRole(u.role)}</span>}</td>
                <td><div className="row" style={{ gap: 6 }}><TombolMasukSebagai u={u} ringkas /><button className="btn sm auto ghost" onClick={() => form(u)}>Edit</button></div></td>
              </tr>);
          })}</tbody></table></div>)}
      <div className="tiny muted" style={{ marginTop: 8 }}>Hak cuti <b>Otomatis</b> aktif sendiri setelah 12 bulan kerja. <b>Mode Lapangan</b>: absen terbuka hanya setelah menjauh sekian km dari titik awal.
        Karyawan bermode <b>Kantor</b> hanya bisa absen di lokasi kerjanya sendiri.</div>
    </div>
  </>);
}

/* ---------- profil karyawan (dibuka HC) ---------- */
function ProfilKaryawan({ id, edit }: { id: number; edit: (u: Data) => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [d, setD] = useState<Data | null>(null);
  const muat = useCallback(() => { api<Data>('kr_profil', { id }).then(setD).catch(galat); }, [id, galat]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="skel" style={{ height: 240 }} />;
  const u = d.profil;
  const gantiFoto = async (f?: File) => {
    try { const b = await bacaBerkas(f, 900); const r = await api<{ pesan: string }>('kr_avatar', { id, gambar: b.data }); toast(r.pesan); muat(); } catch (e) { galat(e); }
  };
  const kv = (k: string, v: string) => <div className="kv" key={k}><span>{k}</span><span style={{ textAlign: 'right' }}><b>{v}</b></span></div>;
  return (<>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <label style={{ margin: 0, cursor: 'pointer' }} title="Ganti foto"><Avatar u={u} ukuran={64} />
        <input type="file" accept="image/*" className="hidden" onChange={(e) => gantiFoto(e.target.files?.[0])} /></label>
      <div><h3 style={{ margin: 0 }}>{u.nama}</h3><div className="muted small">{u.nik} · {u.jabatan}{u.dept && ' · ' + u.dept}</div>
        <div style={{ marginTop: 6 }}><BadgeStatusKerja u={u} /> <span className="badge b-blue">{labelRole(u.role)}</span></div></div>
    </div>
    <div className="grid-2" style={{ marginTop: 6 }}>
      <div className="card flat">{[kv('Atasan', u.atasanNama || '—'), kv('Lokasi', u.cabangNama || '—'), kv('Masuk', tglPendek(u.tglMasuk)),
        kv('Kontrak', u.kontrakSelesai ? tglPendek(u.kontrakSelesai) : '—'), kv('HP', u.noHp || '—'), kv('Email', u.email || '—'), kv('Alamat', u.alamat || '—'),
        kv('Rekening', u.bankRekening ? `${u.bankNama} ${u.bankRekening}` : '—'), kv('NPWP', u.npwp || '—'),
        kv('Darurat', u.daruratNama ? `${u.daruratNama} (${u.daruratHubungan}) ${u.daruratHp}` : '—')]}</div>
      <div className="card flat"><h3><Ikon n="file-text" />Dokumen</h3><DaftarDokumen list={d.dokumen} userId={u.id} jenis={d.jenisDokumen} segarkan={muat} /></div>
    </div>
    <div className="row" style={{ marginTop: 12 }}>
      <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
      <TombolMasukSebagai u={u} />
      <button className="btn" onClick={() => api<Data[]>('adm_users', {}, true).then((l) => edit(l.find((x) => x.id === u.id)!)).catch(galat)}><Ikon n="pencil" />Edit data</button>
    </div>
  </>);
}

function TombolMasukSebagai({ u, ringkas = false }: { u: Data; ringkas?: boolean }) {
  const { me, setMe, tutupSheet, yakin, galat } = useAplikasi();
  const router = useRouter();
  if (me?.role !== 'direktur' || u.role !== 'karyawan' || !u.aktif) return null;
  const masuk = async () => {
    if (!(await yakin(`Masuk sebagai ${u.nama}?`, 'Aplikasi akan memakai hak akses akun karyawan ini. Anda dapat kembali ke Super Admin dari banner di bagian atas halaman.', { ya: 'Masuk sebagai karyawan' }))) return;
    try {
      const r = await api<{ me: Me }>('impersonasi_masuk', { id: u.id }, true);
      setMe(r.me); tutupSheet(); router.replace('/beranda');
    } catch (e) { galat(e); }
  };
  return <button className={'btn sm auto ghost' + (ringkas ? '' : ' soft')} title={`Masuk sebagai ${u.nama}`} onClick={masuk}>
    <Ikon n="user" />{ringkas ? 'Masuk' : 'Masuk sebagai'}
  </button>;
}

/* ---------- form tambah / edit karyawan ---------- */
function FormKaryawan({ u, list, cabang, shift, selesai, awal }: { u: Data | null; list: Data[]; cabang: Data[]; shift: Data[]; selesai: () => void; awal?: Data }) {
  const { me, settings, bukaSheet, tutupSheet, yakin, toast, galat } = useAplikasi();
  const [tab, setTab] = useState('kerja');
  const [v, setV] = useState<Data>(() => awal ?? ({
    nik: u?.nik ?? '', pin: u ? '' : '123456', nama: u?.nama ?? '', jabatan: u?.jabatan ?? '', dept: u?.dept ?? '', cabangId: u?.cabangId ?? 0,
    tglMasuk: u?.tglMasuk ?? todayStr(), role: u?.role === 'admin' || u?.role === 'direktur' ? u.role : 'karyawan', atasanId: u?.atasanId ?? 0,
    statusKerja: u?.statusKerja ?? 'tetap', tglKeluar: u?.tglKeluar ?? '', kontrakMulai: u?.kontrakMulai ?? '', kontrakSelesai: u?.kontrakSelesai ?? '',
    cutiMode: u?.cutiMode ?? 'auto', jatah: u?.jatah ?? settings.jatahDefault, jamMode: u?.jamMode ?? 'tetap', shiftId: u?.shiftId ?? shift[0]?.id ?? 0,
    targetMenit: u?.targetMenit ?? 480, intiMulai: u?.intiMulai ?? '', intiSelesai: u?.intiSelesai ?? '', liburHari: u?.liburHari ?? '',
    lokasiMode: u?.lokasiMode ?? 'kantor', minJarakKm: u?.minJarakKm ?? settings.minJarakDefault, baseLabel: u?.baseLabel ?? '',
    baseLat: u?.baseLat ?? null, baseLng: u?.baseLng ?? null, aktif: u ? (u.aktif ? 1 : 0) : 1,
    ...Object.fromEntries(FIELD_BIO.map((f) => [f[1], u?.[f[1]] ?? ''])),
  }));
  const [kirim, setKirim] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  // setelah memilih titik, form dibuka lagi dengan isian terakhir
  const pilihTitik = () => {
    const isi = v, buka = (x: Data) => bukaSheet(<FormKaryawan u={u} list={list} cabang={cabang} shift={shift} selesai={selesai} awal={x} />);
    bukaSheet(<PilihPeta judul="Titik Awal Kunjungan" lat={v.baseLat} lng={v.baseLng} radius={(+v.minJarakKm || 2.5) * 1000} tipeRadius="luar"
      simpan={(lat, lng) => { buka({ ...isi, baseLat: lat, baseLng: lng }); toast('Titik awal dipilih, tekan Simpan'); }} batal={() => buka(isi)} />);
  };

  const simpan = async () => {
    if (v.lokasiMode === 'lapangan' && v.baseLat == null) { toast('Pilih titik awal di peta dulu', true); return; }
    if (v.lokasiMode === 'kantor' && !+v.cabangId) { toast('Pilih lokasi kerja karyawan ini', true); return; }
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('adm_user_save', { ...v, id: u?.id ?? 0, cabangId: +v.cabangId, atasanId: +v.atasanId, jatah: +v.jatah,
        shiftId: +v.shiftId, targetMenit: +v.targetMenit, minJarakKm: +v.minJarakKm, aktif: +v.aktif });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  const hapus = async () => {
    if (!u || !(await yakin('Hapus karyawan ini beserta data absensi & cutinya?'))) return;
    api<{ pesan: string }>('adm_user_del', { id: u.id }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  };
  const inputBio = (panel: string) => FIELD_BIO.filter((f) => f[0] === panel).map((f) => (
    <div key={f[1]}><label>{f[2]}</label>
      {f[3] === 'sel' ? <select value={v[f[1]] ?? ''} onChange={set(f[1])}>{f[4]!.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        : <input type={f[3] === 'date' ? 'date' : 'text'} value={v[f[1]] ?? ''} onChange={set(f[1])} />}</div>));

  return (<>
    <h3>{u ? 'Edit' : 'Tambah'} Karyawan</h3>
    <div className="seg">{[['kerja', 'briefcase', 'Kepegawaian'], ['bio', 'id-card', 'Biodata'], ['bank', 'landmark', 'Bank & BPJS'], ['darurat', 'heart-pulse', 'Kontak Darurat']]
      .map(([k, ic, t]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>
    {tab === 'kerja' && (<div className="ftab">
      <div className="row"><div><label>NIK / ID</label><input value={v.nik} onChange={set('nik')} /></div>
        <div><label>PIN {u && <span className="tiny">(kosongkan bila tidak diubah)</span>}</label><input value={v.pin} onChange={set('pin')} inputMode="numeric" placeholder={u ? '••••••' : ''} /></div></div>
      <label>Nama lengkap</label><input value={v.nama} onChange={set('nama')} />
      <div className="row"><div><label>Jabatan</label><input value={v.jabatan} onChange={set('jabatan')} /></div>
        <div><label>Divisi</label><input value={v.dept} onChange={set('dept')} /></div></div>
      <label>Lokasi kerja</label>
      <select value={v.cabangId} onChange={set('cabangId')}><option value={0}>— pilih lokasi —</option>
        {cabang.map((c) => <option key={c.id} value={c.id}>{c.nama}{c.tipe === 'pusat' ? ' (Kantor Pusat)' : ''}{c.aktif ? '' : ' — nonaktif'}</option>)}</select>
      <div className="row"><div><label>Tanggal masuk kerja</label><input type="date" value={v.tglMasuk} onChange={set('tglMasuk')} /></div>
        <div><label>Peran</label><select value={v.role} onChange={set('role')}><option value="karyawan">Pegawai</option><option value="admin">HC (kendali penuh)</option>
          {isDir(me) && <option value="direktur">Super Admin</option>}</select></div></div>
      <label>Atasan langsung <span className="tiny">(untuk struktur organisasi)</span></label>
      <select value={v.atasanId} onChange={set('atasanId')}><option value={0}>— tidak ada —</option>
        {list.filter((x) => x.aktif && x.id !== u?.id).map((x) => <option key={x.id} value={x.id}>{x.nama} · {x.jabatan}</option>)}</select>
      <div className="row"><div><label>Status kepegawaian</label><select value={v.statusKerja} onChange={set('statusKerja')}>
        {[['tetap', 'Tetap (PKWTT)'], ['kontrak', 'Kontrak (PKWT)'], ['probation', 'Masa percobaan'], ['magang', 'Magang'], ['harian', 'Harian lepas'], ['freelance', 'Freelance / Mitra']]
          .map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div><label>Tanggal keluar <span className="tiny">(bila resign)</span></label><input type="date" value={v.tglKeluar} onChange={set('tglKeluar')} /></div></div>
      <div className="row"><div><label>Kontrak mulai</label><input type="date" value={v.kontrakMulai} onChange={set('kontrakMulai')} /></div>
        <div><label>Kontrak berakhir</label><input type="date" value={v.kontrakSelesai} onChange={set('kontrakSelesai')} /></div></div>
      <div className="sep" />
      <label style={{ marginTop: 0 }}>Hak cuti tahunan</label>
      <select value={v.cutiMode} onChange={set('cutiMode')}><option value="auto">Otomatis — aktif setelah 12 bulan kerja</option>
        <option value="on">ON — paksa aktifkan</option><option value="off">OFF — nonaktifkan</option></select>
      <label>Jatah cuti per tahun (hari)</label><input type="number" min={0} max={60} value={v.jatah} onChange={set('jatah')} />
      <div className="sep" />
      <label style={{ marginTop: 0 }}>Pola jam kerja</label>
      <select value={v.jamMode} onChange={set('jamMode')}><option value="tetap">Tetap — jam masuk/pulang sesuai pengaturan kantor</option>
        <option value="shift">Shift — mengikuti jadwal shift</option><option value="fleksibel">Fleksibel — bebas jam masuk, wajib genap sekian jam</option></select>
      {v.jamMode === 'shift' && (<><label>Shift bawaan</label><select value={v.shiftId} onChange={set('shiftId')}>
        {shift.map((sh) => <option key={sh.id} value={sh.id}>{sh.nama} ({sh.jamMasuk}–{sh.jamPulang}){sh.aktif ? '' : ' — nonaktif'}</option>)}</select>
        <div className="tiny muted" style={{ marginTop: 4 }}>Dipakai bila tanggal tersebut belum diatur di menu Shift & Jadwal.</div></>)}
      {v.jamMode === 'fleksibel' && (<>
        <label>Target jam kerja per hari</label><select value={v.targetMenit} onChange={set('targetMenit')}>
          {[240, 300, 360, 420, 480, 540, 600].map((mn) => <option key={mn} value={mn}>{mn / 60} jam</option>)}</select>
        <div className="row"><div><label>Jam inti mulai <span className="tiny">(opsional)</span></label><input type="time" value={v.intiMulai} onChange={set('intiMulai')} /></div>
          <div><label>Jam inti selesai</label><input type="time" value={v.intiSelesai} onChange={set('intiSelesai')} /></div></div></>)}
      <label>Hari libur mingguan</label>
      <select value={v.liburHari ?? ''} onChange={set('liburHari')}>
        {[['', 'Bawaan (akhir pekan untuk non-shift; shift ikut roster)'], ['0', 'Tidak ada libur mingguan tetap'], ['7', 'Setiap Minggu'], ['6', 'Setiap Sabtu'],
          ['6,7', 'Sabtu & Minggu'], ['5', 'Setiap Jumat']].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <div className="sep" />
      <label style={{ marginTop: 0 }}>Mode lokasi absen</label>
      <select value={v.lokasiMode} onChange={set('lokasiMode')}><option value="kantor">Kantor — wajib di dalam radius kantor</option>
        <option value="lapangan">Lapangan — wajib menjauh dari titik awal</option><option value="bebas">Bebas — tanpa batas lokasi</option></select>
      {v.lokasiMode === 'lapangan' && (<>
        <label>Jarak minimum dari titik awal (km)</label><input type="number" step="0.1" min="0.1" value={v.minJarakKm} onChange={set('minJarakKm')} />
        <label>Titik awal (hotel / mess / rumah saat kunjungan)</label><input value={v.baseLabel} onChange={set('baseLabel')} placeholder="Mis. Hotel Santika" />
        <div className="note" style={{ marginTop: 8 }}>{v.baseLat != null ? <>Titik: <b>{(+v.baseLat).toFixed(6)}, {(+v.baseLng).toFixed(6)}</b></> : 'Titik awal belum dipilih'}</div>
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={pilihTitik}><Ikon n="map-pin" />Pilih Titik Awal di Peta</button></>)}
      <div className="sep" />
      <label style={{ marginTop: 0 }}>Status akun</label><select value={v.aktif} onChange={set('aktif')}><option value={1}>Aktif (bisa login)</option><option value={0}>Nonaktif</option></select>
    </div>)}
    {tab === 'bio' && <div className="ftab">{inputBio('bio')}</div>}
    {tab === 'bank' && <div className="ftab">{inputBio('bank')}<div className="note" style={{ marginTop: 12 }}>Rekening dipakai HC untuk transfer gaji & reimburse.</div></div>}
    {tab === 'darurat' && <div className="ftab">{inputBio('darurat')}</div>}
    <button className="btn" disabled={kirim} onClick={simpan}>Simpan</button>
    {u && u.id !== me?.id && <button className="btn red" onClick={hapus}>Hapus Karyawan</button>}
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
