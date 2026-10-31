'use client';
/* KPI Karyawan: Supervisor memverifikasi KPI timnya; HC melihat semua karyawan dan mengelola template KPI per jabatan */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { bulanTeks, daftarPeriode, GrafikRiwayat, LembarKpi, SkorKpi, WARNA_STATUS, type LaporKpi, type RiwayatKpi } from '@/components/KpiLapor';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';

type Baris = { userId: number; nama: string; nik: string; jabatan: string; dept: string; laporId: number | null; template: string; status: string; skor: number | null; predikat: string };
type DataTim = { periode: string; admin: boolean; baris: Baris[]; stat: { menunggu: number; disetujui: number; belum: number; tanpa: number; rata: number | null } };
type Indikator = { id?: number; nama: string; deskripsi: string; satuan: string; target: number | string; bobot: number | string; arah: string; sumber: string };
type Template = { id: number; nama: string; keterangan: string; aktif: boolean; jabatan: string[]; jumlahKaryawan: number; indikator: Indikator[] };
type DataTemplate = { template: Template[]; jabatan: string[]; karyawan: { id: number; nama: string; jabatan: string; dept: string; templateKhusus: number | null }[] };

const LABEL: Record<string, string> = { draf: 'Draf', diajukan: 'Menunggu verifikasi', disetujui: 'Disetujui', dikembalikan: 'Dikembalikan', belum: 'Belum mengisi', tanpa: 'Tanpa template' };

export default function KelolaKpi() {
  const { me } = useAplikasi();
  const admin = isAdminUp(me);
  const [tab, setTab] = useState<'nilai' | 'template'>('nilai');
  // jalan pintas dari baris "Tanpa template": buka form template dengan jabatan karyawan tersebut
  const [jabatanBaru, setJabatanBaru] = useState<string | null>(null);
  return (<>
    {admin && <div className="seg kp-tab">{([['nilai', 'circle-check', 'Penilaian'], ['template', 'layers', 'Template KPI']] as const).map(([k, ic, t]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>}
    {tab === 'nilai' ? <Penilaian buatTemplate={admin ? (j) => { setJabatanBaru(j); setTab('template'); } : undefined} />
      : <KelolaTemplate jabatanBaru={jabatanBaru} selesaiJabatan={() => setJabatanBaru(null)} />}
  </>);
}

/* ---------------- PENILAIAN ---------------- */
function Penilaian({ buatTemplate }: { buatTemplate?: (jabatan: string) => void }) {
  const { galat, bukaSheet, yakin } = useAplikasi();
  const [periode, setPeriode] = useState(daftarPeriode(1)[0]);
  const [d, setD] = useState<DataTim | null>(null);
  const [filter, setFilter] = useState(''), [cari, setCari] = useState('');
  const muat = useCallback(() => { api<DataTim>('kpi_tim', { periode }, true).then(setD).catch(galat); }, [periode, galat]);
  useEffect(() => { setD(null); muat(); }, [muat]);
  const tampil = useMemo(() => (d?.baris ?? []).filter((x) => (!filter || (filter === 'belum' ? ['belum', 'draf', 'dikembalikan'].includes(x.status) : x.status === filter))
    && (!cari || [x.nama, x.jabatan, x.dept, x.nik].some((v) => String(v ?? '').toLowerCase().includes(cari.toLowerCase()))))
    .sort((a, b) => (a.status === 'diajukan' ? -1 : 0) - (b.status === 'diajukan' ? -1 : 0) || (b.skor ?? -1) - (a.skor ?? -1) || a.nama.localeCompare(b.nama, 'id')), [d, filter, cari]);
  const buka = async (x: Baris) => {
    if (x.status === 'tanpa') {
      if (buatTemplate && x.jabatan && await yakin(`Buat template KPI untuk jabatan "${x.jabatan}"?`, `${x.nama} belum memiliki template KPI. Semua karyawan dengan jabatan ini akan otomatis memakai template yang dibuat.`, { ya: 'Buat template' }))
        buatTemplate(x.jabatan);
      return;
    }
    bukaSheet(<DetailKpi userId={x.userId} periode={periode} segarkan={muat} />, { besar: true, saatTutup: muat });
  };
  const ekspor = () => d && keExcel(d.baris.map((x) => ({ NIK: x.nik, Nama: x.nama, Jabatan: x.jabatan, Divisi: x.dept, Template: x.template,
    Status: LABEL[x.status], Skor: x.skor ?? '', Predikat: x.predikat })), 'KPI', 'kpi-' + periode).catch(galat);
  return (<>
    <div className="card kp-pilih-bulan">
      <h3 style={{ margin: 0 }}><Ikon n="target" />KPI Karyawan</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ width: 'auto' }}>{daftarPeriode(12).map((p) => <option key={p} value={p}>{bulanTeks(p)}</option>)}</select>
        <button className="btn ghost sm auto" onClick={ekspor} disabled={!d}><Ikon n="download" />Excel</button></div>
    </div>
    {!d ? <div className="card"><div className="skel" style={{ height: 240 }} /></div> : (<>
      <div className="statgrid kp-stat">{([['inbox', 'Menunggu verifikasi', d.stat.menunggu, 'diajukan'], ['circle-check', 'Disetujui', d.stat.disetujui, 'disetujui'],
        ['hourglass', 'Belum diajukan', d.stat.belum, 'belum'], ['chart-pie', 'Rata-rata skor', d.stat.rata ?? '—', '']] as [string, string, number | string, string][]).map(([ic, k, v, f]) => (
        <button key={k} type="button" className={'stat kp-stat-btn' + (f && filter === f ? ' on' : '')} onClick={() => f && setFilter((x) => (x === f ? '' : f))}>
          <span className="si"><Ikon n={ic} /></span><div className="k">{k}</div><div className="v">{v}</div></button>))}</div>
      {d.stat.tanpa > 0 && d.admin && <div className="note" style={{ marginBottom: 12 }}><b>{d.stat.tanpa} karyawan</b> belum memiliki template KPI. Buat template untuk jabatan mereka di tab <b>Template KPI</b>.</div>}
      <div className="card">
        <div className="kp-filter"><input placeholder="Cari nama, jabatan, divisi…" value={cari} onChange={(e) => setCari(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Semua status</option>{['diajukan', 'disetujui', 'belum', 'tanpa'].map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select></div>
        {!tampil.length ? <div className="empty">Tidak ada karyawan pada filter ini.</div> : (
          <div className="kp-tabel">{tampil.map((x) => (
            <button key={x.userId} type="button" className={'kp-baris' + (x.status === 'tanpa' ? ' mati' : '')} onClick={() => buka(x)}
              title={x.status === 'tanpa' ? (buatTemplate ? 'Klik untuk membuat template KPI jabatan ini' : 'Belum ada template KPI — hubungi HC') : 'Buka detail KPI'}>
              <span className="kp-nama"><b>{x.nama}</b><span className="tiny muted">{x.jabatan}{x.dept ? ' · ' + x.dept : ''}</span></span>
              <span className="tiny muted kp-tpl">{x.template || '—'}</span>
              <span><span className={'badge ' + WARNA_STATUS[x.status]}>{LABEL[x.status]}</span></span>
              <span className="kp-skor-sel"><SkorKpi skor={x.skor} /><span className="tiny muted">{x.predikat}</span></span>
            </button>))}</div>)}
      </div>
    </>)}
  </>);
}

function DetailKpi({ userId, periode, segarkan }: { userId: number; periode: string; segarkan: () => void }) {
  const { galat, tutupSheet } = useAplikasi();
  const [p, setP] = useState(periode);
  const [d, setD] = useState<{ lapor: LaporKpi; riwayat: RiwayatKpi[]; bolehVerifikasi: boolean; admin: boolean } | null>(null);
  const muat = useCallback(() => { api<typeof d>('kpi_detail', { userId, periode: p }, true).then(setD).catch((e) => { galat(e); tutupSheet(); }); }, [userId, p, galat, tutupSheet]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="skel" style={{ height: 320 }} />;
  return (<div className="grid-2 kp-detail">
    <div><LembarKpi key={d.lapor.id + d.lapor.status} lapor={d.lapor} mode={d.bolehVerifikasi ? 'verifikator' : 'karyawan'} admin={d.admin} segarkan={() => { muat(); segarkan(); }} /></div>
    <div className="card"><h3><Ikon n="trending-up" />Riwayat {d.lapor.nama.split(' ')[0]}</h3><GrafikRiwayat riwayat={d.riwayat} pilih={setP} />
      <div className="tiny muted" style={{ marginTop: 8 }}>Ketuk batang untuk membuka bulan lain.</div></div>
  </div>);
}

/* ---------------- TEMPLATE (HC) ---------------- */
function KelolaTemplate({ jabatanBaru, selesaiJabatan }: { jabatanBaru: string | null; selesaiJabatan: () => void }) {
  const { galat, bukaSheet, toast, yakin } = useAplikasi();
  const [d, setD] = useState<DataTemplate | null>(null);
  const muat = useCallback(() => { api<DataTemplate>('kpi_template_daftar', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const form = useCallback((t: Template | null, salin = false, awalJabatan?: string) => d && bukaSheet(
    <FormTemplate t={t} salin={salin} jabatan={d.jabatan} awalJabatan={awalJabatan} selesai={muat} />, { besar: true }), [d, bukaSheet, muat]);
  // datang dari baris "Tanpa template": langsung buka form dengan jabatan tercentang
  useEffect(() => { if (d && jabatanBaru) { form(null, false, jabatanBaru); selesaiJabatan(); } }, [d, jabatanBaru, form, selesaiJabatan]);
  if (!d) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const hapus = async (t: Template) => {
    if (!(await yakin(`Hapus template "${t.nama}"?`, 'Laporan KPI bulan-bulan sebelumnya tetap tersimpan.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('kpi_template_hapus', { id: t.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const tugaskan = (userId: number, templateId: number) => api<{ pesan: string }>('kpi_penugasan_simpan', { userId, templateId }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  const terpakai = new Set(d.template.flatMap((t) => t.jabatan.map((j) => j.toLowerCase())));
  const tanpa = d.jabatan.filter((j) => !terpakai.has(j.toLowerCase()));
  return (<>
    <div className="card kp-pilih-bulan"><div><h3 style={{ margin: 0 }}><Ikon n="layers" />Template KPI</h3>
      <div className="tiny muted">Satu template berisi indikator, target, dan bobot untuk satu atau beberapa jabatan.</div></div>
      <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Buat Template</button></div>
    {tanpa.length > 0 && <div className="note" style={{ marginBottom: 12 }}>Jabatan belum punya template ({tanpa.length}): {tanpa.slice(0, 12).join(', ')}{tanpa.length > 12 ? '…' : ''}</div>}
    {!d.template.length ? <div className="card"><div className="empty"><Ikon n="layers" />Belum ada template KPI. Mulai dengan <b>Buat Template</b>.</div></div> : (
      <div className="kp-tpl-grid">{d.template.map((t) => (
        <div key={t.id} className="card kp-tpl-kartu">
          <div className="kp-tpl-atas"><h4>{t.nama}</h4>{!t.aktif && <span className="badge b-gray">Nonaktif</span>}</div>
          {t.keterangan && <div className="tiny muted">{t.keterangan}</div>}
          <div className="kp-chip">{t.jabatan.length ? t.jabatan.map((j) => <span key={j}>{j}</span>) : <span className="kosong">Belum dikaitkan ke jabatan</span>}</div>
          <ul className="kp-tpl-ind">{t.indikator.map((x) => <li key={x.id}><span>{x.nama}{x.sumber !== 'manual' && <span className="badge b-blue kp-oto">otomatis</span>}</span><b>{x.bobot}%</b></li>)}</ul>
          <div className="kp-tpl-bawah"><span className="tiny muted"><Ikon n="users" />{t.jumlahKaryawan} karyawan</span>
            <button className="btn ghost sm auto" onClick={() => form(t)}><Ikon n="pencil" />Ubah</button>
            <button className="btn ghost sm auto" onClick={() => form(t, true)} title="Duplikat"><Ikon n="copy" /></button>
            <button className="btn ghost sm auto" onClick={() => hapus(t)} aria-label="Hapus template"><Ikon n="trash-2" /></button></div>
        </div>))}</div>)}
    {d.template.length > 0 && <div className="card"><h3><Ikon n="user-check" />Template Khusus per Karyawan</h3>
      <div className="tiny muted" style={{ marginBottom: 10 }}>Bawaan: karyawan otomatis memakai template sesuai jabatannya. Pilih template lain bila seseorang perlu KPI berbeda (mis. karyawan baru atau tugas khusus).</div>
      <PenugasanKhusus d={d} tugaskan={tugaskan} /></div>}
  </>);
}

function PenugasanKhusus({ d, tugaskan }: { d: DataTemplate; tugaskan: (u: number, t: number) => void }) {
  const [cari, setCari] = useState('');
  const l = d.karyawan.filter((k) => k.templateKhusus || (cari && [k.nama, k.jabatan, k.dept].some((v) => String(v ?? '').toLowerCase().includes(cari.toLowerCase())))).slice(0, 30);
  return (<>
    <input placeholder="Cari karyawan untuk diberi template khusus…" value={cari} onChange={(e) => setCari(e.target.value)} />
    <div className="kp-tabel" style={{ marginTop: 8 }}>{l.map((k) => (
      <div key={k.id} className="kp-baris statis"><span className="kp-nama"><b>{k.nama}</b><span className="tiny muted">{k.jabatan}</span></span>
        <select value={k.templateKhusus ?? 0} onChange={(e) => tugaskan(k.id, +e.target.value)} style={{ maxWidth: 260 }}>
          <option value={0}>Ikut jabatan</option>{d.template.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}</select></div>))}
      {!l.length && <div className="empty tiny">{cari ? 'Tidak ada yang cocok.' : 'Belum ada template khusus.'}</div>}</div>
  </>);
}

/* nilai awal indikator otomatis saat sumbernya dipilih */
const SUMBER_BAWAAN: Record<string, { nama: string; deskripsi: string; satuan: string; target: number }> = {
  kehadiran: { nama: 'Kehadiran', deskripsi: 'Persentase hadir pada hari kerja (otomatis dari absensi)', satuan: '%', target: 100 },
  tepat_waktu: { nama: 'Ketepatan waktu masuk', deskripsi: 'Persentase hari hadir tanpa terlambat (otomatis dari absensi)', satuan: '%', target: 100 },
  utilisasi: { nama: 'Utilisasi beban kerja', deskripsi: 'Total jam pekerjaan ÷ kapasitas jam kerja (otomatis dari Pekerjaan Saya)', satuan: '%', target: 85 },
  log_selesai: { nama: 'Pekerjaan selesai', deskripsi: 'Jumlah pekerjaan berstatus Selesai dalam sebulan (otomatis dari Pekerjaan Saya)', satuan: 'pekerjaan', target: 100 },
  log_persen_selesai: { nama: 'Persentase pekerjaan selesai', deskripsi: 'Pekerjaan Selesai ÷ semua pekerjaan yang dikerjakan (otomatis)', satuan: '%', target: 90 },
  log_kelengkapan: { nama: 'Kelengkapan log kerja', deskripsi: 'Persentase hari kerja yang terisi catatan pekerjaan (otomatis)', satuan: '%', target: 100 },
};
const TARGET_TETAP = ['kehadiran', 'tepat_waktu'];
const BARU = (): Indikator => ({ nama: '', deskripsi: '', satuan: '', target: '', bobot: '', arah: 'naik', sumber: 'manual' });
function FormTemplate({ t, salin, jabatan, awalJabatan, selesai }: { t: Template | null; salin: boolean; jabatan: string[]; awalJabatan?: string; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [nama, setNama] = useState(t ? t.nama + (salin ? ' (salinan)' : '') : awalJabatan ? 'KPI ' + awalJabatan : '');
  const [ket, setKet] = useState(t?.keterangan ?? ''), [aktif, setAktif] = useState(t?.aktif ?? true);
  const [jab, setJab] = useState<string[]>(salin ? [] : t?.jabatan ?? (awalJabatan ? [awalJabatan] : []));
  const [ind, setInd] = useState<Indikator[]>(() => t ? t.indikator.map((x) => ({ ...x, id: salin ? undefined : x.id }))
    : [{ ...BARU(), nama: 'Kehadiran', deskripsi: 'Persentase hadir pada hari kerja (otomatis dari absensi)', satuan: '%', target: 100, bobot: 15, sumber: 'kehadiran' }, BARU()]);
  const [cariJab, setCariJab] = useState(''), [kirim, setKirim] = useState(false);
  const total = ind.reduce((a, x) => a + (Number(x.bobot) || 0), 0);
  const set = (n: number, k: keyof Indikator, v: string) => setInd((l) => l.map((x, i) => {
    if (i !== n) return x;
    const y = { ...x, [k]: v };
    if (k === 'sumber' && v !== 'manual') {
      const d = SUMBER_BAWAAN[v];
      y.arah = 'naik'; y.satuan = d.satuan; y.target = d.target;
      if (!x.nama || Object.values(SUMBER_BAWAAN).some((s) => s.nama === x.nama)) { y.nama = d.nama; y.deskripsi = d.deskripsi; }
    }
    if (k === 'arah' && v === 'ya_tidak') { y.target = 1; y.satuan = 'ya/tidak'; }
    return y;
  }));
  // skala bobot secara proporsional agar totalnya tepat 100 (sisa pembulatan ditaruh di bobot terbesar)
  const seimbangkan = () => setInd((l) => {
    const b = l.map((x) => Math.max(0, Number(x.bobot) || 0)), jml = b.reduce((a, x) => a + x, 0);
    if (!jml) return l;
    const baru = b.map((x) => Math.round((x / jml) * 100));
    const sisa = 100 - baru.reduce((a, x) => a + x, 0), terbesar = baru.indexOf(Math.max(...baru));
    baru[terbesar] += sisa;
    return l.map((x, i) => ({ ...x, bobot: baru[i] }));
  });
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string }>('kpi_template_simpan', { id: salin ? 0 : t?.id ?? 0, nama, keterangan: ket, aktif, jabatan: jab, indikator: ind })
      .then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<div className="kp-form">
    <h3><Ikon n="layers" />{t && !salin ? 'Ubah' : 'Buat'} Template KPI</h3>
    <div className="row"><div style={{ flex: 2 }}><label style={{ marginTop: 0 }}>Nama template *</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. KPI Staff Sales" /></div>
      <div><label style={{ marginTop: 0 }}>Status</label><select value={aktif ? 1 : 0} onChange={(e) => setAktif(e.target.value === '1')}><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select></div></div>
    <label>Keterangan</label><input value={ket} onChange={(e) => setKet(e.target.value)} placeholder="opsional" />
    <label>Berlaku untuk jabatan <span className="tiny muted">({jab.length} dipilih — karyawan dengan jabatan ini otomatis memakai template)</span></label>
    <input placeholder="Cari jabatan…" value={cariJab} onChange={(e) => setCariJab(e.target.value)} />
    <div className="kp-jabatan">{jabatan.filter((j) => !cariJab || j.toLowerCase().includes(cariJab.toLowerCase()) || jab.includes(j)).map((j) => (
      <label key={j} className={jab.includes(j) ? 'on' : ''}><input type="checkbox" checked={jab.includes(j)} onChange={() => setJab((x) => (x.includes(j) ? x.filter((y) => y !== j) : [...x, j]))} />{j}</label>))}</div>

    <div className="kp-ind-kepala"><h4 style={{ margin: 0 }}>Indikator</h4>
      <span className={'badge ' + (Math.abs(total - 100) < 0.01 ? 'b-green' : 'b-red')}>Total bobot {Math.round(total * 100) / 100}%{Math.abs(total - 100) >= 0.01 && ' (harus 100%)'}</span></div>
    {ind.map((x, n) => (
      <div key={n} className="kp-ind-form">
        <div className="kp-ind-form-atas"><b>#{n + 1}</b>
          <button type="button" className="btn ghost sm auto" disabled={ind.length < 2} onClick={() => setInd((l) => l.filter((_, i) => i !== n))} aria-label="Hapus indikator"><Ikon n="trash-2" /></button></div>
        <div className="row"><div style={{ flex: 2 }}><label>Nama indikator *</label><input value={x.nama} onChange={(e) => set(n, 'nama', e.target.value)} placeholder="mis. Sekolah baru yang dikunjungi" /></div>
          <div><label>Sumber data</label><select value={x.sumber} onChange={(e) => set(n, 'sumber', e.target.value)}>
            <option value="manual">Diisi karyawan</option>
            <optgroup label="Otomatis dari absensi"><option value="kehadiran">% kehadiran</option><option value="tepat_waktu">% tepat waktu</option></optgroup>
            <optgroup label="Otomatis dari log kerja"><option value="utilisasi">% utilisasi beban kerja</option><option value="log_selesai">Jumlah pekerjaan selesai</option>
              <option value="log_persen_selesai">% pekerjaan selesai</option><option value="log_kelengkapan">% hari terisi log</option></optgroup></select></div></div>
        <label>Penjelasan / cara mengukur</label><input value={x.deskripsi} onChange={(e) => set(n, 'deskripsi', e.target.value)} placeholder="mis. dibuktikan dengan laporan kunjungan" />
        <div className="row kp-angka">
          <div><label>Arah</label><select value={x.arah} disabled={x.sumber !== 'manual'} onChange={(e) => set(n, 'arah', e.target.value)}>
            <option value="naik">Makin tinggi makin baik</option><option value="turun">Makin rendah makin baik</option><option value="ya_tidak">Ya / tidak</option></select></div>
          <div><label>Target</label><input type="number" min={0} step="any" value={x.target} disabled={x.arah === 'ya_tidak' || TARGET_TETAP.includes(x.sumber)} onChange={(e) => set(n, 'target', e.target.value)} /></div>
          <div><label>Satuan</label><input value={x.satuan} disabled={x.arah === 'ya_tidak' || x.sumber !== 'manual'} onChange={(e) => set(n, 'satuan', e.target.value)} placeholder="sekolah" /></div>
          <div><label>Bobot (%)</label><input type="number" min={1} max={100} step="any" value={x.bobot} onChange={(e) => set(n, 'bobot', e.target.value)} /></div></div>
      </div>))}
    <button type="button" className="btn ghost" disabled={ind.length >= 15} onClick={() => setInd((l) => [...l, BARU()])}><Ikon n="plus" />Tambah indikator</button>
    <div className="note" style={{ marginTop: 12 }}>Perubahan template berlaku untuk laporan bulan yang belum dibuat. Laporan bulan berjalan dapat diperbarui lewat tombol <b>Muat ulang template</b> di detail KPI karyawan.</div>
    {Math.abs(total - 100) >= 0.01 && (
      <div className="warn kp-bobot-kurang">
        <span>Total bobot <b>{Math.round(total * 100) / 100}%</b> — {total < 100 ? `kurang ${Math.round((100 - total) * 100) / 100}%` : `lebih ${Math.round((total - 100) * 100) / 100}%`}. Total bobot semua indikator harus tepat <b>100%</b> agar bisa disimpan.</span>
        {total > 0 && <button type="button" className="btn ghost sm auto" onClick={seimbangkan}><Ikon n="repeat" />Sesuaikan otomatis ke 100%</button>}
      </div>)}
    <button className="btn" disabled={kirim || Math.abs(total - 100) >= 0.01} onClick={simpan}><Ikon n="check" />Simpan Template</button>
  </div>);
}
