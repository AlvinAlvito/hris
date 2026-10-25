'use client';
/* Pengaturan organisasi: identitas & logo, jam kerja per hari, kebijakan absen, titik kantor, log aktivitas */
import { useEffect, useState, type ReactNode } from 'react';
import { isDir, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman } from '@/components/NavigasiHalaman';
import { PilihPeta } from '@/components/PilihPeta';
import { api } from '@/lib/klien/api';
import { berkasPng } from '@/lib/klien/berkas';

type Data = Record<string, any>;

function Saklar({ on, set, judul, ket }: { on: boolean; set: (v: boolean) => void; judul: string; ket: ReactNode }) {
  return <div className="switch"><div><b>{judul}</b><div className="tiny muted">{ket}</div></div><div className={'sw' + (on ? ' on' : '')} onClick={() => set(!on)} /></div>;
}

export default function Pengaturan() {
  const { me } = useAplikasi();
  return (<>
    <Identitas />
    <div className="grid-2"><div><JamKerja /></div><div><KebijakanAbsen /><LokasiKantor /></div></div>
    {isDir(me) && <LogAktivitas />}
  </>);
}

/* simpan sebagian pengaturan lalu perbarui pengaturan global */
function useSimpan() {
  const { setSettings, toast, galat } = useAplikasi();
  return (data: Data, pesan: string) => api<{ settings: Data }>('adm_settings_save', data)
    .then((d) => { setSettings(d.settings as any); toast(pesan); }).catch(galat);
}

function Identitas() {
  const { settings, setSettings, yakin, toast, galat } = useAplikasi();
  const [nama, setNama] = useState(settings.perusahaan), [slogan, setSlogan] = useState(settings.slogan || '');
  const simpan = () => api<{ pesan: string; settings: Data }>('br_simpan', { perusahaan: nama.trim(), slogan: slogan.trim(), temaDefault: 'posi', warnaBrand: '' })
    .then((r) => { setSettings(r.settings as any); toast(r.pesan); }).catch(galat);
  const unggah = async (aksi: string, f: File | undefined, maks: number) => {
    try { const g = await berkasPng(f, maks); const r = await api<{ pesan: string; settings: Data }>(aksi, { gambar: g }); setSettings(r.settings as any); toast(r.pesan); } catch (e) { galat(e); }
  };
  const hapus = async (jenis: string) => {
    if (!(await yakin(`Hapus ${jenis} kustom?`, 'Kembali ke bawaan POSI.'))) return;
    api<{ pesan: string; settings: Data }>('br_hapus', { jenis }).then((r) => { setSettings(r.settings as any); toast(r.pesan); }).catch(galat);
  };
  return (
    <div className="card"><h3><Ikon n="building-2" />Identitas Organisasi</h3>
      <div className="grid-2" style={{ gap: 14 }}><div>
        <label style={{ marginTop: 0 }}>Nama organisasi</label><input value={nama} onChange={(e) => setNama(e.target.value)} />
        <label>Slogan <span className="tiny muted">(opsional)</span></label><input value={slogan} onChange={(e) => setSlogan(e.target.value)} />
        <button className="btn" onClick={simpan}><Ikon n="check" />Simpan</button>
      </div><div>
        <label style={{ marginTop: 0 }}>Logo <span className="tiny muted">(PNG transparan, maks 2 MB)</span></label>
        <div className="item" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 0 }}>
          <div className="logo" style={{ height: 52 }}><img src={settings.logo || '/logo-posi.png'} alt="" /></div>
          <div style={{ flex: 1 }}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => unggah('br_logo', e.target.files?.[0], 512)} />
            {settings.logo && <button className="btn ghost sm auto" style={{ marginTop: 6 }} onClick={() => hapus('logo')}><Ikon n="trash-2" />Kembali ke logo POSI</button>}</div></div>
        <label>Favicon</label>
        <div className="item" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 0 }}>
          <img src={settings.favicon || '/favicon.png'} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', background: 'var(--surface-3)' }} />
          <div style={{ flex: 1 }}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => unggah('br_favicon', e.target.files?.[0], 256)} />
            {settings.favicon && <button className="btn ghost sm auto" style={{ marginTop: 6 }} onClick={() => hapus('favicon')}><Ikon n="trash-2" />Hapus favicon</button>}</div></div>
      </div></div>
    </div>
  );
}

const HARI_KERJA = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const JADWAL_BAWAAN: Data = { 1: ['08:30', '17:00'], 2: ['08:30', '17:00'], 3: ['08:30', '17:00'], 4: ['08:30', '17:00'], 5: ['08:00', '17:00'], 6: ['08:00', '12:00'], 7: null };
const durasi = (a: string, b: string) => { const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return h2 * 60 + m2 - (h1 * 60 + m1); };

/* Jam kerja per hari: staf jam tetap mengikuti jadwal ini (telat, target jam, hari libur mingguan, hitungan cuti) */
function JamKerja() {
  const { settings: s } = useAplikasi();
  const simpan = useSimpan();
  const [jk, setJk] = useState<Data>(() => ({ ...JADWAL_BAWAAN, ...(s.jadwalKerja ?? {}) }));
  const [tol, setTol] = useState(s.toleransi);
  // jam terakhir yang dipakai sebelum hari itu dijadikan libur, agar saat diaktifkan lagi tidak kembali kosong
  const [ingat, setIngat] = useState<Data>({});
  const ubah = (d: number, i: 0 | 1, v: string) => setJk((x) => ({ ...x, [d]: i === 0 ? [v, x[d][1]] : [x[d][0], v] }));
  const saklar = (d: number) => setJk((x) => {
    if (x[d]) { setIngat((g) => ({ ...g, [d]: x[d] })); return { ...x, [d]: null }; }
    return { ...x, [d]: ingat[d] ?? JADWAL_BAWAAN[d] ?? ['08:00', '17:00'] };
  });
  const totalMinggu = [1, 2, 3, 4, 5, 6, 7].reduce((n, d) => n + (jk[d] ? Math.max(0, durasi(jk[d][0], jk[d][1])) : 0), 0);
  const salah = [1, 2, 3, 4, 5, 6, 7].some((d) => jk[d] && durasi(jk[d][0], jk[d][1]) <= 0);
  return (
    <div className="card"><h3><Ikon n="clock" />Jam Kerja per Hari</h3>
      <div className="tiny muted" style={{ marginBottom: 8 }}>Berlaku untuk karyawan berpola jam <b>Tetap</b>. Hari yang dimatikan menjadi libur mingguan: tidak wajib absen dan tidak dihitung hari cuti.</div>
      <div className="jk-tabel">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const j = jk[d], menit = j ? durasi(j[0], j[1]) : 0;
          return (
            <div key={d} className={'jk-baris' + (j ? '' : ' libur')}>
              <div className="jk-hari"><div className={'sw' + (j ? ' on' : '')} role="switch" aria-checked={!!j} tabIndex={0} aria-label={'Hari kerja ' + HARI_KERJA[d]}
                onClick={() => saklar(d)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); saklar(d); } }} /><b>{HARI_KERJA[d]}</b></div>
              {j ? (<>
                <input type="time" value={j[0]} onChange={(e) => ubah(d, 0, e.target.value)} aria-label={'Jam masuk ' + HARI_KERJA[d]} />
                <span className="muted">–</span>
                <input type="time" value={j[1]} onChange={(e) => ubah(d, 1, e.target.value)} aria-label={'Jam pulang ' + HARI_KERJA[d]} />
                <span className={'badge ' + (menit > 0 ? 'b-gray' : 'b-red')}>{menit > 0 ? `${Math.floor(menit / 60)}j${menit % 60 ? ` ${menit % 60}m` : ''}` : 'jam salah'}</span>
              </>) : <span className="badge b-gray jk-libur">Libur</span>}
            </div>);
        })}
      </div>
      <div className="note" style={{ marginTop: 10 }}>Total <b>{Math.floor(totalMinggu / 60)} jam{totalMinggu % 60 ? ` ${totalMinggu % 60} menit` : ''}</b> per minggu · {[1, 2, 3, 4, 5, 6, 7].filter((d) => jk[d]).length} hari kerja</div>
      <label>Toleransi keterlambatan (menit)</label><input type="number" min={0} max={120} value={tol} onChange={(e) => setTol(+e.target.value)} />
      <div className="tiny muted" style={{ marginTop: 4 }}>Masuk lewat dari jam masuk + toleransi dicatat terlambat; menit terlambat dihitung dari jam masuk.</div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => setJk({ ...JADWAL_BAWAAN })}><Ikon n="undo-2" />Jam kerja perusahaan</button>
        <button className="btn" disabled={salah} onClick={() => simpan({ jadwal_kerja: jk, toleransi: tol || 0 }, 'Jam kerja tersimpan')}><Ikon n="check" />Simpan Jam Kerja</button>
      </div>
    </div>
  );
}

function KebijakanAbsen() {
  const { settings: s } = useAplikasi();
  const simpan = useSimpan();
  const [v, setV] = useState<Data>({ jatah_default: s.jatahDefault, min_jarak_default: s.minJarakDefault, wajib_foto: s.wajibFoto,
    libur_nasional_aktif: s.liburNasionalAktif, titik_awal_oleh_admin: s.titikAwalOlehAdmin });
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const sak = (k: string) => (b: boolean) => setV((x) => ({ ...x, [k]: b }));
  return (
    <div className="card"><h3><Ikon n="sliders-horizontal" />Kebijakan Absen & Cuti</h3>
      <label style={{ marginTop: 0 }}>Jatah cuti default (hari/tahun)</label><input type="number" min={0} max={60} value={v.jatah_default} onChange={set('jatah_default')} />
      <label>Jarak minimum default mode lapangan (km)</label><input type="number" step="0.1" value={v.min_jarak_default} onChange={set('min_jarak_default')} />
      <Saklar on={!!v.wajib_foto} set={sak('wajib_foto')} judul="Wajib foto saat absen" ket="Foto hanya dari kamera langsung" />
      <Saklar on={!!v.libur_nasional_aktif} set={sak('libur_nasional_aktif')} judul="Libur nasional & cuti bersama" ket="Hari di Kalender Libur tidak dihitung hari kerja" />
      <Saklar on={!!v.titik_awal_oleh_admin} set={sak('titik_awal_oleh_admin')} judul="Titik awal hanya diatur HC" ket="Pegawai lapangan tidak bisa mengubah titik awalnya sendiri" />
      <button className="btn" onClick={() => simpan({ ...v, jatah_default: +v.jatah_default || 12, min_jarak_default: +v.min_jarak_default || 2.5 }, 'Pengaturan tersimpan')}>Simpan</button>
    </div>
  );
}

function LokasiKantor() {
  const { settings: s, bukaSheet, tutupSheet } = useAplikasi();
  const simpan = useSimpan();
  const [rad, setRad] = useState(s.radius);
  const titik = (lat: number, lng: number) => { simpan({ office_lat: lat, office_lng: lng, radius: rad || 200 }, 'Titik kantor tersimpan'); tutupSheet(); };
  return (
    <div className="card"><h3><Ikon n="map-pin" />Batas Lokasi Absen</h3>
      <div className="note"><b>Absen di luar radius tetap dapat dikirim.</b> HC akan mendapat penanda peringatan pada Rekap Absensi dan dashboard.</div>
      <div className="note">{s.officeLat != null ? <>Titik kantor cadangan: <b>{s.officeLat.toFixed(6)}, {s.officeLng.toFixed(6)}</b> · radius {s.radius} m</>
        : 'Titik setiap lokasi diatur di menu Lokasi Kerja. Titik cadangan di sini dipakai bila lokasi kerja belum punya titik.'}</div>
      <label>Radius cadangan (meter)</label><input type="number" min={20} max={5000} value={rad} onChange={(e) => setRad(+e.target.value)} />
      <button className="btn ghost" onClick={() => bukaSheet(<PilihPeta judul="Titik Kantor Cadangan" lat={s.officeLat} lng={s.officeLng} radius={rad || 200} simpan={titik} />)}>
        <Ikon n="map-pin" />Pilih Titik di Peta</button>
      <button className="btn" onClick={() => { simpan({ radius: rad || 200 }, 'Pengaturan lokasi tersimpan'); }}>Simpan</button>
    </div>
  );
}

function LogAktivitas() {
  const [log, setLog] = useState<Data | null>(null), [cari, setCari] = useState(''), [page, setPage] = useState(1);
  useEffect(() => { setLog(null); api<Data>('adm_log', { search: cari, page }, true).then(setLog).catch(() => setLog(null)); }, [cari, page]);
  return (
    <div className="card"><h3><Ikon n="history" />Log Aktivitas</h3>
      <input placeholder="Cari pengguna / aksi / keterangan" value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} />
      {!log ? <div className="skel" style={{ height: 120 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Keterangan</th><th>IP</th></tr></thead><tbody>
          {log.items.map((l: Data) => <tr key={l.id}><td>{l.created_at}</td><td>{l.nama ? `${l.nama} (${l.nik})` : '-'}</td><td><code>{l.aksi}</code></td>
            <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{l.keterangan}</td><td className="tiny muted">{l.ip}</td></tr>)}
        </tbody></table></div>)}
      {log && <NavigasiHalaman page={log.page} total={log.total} totalPages={log.totalPages} ubah={setPage} />}
    </div>
  );
}
