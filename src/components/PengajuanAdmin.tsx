'use client';
/* HC / Super Admin: buat pengajuan atas nama karyawan (banyak karyawan & rentang tanggal sekaligus), ubah, dan hapus */
import { useEffect, useMemo, useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { pad, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const JENIS: [string, string, string][] = [
  ['dlk', 'Dinas Luar Kota / Kegiatan Lapangan', 'Izin'], ['wfh', 'Work From Home', 'Izin'], ['sakit', 'Sakit', 'Izin'], ['izin', 'Izin', 'Izin'],
  ['keperluan', 'Keperluan pribadi', 'Izin'], ['lainnya', 'Lainnya', 'Izin'], ['setengah_hari', 'Izin setengah hari', 'Izin'], ['izin_telat', 'Izin terlambat', 'Izin'],
  ['Cuti Tahunan', 'Cuti Tahunan', 'Cuti'], ['Cuti Penting', 'Cuti Penting', 'Cuti'], ['Cuti Melahirkan', 'Cuti Melahirkan', 'Cuti'],
];
const JENIS_KET_UBAH: [string, string][] = [['dlk', 'Dinas Luar Kota'], ['wfh', 'WFH'], ['sakit', 'Sakit'], ['izin', 'Izin'], ['keperluan', 'Keperluan pribadi'],
  ['lainnya', 'Lainnya'], ['setengah_hari', 'Setengah hari'], ['libur', 'Libur']];
const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
/* Jumat–Minggu terdekat (minggu ini bila belum lewat Minggu) atau minggu berikutnya */
function akhirPekan(mingguDepan: boolean) {
  const d = new Date(); d.setHours(12);
  const hari = d.getDay() || 7;   // 1 Senin … 7 Minggu
  const jumat = new Date(d); jumat.setDate(d.getDate() + (5 - hari) + (mingguDepan ? 7 : 0));
  const minggu = new Date(jumat); minggu.setDate(jumat.getDate() + 2);
  return [iso(jumat), iso(minggu)];
}

export function FormPengajuanKaryawan({ selesai, jenisAwal = 'dlk' }: { selesai: () => void; jenisAwal?: string }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [karyawan, setKaryawan] = useState<Data[] | null>(null);
  const [pilih, setPilih] = useState<Set<number>>(() => new Set());
  const [cari, setCari] = useState('');
  const [jenis, setJenis] = useState(jenisAwal);
  const [mulai, setMulai] = useState(todayStr()), [sampai, setSampai] = useState(todayStr());
  const [sesi, setSesi] = useState<'pagi' | 'siang'>('pagi'), [jam, setJam] = useState('10:00');
  const [alasan, setAlasan] = useState('');
  const [setujui, setSetujui] = useState(true), [libur, setLibur] = useState(true);
  const [kirim, setKirim] = useState(false), [hasil, setHasil] = useState<Data[] | null>(null);
  useEffect(() => { api<Data[]>('adm_users', {}, true).then((l) => setKaryawan(l.filter((u) => u.aktif && u.role !== 'direktur'))).catch(galat); }, [galat]);
  useEffect(() => { setLibur(jenis === 'dlk'); }, [jenis]);
  const satuHari = jenis === 'setengah_hari' || jenis === 'izin_telat', cuti = jenis.startsWith('Cuti');

  const q = cari.trim().toLowerCase();
  const grup = useMemo(() => {
    const g = new Map<string, Data[]>();
    for (const u of karyawan ?? []) {
      if (q && !`${u.nama} ${u.nik} ${u.dept} ${u.jabatan}`.toLowerCase().includes(q)) continue;
      const k = (u.dept || '').trim() || 'Tanpa divisi';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(u);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [karyawan, q]);
  const ubah = (id: number) => setPilih((x) => { const b = new Set(x); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const ubahGrup = (l: Data[]) => setPilih((x) => { const b = new Set(x), semua = l.every((u) => b.has(u.id)); l.forEach((u) => (semua ? b.delete(u.id) : b.add(u.id))); return b; });
  const namaPilih = (karyawan ?? []).filter((u) => pilih.has(u.id));

  const simpan = async () => {
    if (!pilih.size) { toast('Pilih minimal satu karyawan', true); return; }
    setKirim(true);
    try {
      const r = await api<{ pesan: string; hasil: Data[] }>('adm_buat_pengajuan', { userIds: [...pilih], jenis, mulai, sampai: satuHari ? mulai : sampai, sesi, jam,
        alasan: alasan.trim(), setujui, termasukLibur: libur });
      toast(r.pesan); setHasil(r.hasil); selesai();
    } catch (e) { galat(e); } finally { setKirim(false); }
  };

  if (hasil) return (<>
    <h3><Ikon n="circle-check" />Hasil Pembuatan Pengajuan</h3>
    <div className="pa-hasil">{hasil.map((h) => (
      <div key={h.nama} className="kv"><span>{h.nama}</span><span style={{ textAlign: 'right' }}>
        {h.dibuat ? <span className="badge b-green">{h.dibuat} {cuti ? 'hari cuti' : 'catatan'}</span> : <span className="badge b-gray">tidak dibuat</span>}
        {h.dilewati.length > 0 && <div className="tiny muted">dilewati: {h.dilewati.join(', ')}</div>}</span></div>))}</div>
    <button className="btn" onClick={() => setHasil(null)}><Ikon n="plus" />Buat lagi</button>
    <button className="btn ghost" onClick={tutupSheet}>Selesai</button>
  </>);

  return (<>
    <h3><Ikon n="user-plus" />Buat Pengajuan untuk Karyawan</h3>
    <div className="note">Untuk karyawan yang lupa mengajukan, mis. dinas luar kota atau kegiatan kompetisi di lapangan. Karyawan menerima notifikasi bahwa pengajuan dicatat atas namanya.</div>
    <label>Jenis pengajuan</label>
    <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
      {['Izin', 'Cuti'].map((g) => <optgroup key={g} label={g === 'Izin' ? 'Izin, dinas & kehadiran' : 'Cuti'}>
        {JENIS.filter((j) => j[2] === g).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</optgroup>)}</select>

    <label>Tanggal</label>
    {satuHari ? <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} /> : (<>
      <div className="row">
        <div><input type="date" value={mulai} onChange={(e) => { setMulai(e.target.value); if (sampai < e.target.value) setSampai(e.target.value); }} aria-label="Dari tanggal" /></div>
        <div><input type="date" value={sampai} min={mulai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" /></div>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost sm auto" onClick={() => { const [a, z] = akhirPekan(false); setMulai(a); setSampai(z); }}>Jumat–Minggu ini</button>
        <button type="button" className="btn ghost sm auto" onClick={() => { const [a, z] = akhirPekan(true); setMulai(a); setSampai(z); }}>Jumat–Minggu depan</button>
        <button type="button" className="btn ghost sm auto" onClick={() => { setMulai(todayStr()); setSampai(todayStr()); }}>Hari ini</button>
      </div></>)}
    {jenis === 'setengah_hari' && <div className="seg" style={{ marginTop: 8 }}>
      <button type="button" className={sesi === 'pagi' ? 'on' : ''} onClick={() => setSesi('pagi')}>Pagi (masuk siang)</button>
      <button type="button" className={sesi === 'siang' ? 'on' : ''} onClick={() => setSesi('siang')}>Siang (pulang awal)</button></div>}
    {jenis === 'izin_telat' && <><label>Perkiraan jam tiba</label><input type="time" value={jam} onChange={(e) => setJam(e.target.value)} /></>}

    <label>{jenis === 'dlk' ? 'Tujuan & keperluan (wajib)' : 'Keterangan'}</label>
    <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder={jenis === 'dlk' ? 'mis. Panitia OSN Provinsi — Medan' : 'mis. dikonfirmasi atasan via telepon'} />

    <label>Karyawan <span className="tiny muted">({pilih.size} dipilih)</span></label>
    <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, NIK, divisi…" />
    {namaPilih.length > 0 && <div className="pa-chip">{namaPilih.map((u) => <button key={u.id} type="button" className="badge b-blue" onClick={() => ubah(u.id)} title="Hapus dari pilihan">{u.nama} <Ikon n="x" /></button>)}</div>}
    <div className="pa-daftar">
      {!karyawan ? <div className="skel" style={{ height: 120 }} /> : !grup.length ? <div className="empty">Tidak ada karyawan yang cocok.</div>
        : grup.map(([dv, l]) => (
          <div key={dv} className="pa-grup">
            <button type="button" className="pa-grup-kepala" onClick={() => ubahGrup(l)}>
              <input type="checkbox" readOnly tabIndex={-1} checked={l.every((u) => pilih.has(u.id))} /><b>{dv}</b><span className="tiny muted">{l.length} orang · pilih semua</span></button>
            {l.map((u) => (
              <label key={u.id} className="pa-orang"><input type="checkbox" checked={pilih.has(u.id)} onChange={() => ubah(u.id)} />
                <span><b>{u.nama}</b><span className="tiny muted"> · {u.jabatan}</span></span></label>))}
          </div>))}
    </div>

    <div className="switch"><div><b>Langsung disetujui</b><div className="tiny muted">Matikan bila tetap perlu diputus seperti pengajuan biasa</div></div>
      <div className={'sw' + (setujui ? ' on' : '')} role="switch" aria-checked={setujui} tabIndex={0} onClick={() => setSetujui(!setujui)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSetujui(!setujui); } }} /></div>
    {!satuHari && !cuti && <div className="switch"><div><b>Termasuk hari libur</b><div className="tiny muted">Aktifkan untuk dinas / kompetisi akhir pekan agar Sabtu–Minggu ikut tercatat</div></div>
      <div className={'sw' + (libur ? ' on' : '')} role="switch" aria-checked={libur} tabIndex={0} onClick={() => setLibur(!libur)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLibur(!libur); } }} /></div>}
    <div className="tiny muted" style={{ marginTop: 6 }}>Tanggal yang sudah punya pengajuan aktif dilewati otomatis. Dinas luar kota & WFH: karyawan tetap bisa absen tanpa batas lokasi; bila tidak absen, hari itu tidak dihitung mangkir.</div>
    <button className="btn" disabled={kirim || !pilih.size} onClick={simpan}><Ikon n="check" />{kirim ? 'Menyimpan…' : `Buat untuk ${pilih.size} karyawan`}</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

/* ubah izin / sakit / dinas / WFH / setengah hari */
export function FormUbahKet({ x, selesai }: { x: Data; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState<Data>({ jenis: x.jenis, tanggal: x.tanggal, sesi: x.sesi || 'pagi', alasan: x.alasan || '', status: x.status, catatan: x.catatanHr || '' });
  const set = (k: string) => (e: { target: { value: string } }) => setV((y) => ({ ...y, [k]: e.target.value }));
  const simpan = () => api<{ pesan: string }>('adm_ket_ubah', { id: x.id, ...v }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  return (<>
    <h3>Ubah Pengajuan · {x.nama}</h3>
    <div className="row"><div><label>Jenis</label><select value={v.jenis} onChange={set('jenis')}>{JENIS_KET_UBAH.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div><label>Tanggal</label><input type="date" value={v.tanggal} onChange={set('tanggal')} /></div></div>
    {v.jenis === 'setengah_hari' && <><label>Sesi</label><select value={v.sesi} onChange={set('sesi')}><option value="pagi">Pagi</option><option value="siang">Siang</option></select></>}
    <label>Status</label><select value={v.status} onChange={set('status')}>
      {['Menunggu HR', 'Disetujui', 'Ditolak HR', 'Dibatalkan'].map((st) => <option key={st} value={st}>{st.replace(' HR', '')}</option>)}</select>
    <label>Keterangan</label><textarea value={v.alasan} onChange={set('alasan')} />
    <label>Catatan HC</label><input value={v.catatan} onChange={set('catatan')} />
    <button className="btn" onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

/* ubah cuti */
export function FormUbahCuti({ c, selesai }: { c: Data; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState<Data>({ jenis: c.jenis, mulai: c.mulai, selesai: c.selesai, alasan: c.alasan || '', status: c.status, catatan: c.catatan || '' });
  const set = (k: string) => (e: { target: { value: string } }) => setV((y) => ({ ...y, [k]: e.target.value }));
  const simpan = () => api<{ pesan: string }>('adm_cuti_ubah', { id: c.id, ...v }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  return (<>
    <h3>Ubah Cuti · {c.nama}</h3>
    <label>Jenis</label><select value={v.jenis} onChange={set('jenis')}>{['Cuti Tahunan', 'Cuti Penting', 'Cuti Melahirkan', 'Sakit', 'Izin'].map((j) => <option key={j}>{j}</option>)}</select>
    <div className="row"><div><label>Mulai</label><input type="date" value={v.mulai} onChange={set('mulai')} /></div>
      <div><label>Selesai</label><input type="date" value={v.selesai} min={v.mulai} onChange={set('selesai')} /></div></div>
    <label>Status</label><select value={v.status} onChange={set('status')}>{['Menunggu', 'Disetujui', 'Ditolak', 'Dibatalkan'].map((st) => <option key={st}>{st}</option>)}</select>
    <label>Alasan</label><textarea value={v.alasan} onChange={set('alasan')} />
    <label>Catatan</label><input value={v.catatan} onChange={set('catatan')} />
    <div className="tiny muted" style={{ marginTop: 6 }}>Jumlah hari dihitung ulang otomatis (hari libur tidak dihitung, kecuali cuti melahirkan). Saat ini: {tglPendek(c.mulai)} – {tglPendek(c.selesai)}, {c.hari} hari.</div>
    <button className="btn" onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

/* tombol ubah/hapus kecil untuk baris daftar (khusus HC / Super Admin) */
export function AksiAdmin({ ubah, hapus }: { ubah?: () => void; hapus: () => void }) {
  return (<div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
    {ubah && <button className="btn ghost sm auto" onClick={ubah}><Ikon n="pencil" />Ubah</button>}
    <button className="btn ghost sm auto" style={{ color: 'var(--danger)' }} onClick={hapus}><Ikon n="trash-2" />Hapus</button>
  </div>);
}
