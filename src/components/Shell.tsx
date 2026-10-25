'use client';
/* Kerangka aplikasi: sidebar (bisa diciutkan), topbar, menu bawah HP, transisi halaman */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api, pantauSibuk } from '@/lib/klien/api';
import { labelRole } from '@/lib/klien/format';
import { NAV, navTerlihat, urutanBawah, type ItemNav } from '@/lib/klien/nav';
import { isPenyetuju, useAplikasi, type Me } from './Aplikasi';
import { Avatar } from './Avatar';
import { Ikon } from './Ikon';

function aktifUntuk(path: string): ItemNav | undefined {
  return [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => path === n.href || path.startsWith(n.href + '/'));
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, settings, inbox, yakin, setMe, galat } = useAplikasi();
  const path = usePathname();
  const router = useRouter();
  const [laci, setLaci] = useState(false);
  const [mini, setMini] = useState(false);
  const [sibuk, setSibuk] = useState(0);
  const [gulir, setGulir] = useState(false);
  const [arah, setArah] = useState<'dari-kanan' | 'dari-kiri'>('dari-kanan');
  const lalu = useRef(path);
  const navBawah = useRef<HTMLElement>(null);
  const [indikator, setIndikator] = useState<{ x: number; tampil: boolean }>({ x: 0, tampil: false });

  useEffect(() => pantauSibuk(setSibuk), []);
  useEffect(() => { try { setMini(localStorage.getItem('posi.sidebar') === 'mini'); } catch { /* */ } }, []);
  useEffect(() => {
    const f = () => setGulir(window.scrollY > 4);
    document.addEventListener('scroll', f, { passive: true });
    return () => document.removeEventListener('scroll', f);
  }, []);

  const aktif = aktifUntuk(path);
  const vis = me ? navTerlihat(me) : [];
  /* arah animasi mengikuti urutan menu */
  if (lalu.current !== path) {
    const urut = vis.map((n) => n.href);
    const a = urut.indexOf(aktifUntuk(lalu.current)?.href ?? ''), b = urut.indexOf(aktif?.href ?? '');
    const baru = b < a ? 'dari-kiri' : 'dari-kanan';
    if (baru !== arah) setArah(baru);
    lalu.current = path;
  }
  useEffect(() => { setLaci(false); window.scrollTo(0, 0); }, [path]);
  useEffect(() => { document.body.classList.toggle('drawer', laci); }, [laci]);
  useEffect(() => { document.body.classList.toggle('sidebar-mini', mini); }, [mini]);
  useEffect(() => { document.body.classList.toggle('hal-beranda', aktif?.k === 'beranda'); }, [aktif]);

  /* garis penanda menu bawah bergeser ke menu aktif (kecuali tombol bulat tengah) */
  useLayoutEffect(() => {
    const geser = () => {
      const on = navBawah.current?.querySelector<HTMLElement>('a.on');
      if (!on || on.classList.contains('tengah')) return setIndikator((x) => ({ ...x, tampil: false }));
      setIndikator({ x: on.offsetLeft + on.offsetWidth / 2 - 15, tampil: true });
    };
    geser();
    window.addEventListener('resize', geser);
    return () => window.removeEventListener('resize', geser);
  }, [path, me]);

  if (!me) return null;
  const hitung = (c?: string) => (c === 'total' && isPenyetuju(me) ? inbox.total : 0);
  const Cnt = ({ c }: { c?: string }) => { const n = hitung(c); return n ? <span className="cnt">{n > 99 ? '99+' : n}</span> : null; };
  const aturMini = () => { const v = !mini; setMini(v); try { localStorage.setItem('posi.sidebar', v ? 'mini' : ''); } catch { /* */ } };
  const keluar = async () => {
    if (!(await yakin('Keluar dari aplikasi?', '', { ya: 'Keluar' }))) return;
    await api('logout', {}, true).catch(() => {});
    setMe(null); router.replace('/masuk');
  };
  const kembaliSuperAdmin = async () => {
    try {
      const r = await api<{ me: Me }>('impersonasi_kembali', {}, true);
      setMe(r.me);
      router.replace('/karyawan');
    } catch (e) { galat(e); }
  };
  const bawah = urutanBawah(me);
  const logo = settings.logo || '/logo-posi.png';
  let grup = '';

  return (
    <div className="shell">
      <div id="loader" className={sibuk ? '' : 'hidden'} />
      <aside id="sidebar">
        <div className="brand">
          <div className="logo"><img src={logo} alt={'Logo ' + settings.perusahaan} /></div>
          <div className="sl">HRIS</div>
        </div>
        <nav id="sideNav">
          {vis.map((n) => {
            const kepala = n.g !== grup ? <div className="ngrp">{(grup = n.g)}</div> : null;
            return (
              <div key={n.k} style={{ display: 'contents' }}>
                {kepala}
                <Link href={n.href} className={'nitem' + (aktif?.k === n.k ? ' on' : '')} title={n.t}>
                  <Ikon n={n.ic} /><span>{n.t}</span><Cnt c={n.cnt} />
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sidefoot">
          <Link href="/profil" className="me">
            <Avatar u={me} ukuran={38} />
            <div style={{ minWidth: 0, flex: 1 }}><div className="nm">{me.nama}</div><div className="rl">{labelRole(me.role)} · {me.nik}</div></div>
            <button className="tbtn" id="btnKeluar" style={{ width: 36, height: 36 }} title="Keluar" onClick={(e) => { e.preventDefault(); keluar(); }}>
              <Ikon n="log-out" />
            </button>
          </Link>
        </div>
      </aside>
      <div id="scrim" onClick={() => setLaci(false)} />

      <div className="main">
        <header className={'topbar' + (gulir ? ' scrolled' : '')}>
          <button className="tbtn" id="burger" onClick={aturMini} aria-label="Tampilkan / sembunyikan menu" title="Tampilkan / sembunyikan menu"><Ikon n="menu" /></button>
          <div className="tb-logo"><img src={logo} alt="" /></div>
          <div style={{ minWidth: 0 }} id="judulWrap"><h1>{aktif?.t ?? ''}</h1></div>
          <div className="sp" />
          <TombolTampilan />
          {isPenyetuju(me) && (
            <Link href="/persetujuan" className="tbtn" title="Persetujuan">
              <Ikon n="bell" />{hitung('total') ? <span className="dot">{hitung('total') > 99 ? '99+' : hitung('total')}</span> : null}
            </Link>
          )}
          <Link href="/profil" className="tb-av" title="Profil"><Avatar u={me} ukuran={38} /></Link>
        </header>
        {me.impersonasi && <div className="impersonasi-banner"><div>
          <b>Anda sedang masuk sebagai {me.nama}</b><span> · Aksi di aplikasi memakai akun karyawan ini.</span>
        </div><button className="btn sm ghost auto" onClick={kembaliSuperAdmin}>Kembali ke Super Admin</button></div>}
        <main id="content">
          <div key={path} className={'page ' + arah}>{children}</div>
        </main>
      </div>

      <nav id="bottomNav" ref={navBawah}>
        <span className="bn-ind" style={{ transform: `translateX(${indikator.x}px)`, opacity: indikator.tampil ? 1 : 0 }} />
        {bawah.urut.map((n) => (
          <Link key={n.k} href={n.href} className={(n.k === bawah.tengah ? 'tengah' : '') + (aktif?.k === n.k ? ' on' : '')}>
            {n.k === bawah.tengah ? <span className="bulat"><Ikon n={n.ic} /></span> : <Ikon n={n.ic} />}
            {n.t.split(' ')[0]}<Cnt c={n.cnt} />
          </Link>
        ))}
        <button onClick={() => setLaci(true)}><Ikon n="menu" />Menu</button>
      </nav>
    </div>
  );
}

/* tombol mode terang / gelap / otomatis */
function TombolTampilan() {
  const { me, setMe, bukaSheet, tutupSheet, terapkanMode, toast, galat } = useAplikasi();
  const [gelap, setGelap] = useState(false);
  useEffect(() => { setGelap(document.documentElement.getAttribute('data-mode') === 'gelap'); }, [me]);
  const buka = () => {
    let pilih = me?.modeTampilan || 'auto';
    function Isi() {
      const [m, setM] = useState(pilih);
      const ganti = (v: string) => { setM(v); pilih = v; terapkanMode(v); setGelap(document.documentElement.getAttribute('data-mode') === 'gelap'); };
      return (
        <>
          <h3><Ikon n="palette" />Tampilan</h3>
          <div className="seg" style={{ marginTop: 12 }}>
            {[['terang', 'sun', 'Terang'], ['gelap', 'moon', 'Gelap'], ['auto', 'monitor', 'Otomatis']].map(([v, ic, t]) => (
              <button key={v} type="button" className={m === v ? 'on' : ''} onClick={() => ganti(v)}><Ikon n={ic} />{t}</button>
            ))}
          </div>
          <button className="btn" onClick={() => api('br_tema_saya', { tema: '', mode: m }, true)
            .then(() => { if (me) setMe({ ...me, modeTampilan: m }); tutupSheet(); toast('Tampilan disimpan'); }).catch(galat)}>Simpan</button>
        </>
      );
    }
    bukaSheet(<Isi />, { saatTutup: () => terapkanMode(me?.modeTampilan) });
  };
  return <button className="tbtn" onClick={buka} title="Tampilan"><Ikon n={gelap ? 'moon' : 'sun'} /></button>;
}
