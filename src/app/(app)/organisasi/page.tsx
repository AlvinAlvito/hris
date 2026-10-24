'use client';
/* Struktur organisasi: bagan kartu bertingkat agar tetap terbaca untuk organisasi besar. */
import { useEffect, useMemo, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';

type Baris = { id: number; nama: string; jabatan: string; dept: string; foto: string; role: string; atasanId: number | null };
type Simpul = { id?: number; nama: string; jabatan: string; dept?: string; foto?: string; children: Simpul[] };

export default function Organisasi() {
  const { settings, galat } = useAplikasi();
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [cari, setCari] = useState('');
  const [tertutup, setTertutup] = useState<Set<number>>(() => new Set());
  useEffect(() => { api<Baris[]>('kr_org', {}, true).then(setRows).catch(galat); }, [galat]);

  const akar = useMemo(() => {
    if (!rows) return [];
    const peta = new Map<number, Simpul>();
    for (const x of rows) peta.set(x.id, { id: x.id, nama: x.nama, jabatan: x.jabatan, dept: x.dept, foto: x.foto, children: [] });
    const hasil: Simpul[] = [];
    for (const x of rows) {
      const simpul = peta.get(x.id)!;
      const atasan = x.atasanId ? peta.get(x.atasanId) : undefined;
      if (atasan && x.atasanId !== x.id) atasan.children.push(simpul);
      else hasil.push(simpul);
    }
    const urutkan = (daftar: Simpul[]) => {
      daftar.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
      daftar.forEach((x) => urutkan(x.children));
    };
    urutkan(hasil);
    return hasil.length === 1 ? hasil : [{ nama: settings.perusahaan, jabatan: 'Organisasi', children: hasil }];
  }, [rows, settings.perusahaan]);

  const semuaId = useMemo(() => {
    const ids: number[] = [];
    const jelajah = (n: Simpul) => { if (n.id && n.children.length) ids.push(n.id); n.children.forEach(jelajah); };
    akar.forEach(jelajah);
    return ids;
  }, [akar]);
  const q = cari.trim().toLocaleLowerCase('id');
  const cocok = (n: Simpul): boolean => [n.nama, n.jabatan, n.dept ?? ''].some((v) => v.toLocaleLowerCase('id').includes(q)) || n.children.some(cocok);
  const hasilCari = akar.filter((n) => !q || cocok(n));

  const ubahCabang = (id: number) => setTertutup((s) => {
    const baru = new Set(s);
    if (baru.has(id)) baru.delete(id); else baru.add(id);
    return baru;
  });

  return (<>
    <div className="page-head org-head"><div><h2 style={{ margin: 0 }}>Struktur Organisasi</h2>
      <div className="muted small">{rows ? `${rows.length} orang · ` : ''}gunakan tombol jumlah bawahan untuk membuka atau menutup cabang.</div></div>
      <div className="org-tools">
        <div className="org-search"><input placeholder="Cari nama, jabatan, atau divisi…" value={cari} onChange={(e) => setCari(e.target.value)} />
          <Ikon n="search" /></div>
        <button className="btn sm ghost auto" disabled={!semuaId.length || !!q} onClick={() => setTertutup(new Set())}>Buka semua</button>
        <button className="btn sm ghost auto" disabled={!semuaId.length || !!q} onClick={() => setTertutup(new Set(semuaId))}>Tutup semua</button>
      </div></div>
    <div className="card org-card">
      {!rows ? <div className="skel" style={{ height: 240 }} />
        : !rows.length ? <div className="empty">Belum ada data karyawan.</div>
          : q && !hasilCari.length ? <div className="empty">Tidak ada karyawan yang cocok dengan pencarian.</div>
            : <div className="org-tree">{hasilCari.map((n, i) => <SimpulOrganisasi key={n.id ?? `org-${i}`} n={n} q={q} tertutup={tertutup} ubah={ubahCabang} cocok={cocok} />)}</div>}
    </div>
  </>);
}

function SimpulOrganisasi({ n, q, tertutup, ubah, cocok }: {
  n: Simpul; q: string; tertutup: Set<number>; ubah: (id: number) => void; cocok: (n: Simpul) => boolean;
}) {
  const punyaBawahan = n.children.length > 0;
  const buka = punyaBawahan && (!n.id || !tertutup.has(n.id) || (!!q && cocok(n)));
  const sorot = !!q && [n.nama, n.jabatan, n.dept ?? ''].some((v) => v.toLocaleLowerCase('id').includes(q));
  const anak = n.children.filter((x) => !q || cocok(x));
  return <section className="org-node">
    <div className={'org-person' + (sorot ? ' match' : '')}>
      {n.id ? <Avatar u={{ nama: n.nama, foto: n.foto }} ukuran={38} /> : <span className="org-root-icon"><Ikon n="network" /></span>}
      <div className="org-ident"><div className="org-name">{n.nama}</div>
        <div className="org-meta">{n.jabatan || 'Jabatan belum diisi'}{n.dept ? ` · ${n.dept}` : ''}</div></div>
      {punyaBawahan && n.id && <button type="button" className="org-toggle" aria-expanded={buka} disabled={!!q} title={q ? 'Hapus pencarian untuk menutup cabang' : undefined} onClick={() => ubah(n.id!)}>
        <Ikon n={buka ? 'chevron-down' : 'chevron-right'} />{n.children.length} bawahan</button>}
    </div>
    {buka && anak.length > 0 && <div className="org-children">{anak.map((x) => <SimpulOrganisasi key={x.id} n={x} q={q} tertutup={tertutup} ubah={ubah} cocok={cocok} />)}</div>}
  </section>;
}
