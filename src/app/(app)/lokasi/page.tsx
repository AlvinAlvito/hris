'use client';
/* Lokasi kerja: kantor pusat, perwakilan, dan lokasi kegiatan (venue lomba) beserta titik & radius absen */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { PilihPeta } from '@/components/PilihPeta';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const TIPE: Record<string, [string, string]> = { pusat: ['Kantor Pusat', 'b-purple'], cabang: ['Kantor Perwakilan', 'b-blue'], kegiatan: ['Lokasi Kegiatan', 'b-amber'] };

export default function Lokasi() {
  const { bukaSheet, galat } = useAplikasi();
  const [list, setList] = useState<Data[] | null>(null);
  const muat = useCallback(() => { api<Data[]>('adm_cabang').then(setList).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = (c: Data | null, awal?: Data) => bukaSheet(<FormLokasi c={c} awal={awal} buka={form} selesai={muat} />);
  const ekspor = () => keExcel((list ?? []).map((c) => ({ Nama: c.nama, Tipe: TIPE[c.tipe]?.[0] ?? c.tipe, Alamat: c.alamat, Latitude: c.lat ?? '',
    Longitude: c.lng ?? '', 'Radius (m)': c.radius, Karyawan: c.jumlahKaryawan, Status: c.aktif ? 'Aktif' : 'Nonaktif' })), 'Lokasi', 'lokasi-kerja-' + todayStr()).catch(galat);
  const tanpaTitik = (list ?? []).filter((c) => c.lat == null).length;
  return (
    <div className="card"><h3><Ikon n="map-pin" />Lokasi Kerja <span className="m">({list?.length ?? 0} lokasi)</span></h3>
      <div className="note">Karyawan bermode <b>Kantor</b> diikat ke satu lokasi kerja; absensinya divalidasi terhadap titik dan radius lokasi itu.</div>
      {tanpaTitik > 0 && <div className="warn" style={{ marginTop: 8 }}>{tanpaTitik} lokasi belum punya titik peta — karyawan di sana belum bisa absen.</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => form(null)}><Ikon n="plus" />Tambah Lokasi</button>
        <button className="btn sm ghost" onClick={ekspor}><Ikon n="download" />Export Excel</button></div>
      {!list ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Nama Lokasi</th><th>Tipe</th><th>Titik &amp; Radius</th><th>Karyawan</th><th>Status</th><th /></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id}><td><b>{c.nama}</b>{c.alamat && <div className="tiny muted">{c.alamat}</div>}</td>
              <td><span className={'badge ' + (TIPE[c.tipe]?.[1] ?? 'b-gray')}>{TIPE[c.tipe]?.[0] ?? c.tipe}</span></td>
              <td>{c.lat != null ? <>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}<div className="tiny muted">radius {c.radius} m</div></> : <span className="badge b-red">belum diset</span>}</td>
              <td>{c.jumlahKaryawan} orang</td>
              <td><span className={'badge ' + (c.aktif ? 'b-green' : 'b-gray')}>{c.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
              <td><button className="btn sm auto ghost" onClick={() => form(c)}>Edit</button></td></tr>))}</tbody></table></div>)}
    </div>
  );
}

function FormLokasi({ c, awal, buka, selesai }: { c: Data | null; awal?: Data; buka: (c: Data | null, awal?: Data) => void; selesai: () => void }) {
  const { bukaSheet, tutupSheet, yakin, toast, galat } = useAplikasi();
  const [v, setV] = useState<Data>(() => awal ?? { nama: c?.nama ?? '', tipe: c?.tipe ?? 'cabang', alamat: c?.alamat ?? '', radius: c?.radius ?? 200,
    aktif: c ? (c.aktif ? 1 : 0) : 1, lat: c?.lat ?? null, lng: c?.lng ?? null });
  const [kirim, setKirim] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const peta = () => bukaSheet(<PilihPeta judul={'Titik Lokasi: ' + (v.nama || 'lokasi baru')} lat={v.lat} lng={v.lng} radius={+v.radius || 200}
    simpan={(lat, lng) => { buka(c, { ...v, lat, lng }); toast('Titik dipilih, tekan Simpan'); }} batal={() => buka(c, v)} />);
  const gps = () => navigator.geolocation?.getCurrentPosition((p) => { setV((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude })); toast('Lokasi terisi, tekan Simpan'); },
    () => toast('Gagal mengambil lokasi', true), { enableHighAccuracy: true, timeout: 12000 });
  const simpan = async () => {
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('adm_cabang_save', { id: c?.id ?? 0, ...v, nama: v.nama.trim(), radius: +v.radius || 200, aktif: +v.aktif });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  const hapus = async () => {
    if (!c || !(await yakin('Hapus lokasi kerja ini?'))) return;
    api<{ pesan: string }>('adm_cabang_del', { id: c.id }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  };
  return (<>
    <h3>{c ? 'Edit' : 'Tambah'} Lokasi Kerja</h3>
    <label>Nama lokasi</label><input value={v.nama} onChange={set('nama')} placeholder="mis. Kantor Perwakilan Medan / Venue OSN 2026" />
    <label>Tipe</label><select value={v.tipe} onChange={set('tipe')}>
      <option value="cabang">Kantor Perwakilan</option><option value="pusat">Kantor Pusat</option><option value="kegiatan">Lokasi Kegiatan (venue lomba, sementara)</option></select>
    <label>Alamat (opsional)</label><input value={v.alamat} onChange={set('alamat')} />
    <label>Radius absen (meter)</label><input type="number" min={20} max={5000} value={v.radius} onChange={set('radius')} />
    <div className="note" style={{ marginTop: 10 }}>{v.lat != null ? <>Titik: <b>{(+v.lat).toFixed(6)}, {(+v.lng).toFixed(6)}</b></> : 'Titik peta belum dipilih'}</div>
    <div className="row" style={{ marginTop: 8 }}>
      <button className="btn ghost sm" onClick={peta}><Ikon n="map-pin" />Pilih di Peta</button>
      <button className="btn ghost sm" onClick={gps}><Ikon n="map-pin" />Pakai Lokasi Saya</button></div>
    <label>Status</label><select value={v.aktif} onChange={set('aktif')}><option value={1}>Aktif</option><option value={0}>Nonaktif (karyawan tidak bisa absen)</option></select>
    <button className="btn" disabled={kirim} onClick={simpan}>Simpan</button>
    {c && <button className="btn red" onClick={hapus}>Hapus Lokasi</button>}
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
