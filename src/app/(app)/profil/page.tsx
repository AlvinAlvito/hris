'use client';
/* Profil sendiri: Kepegawaian, Data Diri (kolom mandiri bisa diubah), Dokumen, Akun & Tampilan */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isDir, useAplikasi } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { DaftarDokumen } from '@/components/Dokumen';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { bacaBerkas } from '@/lib/klien/berkas';
import { FIELD_BIO, STATUS_KERJA, teksPilihan } from '@/lib/klien/biodata';
import { labelRole, masaKerjaTeks, tglIndo, tglPendek } from '@/lib/klien/format';

type Data = Record<string, any>;
const TAB: [string, string, string][] = [['kerja', 'briefcase', 'Kepegawaian'], ['diri', 'id-card', 'Data Diri'], ['dok', 'file-text', 'Dokumen'], ['akun', 'key-round', 'Akun']];

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="kv" style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}><span>{k}</span><span style={{ textAlign: 'right' }}><b>{v}</b></span></div>;
}

export default function Profil() {
  const { me, setMe, settings, toast, galat } = useAplikasi();
  const [d, setD] = useState<Data | null>(null), [tab, setTab] = useState('kerja');
  const muat = useCallback(() => { api<Data>('kr_profil', {}).then((r) => setD(r)).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  if (!me) return null;
  const u = d?.profil;
  const gantiFoto = async (f?: File) => {
    if (!f) return;
    try {
      const b = await bacaBerkas(f, 900);
      const r = await api<{ pesan: string; foto: string }>('kr_avatar', { id: 0, gambar: b.data });
      toast(r.pesan); setMe({ ...me, foto: r.foto }); muat();
    } catch (e) { galat(e); }
  };
  const pola = !u ? '' : u.jamMode === 'shift' ? 'Shift' + (u.shiftNama ? ' — bawaan ' + u.shiftNama : '')
    : u.jamMode === 'fleksibel' ? `Fleksibel — target ${u.targetMenit / 60} jam/hari` : `Tetap (${settings.jamMasuk}–${settings.jamPulang})`;
  const modeAbsen = !u ? '' : u.lokasiMode === 'lapangan' ? `Lapangan (min ${String(u.minJarakKm).replace('.', ',')} km dari titik awal)`
    : u.lokasiMode === 'kantor' ? 'Kantor (dalam radius lokasi kerja)' : 'Bebas';
  const bdg = { background: 'rgba(255,255,255,.2)', color: '#fff' };

  return (
    <div className="sempit">
      <section className="hero" style={{ padding: 24 }}><div className="orb a" /><div className="orb b" /><div className="grid-bg" />
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <label style={{ margin: 0, cursor: 'pointer', position: 'relative' }} title="Ganti foto profil">
            <Avatar u={u ?? me} ukuran={86} />
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: '#fff', color: 'var(--primary)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow)' }}><Ikon n="camera" /></span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { gantiFoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{me.nama}</h2><div className="date">{me.jabatan}{me.dept ? ' · ' + me.dept : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="badge" style={bdg}>{labelRole(me.role)}</span><span className="badge" style={bdg}>NIK {me.nik}</span>
              {u && <span className="badge" style={bdg}>{masaKerjaTeks(u.masaKerjaBulan)}</span>}</div></div>
        </div>
      </section>
      <div className="seg" style={{ marginTop: 16 }}>{TAB.map(([k, ic, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>

      {!d ? <div className="card"><div className="skel" style={{ height: 220 }} /></div> : <>
        {tab === 'kerja' && <div className="card">
          <Kv k="Status kepegawaian" v={STATUS_KERJA[u.statusKerja] || '-'} />
          {u.kontrakSelesai && <Kv k="Kontrak" v={(u.kontrakMulai ? tglPendek(u.kontrakMulai) + ' – ' : 's.d. ') + tglPendek(u.kontrakSelesai)} />}
          <Kv k="Tanggal masuk" v={tglIndo(u.tglMasuk)} /><Kv k="Atasan langsung" v={u.atasanNama || '—'} />
          {u.jumlahBawahan > 0 && <Kv k="Bawahan langsung" v={u.jumlahBawahan + ' orang'} />}
          <Kv k="Lokasi kerja" v={u.cabangNama || '—'} /><Kv k="Pola jam kerja" v={pola} /><Kv k="Mode absen" v={modeAbsen} />
          {!isDir(me) && <Kv k="Hak cuti" v={u.cutiAktif ? `Aktif (${u.jatahEfektif} hari/tahun, sisa ${u.sisa})` : 'Belum aktif'} />}
          <Kv k="Rekening gaji" v={u.bankRekening ? `${u.bankNama} · ${u.bankRekening}` : 'belum diisi — hubungi HC'} />
          <Kv k="NPWP" v={u.npwp || '—'} /><Kv k="BPJS Kesehatan" v={u.bpjsKesNo || '—'} /><Kv k="BPJS Ketenagakerjaan" v={u.bpjsTkNo || '—'} />
        </div>}
        {tab === 'diri' && <DataDiri d={d} selesai={(baru) => { setMe({ ...me, ...baru }); muat(); }} />}
        {tab === 'dok' && <div className="card"><h3><Ikon n="file-text" />Dokumen Saya</h3>
          <div className="note">Dokumen tersimpan privat — hanya Anda dan HC yang dapat membukanya.</div>
          <DaftarDokumen list={d.dokumen} userId={u.id} jenis={d.jenisDokumen ?? ['KTP', 'Kontrak Kerja', 'Ijazah', 'Lainnya']} segarkan={muat} /></div>}
        {tab === 'akun' && <Akun />}
      </>}
    </div>
  );
}

function DataDiri({ d, selesai }: { d: Data; selesai: (me: Data) => void }) {
  const { toast, galat } = useAplikasi();
  const u = d.profil, bisa = (k: string) => d.kolomMandiri.includes(k);
  const [nilai, setNilai] = useState<Data>(() => Object.fromEntries(d.kolomMandiri.map((k: string) => [k, u[k] ?? ''])));
  const [kirim, setKirim] = useState(false);
  const simpan = () => {
    setKirim(true);
    const isi: Data = { id: 0 };
    for (const k of d.kolomMandiri) isi[k] = String(nilai[k] ?? '').trim();
    api<{ pesan: string; me: Data }>('kr_profil_saya', isi).then((r) => { toast(r.pesan); selesai(r.me); }).catch(galat).finally(() => setKirim(false));
  };
  return (
    <div className="card"><h3><Ikon n="id-card" />Data Diri</h3>
      <div className="note">Data yang bisa Anda ubah sendiri ditampilkan sebagai kolom isian. Data lain (KTP, tanggal lahir, status nikah, rekening) diubah HC agar tetap valid untuk pajak & BPJS.</div>
      {FIELD_BIO.filter((f) => f[0] !== 'bank').map((f) => {
        const [, k, label, jenis, pilihan] = f;
        if (!bisa(k)) return <Kv key={k} k={label} v={jenis === 'sel' ? teksPilihan(f, u[k]) : jenis === 'date' && u[k] ? tglIndo(u[k]) : u[k] || '—'} />;
        const ubah = (v: string) => setNilai({ ...nilai, [k]: v });
        return (<div key={k}><label>{label}</label>
          {jenis === 'sel' ? <select value={nilai[k]} onChange={(e) => ubah(e.target.value)}>{pilihan!.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            : <input type={jenis === 'date' ? 'date' : k === 'email' ? 'email' : 'text'} inputMode={/Hp$/.test(k) ? 'tel' : undefined} value={nilai[k]} onChange={(e) => ubah(e.target.value)} />}</div>);
      })}
      <button className="btn" disabled={kirim} onClick={simpan}><Ikon n="check" />Simpan Perubahan</button>
    </div>
  );
}

function Akun() {
  const { me, setMe, terapkanMode, toast, galat, yakin } = useAplikasi();
  const router = useRouter();
  const [mode, setMode] = useState(me?.modeTampilan || 'auto');
  const [lama, setLama] = useState(''), [baru, setBaru] = useState(''), [ulang, setUlang] = useState('');
  // pratinjau mode dikembalikan ke yang tersimpan saat tab ditinggalkan
  useEffect(() => () => terapkanMode(me?.modeTampilan), [me?.modeTampilan, terapkanMode]);
  if (!me) return null;
  const pilih = (m: string) => { setMode(m); terapkanMode(m); };
  const simpanMode = () => api('br_tema_saya', { tema: '', mode }, true).then(() => { setMe({ ...me, modeTampilan: mode }); toast('Tampilan disimpan'); }).catch(galat);
  const gantiPin = () => {
    if (baru !== ulang) { toast('Konfirmasi PIN baru tidak sama', true); return; }
    api<{ pesan: string }>('ganti_pin', { lama, baru }).then((r) => { toast(r.pesan); setLama(''); setBaru(''); setUlang(''); }).catch(galat);
  };
  const keluar = async () => {
    if (!(await yakin('Keluar dari aplikasi?', '', { ya: 'Keluar' }))) return;
    await api('logout', {}, true).catch(() => {});
    setMe(null); router.replace('/masuk');
  };
  const pin = (v: string, set: (x: string) => void) => <input type="password" inputMode="numeric" maxLength={6} value={v} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} />;
  return (<>
    <div className="card"><h3><Ikon n="palette" />Tampilan</h3><div className="muted small">Mode terang / gelap untuk akun Anda.</div>
      <div className="seg" style={{ marginTop: 12 }}>{[['terang', 'sun', 'Terang'], ['gelap', 'moon', 'Gelap'], ['auto', 'monitor', 'Otomatis']].map(([v, ic, t]) =>
        <button key={v} type="button" className={mode === v ? 'on' : ''} onClick={() => pilih(v)}><Ikon n={ic} />{t}</button>)}</div>
      <button className="btn soft" disabled={mode === (me.modeTampilan || 'auto')} onClick={simpanMode}><Ikon n="check" />Simpan Tampilan</button></div>
    <div className="card"><h3><Ikon n="lock" />Ganti PIN</h3>
      <label style={{ marginTop: 0 }}>PIN lama</label>{pin(lama, setLama)}
      <label>PIN baru (6 digit angka)</label>{pin(baru, setBaru)}
      <label>Ulangi PIN baru</label>{pin(ulang, setUlang)}
      <button className="btn" disabled={!lama || baru.length !== 6} onClick={gantiPin}><Ikon n="key-round" />Simpan PIN Baru</button></div>
    <div className="card"><button className="btn red" style={{ marginTop: 0 }} onClick={keluar}><Ikon n="log-out" />Keluar dari aplikasi</button></div>
  </>);
}
