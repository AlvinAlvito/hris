'use client';
/* Struktur organisasi: pohon atasan–bawahan dari kr_org (ECharts tree, bisa digeser & diperbesar) */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Grafik, palet } from '@/components/Grafik';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';

type Baris = { id: number; nama: string; jabatan: string; dept: string; foto: string; role: string; atasanId: number | null };
type Simpul = { id?: number; name: string; jab: string; dept?: string; children: Simpul[] };

export default function Organisasi() {
  const { settings, galat } = useAplikasi();
  const [rows, setRows] = useState<Baris[] | null>(null), [tema, setTema] = useState(0), [cari, setCari] = useState('');
  useEffect(() => { api<Baris[]>('kr_org', {}, true).then(setRows).catch(galat); }, [galat]);
  useEffect(() => {
    const ob = new MutationObserver(() => setTema((t) => t + 1));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => ob.disconnect();
  }, []);

  const opsi = useCallback(() => {
    void tema;
    const peta = new Map<number, Simpul>(), akar: Simpul[] = [];
    for (const x of rows!) peta.set(x.id, { id: x.id, name: x.nama, jab: x.jabatan, dept: x.dept, children: [] });
    for (const x of rows!) {
      const s = peta.get(x.id)!, a = x.atasanId ? peta.get(x.atasanId) : undefined;
      if (a && x.atasanId !== x.id) a.children.push(s); else akar.push(s);
    }
    const pusat = akar.length === 1 ? akar[0] : { name: settings.perusahaan, jab: 'Organisasi', children: akar };
    const q = cari.trim().toLowerCase(), c = palet();
    const cocok = (s: Simpul) => !!q && (s.name.toLowerCase().includes(q) || (s.jab || '').toLowerCase().includes(q));
    const tandai = (s: Simpul): any => ({ ...s, itemStyle: cocok(s) ? { borderColor: c.warn, borderWidth: 3 } : undefined, children: s.children.map(tandai) });
    const esc = (t: string) => t.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
    return {
      tooltip: { trigger: 'item', backgroundColor: c.sf, borderColor: c.line, textStyle: { color: c.ink },
        formatter: (p: any) => `<b>${esc(p.data.name)}</b><br>${esc(p.data.jab || '')}${p.data.dept ? ' · ' + esc(p.data.dept) : ''}` +
          (p.data.children?.length ? `<br>${p.data.children.length} bawahan langsung` : '') },
      series: [{ type: 'tree', data: [tandai(pusat)], orient: 'TB', top: 40, bottom: 60, left: 40, right: 40, roam: true, symbol: 'roundRect', symbolSize: [150, 48],
        initialTreeDepth: q ? -1 : 3, expandAndCollapse: true, animationDurationUpdate: 650, edgeShape: 'polyline',
        lineStyle: { color: c.p, width: 1.6, opacity: 0.45 },
        itemStyle: { color: c.sf, borderColor: c.p, borderWidth: 1.5, shadowBlur: 14, shadowColor: 'rgba(0,0,0,.12)' },
        label: { position: 'inside', formatter: (p: any) => `{n|${p.data.name.slice(0, 22)}}\n{j|${String(p.data.jab || '').slice(0, 26)}}`,
          rich: { n: { fontWeight: 800, fontSize: 12, color: c.ink, fontFamily: 'Jakarta' }, j: { fontSize: 10.5, color: c.mut, padding: [3, 0, 0, 0], fontFamily: 'Jakarta' } } },
        leaves: { label: { position: 'inside' } },
        emphasis: { focus: 'descendant', itemStyle: { borderColor: c.p2, borderWidth: 2.5 } } }],
    };
  }, [rows, settings.perusahaan, cari, tema]);

  return (<>
    <div className="page-head"><div><h2 style={{ margin: 0 }}>Struktur Organisasi</h2>
      <div className="muted small">{rows ? rows.length + ' orang · ' : ''}geser untuk berpindah, cubit/scroll untuk memperbesar, klik kotak untuk buka/tutup cabang</div></div>
      <div style={{ position: 'relative', minWidth: 220 }}><input placeholder="Sorot nama / jabatan…" value={cari} onChange={(e) => setCari(e.target.value)} style={{ paddingLeft: 36 }} />
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}><Ikon n="search" /></span></div></div>
    <div className="card" style={{ padding: 8 }}>
      {rows ? <Grafik opsi={rows.length ? opsi : null} kosong="Belum ada data karyawan" className="chart" />
        : <div className="skel" style={{ height: '70vh' }} />}
    </div>
    <style>{'.card .chart{height:72vh;min-height:420px}'}</style>
  </>);
}
