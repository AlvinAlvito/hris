'use client';
/* Struktur organisasi: bagan kartu bertingkat (semua pengguna) dan master unit organisasi & jabatan (HC / Super Admin). */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { DaftarJabatan, DaftarUnit, type DataOrganisasi } from '@/components/MasterOrganisasi';
import { Avatar } from '@/components/Avatar';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';

type Baris = { id: number; nama: string; jabatan: string; dept: string; foto: string; role: string; atasanId: number | null };
type Simpul = { id?: number; nama: string; jabatan: string; dept?: string; foto?: string; children: Simpul[]; total?: number };

export default function Organisasi() {
  const { me, galat } = useAplikasi();
  const admin = isAdminUp(me);
  const [tab, setTab] = useState<'bagan' | 'unit' | 'jabatan'>('bagan');
  const [master, setMaster] = useState<DataOrganisasi | null>(null);
  const muatMaster = useCallback(() => { api<DataOrganisasi>('org_data', {}, true).then(setMaster).catch(galat); }, [galat]);
  useEffect(() => { if (admin && tab !== 'bagan') muatMaster(); }, [admin, tab, muatMaster]);
  return (<>
    {admin && <div className="seg org-tab" role="tablist">
      {([['bagan', 'network', 'Bagan Organisasi'], ['unit', 'git-branch', 'Unit Organisasi'], ['jabatan', 'briefcase', 'Jabatan']] as const).map(([k, ic, t]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}
    </div>}
    {tab === 'bagan' && <BaganOrganisasi />}
    {tab !== 'bagan' && !master && <div className="card"><div className="skel" style={{ height: 220 }} /></div>}
    {tab === 'unit' && master && <DaftarUnit data={master} muat={muatMaster} />}
    {tab === 'jabatan' && master && <DaftarJabatan data={master} muat={muatMaster} />}
  </>);
}

/* warna aksen tetap per divisi (dari nama divisi) */
function warnaDivisi(dept?: string) {
  let h = 0;
  for (const c of dept || '-') h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 55%)`;
}
const hitungTotal = (n: Simpul): number => (n.total = n.children.reduce((a, c) => a + 1 + hitungTotal(c), 0));
const ZOOM_MIN = 0.3, ZOOM_MAKS = 2;
const batasZoom = (z: number) => Math.min(ZOOM_MAKS, Math.max(ZOOM_MIN, z));

/* Bagan organisasi dari atas ke bawah: pimpinan di atas, bawahan berjajar di bawahnya dengan garis penghubung.
   Tim yang seluruhnya staf (tanpa bawahan) ditumpuk ke bawah agar bagan tidak terlalu melebar.
   Awalnya terbuka sampai kepala divisi; cabang lain dibuka sesuai kebutuhan.
   Bisa digeser (seret) & di-zoom: cubit dua jari (HP), Ctrl + scroll / pinch trackpad (desktop), atau tombol. */
function BaganOrganisasi() {
  const { me, settings, galat, toast } = useAplikasi();
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [cari, setCari] = useState('');
  const [terbuka, setTerbuka] = useState<Set<number> | null>(null);
  const [zoom, setZoom] = useState(1);
  // tampilan bagan / kartu; pilihan terakhir diingat di browser ini
  const [tampilan, setTampilanAsli] = useState<'bagan' | 'kartu'>('bagan');
  useEffect(() => {
    // pilihan tersimpan; bila belum pernah memilih, layar HP memakai tampilan kartu (lebih mudah dibaca)
    let simpan: string | null = null;
    try { simpan = localStorage.getItem('posi.org.tampilan'); } catch { /* */ }
    if (simpan === 'kartu' || (!simpan && window.innerWidth < 640)) setTampilanAsli('kartu');
  }, []);
  const setTampilan = (t: 'bagan' | 'kartu') => { setTampilanAsli(t); try { localStorage.setItem('posi.org.tampilan', t); } catch { /* */ } };
  const kanvas = useRef<HTMLDivElement>(null), seret = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  // akun Super Admin adalah akun sistem, bukan bagian struktur karyawan
  useEffect(() => { api<Baris[]>('kr_org', {}, true).then((l) => setRows(l.filter((x) => x.role !== 'direktur'))).catch(galat); }, [galat]);

  const akar = useMemo<Simpul | null>(() => {
    if (!rows) return null;
    const peta = new Map<number, Simpul>();
    for (const x of rows) peta.set(x.id, { id: x.id, nama: x.nama, jabatan: x.jabatan, dept: x.dept, foto: x.foto, children: [] });
    const puncak: Simpul[] = [];
    for (const x of rows) {
      const simpul = peta.get(x.id)!, atasan = x.atasanId ? peta.get(x.atasanId) : undefined;
      if (atasan && x.atasanId !== x.id) atasan.children.push(simpul); else puncak.push(simpul);
    }
    const urutkan = (l: Simpul[]) => { l.sort((a, b) => b.children.length - a.children.length || a.nama.localeCompare(b.nama, 'id')); l.forEach((x) => urutkan(x.children)); };
    urutkan(puncak);
    const r: Simpul = { nama: settings.perusahaan, jabatan: `${rows.length} karyawan`, children: puncak };
    hitungTotal(r);
    return r;
  }, [rows, settings.perusahaan]);

  // bawaan: terbuka sampai level kepala divisi, ditambah seluruh atasan pengguna agar posisinya langsung terlihat
  const bawaanTerbuka = useMemo(() => {
    const b = new Set((akar?.children ?? []).filter((x) => x.id).map((x) => x.id!));
    const atasan = new Map((rows ?? []).map((x) => [x.id, x.atasanId]));
    for (let a = atasan.get(me?.id ?? 0), n = 0; a && n < 50; a = atasan.get(a), n++) b.add(a);
    return b;
  }, [akar, rows, me?.id]);
  const buka = terbuka ?? bawaanTerbuka;
  const semuaId = useMemo(() => {
    const ids: number[] = [];
    const jelajah = (n: Simpul) => { if (n.id && n.children.length) ids.push(n.id); n.children.forEach(jelajah); };
    if (akar) jelajah(akar);
    return ids;
  }, [akar]);
  const q = cari.trim().toLocaleLowerCase('id');
  const cocokSendiri = useCallback((n: Simpul) => !!q && [n.nama, n.jabatan, n.dept ?? ''].some((v) => v.toLocaleLowerCase('id').includes(q)), [q]);
  const cocok = useCallback((n: Simpul): boolean => cocokSendiri(n) || n.children.some(cocok), [cocokSendiri]);
  const jumlahCocok = useMemo(() => {
    let k = 0;
    const j = (n: Simpul) => { if (n.id && cocokSendiri(n)) k++; n.children.forEach(j); };
    if (akar) j(akar);
    return k;
  }, [akar, cocokSendiri]);
  const ubah = (id: number) => { const b = new Set(buka); if (b.has(id)) b.delete(id); else b.add(id); setTerbuka(b); };

  /* zoom berjangkar: titik di bawah kursor / tengah dua jari tetap di tempatnya.
     Perubahan dikumpulkan per frame (requestAnimationFrame) agar halus saat dicubit / di-scroll cepat. */
  const zoomRef = useRef(1), jangkar = useRef<{ ax: number; ay: number; px: number; py: number; z0: number } | null>(null), frame = useRef(0);
  const target = useRef<{ z: number; cx?: number; cy?: number } | null>(null);
  const zoomKe = useCallback((zBaru: number, cx?: number, cy?: number) => {
    target.current = { z: batasZoom(zBaru), cx, cy };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const k = kanvas.current, t = target.current;
      if (!k || !t || Math.abs(t.z - zoomRef.current) < 0.001) return;
      const r = k.getBoundingClientRect();
      const px = (t.cx ?? r.left + k.clientWidth / 2) - r.left, py = (t.cy ?? r.top + k.clientHeight / 2) - r.top;
      jangkar.current = { ax: k.scrollLeft + px, ay: k.scrollTop + py, px, py, z0: zoomRef.current };
      zoomRef.current = t.z;
      setZoom(t.z);
    });
  }, []);
  useLayoutEffect(() => {
    const k = kanvas.current, j = jangkar.current;
    if (!k || !j) return;
    jangkar.current = null;
    const gaya = getComputedStyle(k), pl = parseFloat(gaya.paddingLeft) || 0, pt = parseFloat(gaya.paddingTop) || 0, rasio = zoom / j.z0;
    k.scrollLeft = (j.ax - pl) * rasio + pl - j.px;
    k.scrollTop = (j.ay - pt) * rasio + pt - j.py;
  }, [zoom]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Ctrl + scroll mouse, pinch trackpad (Chrome/Edge/Firefox mengirim wheel + ctrlKey), gesture trackpad Safari
  useEffect(() => {
    const k = kanvas.current;
    if (!k) return;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();   // cegah zoom seluruh halaman browser
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomKe((target.current?.z ?? zoomRef.current) * Math.exp(-d * 0.0022), e.clientX, e.clientY);
    };
    let gz = 1;
    const gMulai = (e: Event) => { e.preventDefault(); gz = zoomRef.current; };
    const gUbah = (e: Event) => { e.preventDefault(); const g = e as Event & { scale: number; clientX: number; clientY: number }; zoomKe(gz * g.scale, g.clientX, g.clientY); };
    k.addEventListener('wheel', roda, { passive: false });
    k.addEventListener('gesturestart', gMulai);
    k.addEventListener('gesturechange', gUbah);
    return () => { k.removeEventListener('wheel', roda); k.removeEventListener('gesturestart', gMulai); k.removeEventListener('gesturechange', gUbah); };
  }, [akar, rows, tampilan, zoomKe]);

  // geser dengan seret (mouse / satu jari), zoom dengan cubit dua jari
  const jari = useRef(new Map<number, { x: number; y: number }>());
  const cubit = useRef<{ d: number; z: number } | null>(null);
  const jarak = () => { const [a, b] = [...jari.current.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const mulai = (e: PE<HTMLDivElement>) => {
    if (!kanvas.current) return;
    jari.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (jari.current.size === 2) {
      seret.current = null;   // jari kedua: berhenti menggeser, mulai mencubit
      cubit.current = { d: Math.max(1, jarak().d), z: zoomRef.current };
      kanvas.current.setPointerCapture(e.pointerId);
      return;
    }
    if (jari.current.size > 2 || (e.target as HTMLElement).closest('button')) return;
    seret.current = { x: e.clientX, y: e.clientY, l: kanvas.current.scrollLeft, t: kanvas.current.scrollTop };
    kanvas.current.setPointerCapture(e.pointerId);
    kanvas.current.classList.add('geser');
  };
  const gerak = (e: PE<HTMLDivElement>) => {
    if (jari.current.has(e.pointerId)) jari.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cubit.current && jari.current.size >= 2) {
      const j = jarak();
      zoomKe(cubit.current.z * (j.d / cubit.current.d), j.x, j.y);
      return;
    }
    const s = seret.current;
    if (!s || !kanvas.current) return;
    kanvas.current.scrollLeft = s.l - (e.clientX - s.x);
    kanvas.current.scrollTop = s.t - (e.clientY - s.y);
  };
  const selesai = (e: PE<HTMLDivElement>) => {
    jari.current.delete(e.pointerId);
    if (jari.current.size < 2) cubit.current = null;
    seret.current = null;   // setelah mencubit, angkat semua jari dulu sebelum menggeser lagi
    kanvas.current?.classList.remove('geser');
  };
  // perkecil agar seluruh bagan yang sedang terbuka muat di layar
  const pasLayar = () => {
    const k = kanvas.current, isi = k?.firstElementChild as HTMLElement | null;
    if (!k || !isi) return;
    const gaya = getComputedStyle(k);
    const ruangL = k.clientWidth - parseFloat(gaya.paddingLeft) - parseFloat(gaya.paddingRight);
    const ruangT = k.clientHeight - parseFloat(gaya.paddingTop) - parseFloat(gaya.paddingBottom);
    const r = isi.getBoundingClientRect(), z0 = zoomRef.current;
    // lebar asli = isi kartu (bukan min-width 100%)
    const lebar = Math.max(...[...isi.querySelectorAll<HTMLElement>(':scope > .ot-simpul')].map((x) => x.getBoundingClientRect().width), 1) / z0;
    const z1 = batasZoom(Math.min(1, ruangL / lebar, ruangT / (r.height / z0)));
    zoomRef.current = z1; setZoom(z1);
    requestAnimationFrame(() => { k.scrollLeft = Math.max(0, (k.scrollWidth - k.clientWidth) / 2); k.scrollTop = 0; });
  };

  // unduh PDF: bagan dirender ulang di luar layar dalam keadaan terbuka semua & tema terang, lalu difoto
  const [ekspor, setEkspor] = useState(false);
  const wadahEkspor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ekspor) return;
    let batal = false;
    (async () => {
      try {
        const el = wadahEkspor.current;
        if (!el) throw new Error('Bagan belum siap');
        await document.fonts.ready;
        // tunggu foto profil termuat (maks. 4 detik; foto yang gagal tetap tampil sebagai kotak kosong, tidak menggagalkan unduhan)
        await Promise.all([...el.querySelectorAll('img')].map((g) => { g.loading = 'eager'; return g.complete ? null : Promise.race([g.decode().catch(() => null), new Promise((s) => setTimeout(s, 4000))]); }));
        const [{ toCanvas }, { pdfDariJpeg }] = await Promise.all([import('html-to-image'), import('@/lib/klien/pdfGambar')]);
        const w = el.scrollWidth, h = el.scrollHeight;
        // ketajaman 2.5×, dibatasi agar tetap aman: HP (batas kanvas iOS ±16 juta piksel) lebih ketat daripada desktop
        const hp = matchMedia('(pointer:coarse)').matches;
        const rasio = Math.max(1, Math.min(2.5, Math.sqrt((hp ? 16e6 : 45e6) / (w * h)), (hp ? 16000 : 30000) / Math.max(w, h)));
        const kanvasGambar = await toCanvas(el, { pixelRatio: rasio, width: w, height: h, backgroundColor: '#ffffff', cacheBust: true,
          style: { position: 'static', left: '0', top: '0', transform: 'none' } });
        const jpeg = await new Promise<Blob>((ok, gagal) => kanvasGambar.toBlob((b) => (b ? ok(b) : gagal(new Error('Gagal membuat gambar'))), 'image/jpeg', 0.94));
        const pdf = await pdfDariJpeg(jpeg, kanvasGambar.width, kanvasGambar.height, w * 0.75, h * 0.75, `Struktur Organisasi ${settings.perusahaan}`);
        if (batal) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pdf);
        a.download = `struktur-organisasi-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        toast('PDF struktur organisasi diunduh');
      } catch (e) { galat(e); } finally { if (!batal) setEkspor(false); }
    })();
    return () => { batal = true; };
  }, [ekspor, galat, toast, settings.perusahaan]);
  // bagan lebih lebar dari layar: gulir ke tengah agar pimpinan puncak langsung terlihat
  const sudahTengah = useRef(false);
  useEffect(() => {
    const k = kanvas.current;
    if (!k || !akar || tampilan !== 'bagan' || sudahTengah.current) return;
    sudahTengah.current = true;
    requestAnimationFrame(() => { k.scrollLeft = Math.max(0, (k.scrollWidth - k.clientWidth) / 2); });
  }, [akar, tampilan]);
  useEffect(() => { if (tampilan !== 'bagan') sudahTengah.current = false; }, [tampilan]);
  const z = (f: number) => zoomKe(zoomRef.current * f);

  return (<>
    <div className="page-head org-head"><div><h2 style={{ margin: 0 }}>Struktur Organisasi</h2>
      <div className="muted small">{rows ? `${rows.length} karyawan · ` : ''}{tampilan === 'bagan' ? 'klik angka bawahan untuk membuka cabang, seret untuk menggeser, cubit layar / Ctrl + scroll untuk memperbesar.' : 'dikelompokkan per divisi, pimpinan tim di urutan pertama.'}</div></div>
      <div className="org-tools">
        <div className="seg ot-mode" role="tablist" aria-label="Tampilan struktur">
          <button type="button" role="tab" aria-selected={tampilan === 'bagan'} className={tampilan === 'bagan' ? 'on' : ''} onClick={() => setTampilan('bagan')}><Ikon n="network" />Bagan</button>
          <button type="button" role="tab" aria-selected={tampilan === 'kartu'} className={tampilan === 'kartu' ? 'on' : ''} onClick={() => setTampilan('kartu')}><Ikon n="layout-dashboard" />Kartu</button>
        </div>
        <div className="org-search"><input placeholder="Cari nama, jabatan, atau divisi…" value={cari} onChange={(e) => setCari(e.target.value)} />
          <Ikon n="search" /></div>
        {tampilan === 'bagan' && <>
          <button className="btn sm ghost auto" disabled={!!q} onClick={() => setTerbuka(new Set(semuaId))}><Ikon n="chevron-down" />Buka semua</button>
          <button className="btn sm ghost auto" disabled={!!q} onClick={() => setTerbuka(new Set())}><Ikon n="chevron-up" />Ringkas</button>
          <div className="ot-zoom" role="group" aria-label="Perbesaran bagan">
            <button type="button" onClick={() => z(1 / 1.2)} aria-label="Perkecil">−</button><span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => z(1.2)} aria-label="Perbesar">+</button>
            <button type="button" className="ot-pas" onClick={pasLayar} aria-label="Pas layar" title="Pas layar"><Ikon n="maximize" /></button></div></>}
        <button className="btn sm auto" disabled={!akar || !rows?.length || ekspor} onClick={() => setEkspor(true)}>
          {ekspor ? <><span className="spin" />Menyiapkan PDF…</> : <><Ikon n="download" />Unduh PDF</>}</button>
      </div></div>
    {q && tampilan === 'bagan' && <div className="note" style={{ marginBottom: 10 }}>{jumlahCocok
      ? <><b>{jumlahCocok}</b> karyawan cocok dengan “{cari.trim()}” — cabangnya dibuka otomatis dan disorot.</>
      : 'Tidak ada karyawan yang cocok dengan pencarian.'}</div>}
    {tampilan === 'kartu' ? (akar ? <KartuOrganisasi akar={akar} q={q} saya={me?.id} /> : <div className="card"><div className="skel" style={{ height: 320 }} /></div>) :
    <div className="card ot-card">
      {!akar ? <div className="skel" style={{ height: 320 }} />
        : !rows?.length ? <div className="empty">Belum ada data karyawan.</div>
          : <div className="ot-kanvas" ref={kanvas} onPointerDown={mulai} onPointerMove={gerak} onPointerUp={selesai} onPointerCancel={selesai}>
            <div className="ot-isi" style={{ zoom }}><Cabang n={akar} akar q={q} buka={buka} ubah={ubah} cocok={cocok} cocokSendiri={cocokSendiri} saya={me?.id} /></div>
          </div>}
    </div>}
    {ekspor && akar && (
      <div className="ot-cetak" data-mode="terang" ref={wadahEkspor} aria-hidden>
        <div className="ot-cetak-kepala">
          <div><div className="ot-cetak-judul">Struktur Organisasi</div><div className="ot-cetak-sub">{settings.perusahaan}</div></div>
          <div className="ot-cetak-tgl">Per {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br />{rows?.length ?? 0} karyawan</div>
        </div>
        <div className="ot-isi"><Cabang n={akar} akar q="" buka={new Set(semuaId)} ubah={() => {}} cocok={() => false} cocokSendiri={() => false} /></div>
      </div>)}
  </>);
}

/* Tampilan kartu: karyawan dikelompokkan per divisi; pimpinan (paling banyak bawahan) di urutan pertama */
function KartuOrganisasi({ akar, q, saya }: { akar: Simpul; q: string; saya?: number }) {
  const grup = useMemo(() => {
    const semua: { n: Simpul; atasan: string }[] = [];
    const jalan = (n: Simpul, atasan: string) => n.children.forEach((c) => { semua.push({ n: c, atasan }); jalan(c, c.nama); });
    jalan(akar, '');
    const peta = new Map<string, { n: Simpul; atasan: string }[]>();
    for (const x of semua) {
      if (q && ![x.n.nama, x.n.jabatan, x.n.dept ?? '', x.atasan].some((v) => v.toLocaleLowerCase('id').includes(q))) continue;
      const k = (x.n.dept || '').trim() || 'Tanpa divisi';
      if (!peta.has(k)) peta.set(k, []);
      peta.get(k)!.push(x);
    }
    for (const l of peta.values()) l.sort((a, b) => (b.n.total ?? 0) - (a.n.total ?? 0) || a.n.nama.localeCompare(b.n.nama, 'id'));
    return [...peta.entries()].sort((a, b) => (/^direksi$/i.test(b[0]) ? 1 : 0) - (/^direksi$/i.test(a[0]) ? 1 : 0) || b[1].length - a[1].length || a[0].localeCompare(b[0], 'id'));
  }, [akar, q]);
  if (!grup.length) return <div className="card"><div className="empty">Tidak ada karyawan yang cocok dengan pencarian.</div></div>;
  return (<div className="ok-daftar">{grup.map(([dv, l]) => (
    <section key={dv} className="card ok-grup" style={{ ['--dv' as string]: warnaDivisi(dv === 'Tanpa divisi' ? '' : dv) }}>
      <h3 className="ok-judul"><span className="ok-titik" />{dv}<span className="m">{l.length} orang</span></h3>
      <div className="ok-grid">{l.map(({ n, atasan }) => (
        <article key={n.id} className={'ok-kartu' + (n.id === saya ? ' saya' : '')}>
          {n.id === saya && <span className="ot-anda">Anda</span>}
          <div className="ok-foto"><Avatar u={{ nama: n.nama, foto: n.foto }} ukuran={68} /></div>
          <div className="ok-nama" title={n.nama}>{n.nama}</div>
          <div className="ok-jab">{n.jabatan || 'Jabatan belum diisi'}</div>
          <div className="ok-info">
            {atasan ? <span title="Atasan langsung"><Ikon n="user-check" />{atasan}</span> : <span><Ikon n="star" />Pimpinan puncak</span>}
            {!!n.total && <span className="ok-tim" title={`${n.children.length} bawahan langsung`}><Ikon n="users" />{n.total} di timnya</span>}
          </div>
        </article>))}</div>
    </section>))}</div>);
}

function Cabang({ n, akar, q, buka, ubah, cocok, cocokSendiri, saya }: {
  n: Simpul; akar?: boolean; q: string; buka: Set<number>; ubah: (id: number) => void; cocok: (n: Simpul) => boolean; cocokSendiri: (n: Simpul) => boolean; saya?: number;
}) {
  const anak = n.children.filter((x) => !q || cocok(x));
  const terbuka = !!akar || (anak.length > 0 && (q ? true : !!n.id && buka.has(n.id)));
  const tumpuk = !akar && anak.length > 1 && anak.every((x) => !x.children.length);
  return (
    <div className="ot-simpul">
      <div className={'ot-kartu' + (akar ? ' akar' : '') + (cocokSendiri(n) ? ' cocok' : '') + (!akar && n.id === saya ? ' saya' : '')} style={akar ? undefined : { ['--dv' as string]: warnaDivisi(n.dept) }}>
        {!akar && n.id === saya && <span className="ot-anda">Anda</span>}
        {akar ? <span className="ot-logo"><Ikon n="network" /></span> : <Avatar u={{ nama: n.nama, foto: n.foto }} ukuran={40} />}
        <div className="ot-id">
          <div className="ot-nama">{n.nama}</div>
          <div className="ot-jab">{n.jabatan || 'Jabatan belum diisi'}</div>
          {!akar && n.dept && <span className="ot-dv">{n.dept}</span>}
        </div>
        {!akar && n.children.length > 0 && (
          <button type="button" className={'ot-tog' + (terbuka ? ' on' : '')} aria-expanded={terbuka} disabled={!!q}
            aria-label={`${terbuka ? 'Tutup' : 'Buka'} ${n.total} bawahan ${n.nama}`}
            title={`${n.children.length} bawahan langsung · ${n.total} total di bawahnya`} onClick={() => ubah(n.id!)}>
            {terbuka ? <Ikon n="chevron-up" /> : n.total}</button>)}
      </div>
      {terbuka && anak.length > 0 && (
        <div className={'ot-anak' + (tumpuk ? ' tumpuk' : '')}>{anak.map((x, i) => (
          <div key={x.id ?? i} className="ot-cab"><Cabang n={x} q={q} buka={buka} ubah={ubah} cocok={cocok} cocokSendiri={cocokSendiri} saya={saya} /></div>))}</div>)}
    </div>
  );
}
