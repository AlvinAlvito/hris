'use client';
/* Pembungkus ECharts: dimuat hanya saat dibutuhkan; ECharts-GL (3D) hanya bila perangkat mendukung WebGL */
import { useEffect, useRef } from 'react';

let muatan: Promise<any> | null = null, muatanGl: Promise<any> | null = null;
export function adaWebGL() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
  catch { return false; }
}
export function muatECharts(gl = false): Promise<any> {
  muatan ??= import('echarts');
  if (!gl) return muatan;
  muatanGl ??= muatan.then(async (e) => { await import('echarts-gl'); return e; });
  return muatanGl;
}
/* warna tema dari token CSS, agar grafik ikut mode gelap/terang */
export function palet() {
  const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { p: g('--primary'), p2: g('--primary-2'), a: g('--accent'), ok: g('--success'), warn: g('--warning'), bad: g('--danger'), info: g('--info'),
    ink: g('--ink'), mut: g('--muted'), line: g('--line'), sf: g('--surface') };
}

export function Grafik({ opsi, className = 'chart', gl = false, kosong }: { opsi: ((echarts: any) => any) | null; className?: string; gl?: boolean; kosong?: string }) {
  const el = useRef<HTMLDivElement>(null), inst = useRef<any>(null);
  useEffect(() => {
    let hidup = true;
    muatECharts(gl).then((echarts) => {
      if (!hidup || !el.current) return;
      if (!inst.current) inst.current = echarts.init(el.current, null, { renderer: 'canvas' });
      const c = palet();
      inst.current.setOption(opsi ? opsi(echarts) : { graphic: { type: 'text', left: 'center', top: 'middle', style: { text: kosong ?? 'Belum ada data', fill: c.mut, font: '600 14px Jakarta' } } }, true);
    });
    return () => { hidup = false; };
  }, [opsi, gl, kosong]);
  useEffect(() => {
    const ubah = () => inst.current?.resize();
    window.addEventListener('resize', ubah);
    return () => { window.removeEventListener('resize', ubah); inst.current?.dispose(); inst.current = null; };
  }, []);
  return <div ref={el} className={className} />;
}
