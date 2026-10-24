'use client';
/* Dashboard HC: KPI, komposisi hari ini, per lokasi, jam kerja, terlambat, payroll, reimburse, komposisi SDM, monitoring */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAplikasi } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { adaWebGL, Grafik, palet } from '@/components/Grafik';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { jamKerjaTeks, labelRole, NAMA_BULAN, periodeTeks, rupiah, tglIndo, tglPendek } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function Dashboard() {
  const { inbox, bukaSheet, galat } = useAplikasi();
  const [g, setG] = useState<Data | null>(null), [mon, setMon] = useState<Data | null>(null), [pay, setPay] = useState<Data | null>(null);
  const [cab, setCab] = useState(0), [tema, setTema] = useState(0), [mode3d, setMode3d] = useState(true), [putar, setPutar] = useState(true), [gl, setGl] = useState(false);
  useEffect(() => { setGl(adaWebGL()); }, []);
  useEffect(() => {
    api<Data>('dash_grafik', { hari: 30 }, true).then(setG).catch(galat);
    api<Data>('py_ringkasan', {}, true).then(setPay).catch(() => setPay(null));
  }, [galat]);
  const muatMon = useCallback(() => { api<Data>('adm_dash', { cabangId: cab }, true).then(setMon).catch(galat); }, [cab, galat]);
  useEffect(() => { muatMon(); }, [muatMon]);
  // gambar ulang grafik saat mode gelap/terang berubah
  useEffect(() => {
    const ob = new MutationObserver(() => setTema((t) => t + 1));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => ob.disconnect();
  }, []);
  const tigaD = gl && mode3d;
  const o = useOpsiGrafik(g, pay, tigaD, putar, tema);

  const h = g?.hariIni;
  const kpi: [string, string, string | number, string, boolean?][] = g ? [
    ['users', 'Karyawan aktif', g.total, ''], ['circle-check', 'Hadir hari ini', h.hadir + h.telat, 'c-green'], ['clock-alert', 'Terlambat', h.telat, 'c-amber'],
    ['plane', 'Cuti / izin', h.cuti + h.ket, 'c-cyan'], ['hourglass', 'Belum absen', h.belum, 'c-red'], ['inbox', 'Menunggu persetujuan', inbox.total, 'c-gray', true]] : [];
  const fotoBesar = (src: string, nama: string) => bukaSheet(<><h3>{nama}</h3><img src={src} alt="" style={{ width: '100%', borderRadius: 14 }} /></>);

  return (<>
    <div className="kpis">{g ? kpi.map(([ic, k, v, w, link]) => {
      const isi = <><div className="ico"><Ikon n={ic} /></div><div className="v">{v}</div><div className="k">{k}</div></>;
      return link ? <Link key={k} href="/persetujuan" className={'kpi ' + w} style={{ textDecoration: 'none', color: 'inherit' }}>{isi}</Link> : <div key={k} className={'kpi ' + w}>{isi}</div>;
    }) : Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi"><div className="skel" style={{ height: 86 }} /></div>)}</div>

    <div className="grid-2">
      <div className="card"><h3><Ikon n="sparkles" />Komposisi Hari Ini</h3><Grafik opsi={o.pie} className="chart pendek" />
        {h && [['Tepat waktu', h.hadir, 'var(--success)'], ['Terlambat', h.telat, 'var(--warning)'], ['Cuti / izin', h.cuti + h.ket, 'var(--primary)'], ['Libur', h.libur, 'var(--muted)'], ['Belum absen', h.belum, 'var(--danger)']]
          .map(([t, v, c]) => <div key={t as string} className="kv" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c as string, marginRight: 8 }} />{t}</span><b>{v}</b></div>)}</div>
      <div className="card"><h3><Ikon n="map-pin" />Kehadiran per Lokasi</h3><Grafik opsi={o.lokasi} className="chart pendek" /></div>
    </div>
    <div className="grid-2">
      <div className="card"><h3><Ikon n="timer" />Rata-rata Jam Kerja & Lembur per Minggu</h3><Grafik opsi={o.jam} className="chart pendek" /></div>
      <div className="card"><h3><Ikon n="clock-alert" />Paling Sering Terlambat <span className="m">bulan ini</span></h3><Grafik opsi={o.telat} kosong="Belum ada keterlambatan bulan ini" className="chart pendek" /></div>
    </div>
    <div className="grid-2">
      <div className="card"><div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="calculator" />Biaya Payroll <span className="m">per periode</span></h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {tigaD && <button className="btn ghost sm auto" onClick={() => setPutar(!putar)}><Ikon n="repeat" />{putar ? 'Jeda putar' : 'Putar'}</button>}
          {gl && <button className="btn ghost sm auto" onClick={() => setMode3d(!mode3d)}><Ikon n="layers" />{mode3d ? 'Tampilan 2D' : 'Tampilan 3D'}</button>}
        </div></div><Grafik key={'pay' + tigaD} opsi={o.pay} gl={tigaD} kosong="Belum ada data payroll" /></div>
      <div className="card"><h3><Ikon n="receipt" />Reimburse 90 Hari <span className="m">per kategori</span></h3><Grafik opsi={o.rb} kosong="Belum ada reimburse disetujui" /></div>
    </div>
    <div className="grid-3">
      <div className="card"><h3><Ikon n="building-2" />Per Divisi</h3><Grafik opsi={o.dept} className="chart pendek" /></div>
      <div className="card"><h3><Ikon n="briefcase" />Status Kepegawaian</h3><Grafik opsi={o.status} className="chart pendek" /></div>
      <div className="card"><h3><Ikon n="users" />Jenis Kelamin</h3><Grafik opsi={o.jk} className="chart pendek" /></div>
    </div>

    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="fingerprint" />Monitoring Hari Ini {mon && <span className="m">{tglIndo(mon.tanggal)}</span>}</h3>
        <select style={{ width: 'auto' }} value={cab} onChange={(e) => setCab(+e.target.value)}><option value={0}>Semua lokasi</option>
          {(mon?.perCabang ?? []).map((c: Data) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select></div>
      {!!mon?.rows?.filter((r: Data) => r.luar).length && (
        <Link href="/absensi" className="warn" style={{ display: 'block', marginTop: 12, textDecoration: 'none' }}>
          <b><Ikon n="circle-alert" /> {mon.rows.filter((r: Data) => r.luar).length} karyawan tercatat absen di luar area kantor.</b>
          <span className="tiny" style={{ display: 'block', marginTop: 3 }}>Buka Rekap Absensi untuk melihat detail lokasi dan jaraknya.</span>
        </Link>
      )}
      {!mon ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Karyawan</th><th>Lokasi</th><th>Jadwal</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Telat</th><th>Jam kerja</th><th>Foto</th></tr></thead><tbody>
          {mon.rows.map((r: Data) => {
            const libur = r.jadwalHariIni === 'LIBUR';
            const st = r.cuti ? <span className="badge b-blue">{r.cuti}</span> : r.inTime ? (!r.outTime ? <span className="badge b-green">Bekerja</span> : <span className="badge b-purple">Selesai</span>)
              : r.ket ? <span className={'badge ' + (r.ketStatus === 'Disetujui' ? 'b-blue' : 'b-amber')}>{r.ket}</span> : libur ? <span className="badge b-gray">Libur</span> : <span className="badge b-red">Belum absen</span>;
            return (
              <tr key={r.id}><td><div className="orang"><Avatar u={r} ukuran={32} /><div><b>{r.nama}</b><div className="tiny muted">{r.nik} · {labelRole(r.role)}</div></div></div></td>
                <td>{r.cabangNama || '—'}</td><td>{libur ? <span className="badge b-gray">Libur</span> : r.jadwalHariIni || 'Tetap'}</td><td>{st}</td>
                <td className="num">{r.inTime || '—'}</td><td className="num">{r.outTime || '—'}</td>
                <td>{r.inTime && r.jamMode !== 'fleksibel' ? (r.terlambat ? <span className="badge b-red">{r.menitTelat}m</span> : <span className="badge b-green">OK</span>) : '—'}</td>
                <td className="num">{r.inTime && r.outTime ? jamKerjaTeks(r.menitKerja) : r.inTime ? <span className="tiny muted">berjalan</span> : '—'}</td>
                <td>{r.foto ? <img src={r.foto} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }} onClick={() => fotoBesar(r.foto, r.nama)} /> : '—'}</td></tr>);
          })}</tbody></table></div>)}
    </div>
  </>);
}

/* opsi grafik dihitung ulang bila data atau mode warna berubah */
function useOpsiGrafik(g: Data | null, pay: Data | null, tigaD: boolean, putar: boolean, tema: number) {
  return useMemo(() => {
    const kosong = { pie: null, lokasi: null, jam: null, telat: null, pay: null, rb: null, dept: null, status: null, jk: null };
    if (!g || typeof window === 'undefined') return kosong as Record<string, ((e: any) => any) | null>;
    void tema;
    const c = palet();
    const tooltip = { backgroundColor: c.sf, borderColor: c.line, textStyle: { color: c.ink, fontFamily: 'Jakarta' } };
    const dasar = { textStyle: { fontFamily: 'Jakarta', color: c.mut }, grid: { left: 10, right: 14, top: 30, bottom: 10, containLabel: true }, tooltip: { trigger: 'axis', ...tooltip } };
    const sumbu = { axisLine: { lineStyle: { color: c.line } }, axisTick: { show: false }, axisLabel: { color: c.mut, fontFamily: 'Jakarta' }, splitLine: { lineStyle: { color: c.line, type: 'dashed' } } };
    const grad = (e: any, c1: string, c2: string, v = false) => new e.graphic.LinearGradient(0, 0, v ? 0 : 1, v ? 1 : 0, [{ offset: 0, color: c1 }, { offset: 1, color: c2 }]);
    const grid3 = (lebar: number) => ({ boxWidth: lebar, boxDepth: 74, boxHeight: 60, top: -22, splitLine: { lineStyle: { color: c.line, opacity: 0.4 } },
      viewControl: { alpha: 20, beta: 14, distance: 182, autoRotate: putar, autoRotateSpeed: 4, autoRotateAfterStill: 4 },
      light: { main: { intensity: 1.35, shadow: true, alpha: 42, beta: 28 }, ambient: { intensity: 0.42 } }, temporalSuperSampling: { enable: true } });
    const sumbu3 = (data?: string[]) => ({ type: data ? 'category' : 'value', data, name: '', axisLabel: { color: c.mut, fontSize: 10 }, axisLine: { lineStyle: { color: c.line } } });
    const h = g.hariIni;
    const donat = (data: Data[], warna: string[], mawar = false) => () => ({ tooltip: { trigger: 'item', ...tooltip },
      legend: { bottom: 0, textStyle: { color: c.mut, fontSize: 11 }, itemWidth: 10, itemHeight: 10, type: 'scroll' },
      series: [{ type: 'pie', roseType: mawar ? 'radius' : false, radius: mawar ? ['18%', '72%'] : ['48%', '72%'], center: ['50%', '44%'],
        itemStyle: { borderRadius: 8, borderColor: c.sf, borderWidth: 2 }, label: { show: false },
        data: data.map((d, i) => ({ name: d.nama, value: d.nilai, itemStyle: { color: warna[i % warna.length] } })) }] });
    const W = [c.p, c.a, c.ok, c.warn, c.p2, c.bad, c.info, c.mut];
    const dataPie = [{ name: 'Tepat waktu', value: h.hadir }, { name: 'Terlambat', value: h.telat }, { name: 'Cuti / izin', value: h.cuti + h.ket }, { name: 'Libur', value: h.libur }, { name: 'Belum absen', value: h.belum }];
    const wPie = [c.ok, c.warn, c.p, c.mut, c.bad];
    const lok = [...g.lokasi].sort((a: Data, b: Data) => b.total - a.total).slice(0, 8);
    const per = pay?.periode ?? [], kom: [string, string, string][] = [['Take home pay', 'thp', c.p], ['PPh 21', 'pph', c.warn], ['BPJS perusahaan', 'bpjs', c.ok]];
    const lblPer = per.map((p: Data) => NAMA_BULAN[+p.periode.slice(5) - 1].slice(0, 3) + ' ' + p.periode.slice(2, 4));
    const rb = g.reimburse;
    return {
      pie: dataPie.some((d) => d.value > 0) ? () => ({ tooltip: { trigger: 'item', ...tooltip }, series: [{ type: 'pie', radius: ['52%', '80%'],
        itemStyle: { borderRadius: 8, borderColor: c.sf, borderWidth: 3 }, label: { show: false }, data: dataPie.map((d, i) => ({ ...d, itemStyle: { color: wPie[i] } })) }] }) : null,
      lokasi: (e: any) => ({ ...dasar, grid: { left: 10, right: 40, top: 10, bottom: 10, containLabel: true }, xAxis: { type: 'value', max: (v: any) => Math.max(1, v.max), ...sumbu },
        yAxis: { type: 'category', data: lok.map((l: Data) => l.nama), inverse: true, ...sumbu },
        series: [{ type: 'bar', data: lok.map((l: Data) => l.total), barGap: '-100%', barWidth: 18, itemStyle: { color: c.line, borderRadius: 9 }, silent: true },
          { type: 'bar', name: 'Hadir', data: lok.map((l: Data) => l.hadir), barWidth: 18, itemStyle: { color: grad(e, c.p, c.a), borderRadius: 9 },
            label: { show: true, position: 'right', color: c.ink, fontWeight: 700, formatter: (p: any) => `${p.value}/${lok[p.dataIndex].total}` } }] }),
      jam: (e: any) => ({ ...dasar, legend: { top: 0, textStyle: { color: c.mut } },
        xAxis: { type: 'category', data: g.jamMingguan.map((w: Data) => tglPendek(w.awal).replace(/ \d{4}$/, '')), ...sumbu },
        yAxis: [{ type: 'value', name: 'jam/hari', ...sumbu }, { type: 'value', name: 'lembur', ...sumbu, splitLine: { show: false } }],
        series: [{ type: 'line', name: 'Rata-rata jam kerja', smooth: true, symbolSize: 8, data: g.jamMingguan.map((w: Data) => w.rata), lineStyle: { width: 3, color: c.p }, itemStyle: { color: c.p } },
          { type: 'bar', name: 'Total jam lembur', yAxisIndex: 1, data: g.jamMingguan.map((w: Data) => w.lembur), barWidth: 14, itemStyle: { color: grad(e, c.a, c.p2, true), borderRadius: [6, 6, 0, 0] } }] }),
      telat: g.topTelat.length ? (e: any) => ({ ...dasar, grid: { left: 10, right: 60, top: 10, bottom: 10, containLabel: true }, xAxis: { type: 'value', ...sumbu },
        yAxis: { type: 'category', data: g.topTelat.map((t: Data) => t.nama), inverse: true, ...sumbu },
        series: [{ type: 'bar', data: g.topTelat.map((t: Data) => t.menit), barWidth: 16, itemStyle: { color: grad(e, c.warn, c.bad), borderRadius: 8 },
          label: { show: true, position: 'right', color: c.ink, formatter: (p: any) => `${p.value} mnt (${g.topTelat[p.dataIndex].kali}×)` } }] }) : null,
      pay: per.length ? () => (tigaD ? {
        tooltip: { formatter: (p: any) => `<b>${periodeTeks(per[p.value[0]].periode)}</b><br>${kom[p.value[1]][0]}: <b>${rupiah(p.value[2] * 1e6)}</b>`, ...tooltip },
        xAxis3D: sumbu3(lblPer), yAxis3D: sumbu3(kom.map((k) => k[0])), zAxis3D: sumbu3(), grid3D: { ...grid3(Math.max(60, per.length * 22)), boxDepth: 50 },
        series: kom.map((k, yi) => ({ type: 'bar3D', name: k[0], shading: 'lambert', bevelSize: 0.3, itemStyle: { color: k[2] }, data: per.map((p: Data, xi: number) => [xi, yi, +(p[k[1]] / 1e6).toFixed(2)]) })),
      } : { ...dasar, legend: { top: 0, textStyle: { color: c.mut } }, xAxis: { type: 'category', data: lblPer, ...sumbu }, yAxis: { type: 'value', ...sumbu },
        series: kom.map((k) => ({ type: 'bar', name: k[0], data: per.map((p: Data) => p[k[1]]), itemStyle: { color: k[2], borderRadius: [5, 5, 0, 0] } })) }) : null,
      rb: rb.length ? () => ({ tooltip: { trigger: 'item', formatter: (p: any) => `<b>${p.name}</b><br>${rupiah(p.value)} · ${rb[p.dataIndex].n} klaim`, ...tooltip },
        legend: { bottom: 0, textStyle: { color: c.mut }, type: 'scroll' },
        series: [{ type: 'pie', roseType: 'area', radius: ['16%', '74%'], center: ['50%', '45%'], itemStyle: { borderRadius: 10, borderColor: c.sf, borderWidth: 2 },
          label: { color: c.ink, formatter: (p: any) => `${p.name}\n${rupiah(p.value)}`, fontSize: 11 }, data: rb.map((r: Data, i: number) => ({ name: r.kategori, value: r.total, itemStyle: { color: W[i % W.length] } })) }] }) : null,
      dept: donat(g.dept, W, true), status: donat(g.statusKerja, W),
      jk: donat(g.jk.map((x: Data) => ({ nama: x.nama === 'L' ? 'Laki-laki' : x.nama === 'P' ? 'Perempuan' : x.nama, nilai: x.nilai })), [c.p, '#ec4899', c.mut]),
    } as Record<string, ((e: any) => any) | null>;
  }, [g, pay, tigaD, putar, tema]);
}
