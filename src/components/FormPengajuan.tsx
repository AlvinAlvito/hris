'use client';
/* Formulir pengajuan pegawai: cuti, izin/sakit, setengah hari, WFH, dinas luar kota, lembur */
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/klien/api';
import { pad, todayStr } from '@/lib/klien/format';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';

type Selesai = () => void;

/* ---------- izin / sakit / setengah hari / WFH / dinas luar kota ---------- */
const JUDUL_IZIN: Record<string, string> = { izin: 'Izin / Sakit', setengah_hari: 'Izin Setengah Hari', wfh: 'Work From Home', dlk: 'Dinas Luar Kota' };
export function FormIzin({ jenis, selesai }: { jenis: 'izin' | 'setengah_hari' | 'wfh' | 'dlk'; selesai: Selesai }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [jenisIzin, setJenisIzin] = useState('sakit');
  const [mulai, setMulai] = useState(todayStr());
  const [sampai, setSampai] = useState(todayStr());
  const [sesi, setSesi] = useState<'pagi' | 'siang'>('pagi');
  const [alasan, setAlasan] = useState('');
  const [kirim, setKirim] = useState(false);
  const setengah = jenis === 'setengah_hari';
  const ajukan = async () => {
    setKirim(true);
    try {
      const d: Record<string, string> = { jenis: jenis === 'izin' ? jenisIzin : jenis, tanggal: mulai, alasan: alasan.trim() };
      if (setengah) d.sesi = sesi; else d.sampai = sampai;
      const r = await api<{ pesan: string }>('ketidakhadiran_ajukan', d);
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (
    <>
      <h3>{JUDUL_IZIN[jenis]}</h3>
      {jenis === 'izin' && (
        <><label>Jenis</label>
          <select value={jenisIzin} onChange={(e) => setJenisIzin(e.target.value)}>
            <option value="sakit">Sakit</option><option value="izin">Izin</option>
            <option value="keperluan">Keperluan pribadi</option><option value="lainnya">Lainnya</option>
          </select></>
      )}
      {setengah ? (
        <>
          <label>Tanggal</label><input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
          <label>Sesi izin</label>
          <div className="seg">
            <button type="button" className={sesi === 'pagi' ? 'on' : ''} onClick={() => setSesi('pagi')}><Ikon n="sun" />Pagi (masuk siang)</button>
            <button type="button" className={sesi === 'siang' ? 'on' : ''} onClick={() => setSesi('siang')}><Ikon n="moon" />Siang (pulang lebih awal)</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Tidak memotong jatah cuti. Target jam kerja hari itu menjadi separuh.</div>
        </>
      ) : (
        <>
          <div className="row">
            <div><label>Dari tanggal</label><input type="date" value={mulai} onChange={(e) => { setMulai(e.target.value); if (sampai < e.target.value) setSampai(e.target.value); }} /></div>
            <div><label>Sampai</label><input type="date" value={sampai} min={mulai} onChange={(e) => setSampai(e.target.value)} /></div>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {jenis === 'izin' ? 'Tidak memotong jatah cuti. ' : 'Absen tetap dengan foto, tanpa batas lokasi kantor. '}Hari libur dalam rentang tidak dihitung.
          </div>
        </>
      )}
      <label>{jenis === 'dlk' ? 'Kota tujuan & keperluan' : 'Keterangan'}</label>
      <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)}
        placeholder={jenis === 'dlk' ? 'mis. Medan — persiapan OSN tingkat provinsi' : jenis === 'wfh' ? 'mis. menyelesaikan laporan' : 'mis. demam, kontrol ke dokter'} />
      <button className="btn" disabled={kirim} onClick={ajukan}><Ikon n="send" />Kirim ke HC</button>
      <button className="btn ghost" onClick={tutupSheet}>Batal</button>
    </>
  );
}

/* ---------- cuti ---------- */
const JENIS_CUTI = ['Cuti Tahunan', 'Cuti Melahirkan', 'Cuti Penting'];   // sakit & izin harian lewat form Izin / Sakit
export function FormCuti({ selesai }: { selesai: Selesai }) {
  const { me, settings, tutupSheet, toast, galat } = useAplikasi();
  const opsi = JENIS_CUTI.filter((j) => !(j === 'Cuti Tahunan' && !me?.cutiAktif));
  const [jenis, setJenis] = useState(opsi[0]);
  const [mulai, setMulai] = useState(todayStr());
  const [akhir, setAkhir] = useState(todayStr());
  const [alasan, setAlasan] = useState('');
  const [libur, setLibur] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(0);
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    api<{ pending: number }>('cuti_saya', {}, true).then((d) => setPending(d.pending)).catch(() => {});
    if (!settings.liburNasionalAktif) return;
    const th = new Set([mulai.slice(0, 4), akhir.slice(0, 4)]);
    th.forEach((t) => api<{ tanggal: string; nama: string }[]>('info_libur', { tahun: +t }, true)
      .then((l) => setLibur((x) => ({ ...x, ...Object.fromEntries(l.map((y) => [y.tanggal, y.nama])) }))).catch(() => {}));
  }, [mulai, akhir, settings.liburNasionalAktif]);

  const hari = useMemo(() => {
    if (!mulai || !akhir || akhir < mulai) return 0;
    const hk = +settings.hariKerjaSeminggu || 5, kal = jenis === 'Cuti Melahirkan';
    let n = 0;
    for (const d = new Date(mulai + 'T00:00:00'), b = new Date(akhir + 'T00:00:00'); d <= b; d.setDate(d.getDate() + 1)) {
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      if (kal || ((d.getDay() || 7) <= hk && !libur[key])) n++;
    }
    return n;
  }, [mulai, akhir, jenis, libur, settings.hariKerjaSeminggu]);
  const sisa = (me?.sisa ?? 0) - pending;

  const ajukan = async () => {
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('cuti_ajukan', { jenis, mulai, selesai: akhir, alasan: alasan.trim() });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (
    <>
      <h3>Ajukan Cuti</h3>
      <label>Jenis</label>
      <select value={jenis} onChange={(e) => setJenis(e.target.value)}>{opsi.map((j) => <option key={j}>{j}</option>)}</select>
      <div className="row">
        <div><label>Tanggal mulai</label><input type="date" value={mulai} onChange={(e) => { setMulai(e.target.value); if (akhir < e.target.value) setAkhir(e.target.value); }} /></div>
        <div><label>Tanggal selesai</label><input type="date" value={akhir} min={mulai} onChange={(e) => setAkhir(e.target.value)} /></div>
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <b>{hari} hari</b> {jenis === 'Cuti Melahirkan' ? '(hari kalender)' : `(hari kerja; ${(+settings.hariKerjaSeminggu || 5) === 6 ? 'Minggu' : 'Sabtu–Minggu'}${settings.liburNasionalAktif ? ' & tanggal merah' : ''} tidak dihitung)`}
        {jenis === 'Cuti Tahunan'
          ? <><br />Memotong saldo cuti tahunan. Sisa tersedia: <b>{sisa} hari</b>{hari > sisa && <><br /><span style={{ color: 'var(--danger)' }}>Melebihi sisa cuti</span></>}</>
          : <><br />Tidak memotong saldo cuti tahunan.</>}
      </div>
      <label>Alasan / keterangan</label>
      <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: keperluan keluarga" />
      <div className="row">
        <button className="btn ghost sm" onClick={tutupSheet}>Batal</button>
        <button className="btn sm" disabled={kirim} onClick={ajukan}>Kirim Pengajuan</button>
      </div>
    </>
  );
}

/* ---------- lembur ---------- */
export function FormLembur({ selesai }: { selesai: Selesai }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [tgl, setTgl] = useState(todayStr());
  const [a, setA] = useState('17:00');
  const [b, setB] = useState('20:00');
  const [alasan, setAlasan] = useState('');
  const [kirim, setKirim] = useState(false);
  const ajukan = async () => {
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('pengajuan_ajukan', { jenis: 'lembur', tanggal: tgl, jamMulai: a, jamSelesai: b, alasan: alasan.trim() });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (
    <>
      <h3>Ajukan Lembur</h3>
      <label>Tanggal lembur</label><input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
      <div className="row">
        <div><label>Jam mulai</label><input type="time" value={a} onChange={(e) => setA(e.target.value)} /></div>
        <div><label>Jam selesai</label><input type="time" value={b} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      <label>Alasan</label>
      <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. input nilai OSN" />
      <button className="btn" disabled={kirim} onClick={ajukan}><Ikon n="send" />Kirim ke HC</button>
      <button className="btn ghost" onClick={tutupSheet}>Batal</button>
    </>
  );
}
