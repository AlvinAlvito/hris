'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAplikasi, type Me } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { pad, salam, tglIndo, todayStr } from '@/lib/klien/format';
import { berandaAwal } from '@/lib/klien/nav';

export function FormMasuk() {
  const { settings, setMe, setSettings } = useAplikasi();
  const router = useRouter();
  const [nik, setNik] = useState('');
  const [pin, setPin] = useState('');
  const [lihat, setLihat] = useState(false);
  const [salah, setSalah] = useState('');
  const [proses, setProses] = useState(false);
  const [jam, setJam] = useState('');
  const [sapa, setSapa] = useState('Selamat datang');
  const jauh = useRef<HTMLDivElement>(null), dekat = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = () => { const d = new Date(); setJam(tglIndo(todayStr(d)) + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes())); setSapa(salam(d)); };
    t(); const id = setInterval(t, 15000);
    return () => clearInterval(id);
  }, []);
  /* bentuk geometri bergeser pelan mengikuti mouse; lapisan dekat bergerak lebih jauh */
  useEffect(() => {
    let tunda = 0;
    const gerak = (e: MouseEvent) => {
      if (tunda) return;
      tunda = requestAnimationFrame(() => {
        tunda = 0;
        const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
        if (jauh.current) jauh.current.style.transform = `translate3d(${x * -14}px,${y * -14}px,0)`;
        if (dekat.current) dekat.current.style.transform = `translate3d(${x * -34}px,${y * -34}px,0)`;
      });
    };
    document.addEventListener('mousemove', gerak, { passive: true });
    return () => { document.removeEventListener('mousemove', gerak); cancelAnimationFrame(tunda); };
  }, []);

  const masuk = async (e: FormEvent) => {
    e.preventDefault();
    setSalah('');
    if (!nik.trim() || !pin.trim()) { setSalah('NIK dan PIN wajib diisi'); return; }
    setProses(true);
    try {
      const d = await api<{ me: Me; settings: any }>('login', { nik: nik.trim(), pin: pin.trim() });
      setSettings(d.settings); setMe(d.me); setPin('');
      router.replace(berandaAwal(d.me));
      router.refresh();
    } catch (er) {
      setSalah(er instanceof Error ? er.message : 'Gagal masuk');
      setProses(false);
    }
  };

  return (
    <div id="loginScreen">
      <section className="lg-art">
        <div className="bentuk jauh" ref={jauh} aria-hidden="true">
          <span className="b b-cincin s1" /><span className="b b-titik s2" />
          <span className="b b-simbol s3">π</span><span className="b b-simbol s4">Σ</span>
          <span className="b b-simbol s5">Δ</span><span className="b b-simbol s6">√</span>
          <span className="b b-garis-kotak s7" /><span className="b b-plus s8" />
        </div>
        <div className="bentuk dekat" ref={dekat} aria-hidden="true">
          <span className="b b-segitiga s9" /><span className="b b-kotak s10" /><span className="b b-lingkaran s11" />
          <span className="b b-segitiga kecil s12" /><span className="b b-kotak kecil s13" />
          <svg className="b b-garis-segitiga s14" viewBox="0 0 100 88"><polygon points="50,4 96,84 4,84" /></svg>
        </div>
        <div className="lg-logo"><img src={settings.logo || '/logo-posi.png'} alt="POSI" /></div>
        <div className="lg-judul">
          <div className="lg-pita"><Ikon n="trophy" />Sistem Kepegawaian</div>
          <h1>HRIS <span>POSI</span></h1>
          <p>{settings.slogan ? settings.perusahaan + ' · ' + settings.slogan : settings.perusahaan}</p>
        </div>
        <div className="lg-jam" suppressHydrationWarning>{jam}</div>
      </section>
      <section className="lg-form">
        <div className="lg-box">
          <div className="lg-sapa" suppressHydrationWarning>{sapa}</div>
          <h2>Masuk ke akun Anda</h2>
          <form className="card lg-card" onSubmit={masuk} noValidate>
            <label style={{ marginTop: 0 }} htmlFor="lgNik">NIK</label>
            <div className="lg-input"><Ikon n="id-card" />
              <input id="lgNik" value={nik} onChange={(e) => setNik(e.target.value)} autoCapitalize="off" autoComplete="username" placeholder="Masukkan NIK" />
            </div>
            <label htmlFor="lgPin">PIN</label>
            <div className="lg-input pin-wrap"><Ikon n="lock" />
              <input id="lgPin" type={lihat ? 'text' : 'password'} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password" placeholder="••••••" />
              <button type="button" className="pin-lihat" onClick={() => setLihat(!lihat)}
                aria-label={lihat ? 'Sembunyikan PIN' : 'Tampilkan PIN'} title={lihat ? 'Sembunyikan PIN' : 'Tampilkan PIN'}>
                <Ikon n={lihat ? 'eye-off' : 'eye'} />
              </button>
            </div>
            <button className="btn lg-btn" type="submit" disabled={proses}>
              {proses ? <><span className="spin" /> Masuk…</> : <>Masuk<Ikon n="log-in" /></>}
            </button>
            {salah && <div className="err" style={{ marginTop: 12 }}>{salah}</div>}
            <div className="center tiny muted" style={{ marginTop: 16 }}>Lupa PIN? Hubungi HC.</div>
          </form>
          <div className="lg-kaki" suppressHydrationWarning>© {new Date().getFullYear()} {settings.perusahaan}</div>
        </div>
      </section>
    </div>
  );
}
