'use client';
/* Pengaturan organisasi: identitas & logo, jam kerja, kebijakan absen, reimburse & kasbon, titik kantor, log aktivitas */
import { useEffect, useState, type ReactNode } from 'react';
import { isDir, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
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
    <div className="grid-2"><div><JamKerja /></div><div><Keuangan /><LokasiKantor /></div></div>
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

function JamKerja() {
  const { settings: s } = useAplikasi();
  const simpan = useSimpan();
  const [v, setV] = useState<Data>({ jam_masuk: s.jamMasuk, jam_pulang: s.jamPulang, toleransi: s.toleransi, hari_kerja_seminggu: s.hariKerjaSeminggu,
    jatah_default: s.jatahDefault, min_jarak_default: s.minJarakDefault, wajib_foto: s.wajibFoto, libur_minggu_nonshift: s.liburMingguNonshift,
    libur_nasional_aktif: s.liburNasionalAktif, titik_awal_oleh_admin: s.titikAwalOlehAdmin });
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const sak = (k: string) => (b: boolean) => setV((x) => ({ ...x, [k]: b }));
  return (
    <div className="card"><h3><Ikon n="clock" />Jam & Hari Kerja</h3>
      <div className="row"><div><label>Jam masuk</label><input type="time" value={v.jam_masuk} onChange={set('jam_masuk')} /></div>
        <div><label>Jam pulang</label><input type="time" value={v.jam_pulang} onChange={set('jam_pulang')} /></div></div>
      <label>Toleransi keterlambatan (menit)</label><input type="number" min={0} max={120} value={v.toleransi} onChange={set('toleransi')} />
      <label>Pola hari kerja</label><select value={v.hari_kerja_seminggu} onChange={set('hari_kerja_seminggu')}>
        <option value={5}>5 hari (Senin–Jumat) — Sabtu & Minggu libur</option><option value={6}>6 hari (Senin–Sabtu) — Minggu libur</option></select>
      <div className="tiny muted" style={{ marginTop: 4 }}>Menentukan libur akhir pekan staf non-shift, hitungan hari cuti, dan rumus lembur hari libur (PP 35/2021).</div>
      <label>Jatah cuti default (hari/tahun)</label><input type="number" min={0} max={60} value={v.jatah_default} onChange={set('jatah_default')} />
      <label>Jarak minimum default mode lapangan (km)</label><input type="number" step="0.1" value={v.min_jarak_default} onChange={set('min_jarak_default')} />
      <Saklar on={!!v.wajib_foto} set={sak('wajib_foto')} judul="Wajib foto saat absen" ket="Foto hanya dari kamera langsung" />
      <Saklar on={!!v.libur_minggu_nonshift} set={sak('libur_minggu_nonshift')} judul="Libur akhir pekan otomatis" ket="Staf non-shift tidak wajib absen di akhir pekan" />
      <Saklar on={!!v.libur_nasional_aktif} set={sak('libur_nasional_aktif')} judul="Libur nasional & cuti bersama" ket="Hari di Kalender Libur tidak dihitung hari kerja staf non-shift" />
      <Saklar on={!!v.titik_awal_oleh_admin} set={sak('titik_awal_oleh_admin')} judul="Titik awal hanya diatur HC" ket="Pegawai lapangan tidak bisa mengubah titik awalnya sendiri" />
      <button className="btn" onClick={() => simpan({ ...v, toleransi: +v.toleransi || 0, hari_kerja_seminggu: +v.hari_kerja_seminggu, jatah_default: +v.jatah_default || 12,
        min_jarak_default: +v.min_jarak_default || 2.5 }, 'Pengaturan tersimpan')}>Simpan Pengaturan</button>
    </div>
  );
}

function Keuangan() {
  const { settings: s } = useAplikasi();
  const simpan = useSimpan();
  const [kat, setKat] = useState((s.reimburseKategori || []).join('|')), [hari, setHari] = useState(s.reimburseMaksHari);
  const [kali, setKali] = useState(s.kasbonMaksKaliGaji), [tenor, setTenor] = useState(s.kasbonTenorMaks), [satu, setSatu] = useState(!!s.kasbonSatuAktif);
  return (
    <div className="card"><h3><Ikon n="receipt" />Reimburse & Kasbon</h3>
      <label style={{ marginTop: 0 }}>Kategori reimburse <span className="tiny">(pisahkan dengan tanda |)</span></label><input value={kat} onChange={(e) => setKat(e.target.value)} />
      <div className="row"><div><label>Batas klaim (hari)</label><input type="number" min={1} max={365} value={hari} onChange={(e) => setHari(+e.target.value)} /></div>
        <div><label>Maks. kasbon (× gaji)</label><input type="number" step="0.5" min={0} max={12} value={kali} onChange={(e) => setKali(+e.target.value)} /></div></div>
      <label>Tenor cicilan kasbon maksimal (bulan)</label><input type="number" min={1} max={60} value={tenor} onChange={(e) => setTenor(+e.target.value)} />
      <Saklar on={satu} set={setSatu} judul="Satu kasbon aktif per pegawai" ket="Pegawai harus melunasi dulu sebelum mengajukan lagi" />
      <button className="btn" onClick={() => simpan({ reimburse_kategori: kat.split('|').map((x: string) => x.trim()).filter(Boolean).join('|') || 'Lainnya',
        reimburse_maks_hari: hari || 60, kasbon_maks_kali_gaji: kali || 0, kasbon_tenor_maks: tenor || 12, kasbon_satu_aktif: satu }, 'Pengaturan reimburse & kasbon tersimpan')}>Simpan</button>
    </div>
  );
}

function LokasiKantor() {
  const { settings: s, bukaSheet, tutupSheet } = useAplikasi();
  const simpan = useSimpan();
  const [geo, setGeo] = useState(!!s.geofenceOn), [rad, setRad] = useState(s.radius);
  const titik = (lat: number, lng: number) => { simpan({ office_lat: lat, office_lng: lng, radius: rad || 200 }, 'Titik kantor tersimpan'); tutupSheet(); };
  return (
    <div className="card"><h3><Ikon n="map-pin" />Batas Lokasi Absen</h3>
      <Saklar on={geo} set={setGeo} judul="Tolak absen di luar radius" ket='Jika mati, absen tetap tercatat namun ditandai "luar area"' />
      <div className="note">{s.officeLat != null ? <>Titik kantor cadangan: <b>{s.officeLat.toFixed(6)}, {s.officeLng.toFixed(6)}</b> · radius {s.radius} m</>
        : 'Titik setiap lokasi diatur di menu Lokasi Kerja. Titik cadangan di sini dipakai bila lokasi kerja belum punya titik.'}</div>
      <label>Radius cadangan (meter)</label><input type="number" min={20} max={5000} value={rad} onChange={(e) => setRad(+e.target.value)} />
      <button className="btn ghost" onClick={() => bukaSheet(<PilihPeta judul="Titik Kantor Cadangan" lat={s.officeLat} lng={s.officeLng} radius={rad || 200} simpan={titik} />)}>
        <Ikon n="map-pin" />Pilih Titik di Peta</button>
      <button className="btn" onClick={() => { simpan({ radius: rad || 200, geofence_on: geo }, 'Pengaturan lokasi tersimpan'); }}>Simpan</button>
    </div>
  );
}

function LogAktivitas() {
  const [log, setLog] = useState<Data[] | null>(null);
  useEffect(() => { api<Data[]>('adm_log', {}, true).then(setLog).catch(() => setLog([])); }, []);
  return (
    <div className="card"><h3><Ikon n="history" />Log Aktivitas <span className="m">(200 terakhir)</span></h3>
      {!log ? <div className="skel" style={{ height: 120 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Keterangan</th><th>IP</th></tr></thead><tbody>
          {log.map((l) => <tr key={l.id}><td>{l.created_at}</td><td>{l.nama ? `${l.nama} (${l.nik})` : '-'}</td><td><code>{l.aksi}</code></td>
            <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{l.keterangan}</td><td className="tiny muted">{l.ip}</td></tr>)}
        </tbody></table></div>)}
    </div>
  );
}
