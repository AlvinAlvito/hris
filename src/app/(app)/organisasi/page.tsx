'use client';
/* Struktur organisasi: bagan kartu bertingkat (semua pengguna) dan master unit organisasi & jabatan (HC / Super Admin). */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
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

/* Bagan organisasi dari atas ke bawah: pimpinan di atas, bawahan berjajar di bawahnya dengan garis penghubung.
   Tim yang seluruhnya staf (tanpa bawahan) ditumpuk ke bawah agar bagan tidak terlalu melebar.
   Awalnya terbuka sampai kepala divisi; cabang lain dibuka sesuai kebutuhan. Bisa digeser (seret) & di-zoom. */
function BaganOrganisasi() {
  const { me, settings, galat } = useAplikasi();
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

  // geser kanvas dengan seret (mouse / sentuh), kecuali saat menekan tombol
  const mulai = (e: PE<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !kanvas.current) return;
    seret.current = { x: e.clientX, y: e.clientY, l: kanvas.current.scrollLeft, t: kanvas.current.scrollTop };
    kanvas.current.setPointerCapture(e.pointerId);
    kanvas.current.classList.add('geser');
  };
  const gerak = (e: PE<HTMLDivElement>) => {
    const s = seret.current;
    if (!s || !kanvas.current) return;
    kanvas.current.scrollLeft = s.l - (e.clientX - s.x);
    kanvas.current.scrollTop = s.t - (e.clientY - s.y);
  };
  const selesai = () => { seret.current = null; kanvas.current?.classList.remove('geser'); };
  // bagan lebih lebar dari layar: gulir ke tengah agar pimpinan puncak langsung terlihat
  const sudahTengah = useRef(false);
  useEffect(() => {
    const k = kanvas.current;
    if (!k || !akar || tampilan !== 'bagan' || sudahTengah.current) return;
    sudahTengah.current = true;
    requestAnimationFrame(() => { k.scrollLeft = Math.max(0, (k.scrollWidth - k.clientWidth) / 2); });
  }, [akar, tampilan]);
  useEffect(() => { if (tampilan !== 'bagan') sudahTengah.current = false; }, [tampilan]);
  const z = (d: number) => setZoom((x) => Math.min(1.3, Math.max(0.5, Math.round((x + d) * 10) / 10)));

  return (<>
    <div className="page-head org-head"><div><h2 style={{ margin: 0 }}>Struktur Organisasi</h2>
      <div className="muted small">{rows ? `${rows.length} karyawan · ` : ''}{tampilan === 'bagan' ? 'klik angka bawahan untuk membuka cabang, seret untuk menggeser bagan.' : 'dikelompokkan per divisi, pimpinan tim di urutan pertama.'}</div></div>
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
            <button type="button" onClick={() => z(-0.1)} aria-label="Perkecil">−</button><span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => z(0.1)} aria-label="Perbesar">+</button></div></>}
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
