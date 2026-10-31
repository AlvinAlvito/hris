'use client';
/* Portal lowongan publik: daftar lowongan → detail → form lamaran (unggah CV) → ucapan terima kasih.
   Pelamar tidak perlu akun; HRD menghubungi lewat WhatsApp / email yang dicantumkan. */
import { useEffect, useMemo, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { tglIndo } from '@/lib/klien/format';

type Lowongan = { id: number; judul: string; divisi: string; lokasi: string; tipe: string; tipeLabel: string; deskripsi: string; kualifikasi: string[];
  nilaiPlus: string[]; pertanyaan: string[]; batas: string | null; dibuka: string };
const MAKS_CV = 5 * 1024 * 1024;

const bacaBerkas = (f: File) => new Promise<string>((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => gagal(new Error('Gagal membaca berkas')); r.readAsDataURL(f); });

export function PortalRekrutmen() {
  const { settings, galat } = useAplikasi();
  const [data, setData] = useState<{ lowongan: Lowongan[]; pendidikan: string[]; pengalaman: string[] } | null>(null);
  const [pilih, setPilih] = useState<Lowongan | null>(null);
  const [lamar, setLamar] = useState(false);
  const [selesai, setSelesai] = useState<{ nama: string; posisi: string } | null>(null);
  const [cari, setCari] = useState('');

  useEffect(() => { api<{ lowongan: Lowongan[]; pendidikan: string[]; pengalaman: string[] }>('rk_portal', {}, true).then(setData).catch(galat); }, [galat]);
  // tautan langsung ke satu lowongan: /rekrutmen#lowongan-12
  useEffect(() => {
    if (!data) return;
    const m = /^#lowongan-(\d+)$/.exec(window.location.hash);
    if (m) setPilih(data.lowongan.find((x) => x.id === +m[1]) ?? null);
  }, [data]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [pilih, lamar, selesai]);

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return (data?.lowongan ?? []).filter((x) => !k || [x.judul, x.divisi, x.lokasi, x.tipeLabel].some((v) => v.toLowerCase().includes(k)));
  }, [data, cari]);
  const kembali = () => { setLamar(false); setPilih(null); history.replaceState(null, '', '/rekrutmen'); };

  return (
    <div className="rk-portal">
      <header className="rk-kepala">
        <a href="/rekrutmen" className="rk-logo" onClick={(e) => { e.preventDefault(); setSelesai(null); kembali(); }}><img src={settings.logo || '/logo-posi.png'} alt={settings.perusahaan} /></a>
        <span className="rk-pita"><Ikon n="briefcase" />Karier</span>
      </header>

      {selesai ? (
        <section className="card rk-selesai">
          <div className="rk-selesai-ic"><Ikon n="circle-check" /></div>
          <h2>Terima kasih, {selesai.nama.split(' ')[0]}!</h2>
          <p>Lamaran Anda{selesai.posisi && <> untuk posisi <b>{selesai.posisi}</b></>} sudah kami terima.</p>
          <p className="muted">Tim HRD akan segera menghubungi Anda melalui <b>WhatsApp</b> atau <b>email</b> yang Anda cantumkan bila Anda lolos ke tahap berikutnya. Mohon pastikan nomor dan email tersebut aktif.</p>
          <button className="btn ghost auto" onClick={() => { setSelesai(null); kembali(); }}><Ikon n="chevron-left" />Lihat lowongan lain</button>
        </section>
      ) : pilih && lamar ? (
        <FormLamaran l={pilih} pendidikan={data?.pendidikan ?? []} opsiPengalaman={data?.pengalaman ?? []} batal={() => setLamar(false)} selesai={setSelesai} />
      ) : pilih ? (
        <DetailLowongan l={pilih} kembali={kembali} lamar={() => setLamar(true)} />
      ) : (<>
        <section className="rk-hero">
          <h1>Bergabung bersama <span>{settings.perusahaan || 'Yayasan Pendidikan Posi'}</span></h1>
          <p>Kami mencari talenta yang ingin tumbuh dan berkontribusi mencetak generasi juara sains Indonesia. Temukan posisi yang sesuai dan kirim lamaran Anda secara online.</p>
        </section>
        <div className="rk-cari"><Ikon n="search" /><input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari posisi, divisi, atau lokasi…" aria-label="Cari lowongan" /></div>
        {!data ? <div className="card"><div className="skel" style={{ height: 120 }} /></div>
          : !tampil.length ? <div className="card rk-kosong"><Ikon n="briefcase" /><b>{data.lowongan.length ? 'Tidak ada lowongan yang cocok dengan pencarian.' : 'Belum ada lowongan yang dibuka saat ini.'}</b>
            <span className="muted small">Silakan kembali lagi nanti.</span></div>
          : <div className="rk-daftar">{tampil.map((x) => (
            <button key={x.id} type="button" className="card rk-item" onClick={() => { setPilih(x); history.replaceState(null, '', '#lowongan-' + x.id); }}>
              <div className="rk-item-atas"><h3>{x.judul}</h3><span className="badge b-blue">{x.tipeLabel}</span></div>
              <div className="rk-meta">{x.divisi && <span><Ikon n="building-2" />{x.divisi}</span>}{x.lokasi && <span><Ikon n="map-pin" />{x.lokasi}</span>}
                <span><Ikon n="calendar" />{x.batas ? 'Ditutup ' + tglIndo(x.batas) : 'Dibuka hingga terisi'}</span></div>
              {x.deskripsi && <p className="rk-cuplik">{x.deskripsi.slice(0, 180)}{x.deskripsi.length > 180 && '…'}</p>}
              <span className="rk-lanjut">Lihat detail & lamar <Ikon n="chevron-right" /></span>
            </button>))}</div>}
      </>)}
      <footer className="rk-kaki">© {new Date().getFullYear()} {settings.perusahaan} · Data lamaran hanya digunakan untuk keperluan rekrutmen.</footer>
    </div>
  );
}

function DetailLowongan({ l, kembali, lamar }: { l: Lowongan; kembali: () => void; lamar: () => void }) {
  return (
    <section className="card rk-detail">
      <button className="btn ghost sm auto" onClick={kembali}><Ikon n="chevron-left" />Semua lowongan</button>
      <h2>{l.judul}</h2>
      <div className="rk-meta"><span className="badge b-blue">{l.tipeLabel}</span>{l.divisi && <span><Ikon n="building-2" />{l.divisi}</span>}
        {l.lokasi && <span><Ikon n="map-pin" />{l.lokasi}</span>}<span><Ikon n="calendar" />{l.batas ? 'Ditutup ' + tglIndo(l.batas) : 'Dibuka hingga terisi'}</span></div>
      {l.deskripsi && <><h4>Tentang posisi ini</h4><p className="rk-teks">{l.deskripsi}</p></>}
      {l.kualifikasi.length > 0 && <><h4>Kualifikasi</h4><ul className="rk-list">{l.kualifikasi.map((k) => <li key={k}><Ikon n="check" />{k}</li>)}</ul></>}
      {l.nilaiPlus.length > 0 && <><h4>Nilai tambah</h4><ul className="rk-list plus">{l.nilaiPlus.map((k) => <li key={k}><Ikon n="star" />{k}</li>)}</ul></>}
      <button className="btn rk-tombol" onClick={lamar}><Ikon n="send" />Lamar Sekarang</button>
    </section>
  );
}

function FormLamaran({ l, pendidikan, opsiPengalaman, batal, selesai }: { l: Lowongan; pendidikan: string[]; opsiPengalaman: string[]; batal: () => void; selesai: (x: { nama: string; posisi: string }) => void }) {
  const { settings, toast, galat } = useAplikasi();
  const [v, setV] = useState({ nama: '', email: '', noHp: '', domisili: '', pendidikan: '', jurusan: '', pengalaman: '', kerjaTerakhir: '', tautan: '', situs: '' });
  const [jawaban, setJawaban] = useState<string[]>(l.pertanyaan.map(() => ''));
  const [cv, setCv] = useState<File | null>(null);
  const [setuju, setSetuju] = useState(false);
  const [kirim, setKirim] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const pilihCv = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) { toast('CV harus berupa PDF atau Word (.docx)', true); return; }
    if (f.size > MAKS_CV) { toast('Ukuran CV maksimal 5 MB', true); return; }
    setCv(f);
  };
  const ajukan = async (e: React.FormEvent) => {
    e.preventDefault();
    // periksa berurutan dari atas agar pesan sesuai kolom yang belum diisi
    const kurang = v.nama.trim().length < 3 ? 'Isi nama lengkap Anda'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim()) ? 'Isi alamat email yang valid'
      : v.noHp.replace(/\D/g, '').length < 9 ? 'Isi nomor WhatsApp yang aktif'
      : !v.pendidikan ? 'Pilih pendidikan terakhir'
      : !v.pengalaman ? 'Pilih lama pengalaman kerja'
      : l.pertanyaan.find((_, n) => !jawaban[n].trim()) ? `Jawab pertanyaan: "${l.pertanyaan.find((_, n) => !jawaban[n].trim())}"`
      : !cv ? 'Unggah CV Anda (PDF atau DOCX)'
      : !setuju ? 'Centang persetujuan pemrosesan data' : '';
    if (kurang || !cv) { toast(kurang, true); return; }
    setKirim(true);
    try {
      const r = await api<{ nama: string; posisi: string }>('rk_lamar', { ...v, lowonganId: l.id, jawaban, setuju, cv: await bacaBerkas(cv), cvNama: cv.name });
      selesai({ nama: r.nama || v.nama, posisi: r.posisi || l.judul });
    } catch (er) { galat(er); setKirim(false); }
  };
  return (
    <form className="card rk-form" onSubmit={ajukan} noValidate>
      <button type="button" className="btn ghost sm auto" onClick={batal}><Ikon n="chevron-left" />Kembali ke detail</button>
      <h2>Lamar: {l.judul}</h2>
      <p className="muted small">Lengkapi data di bawah ini. Kolom bertanda * wajib diisi.</p>
      <label htmlFor="rkNama">Nama lengkap *</label><input id="rkNama" value={v.nama} onChange={set('nama')} autoComplete="name" required maxLength={150} />
      <div className="row">
        <div><label htmlFor="rkEmail">Email *</label><input id="rkEmail" type="email" value={v.email} onChange={set('email')} autoComplete="email" required maxLength={150} /></div>
        <div><label htmlFor="rkHp">Nomor WhatsApp *</label><input id="rkHp" type="tel" inputMode="tel" value={v.noHp} onChange={set('noHp')} autoComplete="tel" placeholder="08xxxxxxxxxx" required /></div>
      </div>
      <div className="row">
        <div><label htmlFor="rkPend">Pendidikan terakhir *</label><select id="rkPend" value={v.pendidikan} onChange={set('pendidikan')} required>
          <option value="">— pilih —</option>{pendidikan.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div><label htmlFor="rkJur">Jurusan / program studi</label><input id="rkJur" value={v.jurusan} onChange={set('jurusan')} maxLength={100} placeholder="mis. Pendidikan Matematika" /></div>
      </div>
      <div className="row">
        <div><label htmlFor="rkPengalaman">Lama pengalaman kerja *</label><select id="rkPengalaman" value={v.pengalaman} onChange={set('pengalaman')} required>
          <option value="">— pilih —</option>{opsiPengalaman.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div><label htmlFor="rkKota">Domisili (kota)</label><input id="rkKota" value={v.domisili} onChange={set('domisili')} maxLength={120} placeholder="mis. Medan" /></div>
      </div>
      <label htmlFor="rkKerja">Posisi & tempat kerja terakhir <span className="tiny muted">(kosongkan bila belum pernah bekerja)</span></label>
      <input id="rkKerja" value={v.kerjaTerakhir} onChange={set('kerjaTerakhir')} maxLength={150} placeholder="mis. Guru Matematika — SMA Swasta Cendekia" />
      <label htmlFor="rkTautan">Tautan portofolio / LinkedIn <span className="tiny muted">(opsional)</span></label>
      <input id="rkTautan" type="url" value={v.tautan} onChange={set('tautan')} placeholder="https://" maxLength={300} />
      {l.pertanyaan.map((t, n) => (
        <div key={n}><label htmlFor={'rkQ' + n}>{t} *</label>
          <textarea id={'rkQ' + n} value={jawaban[n]} maxLength={1500} onChange={(e) => setJawaban((x) => x.map((y, j) => (j === n ? e.target.value : y)))} /></div>))}
      <label htmlFor="rkCv">CV / Resume * <span className="tiny muted">(PDF atau DOCX, maks. 5 MB)</span></label>
      <label className={'rk-unggah' + (cv ? ' ada' : '')} htmlFor="rkCv">
        <Ikon n={cv ? 'file-text' : 'upload'} /><span>{cv ? <><b>{cv.name}</b> · {(cv.size / 1024 / 1024).toFixed(1)} MB</> : 'Pilih berkas CV dari perangkat Anda'}</span>
        <input id="rkCv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => pilihCv(e.target.files?.[0])} />
      </label>
      {/* jebakan bot: tidak terlihat oleh manusia */}
      <input className="rk-jebak" tabIndex={-1} autoComplete="off" value={v.situs} onChange={set('situs')} aria-hidden="true" />
      <label className="rk-setuju"><input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} />
        <span>Saya menyatakan data yang saya isi benar dan menyetujui data serta CV saya diproses (termasuk dibantu analisis AI) untuk keperluan rekrutmen {settings.perusahaan || 'Yayasan Pendidikan Posi'}.</span></label>
      <button className="btn rk-tombol" type="submit" disabled={kirim}>{kirim ? <><span className="spin" /> Mengirim lamaran…</> : <><Ikon n="send" />Kirim Lamaran</>}</button>
    </form>
  );
}
